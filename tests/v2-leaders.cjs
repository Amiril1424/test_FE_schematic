const assert=require('node:assert/strict');const{chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'});try{
const page=await browser.newPage();await page.goto('http://127.0.0.1:8080/obsolete/previews/leaders_preview.html');await page.waitForFunction(()=>document.querySelectorAll('pre').length===3);
const results=await page.locator('svg').evaluateAll(nodes=>nodes.map(svg=>({count:+svg.dataset.requestCount,placed:svg.leaderLayout.placed.length,issues:svg.leaderLayout.issues,shift:svg.leaderLayout.dimensionShift,
 ids:[...svg.querySelectorAll('[data-leader-id]')].map(n=>n.dataset.leaderId),labels:[...svg.querySelectorAll('[data-layer="leaders"] text')].map(n=>n.textContent),
 placements:svg.leaderLayout.placed, bounds:svg.leaderLayout.placed.map(p=>p.bounds)})));
for(const r of results){assert.equal(r.placed,r.count);assert.deepEqual(r.issues,[]);assert.equal(new Set(r.ids).size,r.ids.length);assert.equal(r.ids.filter(x=>x.startsWith('wire-')).length,2);assert.equal(r.ids.filter(x=>x.startsWith('arm-')&&x.endsWith('/specification')).length,1);
 for(const l of r.placements){assert([1,2,3,4].includes(l.quadrant));if(l.id.startsWith('wire-'))assert(Math.abs(l.elbow.x-l.tip.x)<=18);}
 for(const b of r.bounds)assert(b.minX>=5&&b.maxX<=205&&b.minY>=5&&b.maxY<=292);
 assert(r.labels.some(s=>s.startsWith('計算外径Ø=')));}
assert(results[1].shift>0);
// A deliberately blocked page must report failure, not silently claim success.
const blocked=await page.evaluate(async()=>{const{placeSchematicLeaders}=await import('/schematic_leaders.js');const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 210 297');document.body.append(svg);const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x','0');text.setAttribute('y','150');text.setAttribute('font-size','400');text.textContent='BLOCK';svg.append(text);const r=placeSchematicLeaders(svg,[{id:'blocked',tip:{x:100,y:150},rows:['Test']}],document);svg.remove();return r.issues;});assert.equal(blocked.length,1);
console.log('PASS leaders: short single/pair, shared arm specification, multiple OHW, dimensions shifted, paper bounds, explicit blocked result');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
