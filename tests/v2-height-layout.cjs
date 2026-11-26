const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:8080/final_preview.html');
  await page.waitForFunction(()=>document.querySelectorAll('section').length===3);
  const results=await page.locator('svg').evaluateAll(svgs=>svgs.map(svg=>{
   const localBox=node=>{
    const b=node.getBBox(),m=svg.getCTM().inverse().multiply(node.getCTM());
    const p=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
    return {left:Math.min(...p.map(v=>v.x)),right:Math.max(...p.map(v=>v.x)),top:Math.min(...p.map(v=>v.y)),bottom:Math.max(...p.map(v=>v.y))};
   };
   const textBoxes=[...svg.querySelectorAll('text')].filter(n=>!n.closest('[data-layer="object-height-dimensions"]')).map(localBox);
   const columns=[...svg.querySelectorAll('[data-layer="object-height-dimensions"] [data-dimension-id]')].map(g=>localBox(g.querySelectorAll('line')[2]));
   return {moves:svg.heightColumnLayout.moves,columns,
    collision:columns.some(c=>textBoxes.some(t=>c.left>=t.left&&c.left<=t.right&&c.top<t.bottom&&c.bottom>t.top)),
    centerLabels:[...svg.querySelectorAll('[data-dimension-id$="/load-center"] text')].map(n=>n.textContent)};
  }));
  assert(results[2].moves.length>0,'Long-arm columns should compact');
  for(const r of results){
   assert(!r.collision);assert(r.moves.every(m=>m.to<m.from));
   for(let i=1;i<r.columns.length;i++)assert(r.columns[i-1].left-r.columns[i].left>=8-1e-8);
   assert(r.centerLabels.some(s=>/^H\d+'=/.test(s)));
  }
  console.log('PASS compact object-height columns: moved inward, maintained spacing, avoided text and preserved primed taper indices');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
