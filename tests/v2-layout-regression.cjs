const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'});
 try{
 const page=await browser.newPage();
 for(const [url,count] of [['pole_dimensions_preview.html',4],['arm_dimensions_preview.html',4],['object_heights_preview.html',1]]){
  await page.goto('http://127.0.0.1:8080/obsolete/previews/'+url);
  await page.waitForSelector('metadata',{state:'attached'});
  const results=await page.locator('svg').evaluateAll(nodes=>nodes.map(svg=>({
   issues:svg.dimensionLayout.issues,
   ids:[...svg.querySelectorAll('[data-dimension-id]')].map(n=>n.dataset.dimensionId),
   text:[...svg.querySelectorAll('[data-dimension-id] text')].map(n=>n.textContent),
   finite:svg.dimensionLayout.obstacles.every(o=>Object.values(o.bounds).every(Number.isFinite))
  })));
  assert.equal(results.length,count);
  for(const r of results){assert.deepEqual(r.issues,[]);assert(r.finite);assert.equal(new Set(r.ids).size,r.ids.length);assert(r.text.length>0);}
  if(url==='arm_dimensions_preview.html'){
   assert.deepEqual(results[1].text,['L1=180','L1=180']);
   assert.deepEqual(results[2].text,['L1=180','L2=180']);
   assert.equal(await page.locator('svg').nth(1).locator('circle').count(),1);
  }
  if(url==='object_heights_preview.html')assert(results[0].text.includes('H4=4800'));
 }
 console.log('PASS 9 preview fixtures: dimension presence, unique IDs, short-arm dot, L indices, finite obstacles and no reported label conflicts');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
