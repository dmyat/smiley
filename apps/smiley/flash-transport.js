'use strict';
// Outbound ISO 13400 transport. No listener, Wi-Fi bridge, discovery or firewall changes.
// An explicit gateway IP, tester address and ECU target are required. No BMW addresses guessed.
const net = require('net');
const TYPE = { ROUTE: 5, ROUTED: 6, ALIVE: 7, ALIVE_REPLY: 8, DIAG: 0x8001, ACK: 0x8002, NACK: 0x8003 };
function integer(n, min, max, name) {
    if (!Number.isInteger(n) || n < min || n > max) throw Error('Invalid ' + name);
    return n;
}
function validateConnection(c) {
    if (!c || c.protocol !== 'doip' || net.isIP(c.host) !== 4) throw Error('Set an IPv4 DoIP gateway in connect.json');
    integer(c.port, 1, 65535, 'port');
    integer(c.testerAddress, 1, 65535, 'tester address');
    integer(c.ecuAddress, 1, 65535, 'ECU address');
    integer(c.activationType, 0, 255, 'routing activation type');
    if (c.testerAddress === c.ecuAddress) throw Error('Tester and ECU addresses must differ');
    return Object.assign({}, c);
}
function packet(type, payload) {
    const p = Buffer.from(payload), b = Buffer.alloc(8 + p.length);
    b[0] = 2; b[1] = 0xfd; b.writeUInt16BE(type, 2); b.writeUInt32BE(p.length, 4); p.copy(b, 8); return b;
}
function address(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; }
class DoipTransport {
    constructor(config, options) {
        this.config = validateConnection(config); const o = options || {};
        this.socketFactory = o.socketFactory || (() => new net.Socket());
        this.timeout = o.timeout || 5000; this.pendingTimeout = o.pendingTimeout || 15000;
        this.totalTimeout = o.totalTimeout || 120000;
        this.onClose = o.onClose || (() => {}); this.active = false; this.socket = null;
        this.waiter = null; this.buffer = Buffer.alloc(0); this.tail = Promise.resolve(); this.generation = 0;
    }
    async connect() {
        if (this.socket) throw Error('Connection already open');
        const s = this.socket = this.socketFactory(); this.generation++;
        s.on('data', (b) => { if (s === this.socket) { try { this._data(b); } catch (e) { this.close(e); } } });
        s.on('error', (e) => { if (s === this.socket) this.close(e); });
        s.on('close', () => { if (s === this.socket) this.close(Error('Diagnostic connection closed')); });
        await new Promise((resolve, reject) => {
            const t = setTimeout(() => { this.close(Error('Gateway connection timed out')); }, this.timeout);
            this.connectWaiter = { reject: (e) => { clearTimeout(t); reject(e); } };
            s.once('connect', () => { clearTimeout(t); this.connectWaiter = null; resolve(); });
            try { s.connect(this.config.port, this.config.host); } catch (e) { this.close(e); }
        });
        await this._exchange('route', Buffer.concat([address(this.config.testerAddress), Buffer.from([this.config.activationType, 0, 0, 0, 0])]));
        this.active = true;
    }
    request(request) {
        const b = Buffer.from(request), generation = this.generation;
        if (!b.length || b.length > 65535) return Promise.reject(Error('Invalid UDS request length'));
        const run = this.tail.then(() => {
            if (!this.active || generation !== this.generation) throw Error('Connect to the ECU first');
            return this._exchange('uds', b);
        });
        this.tail = run.catch(() => {}); return run;
    }
    _exchange(kind, bytes) {
        return new Promise((resolve, reject) => {
            if (!this.socket || this.waiter) return reject(Error('Transport unavailable or busy'));
            const w = this.waiter = { kind, bytes, resolve, reject, deadline: Date.now() + this.totalTimeout };
            this._arm(w, this.timeout);
            const p = kind === 'route' ? packet(TYPE.ROUTE, bytes) : packet(TYPE.DIAG,
                Buffer.concat([address(this.config.testerAddress), address(this.config.ecuAddress), bytes]));
            try { this.socket.write(p); } catch (e) { this.close(e); }
        });
    }
    _arm(w, delay) {
        clearTimeout(w.timer);
        w.timer = setTimeout(() => this.close(Error('ECU response timed out; reconnect before retrying')),
            Math.max(1, Math.min(delay, w.deadline - Date.now())));
    }
    _finish(value) { const w = this.waiter; if (!w) return; this.waiter = null; clearTimeout(w.timer); w.resolve(value); }
    _data(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        if (this.buffer.length > 2 * 1024 * 1024) throw Error('DoIP receive buffer exceeded');
        while (this.buffer.length >= 8) {
            const b = this.buffer;
            if (b[0] !== 2 || b[1] !== 0xfd) throw Error('Unexpected DoIP protocol header');
            const n = b.readUInt32BE(4); if (n > 1024 * 1024) throw Error('Oversized DoIP frame');
            if (b.length < 8 + n) return;
            this.buffer = b.slice(8 + n); this._frame(b.readUInt16BE(2), b.slice(8, 8 + n));
        }
    }
    _frame(type, p) {
        const w = this.waiter, c = this.config;
        if (type === TYPE.ALIVE) {
            if (p.length !== 0) throw Error('Malformed DoIP alive check');
            this.socket.write(packet(TYPE.ALIVE_REPLY, address(c.testerAddress))); return;
        }
        if (type === 0) throw Error('DoIP gateway rejected the packet');
        if (type === TYPE.ROUTED) {
            if (!w || w.kind !== 'route' || p.length < 9 || p.readUInt16BE(0) !== c.testerAddress) throw Error('Unexpected routing response');
            if (p[4] !== 0x10) throw Error('Routing activation denied (0x' + p[4].toString(16) + ')');
            this.gatewayAddress = p.readUInt16BE(2); this._finish(p); return;
        }
        if (![TYPE.DIAG, TYPE.ACK, TYPE.NACK].includes(type)) return;
        if (p.length < 5) throw Error('Truncated diagnostic frame');
        if (p.readUInt16BE(0) !== c.ecuAddress || p.readUInt16BE(2) !== c.testerAddress) return;
        if (type === TYPE.ACK) { if (p[4] !== 0) throw Error('Invalid diagnostic acknowledgement'); return; }
        if (type === TYPE.NACK) throw Error('Gateway rejected diagnostic delivery (0x' + p[4].toString(16) + ')');
        if (!w || w.kind !== 'uds') throw Error('Unsolicited ECU response; reconnect');
        const r = p.slice(4), sid = w.bytes[0];
        if (r[0] === 0x7f) {
            if (r.length !== 3 || r[1] !== sid) throw Error('Mismatched negative response');
            if (r[2] === 0x78) { this._arm(w, this.pendingTimeout); return; } // WAIT, never resend the write.
        } else if (r[0] !== sid + 0x40) throw Error('Mismatched ECU service response');
        this._finish(r);
    }
    close(reason) {
        const e = reason || Error('Disconnected'), s = this.socket;
        this.socket = null; this.active = false; this.buffer = Buffer.alloc(0); this.generation++;
        if (this.connectWaiter) { this.connectWaiter.reject(e); this.connectWaiter = null; }
        if (this.waiter) { clearTimeout(this.waiter.timer); this.waiter.reject(e); this.waiter = null; }
        if (s) { s.destroy(); this.onClose(e); }
    }
}
function positive(response, sid, echo, exactLength) {
    const r = Buffer.from(response || []), prefix = Buffer.from([sid + 0x40].concat(echo || []));
    if (r[0] === 0x7f) throw Error('ECU rejected service 0x' + sid.toString(16) + ' (NRC 0x' + (r[2] || 0).toString(16) + ')');
    if (r.length < prefix.length || !r.slice(0, prefix.length).equals(prefix) ||
        (exactLength != null && r.length !== exactLength)) throw Error('Invalid response to service 0x' + sid.toString(16));
    return r;
}
async function readIdentity(transport) {
    const result = {};
    for (const entry of [['vin', 0xf190], ['hardware', 0xf191], ['software', 0xf194]]) {
        const did = [entry[1] >> 8, entry[1] & 255];
        const r = positive(await transport.request([0x22].concat(did)), 0x22, did);
        if (r.length < 4) throw Error('Empty ' + entry[0] + ' identity');
        result[entry[0] + 'Hex'] = r.slice(3).toString('hex');
        result[entry[0]] = r.slice(3).toString('ascii').replace(/[^\x20-\x7e]/g, '').trim() || result[entry[0] + 'Hex'];
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(result.vin) || result.vinHex.length !== 34) throw Error('ECU did not return a valid VIN');
    return result;
}
module.exports = { DoipTransport, packet, TYPE, positive, readIdentity, validateConnection, integer };
