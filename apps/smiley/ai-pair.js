'use strict';
/**
 * ai-pair.js - type the AI key on a phone, not on the car screen.
 *
 * While the owner has the pairing screen open, a one-page site runs on the car's Wi-Fi address.
 * The car shows its address as a QR code with a one-time code in it; the phone opens the page,
 * the owner pastes the key, and the page hands it to the app. Then the site switches itself off.
 *
 *   - only reachable on the car's own Wi-Fi, and only while pairing is on (ten minutes at most)
 *   - the key is accepted only with the one-time code from the QR; a wrong code gets nothing
 *   - the page can do one thing: hand over a key. It reads nothing back from the car.
 *
 * It uses the same port as the phone gauges page (8765), which the Phone Access helper opens on
 * the car's hotspot while a page answers there.
 */
const http = require('http');
const crypto = require('crypto');
const { wifiAddress } = require('./phone');

const PORT = 8765, LIFE_MS = 10 * 60 * 1000, MAX_BODY = 600;
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI key for the car</title><style>
body{margin:0;background:#0c0c0d;color:#fff;font:17px/1.45 system-ui,sans-serif;padding:28px 22px;max-width:520px;margin:auto}
h1{font-size:24px;margin:0 0 6px}p{color:#b5b5b5;margin:0 0 18px}
input{width:100%;box-sizing:border-box;font:17px monospace;padding:14px;border-radius:10px;border:1px solid #444;background:#161617;color:#fff}
button{width:100%;margin-top:14px;font:600 18px system-ui;padding:15px;border:0;border-radius:10px;background:#e10600;color:#fff}
button:disabled{opacity:.5}#m{margin-top:16px;min-height:24px}</style></head><body>
<h1>AI key for the car</h1><p>Paste the API key from your Anthropic or OpenAI account. It goes to the app in your car over the car's Wi-Fi and is saved there only.</p>
<label for="k">API key</label><input id="k" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
<button id="b">Send to the car</button><div id="m" role="status"></div>
<script>
var b=document.getElementById('b'),k=document.getElementById('k'),m=document.getElementById('m');
b.onclick=function(){var t=location.hash.slice(1),v=k.value.trim();if(!t){m.textContent='Scan the code on the car screen again.';return;}
if(v.length<20){m.textContent='That key looks too short.';return;}b.disabled=true;m.textContent='Sending...';
fetch('/api/key',{method:'POST',headers:{'Authorization':'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({key:v})})
.then(function(r){return r.text().then(function(x){if(r.ok){k.value='';m.textContent='Done. The car has the key. You can close this page.';}else{b.disabled=false;m.textContent=x;}});})
.catch(function(){b.disabled=false;m.textContent='Could not reach the car. Is this phone on the car Wi-Fi?';});};
</script></body></html>`;

class KeyPairing {
    /** onKey(key) -> true when the key was accepted; host() for tests (the car's Wi-Fi address otherwise). */
    constructor(onKey, host) { this.onKey = onKey; this.hostFn = host || wifiAddress; this.server = null; this.token = null; this.host = null; this.port = PORT; this.error = null; this.timer = null; this.done = false; }
    authorized(header) {
        const expected = 'Bearer ' + this.token;
        return !!this.token && typeof header === 'string' && Buffer.byteLength(header) === Buffer.byteLength(expected) && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    }
    handle(req, res) {
        const send = (status, type, data) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" }); res.end(data); };
        if (req.method === 'GET') {
            if (req.url === '/.smiley-health') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'X-Smiley-Phone': '1' }); return res.end('ok'); }
            if (req.url === '/' || req.url === '/index.html') return send(200, 'text/html; charset=utf-8', PAGE);
            return send(404, 'text/plain', 'Not found');
        }
        if (req.method !== 'POST' || req.url !== '/api/key') return send(405, 'text/plain', 'Not allowed');
        if (!this.authorized(req.headers.authorization)) return send(401, 'text/plain', 'Scan the code on the car screen again.');
        const parts = []; let size = 0, over = false;
        req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { over = true; req.destroy(); } else parts.push(c); });
        req.on('end', () => {
            if (over) return;
            let key = null; try { key = JSON.parse(Buffer.concat(parts).toString('utf8')).key; } catch (e) { /* not JSON */ }
            if (typeof key !== 'string' || !this.onKey(key)) return send(400, 'text/plain', 'That key was not accepted. Check it and try again.');
            send(200, 'text/plain', 'ok'); this.done = true; setTimeout(() => this.stop(), 300);
        });
    }
    start() {
        if (this.server) return Promise.resolve();
        this.host = this.hostFn(); if (!this.host) return Promise.reject(new Error('Car Wi-Fi not found. Turn on the car hotspot and join it with your phone.'));
        this.token = crypto.randomBytes(16).toString('hex'); this.error = null; this.done = false;
        return new Promise((resolve, reject) => {
            const s = http.createServer((req, res) => this.handle(req, res)); this.server = s;
            s.on('connection', (socket) => socket.setTimeout(15000, () => socket.destroy()));
            s.on('error', (e) => { this.error = e.message; this.stop(); reject(new Error('Pairing: ' + e.message)); });
            s.listen(this.port, this.host, () => { this.timer = setTimeout(() => this.stop(), LIFE_MS); if (this.timer.unref) this.timer.unref(); resolve(); });
        });
    }
    stop() { clearTimeout(this.timer); if (this.server) this.server.close(); this.server = null; this.token = null; }
    view() { return { running: !!this.server, url: this.server ? 'http://' + this.host + ':' + this.port + '/#' + this.token : null, error: this.error, done: this.done }; }
}
module.exports = { KeyPairing, PAGE };
