'use strict';
// One SMILEY diagnostic conversation at a time, including telemetry and hold jobs.
//
//   action(fn)  a button press: refused while another request runs (the driver presses again)
//   queued(fn)  an exhaust flap command: waits its turn instead. The rpm guard's hand-back to
//               OEM and the 15 s hold must reach the DME even when a fault scan is running, so
//               they are never dropped for being late.
//   poll(fn)    background telemetry: skipped while anything else runs
class Session {
    constructor() { this.pending = 0; this.tail = Promise.resolve(); this.polling = null; this.paused = false; this.demo = false; }
    get busy() { return this.pending > 0; }
    _gate(allowPaused) {
        if (this.demo) throw new Error('Demo mode: nothing is sent to the car');
        if (this.paused && !allowPaused) throw new Error('This app is paused');
    }
    _enqueue(fn) {
        this.pending++;
        const run = this.tail.then(async () => {
            if (this.polling) { try { await this.polling; } catch (e) { /* the poll logs its own errors */ } }
            return fn();
        });
        this.tail = run.then(() => {}, () => {});
        const done = () => { this.pending--; };
        run.then(done, done);
        return run;
    }
    async action(fn, allowPaused) {
        this._gate(allowPaused);
        if (this.busy) throw new Error('Another request is still running. Try again.');
        return this._enqueue(fn);
    }
    async queued(fn, allowPaused) {
        this._gate(allowPaused);
        return this._enqueue(fn);
    }
    async poll(fn) {
        if (this.busy || this.polling || this.paused || this.demo) return;
        const p = Promise.resolve().then(fn); this.polling = p;
        try { return await p; } finally { if (this.polling === p) this.polling = null; }
    }
}
module.exports = { Session };
