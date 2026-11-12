'use strict';
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const PAGE = require('./phone-page');
// Network inspection only. An IP address is not proof of MHD connectivity.
function inspectNetwork() {
    const all = os.networkInterfaces(), rows = [];
    Object.keys(all).forEach((name) => (all[name] || []).forEach((a) => {
        if (!a.internal && (a.family === 'IPv4' || a.family === 4)) rows.push({ name, address: a.address });
    }));
    return { interfaces: rows, bridgeReady: false, phoneConnected: false,
        note: 'Hotspot diagnostic bridge is not implemented in this build.' };
}
function wifiAddress(interfaces) {
    const all=interfaces||os.networkInterfaces();
    for(const name of Object.keys(all)) {
        if(!/^wlan_bridge$|^wlan\d+$|^wlan\d+_bridge$/.test(name))continue;
        const a=(all[name]||[]).find((v)=>!v.internal&&(v.family==='IPv4'||v.family===4)&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v.address));
        if(a)return a.address;
    }
    return null;
}
class PhoneServer {
    constructor(stats){this.stats=stats;this.server=null;this.token=null;this.host=null;this.port=8765;this.lastPhone=0;this.error=null;this.timer=null;this.sockets=new Set();this.ready=false;}
    authorized(header){
        const expected='Bearer '+this.token;
        return !!this.token&&typeof header==='string'&&Buffer.byteLength(header)===Buffer.byteLength(expected)&&crypto.timingSafeEqual(Buffer.from(header),Buffer.from(expected));
    }
    handle(req,res){
        const send=(status,type,data)=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"});res.end(data);};
        if(req.method!=='GET')return send(405,'text/plain','Read-only endpoint');
        // the phone access helper (native/smiley-phone-net) asks this to know the page is on; it says nothing else
        if(req.url==='/.smiley-health'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store','X-Smiley-Phone':'1'});return res.end('ok');}
        if(req.url==='/'||req.url==='/index.html')return send(200,'text/html; charset=utf-8',PAGE);
        if(!this.authorized(req.headers.authorization))return send(401,'text/plain','Scan the code on the car screen');
        this.lastPhone=Date.now();
        if(req.url==='/api/stats')return send(200,'application/json',JSON.stringify(this.stats()));
        return send(404,'text/plain','Not found');
    }
    start(){
        if(this.server)return Promise.resolve();
        this.host=wifiAddress();if(!this.host)return Promise.reject(new Error('Car Wi-Fi not found. Turn on the car hotspot.'));
        this.token=crypto.randomBytes(16).toString('hex');this.error=null;this.lastPhone=0;
        return new Promise((resolve,reject)=>{
            const s=http.createServer((req,res)=>this.handle(req,res));this.server=s;
            s.on('connection',(socket)=>{this.sockets.add(socket);socket.on('close',()=>this.sockets.delete(socket));socket.setTimeout(15000,()=>socket.destroy());});
            s.on('error',(e)=>{this.error=e.message;this.stop();reject(new Error('Phone server: '+e.message));});
            s.listen(this.port,this.host,()=>{if(this.server!==s){s.close();resolve();return;}this.ready=true;this.timer=setTimeout(()=>this.stop(),30*60*1000);resolve();});
        });
    }
    stop(){clearTimeout(this.timer);this.sockets.forEach((s)=>s.destroy());this.sockets.clear();if(this.server)this.server.close();this.server=null;this.ready=false;this.token=null;this.lastPhone=0;}
    view(){return {running:this.ready,url:this.ready?'http://'+this.host+':'+this.port+'/#'+this.token:null,
        connected:this.ready&&Date.now()-this.lastPhone<5000,error:this.error};}
}
module.exports = { inspectNetwork,PhoneServer,wifiAddress };
