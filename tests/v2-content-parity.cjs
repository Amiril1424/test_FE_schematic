const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
 const browser=await chromium.launch({channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1400,height:1100}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8080/obsolete/previews/geometry_preview.html');
  const results=await page.evaluate(async()=>{
   const {createProject}=await import('/schematic_Lighting_1a.js');
   const {generateSchematicSVG}=await import('/schematic_final.js');
   document.body.replaceChildren();const results=[];
   for(const type of ['on-gl','embedment','baseplate-under-gl'])for(const tapered of [false,true]) {
    const project=createProject({installation:{type,depth:type==='on-gl'?0:300},
     poles:[{height:8000,type:tapered?'tapered':'straight',lowerDiameter:165,upperDiameter:85,thickness:4}],
     arms:[{height:7000,length:1000,diameter:60.5,thickness:3.2,verticalAngle:5}],
     directObjects:[{type:'lighting',attachment:'pole-top'}],
     overheadWires:[{name:'Wire',height:5500,diameter:12,weight:0.2,span:5000}]});
    const start=performance.now(),result=await generateSchematicSVG(project,document);
    const svg=result.svg;document.body.append(svg);
    results.push({type,tapered,ms:performance.now()-start,issues:result.report.issues,
     texts:[...svg.querySelectorAll('text')].map(n=>n.textContent),
     components:[...svg.querySelectorAll('[data-component-id]')].map(n=>n.dataset.componentId),
     leaders:[...svg.querySelectorAll('[data-leader-id]')].map(n=>n.dataset.leaderId),
     centerlines:svg.querySelectorAll('[data-role="centerline"]').length,
     layers:[...svg.querySelectorAll('[data-layer]')].map(n=>n.dataset.layer),
     xml:result.svgString.includes('stroke-dasharray="6 1 1 1"')});
   }
   return results;
  });
  assert.deepEqual(errors,[]);
  for(const r of results){
   assert.deepEqual(r.issues,[],JSON.stringify(r));
   for(const text of ['G.L.','開口部','検討部','灯具'])assert(r.texts.includes(text),text);
   assert.equal(r.texts.includes('(荷重中心高さ)'),r.tapered);
   assert(r.components.includes('opening'));
   assert(r.components.includes('object-1/adapter'));
   assert(r.components.includes('arm-1/centerline'));
   assert(r.centerlines>=3&&r.xml);
   for(const leader of ['opening/leader','pole-1/specification','arm-1/specification','wire-1/leader','object-1/leader'])assert(r.leaders.includes(leader),leader);
  }
  await page.screenshot({path:'test-results/content-parity.png',fullPage:true});
  console.log('PASS 6 final content-parity cases: installations, straight/taper, top lighting, opening, centerlines, datum labels, load centroid and all leaders');
  console.log(JSON.stringify(results.map(({type,tapered,ms})=>({type,tapered,ms})),null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
