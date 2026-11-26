'use strict';
/**
 * ai.js - ask an AI assistant about the car, from the car's screen. Chat only.
 *
 * The owner brings their own API key (Anthropic or OpenAI) and the car needs internet (Wi-Fi or a
 * phone hotspot). A question goes out with a short summary of the live readings and the fault
 * codes last read, so the answer is about this car. The VIN is never sent.
 *
 * What it cannot do, by design: it runs no commands, writes no files outside its own settings
 * file, and sends nothing to the car. The answer is text on the screen and nothing else.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const PROVIDERS = {
    claude: { name: 'Claude', host: 'api.anthropic.com', path: '/v1/messages', model: 'claude-haiku-5-5' },
    openai: { name: 'OpenAI', host: 'api.openai.com', path: '/v1/chat/completions', model: 'gpt-4o-mini' },
};
const PRESETS = [
    ['Explain my fault codes', 'Explain the fault codes listed below in plain words: what each one means, how serious it is, and what to check first.'],
    ['Are my temperatures OK?', 'Look at the oil, coolant and intake temperatures below. Are they normal for this engine right now? Say what normal looks like.'],
    ['Is my boost healthy?', 'Look at the boost and boost target below. Is the engine making the boost it asks for? What would a boost leak look like?'],
    ['Before a hard drive', 'What should I check on this car before driving it hard today, given the readings and fault codes below?'],
];
const SYSTEM = 'You are an assistant shown on the centre screen of a 2021 BMW M340i xDrive (G20, B58 engine, ZF 8HP gearbox). '
    + 'Answer in plain text, at most 90 words, no lists, no markdown, no headings. Be specific to this car. '
    + 'You cannot control the car or run anything; never claim you did. If a question needs a mechanic, say so.';
const MAX_Q = 300, TIMEOUT_MS = 30000, KEEP_TURNS = 3;
const providerOf = (key) => (/^sk-ant-/.test(key) ? 'claude' : 'openai');

/** The default transport: one HTTPS POST, JSON in and out. Resolves { status, json }. */
function post(host, urlPath, headers, body) {
    return new Promise((resolve, reject) => {
        const data = Buffer.from(JSON.stringify(body));
        const req = https.request({ host, path: urlPath, method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': data.length }, headers) }, (res) => {
            const parts = []; let size = 0;
            res.on('data', (c) => { size += c.length; if (size < 200000) parts.push(c); });
            res.on('end', () => { let json = null; try { json = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) { /* not JSON */ } resolve({ status: res.statusCode, json }); });
        });
        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('No answer in 30 seconds')));
        req.on('error', reject);
        req.end(data);
    });
}

class Assistant {
    /** o: { dataDir, log, context: () => text about the car, post (tests) } */
    constructor(o) {
        this.o = o; this.file = path.join(o.dataDir, 'ai.json'); this.post = o.post || post;
        this.cfg = { key: '', provider: 'claude', model: '' };
        try { const c = JSON.parse(fs.readFileSync(this.file, 'utf8')); if (c && typeof c.key === 'string') this.cfg = Object.assign(this.cfg, c); } catch (e) { /* no key yet */ }
        this.turns = []; this.busy = false; this.question = ''; this.answer = ''; this.error = '';
    }
    save() {
        try { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.cfg), { mode: 0o600 }); fs.renameSync(this.file + '.tmp', this.file); }
        catch (e) { this.o.log && this.o.log.warn('ai: could not save the key (' + e.message + ')'); }
    }
    setKey(key) {
        key = String(key || '').trim();
        if (key.length < 20) { this.error = 'That key is too short. Check it and try again.'; return false; }
        this.cfg = { key, provider: providerOf(key), model: '' }; this.turns = []; this.answer = ''; this.error = ''; this.save(); return true;
    }
    forget() { this.cfg = { key: '', provider: 'claude', model: '' }; this.turns = []; this.answer = ''; this.question = ''; this.error = ''; try { fs.unlinkSync(this.file); } catch (e) { /* none */ } }
    model() { return this.cfg.model || PROVIDERS[this.cfg.provider].model; }
    /** Ask; `shown` is what the screen shows as the question (a preset's short name). Never throws. */
    async ask(question, shown) {
        question = String(question || '').trim().slice(0, MAX_Q);
        if (!question || this.busy) return;
        if (!this.cfg.key) { this.error = 'Add your API key first.'; return; }
        this.busy = true; this.question = shown || question; this.answer = ''; this.error = '';
        const P = PROVIDERS[this.cfg.provider], ctx = String((this.o.context && this.o.context()) || '').slice(0, 1500);
        const messages = this.turns.concat([{ role: 'user', content: question + (ctx ? '\n\nThe car right now:\n' + ctx : '') }]);
        try {
            const r = this.cfg.provider === 'claude'
                ? await this.post(P.host, P.path, { 'x-api-key': this.cfg.key, 'anthropic-version': '2023-06-01' }, { model: this.model(), max_tokens: 400, system: SYSTEM, messages })
                : await this.post(P.host, P.path, { authorization: 'Bearer ' + this.cfg.key }, { model: this.model(), max_tokens: 400, messages: [{ role: 'system', content: SYSTEM }].concat(messages) });
            const j = r.json || {};
            const text = this.cfg.provider === 'claude' ? ((j.content || []).filter((c) => c && c.type === 'text').map((c) => c.text).join(' '))
                : (((j.choices || [])[0] || {}).message || {}).content;
            if (r.status === 200 && typeof text === 'string' && text.trim()) {
                this.answer = text.replace(/\s+/g, ' ').trim().slice(0, 900);
                this.turns = this.turns.concat([{ role: 'user', content: question }, { role: 'assistant', content: this.answer }]).slice(-KEEP_TURNS * 2);
            } else {
                const why = (j.error && (j.error.message || j.error.type)) || '';
                this.error = r.status === 401 || r.status === 403 ? 'The key was refused. Enter it again.'
                    : r.status === 429 ? 'Too many questions or no credit left on this key.'
                    : r.status === 404 ? 'Model "' + this.model() + '" was not found for this key.'
                    : 'No answer (' + r.status + (why ? ': ' + String(why).slice(0, 80) : '') + ')';
            }
        } catch (e) {
            this.error = /ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|EHOSTUNREACH/.test(String(e.code || e.message)) ? 'No internet. Connect the car to Wi-Fi or a phone hotspot.'
                : /CERT|certificate|SSL|TLS/i.test(String(e.code || e.message)) ? 'Secure connection failed (' + String(e.code || e.message).slice(0, 40) + ')'
                : String(e.message || e).slice(0, 90);
        }
        this.busy = false;
    }
    view() {
        const k = this.cfg.key;
        return { hasKey: !!k, keyHint: k ? '...' + k.slice(-4) : '', provider: PROVIDERS[this.cfg.provider].name, model: this.model(),
            busy: this.busy, question: this.question, answer: this.answer, error: this.error, presets: PRESETS.map((p) => p[0]) };
    }
}
module.exports = { Assistant, PRESETS, PROVIDERS, providerOf, SYSTEM };
