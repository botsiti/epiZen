// Run against an isolated headless Chromium instance on port 9338.
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pages = await (await fetch('http://localhost:9338/json')).json();
const socket = new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0;const pending=new Map();
socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true});assert.ok(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;};
await send('Page.enable');
await send('Page.navigate',{url:new URL('./index.html',import.meta.url).href});
for(let i=0;i<40;i++){if(await evaluate('document.readyState === "complete" && !!document.getElementById("result")'))break;await new Promise(r=>setTimeout(r,100));}
const set=async values=>evaluate(`(()=>{const values=${JSON.stringify(values)};for(const [id,value] of Object.entries(values)){document.getElementById(id).value=value;}calculate();return document.getElementById('result').innerText;})()`);
assert.match(await set({estimate:10,actual:10,difficulty:1.25,completion:100,share:70}),/750 XP/);
assert.match(await evaluate('document.getElementById("result").innerText'),/Personal Growth · 525 XP/);
assert.match(await set({estimate:240,actual:240,difficulty:1.5,completion:100,share:100}),/18,720 XP/);
assert.match(await evaluate('document.getElementById("result").innerText'),/4,320 earned bonus XP/);
for(const [h,tier] of [[1.75,'Common'],[2,'Rare'],[9.75,'Rare'],[10,'Epic'],[39.75,'Epic'],[40,'Legendary']])assert.match(await set({estimate:h}),new RegExp(tier));
assert.match(await set({estimate:10,actual:5,difficulty:1,completion:50,share:70}),/360 XP/);
assert.match(await set({estimate:0,actual:0,completion:0}),/0 XP/);
assert.match(await set({estimate:-1}),/Enter valid/);
assert.match(await set({estimate:1,share:101}),/Enter valid/);
assert.match(await set({estimate:'',share:70}),/Enter valid/);
await set({estimate:10,actual:10,difficulty:1.25,completion:100,share:70});
await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
for(const width of [1000,650,320]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,`Horizontal overflow at ${width}`);
 const missing=await evaluate(`Array.from(document.querySelectorAll('a[href^="#"]')).filter(a=>!document.querySelector(a.getAttribute('href'))).map(a=>a.href)`);assert.deepEqual(missing,[]);
 const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(new URL(`./evidence/guide-${width}.png`,import.meta.url),Buffer.from(data,'base64'));
}
await send('Emulation.setDeviceMetricsOverride',{width:1000,height:1100,deviceScaleFactor:1,mobile:false});
await evaluate('document.getElementById("calculator").scrollIntoView()');
const {data}=await send('Page.captureScreenshot',{format:'png'});
await writeFile(new URL('./evidence/calculator.png',import.meta.url),Buffer.from(data,'base64'));
console.log('PASS: calculator examples, rarity boundaries, progress, invalid inputs, anchor links, and no horizontal overflow at 1000/650/320px.');
socket.close();
