'use strict';
const { DoipTransport, readIdentity } = require('./flash-transport');
const { loadConnection, loadCalibration, matchIdentity } = require('./flash-files');
const { runFlash, Journal } = require('./flash-engine');
const { demoBundle, DemoTransport } = require('./flash-demo');
const providers = require('./flash-profiles');
class FlashWorkspace {
    constructor(options) {
        this.options = options; this.journal = new Journal(options.dataDir); this.transport = null;
        this.identity = null; this.bundle = null; this.config = null; this.busy = false; this.programming = false;
        this.power = false; this.confirmUntil = 0; this.phase = 'Load a calibration'; this.percent = 0;
        this.error = ''; this.connectionError = ''; this.mode = options.demo();
        this.recovery = !!(this.journal.read() || {}).incomplete;
    }
    changed() { if (this.options.changed) this.options.changed(); }
    get connected() { return !!(this.transport && this.transport.active && this.identity); }
    invalidate() {
        if (this.busy) throw Error('Wait for the current connection or flash operation');
        this.disconnect(); this.bundle = null; this.error = ''; this.phase = 'Load a calibration'; this.percent = 0; this.mode = this.options.demo();
    }
    async connect() {
        if (this.busy) throw Error('Connection is busy');
        if (this.connected) return this.disconnect();
        this.busy = true; this.error = ''; this.connectionError = ''; this.confirmUntil = 0; this.power = false; this.identity = null;
        this.changed();
        try {
            if (this.transport) this.transport.close();
            if (this.options.demo()) {
                this.config = null;
                this.transport = new DemoTransport(demoBundle());
            } else {
                if (this.recovery) throw Error('An unfinished flash needs recovery review before reconnecting');
                this.config = loadConnection(this.options.dataDir);
                await this.options.quiet(); // Await all SMILEY traffic and hand held exhaust control back first.
                this.transport = new DoipTransport(this.config, { onClose: (e) => {
                    this.identity = null; this.confirmUntil = 0; this.power = false;
                    if (this.programming) this.error = e.message;
                    this.changed();
                } });
            }
            await this.transport.connect();
            this.identity = await readIdentity(this.transport);
        } catch (e) {
            this.connectionError = e.code === 'ENOENT' ? 'Add flash/connect.json with your diagnostic endpoint' : String(e.message || e);
            if (this.transport) this.transport.close(); this.identity = null; throw Error(this.connectionError);
        } finally { this.busy = false; this.changed(); }
    }
    disconnect() {
        if (this.busy) throw Error('Disconnect is locked while an operation is running');
        if (this.transport) this.transport.close(); this.transport = null; this.identity = null; this.confirmUntil = 0; this.power = false; this.changed();
    }
    load() {
        if (this.busy) throw Error('Wait for the current operation');
        this.bundle = null; this.confirmUntil = 0; this.power = false; this.error = ''; this.percent = 0;
        try {
            this.bundle = this.options.demo() ? demoBundle() : loadCalibration(this.options.dataDir, providers);
            this.phase = this.bundle.blocker ? 'Programming adapter required' : 'Calibration loaded';
        } catch (e) { this.error = e.code === 'ENOENT' ? 'Add profile.json and the calibration file to the flash folder' : String(e.message || e); this.phase = 'File check failed'; }
        this.changed();
    }
    togglePower() { if (this.busy) return; this.power = !this.power; this.confirmUntil = 0; this.changed(); }
    blockers() {
        const b = this.bundle, demo = this.options.demo(), result = [];
        if (this.recovery && !demo) result.push('Previous flash needs recovery review');
        if (!this.connected) result.push('Connect and identify the ECU first');
        if (!b) result.push('Load a calibration file');
        else {
            if (b.simulation !== demo || (this.transport && b.simulation !== (this.transport.simulation === true))) result.push('Reconnect after changing demo mode');
            if (b.blocker) result.push(b.blocker);
            if (this.identity && !matchIdentity(b.profile.expected, this.identity)) result.push('Calibration does not match the connected ECU');
            if (this.transport && this.transport.config.ecuAddress !== b.profile.ecuAddress) result.push('ECU address does not match');
        }
        if (!this.power) result.push(demo ? 'Confirm simulated power' : 'Confirm a programming power supply is connected');
        return result;
    }
    async flash() {
        if (this.busy) throw Error('Flash is already running');
        const blocked = this.blockers(); if (blocked.length) throw Error(blocked[0]);
        if (Date.now() >= this.confirmUntil) { this.confirmUntil = Date.now() + 15000; this.phase = 'Review the ECU and file, then confirm'; this.changed(); return; }
        this.busy = this.programming = true; this.error = ''; this.percent = 0; this.changed();
        const simulated = this.options.demo();
        try {
            await runFlash({ bundle: this.bundle, transport: this.transport, identity: this.identity, powerConfirmed: this.power,
                journal: this.journal, identify: () => readIdentity(this.transport),
                isStillAuthorized: () => this.options.demo() === simulated && Date.now() < this.confirmUntil,
                progress: (p) => { this.phase = p.phase; this.percent = p.percent; this.changed(); } });
            this.phase = simulated ? 'Simulation complete' : 'Flash confirmed';
        } catch (e) {
            this.error = String(e.message || e); this.phase = 'Stopped - review required';
            if (!simulated) this.recovery = !!(this.journal.read() || {}).incomplete;
            throw e;
        } finally {
            // Finish with an explicitly closed diagnostic session. Never automatically resume polling.
            if (this.transport) this.transport.close(); this.identity = null;
            this.busy = this.programming = false; this.power = false; this.confirmUntil = 0; this.changed();
        }
    }
    view() {
        const b = this.bundle, demo = this.options.demo(), reasons = this.blockers();
        return { demo, connected: this.connected, busy: this.busy, programming: this.programming,
            endpoint: demo ? 'In-memory ECU' : this.config ? this.config.host + ':' + this.config.port : 'Connection setup required',
            target: demo ? 'Simulation only' : this.config ? 'ECU 0x' + this.config.ecuAddress.toString(16).toUpperCase() : 'No ECU address selected',
            identity: this.identity, connectionError: this.connectionError, error: this.error,
            file: b ? b.name : 'No calibration loaded', label: b ? b.profile.label : 'Choose a matching calibration',
            size: b ? b.data.length : null, hash: b ? b.hash : '', fileChecked: !!b,
            matched: !!(b && this.identity && matchIdentity(b.profile.expected, this.identity)), supported: !!(b && b.adapter),
            power: this.power, reasons, ready: !reasons.length && !this.busy, confirmation: Date.now() < this.confirmUntil,
            phase: this.phase, percent: this.percent, recovery: this.recovery && !demo };
    }
    stop() { if (this.transport) this.transport.close(); }
}
module.exports = { FlashWorkspace };
