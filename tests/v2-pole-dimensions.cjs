const assert=require('node:assert/strict');
(async()=>{
const load=async f=>import('../'+f);
const g=await load('schematic_Lighting_1a.js'),d=await load('schematic_dimensions.js');
const run=(poles,type='baseplate-under-gl',depth=300,openingHeight=750)=>d.buildPoleDimensions(g.buildPoleGeometry(g.createProject({poles,installation:{type,depth}})),{openingHeight});
const straight={height:1650,lowerDiameter:165,thickness:4};
let r=run([{type:'tapered',height:6500,lowerDiameter:165,upperDiameter:85,thickness:4},straight],'baseplate-under-gl',300,900);
assert.deepEqual(r.dimensions.filter(x=>x.hIndex).map(x=>x.label),['H1=8450','H2=6500','H3=1950',"H2'=2903"]);
assert.equal(r.dimensions.find(x=>x.id==='opening/height').engineering.value,1200);
assert.equal(r.nextHIndex,4);
r=run([{type:'tapered',height:8000,lowerDiameter:165,upperDiameter:85,thickness:4}]);
assert.deepEqual(r.dimensions.filter(x=>x.hIndex).map(x=>x.label),['H1=8300','H2=8000','H3=300',"H2'=3573"]);
assert.equal(r.diameterReferences.length,3);assert.deepEqual(r.diameterReferences.map(x=>x.engineering.value),[85,165,165]);
assert.equal(r.openingDatumY,0);
r=run([straight],'on-gl',0);assert.equal(r.nextHIndex,2);
r=run([straight],'embedment',1000);assert.equal(r.nextHIndex,2);assert.equal(r.dimensions.find(x=>x.id==='installation/full-length').engineering.value,2650);
assert(r.dimensions.filter(x=>x.id.startsWith('installation/')).every(x=>x.hIndex===null));
assert.equal(r.dimensions.find(x=>x.id==='installation/depth').paper.offset,
  r.dimensions.find(x=>x.id==='pole/height-total').paper.offset);
console.log('PASS pole dimensions: illustrated Under GL cases, On GL, Embedment, indices and datum');
})().catch(e=>{console.error(e);process.exitCode=1});
