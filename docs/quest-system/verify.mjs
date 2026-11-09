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
assert.match(await set({profile:'practice',minutes:10,previous:0}),/60 XP/);
assert.match(await set({profile:'leisure',minutes:120}),/60 XP/);
assert.match(await set({profile:'practice',minutes:10,previous:10}),/10 XP/);
assert.match(await set({profile:'training',minutes:60,previous:0}),/75 XP/);
assert.equal(await evaluate("dailyXp('practice',5)+(dailyXp('practice',10)-dailyXp('practice',5))"),60);
assert.equal(await evaluate("dailyXp('leisure',2)"),1);
assert.equal(await evaluate("dailyXp('practice',20)"),70);
assert.equal(await evaluate("dailyXp('leisure',60)*.5"),15);
// Display rounding must never be used to calculate earned totals.
assert.deepEqual(await evaluate('[33.3,33.6,33.5,0,0.4].map(roundXp)'),[33,34,34,0,0]);
assert.deepEqual(await evaluate('[101*.33,101*.35,101*.32].map(roundXp)'),[33,35,32]);
assert.equal(await evaluate('roundXp(101)'),101);
assert.equal(await evaluate('roundXp(10*.4)'),4);
assert.equal(await evaluate('roundXp(dailyXp("leisure",2))'),1);
assert.match(await set({profile:'training',minutes:15,previous:0}),/23 XP/);
assert.doesNotMatch(await evaluate('document.getElementById("result").innerText'),/22\.5/);
for(const [tier,bonus] of [['common',100],['rare',500],['epic',2000],['legendary',6000]])assert.match(await set({tier,estimate:''}),new RegExp(`${new Intl.NumberFormat("en-US").format(bonus)} XP for finishing`));
assert.match(await set({estimate:240,completion:100}),/24,000 XP for finishing/);
assert.match(await set({estimate:20,completion:25}),/500 quest XP earned/);
for(const [h,tier] of [[1.99,'Common'],[2,'Rare'],[9.99,'Rare'],[10,'Epic'],[39.99,'Epic'],[40,'Legendary']])assert.match(await set({estimate:h}),new RegExp(tier));
assert.match(await set({minutes:-1}),/Enter valid/);
assert.match(await set({minutes:1000,previous:1000}),/Enter valid/);
assert.match(await set({minutes:10,previous:0,completion:101}),/Enter valid/);
await set({profile:'practice',minutes:10,previous:0,completion:0,tier:'rare',estimate:''});
for(const type of ['focus','mouseenter','click']){
 await evaluate(`document.querySelector('[data-tier="epic"]').dispatchEvent(new Event('${type}'))`);
 assert.match(await evaluate('document.getElementById("rarity-help").innerText'),/10 to under 40/);
 assert.equal(await evaluate(`document.querySelector('[data-tier="epic"]').getAttribute('aria-pressed')`),'true');
}
await evaluate('explain("legendary")');
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
console.log('PASS: daily reward profiles, split-session invariance, Dog routing arithmetic, quest presets/refinement/boundaries, partial progress, invalid inputs, hover/focus/click references, anchors and responsive overflow checks.');
socket.close();
