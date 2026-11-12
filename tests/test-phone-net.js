'use strict';
// The phone access helper against a pretend firewall: a stand-in `nft` that keeps the chain's rules
// in a file. No car and no real firewall are involved.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), cp = require('child_process'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-net-')), rules = path.join(dir, 'rules.json'), fake = path.join(dir, 'nft');
fs.writeFileSync(rules, JSON.stringify({ next: 10, rules: [{ h: 3, text: 'ct state established accept' }, { h: 4, text: 'iifname "wlan_bridge" tcp dport 8470 accept comment "mgu-updater-web"' }] }));
fs.writeFileSync(fake, '#!/usr/bin/env node\n' + `
const fs=require('fs'),f=${JSON.stringify(rules)},s=JSON.parse(fs.readFileSync(f,'utf8')),a=process.argv.slice(2);
if(a[0]==='-a'&&a[1]==='list'){console.log('table ip filter {\\n\\tchain input { # handle 1');s.rules.forEach(r=>console.log('\\t\\t'+r.text+' # handle '+r.h));console.log('\\t}\\n}');}
else if(a[0]==='insert'){s.rules.unshift({h:s.next++,text:a.slice(5).join(' ')});fs.writeFileSync(f,JSON.stringify(s));}
else if(a[0]==='delete'){s.rules=s.rules.filter(r=>String(r.h)!==a[6]);fs.writeFileSync(f,JSON.stringify(s));}
else process.exit(2);
`, { mode: 0o755 });
const mine = () => JSON.parse(fs.readFileSync(rules, 'utf8')).rules.filter((r) => /smiley-phone-net/.test(r.text));
const others = () => JSON.parse(fs.readFileSync(rules, 'utf8')).rules.filter((r) => !/smiley-phone-net/.test(r.text)).length;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what) => { for (let i = 0; i < 80; i++) { if (fn()) return; await wait(50); } throw new Error('timed out: ' + what); };
(async () => {
    // a rule left by an earlier run is cleared at start
    const s0 = JSON.parse(fs.readFileSync(rules, 'utf8')); s0.rules.unshift({ h: 9, text: 'iifname "wlan_bridge" tcp dport 8765 accept comment "smiley-phone-net"' }); fs.writeFileSync(rules, JSON.stringify(s0));
    let page = null;
    const startPage = (header) => new Promise((r) => { page = http.createServer((q, res) => { res.writeHead(200, header ? { 'X-Smiley-Phone': '1' } : {}); res.end('ok'); }).listen(8765, '127.0.0.1', r); });
    const stopPage = () => new Promise((r) => page.close(r));
    const helper = cp.spawn(process.execPath, [path.join(__dirname, '..', 'native', 'smiley-phone-net', 'smiley-phone-net')],
        { env: Object.assign({}, process.env, { SMILEY_PHONE_NFT: fake, SMILEY_PHONE_ADDR: '127.0.0.1', SMILEY_PHONE_TICK_MS: '100' }), stdio: ['ignore', 'pipe', 'inherit'] });
    let out = ''; helper.stdout.on('data', (d) => { out += d; });
    try {
        await until(() => /started/.test(out), 'start'); assert.strictEqual(mine().length, 0, 'a stale rule is removed at start');
        await wait(400); assert.strictEqual(mine().length, 0, 'closed while the phone page is off');
        await startPage(false); await wait(500); assert.strictEqual(mine().length, 0, 'another program on the port is not SMILEY: stays closed'); await stopPage();
        await startPage(true); await until(() => mine().length === 1, 'open');
        assert(/iifname "wlan_bridge" tcp dport 8765 accept/.test(mine()[0].text), 'only the car Wi-Fi and only port 8765');
        assert.strictEqual(JSON.parse(fs.readFileSync(rules, 'utf8')).rules[0].text, mine()[0].text, 'at the top of the chain');
        await wait(400); assert.strictEqual(mine().length, 1, 'one rule, not one per check');
        await stopPage(); await until(() => mine().length === 0, 'close when the page stops');
        await startPage(true); await until(() => mine().length === 1, 'open again');
        helper.kill('SIGTERM'); await new Promise((r) => helper.on('exit', r));
        assert.strictEqual(mine().length, 0, 'closed when the helper stops'); assert.strictEqual(others(), 2, "other programs' rules are never touched");
        await stopPage();
        console.log('PASS phone access helper: opens port 8765 on the car Wi-Fi only while the SMILEY phone page is on, and cleans up');
    } catch (e) { helper.kill('SIGKILL'); try { page.close(); } catch (x) { /* closed */ } console.error(e); process.exitCode = 1; }
})();
