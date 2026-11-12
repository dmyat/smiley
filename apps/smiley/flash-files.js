'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { integer, validateConnection } = require('./flash-transport');
const MAX_IMAGE = 16 * 1024 * 1024;
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
function readLocal(dir, name, max) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(name || '') || name.includes('..')) throw Error('Use a simple file name inside the flash folder');
    const file = path.join(dir, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) throw Error('Invalid or oversized ' + name);
    const root = fs.realpathSync(dir), real = fs.realpathSync(file);
    if (path.dirname(real) !== root) throw Error('File must stay inside the flash folder');
    const data = fs.readFileSync(file); if (data.length > max) throw Error('File changed while loading'); return data;
}
function readJSON(dir, name) { return JSON.parse(readLocal(dir, name, 32768).toString('utf8')); }
function loadConnection(dataDir) { return validateConnection(readJSON(path.join(dataDir, 'flash'), 'connect.json')); }
function loadCalibration(dataDir, providers) {
    const dir = path.join(dataDir, 'flash'), p = readJSON(dir, 'profile.json');
    if (p.schema !== 1 || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(p.provider || '')) throw Error('Invalid programming profile');
    if (typeof p.label !== 'string' || !p.label.trim() || p.label.length > 48) throw Error('Profile needs a short label');
    integer(p.ecuAddress, 1, 65535, 'profile ECU address');
    for (const k of ['vinHex', 'hardwareHex', 'softwareHex']) {
        const h = (p.expected || {})[k];
        if (typeof h !== 'string' || !/^(?:[0-9a-fA-F]{2})+$/.test(h) || h.length > 512) throw Error('Profile requires exact ' + k);
        p.expected[k] = h.toLowerCase();
    }
    if (p.expected.vinHex.length !== 34) throw Error('Profile requires a 17-byte VIN');
    const image = p.image || {};
    integer(image.bytes, 1, MAX_IMAGE, 'image size');
    if (!/^[a-fA-F0-9]{64}$/.test(image.sha256 || '')) throw Error('Profile requires a SHA-256 hash');
    const data = readLocal(dir, image.file, MAX_IMAGE);
    if (data.length !== image.bytes || hash(data) !== image.sha256.toLowerCase()) throw Error('Calibration size or SHA-256 does not match');
    const adapter = Object.prototype.hasOwnProperty.call(providers, p.provider) ? providers[p.provider] : null;
    return { profile: p, data, adapter, simulation: false, name: image.file,
        hash: hash(data), blocker: adapter ? '' : 'No verified programming adapter for ' + p.provider };
}
function matchIdentity(expected, actual) {
    return !!actual && ['vinHex', 'hardwareHex', 'softwareHex'].every((k) => expected[k] === actual[k]);
}
module.exports = { loadConnection, loadCalibration, readJSON, readLocal, matchIdentity, hash, MAX_IMAGE };
