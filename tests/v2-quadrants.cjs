const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8080/final_preview.html');
  await page.waitForFunction(()=>document.querySelectorAll('section').length===3);
  const diameters=await page.locator('[data-dimension-kind="diameter"]').evaluateAll(groups=>groups.map(g=>({
   quadrant:+g.dataset.quadrant,run:+g.dataset.diagonalRun,id:g.dataset.dimensionId,textPosition:g.dataset.textPosition,
   lines:[...g.querySelectorAll('line')].slice(0,2).map(n=>({dx:+n.getAttribute('x2')-n.getAttribute('x1'),dy:+n.getAttribute('y2')-n.getAttribute('y1')}))
  })));
  for(const d of diameters){
   assert([1,2,3,4].includes(d.quadrant));assert(d.id.endsWith('diameter-top')?d.run>=4&&d.run<=9:d.run>=10&&d.run<=12);
   for(const line of d.lines)assert(Math.abs(Math.abs(line.dx)-Math.abs(line.dy))<1e-8);
   if(d.quadrant>=3){
    assert(Math.abs(d.lines[0].dx-d.lines[1].dx)<1e-8);
    assert(Math.abs(d.lines[0].dy-d.lines[1].dy)<1e-8);
    assert.equal(d.textPosition,d.quadrant===3?'outside-left':'outside-right');
   }
  }
  assert(diameters.filter(d=>d.id.endsWith('diameter-top')).every(d=>d.quadrant===1));
  const datumChecks=await page.locator('svg').evaluateAll(svgs=>svgs.map(svg=>{
   const line=svg.querySelector('[data-reference-id="ground-level"] line');
   const left=+line.getAttribute('x1'),right=+line.getAttribute('x2'),y=+line.getAttribute('y1');
   const center=svg.engineeringTransform.toPaper({x:0,y:0}).x;
   const object=(svg.querySelector('[data-component-id="installation/baseplate"]')||svg.querySelector('[data-component-id="pole-1/above-gl"]')).getBBox();
   const glText=svg.querySelector('[data-reference-id="ground-level"] text').getBBox();
   const inspectionText=svg.querySelector('[data-reference-id="inspection"] text').getBBox();
   const extensions=[...svg.querySelectorAll('[data-dimension-id] line')].filter(n=>
    Math.abs(+n.getAttribute('y1')-y)<1e-8&&Math.abs(+n.getAttribute('y2')-y)<1e-8);
   return {symmetric:Math.abs((left+right)/2-center)<1e-8,
    clearText:glText.x+glText.width<object.x-2&&inspectionText.x>object.x+object.width+6,
    separated:extensions.every(n=>Math.max(+n.getAttribute('x1'),+n.getAttribute('x2'))<=left-0.99||
      Math.min(+n.getAttribute('x1'),+n.getAttribute('x2'))>=right+0.99)};
  }));
  assert(datumChecks.every(c=>c.symmetric&&c.separated&&c.clearText));
  const spacing=await page.locator('[data-leader-id] text').evaluateAll(nodes=>nodes.map(n=>({
   letter:n.getAttribute('letter-spacing'),word:n.getAttribute('word-spacing')
  })));
  const rows=await page.locator('[data-leader-id]').evaluateAll(groups=>groups.map(g=>[...g.querySelectorAll('text')].map(t=>+t.getAttribute('y'))));
  for(const ys of rows)for(let i=1;i<ys.length;i++)assert(ys[i]-ys[i-1]>=4.1-1e-8);
  assert(spacing.length>0);
  assert(spacing.every(s=>s.letter==='0.12'&&s.word==='0.35'));
  const leader=await page.evaluate(async()=>{
   const {placeSchematicLeaders}=await import('/schematic_leaders.js');
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 210 297');document.body.append(svg);
   const result=placeSchematicLeaders(svg,[{id:'priority',tip:{x:100,y:150},rows:['Test'],kind:'object'}],document);
   svg.remove();return result.placed[0];
  });
  assert.equal(leader.quadrant,1);assert.equal(leader.elbow.x-leader.tip.x,9);assert.equal(leader.tip.y-leader.elbow.y,9);
  await page.locator('svg').nth(2).screenshot({path:'test-results/quadrant-upper-diameter.png'});
  console.log('PASS 45-degree diameter diagonals, paper-mm limits, upper Q1 preference and default Q1 leader');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
