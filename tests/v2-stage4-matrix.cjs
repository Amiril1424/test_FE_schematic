const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge'});
try{const page=await browser.newPage({viewport:{width:1400,height:1000}});await page.goto('http://127.0.0.1:8080/obsolete/previews/geometry_preview.html');
const results=await page.evaluate(async()=>{
 const g=await import('/schematic_Lighting_1a.js'),d=await import('/schematic_dimensions.js'),r=await import('/schematic_geometry_preview.js');await document.fonts.ready;
 const results=[];document.body.replaceChildren();
 for(const type of ['on-gl','embedment','baseplate-under-gl'])for(const count of [1,2])for(const quantity of [1,2,3])for(const angle of [-5,0,5]){
 const length=quantity===1?180:2500,height=count===1?6000:10000;
 const p=g.createProject({installation:{type,depth:type==='on-gl'?0:300},poles:count===1?[{height,lowerDiameter:165,thickness:4}]:[{height:6000,type:'tapered',lowerDiameter:165,upperDiameter:85,thickness:4},{height:4000,lowerDiameter:165,thickness:4}],
 arms:[{height:height-1000,length,diameter:60.5,thickness:3.2,fixAngle:0,verticalAngle:angle},{height:height-1000,length,diameter:60.5,thickness:3.2,fixAngle:180,verticalAngle:angle}],
 directObjects:[{height:3000,areaFront:0.24,areaSide:0.1,quantity}],overheadWires:[{height:height-1000,diameter:12,weight:0.2,span:5000},{height:2000,diameter:12,weight:0.2,span:5000,fixAngle:180}]});
 const start=performance.now(),scene=g.buildSchematicGeometry(p),pd=d.buildPoleDimensions(scene.pole),ad=d.buildArmDimensions(p,scene),hd=d.buildObjectHeightDimensions(p,scene,pd);
 const svg=r.renderGeometryPreview(scene,document,pd,ad,hd);document.body.append(svg);
 results.push({type,count,quantity,angle,length,ms:performance.now()-start,issues:svg.dimensionLayout.issues,
 armValues:ad.map(a=>a.engineering.value),armLabels:ad.map(a=>a.label),
 merged:hd.dimensions.some(x=>x.sourceIds.includes('arm-1')&&x.sourceIds.includes('arm-2')&&x.sourceIds.includes('wire-1')),
 boxes:scene.components.filter(c=>c.type==='direct-object').length,
 labels:svg.querySelectorAll('[data-dimension-id] text').length,expected:pd.dimensions.length+pd.dimensions.filter(d=>d.note).length+pd.diameterReferences.length+ad.length+hd.dimensions.length,
 fontSizes:[...svg.querySelectorAll('[data-dimension-id] text')].map(x=>x.getAttribute('font-size')),
 finite:svg.dimensionLayout.obstacles.every(o=>Object.values(o.bounds).every(Number.isFinite)),geometryIssues:scene.issues});
 if(results.length>1)svg.remove();
 }return results;
});
for(const result of results){assert(result.armValues.every(v=>Math.abs(v-result.length)<1e-8));assert.equal(new Set(result.armLabels).size,1);assert(result.merged);assert.equal(result.boxes,result.quantity);assert.equal(result.labels,result.expected);assert(result.fontSizes.every(v=>v==='3.5'));assert(result.finite);assert(result.geometryIssues.every(x=>x.code==='arm-rib-clearance'));}
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/stage4-matrix.json',JSON.stringify(results,null,2));await page.screenshot({path:'test-results/stage4-matrix.png'});
console.log(JSON.stringify({cases:results.length,withLayoutIssues:results.filter(x=>x.issues.length).length,maxMs:Math.max(...results.map(x=>x.ms)),averageMs:results.reduce((s,x)=>s+x.ms,0)/results.length}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

