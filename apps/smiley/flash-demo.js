'use strict';
// In-memory fictional ECU. No net module, no BMW addresses, no usable calibration.
const { hash } = require('./flash-files');
const { readIdentity, positive } = require('./flash-transport');
const VIN = 'SM1LEY' + 'DEM' + '00000001', HW = 'SIM-HW-001', SW = 'SIM-SW-001';
const enc = (s) => Buffer.from(s).toString('hex');
function demoBundle() {
    const data = Buffer.alloc(32768); for (let i = 0; i < data.length; i++) data[i] = (i * 7 + 31) & 255;
    return { simulation: true, name: 'smiley-demo.bin', data, hash: hash(data), blocker: '',
        profile: { schema: 1, label: 'SMILEY demonstration', ecuAddress: 0x1234,
            expected: { vinHex: enc(VIN), hardwareHex: enc(HW), softwareHex: enc(SW) } },
        adapter: {
            validateImage: async (b) => hash(b) === hash(data),
            plan: async () => ({ address: 0, length: data.length, blockSize: 256, session: 2,
                erase: { request: [0x31, 1, 0xff, 0], response: [0x71, 1, 0xff, 0, 0] },
                verify: { request: [0x31, 1, 0xff, 1], response: [0x71, 1, 0xff, 1, 0] },
                reset: { request: [0x11, 1], response: [0x51, 1] } }),
            authorize: async () => true,
            readConditions: async (send) => {
                const r = positive(await send([0x22, 0xfe, 1]), 0x22, [0xfe, 1], 9);
                return { at: Date.now(), speed: r[3], rpm: r[4], gear: r[5] === 1 ? 'P' : 'D', ignition: r[6] === 1,
                    voltage: r.readUInt16BE(7) / 100, minVoltage: 13, maxVoltage: 14.8 };
            },
            afterReset: async (o) => (await o.identify()).software === SW,
        } };
}
class DemoTransport {
    constructor(bundle, options) {
        this.simulation = true; this.bundle = bundle; this.active = false; this.config = { ecuAddress: 0x1234, host: 'In-memory ECU', port: 0 };
        this.calls = []; this.delay = (options || {}).delay == null ? 25 : options.delay; this.received = []; this.seq = 1; this.programming = false;
    }
    async connect() { this.active = true; }
    close() { this.active = false; }
    async request(bytes) {
        if (!this.active) throw Error('Simulation disconnected');
        const b = Buffer.from(bytes); this.calls.push(b);
        if (this.delay) await new Promise((resolve) => setTimeout(resolve, this.delay));
        const no = () => Buffer.from([0x7f, b[0], 0x22]);
        if (b[0] === 0x22) {
            const did = b.readUInt16BE(1), s = ({ 61840: VIN, 61841: HW, 61844: SW })[did];
            if (s) return Buffer.concat([Buffer.from([0x62, b[1], b[2]]), Buffer.from(s)]);
            if (did === 0xfe01) return Buffer.from([0x62, 0xfe, 1, 0, 0, 1, 1, 5, 100]); // 13.80 V
            return no();
        }
        if (b[0] === 0x10 && b[1] === 2) { this.programming = true; return Buffer.from([0x50, 2, 0, 50, 1, 244]); }
        if (!this.programming) return no();
        if (b[0] === 0x31 && b[3] === 0) { this.erased = true; this.received = []; return Buffer.from([0x71, 1, 0xff, 0, 0]); }
        if (b[0] === 0x34 && this.erased && b.length === 11 && b.readUInt32BE(3) === 0 && b.readUInt32BE(7) === this.bundle.data.length) {
            this.download = true; this.seq = 1; return Buffer.from([0x74, 0x20, 1, 2]);
        }
        if (b[0] === 0x36 && this.download && b[1] === this.seq) {
            this.received.push(b.slice(2)); this.seq = (this.seq + 1) & 255; return Buffer.from([0x76, b[1]]);
        }
        if (b[0] === 0x37 && this.download && Buffer.concat(this.received).equals(this.bundle.data)) { this.download = false; this.transferred = true; return Buffer.from([0x77]); }
        if (b[0] === 0x31 && b[3] === 1 && this.transferred && hash(Buffer.concat(this.received)) === this.bundle.hash) { this.verified = true; return Buffer.from([0x71, 1, 0xff, 1, 0]); }
        if (b[0] === 0x11 && this.verified) { this.programming = false; return Buffer.from([0x51, b[1]]); }
        return no();
    }
}
module.exports = { demoBundle, DemoTransport, readIdentity };
