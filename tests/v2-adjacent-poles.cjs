const assert=require('node:assert/strict');
(async()=>{
const g=await import('../schematic_Lighting_1a.js'),d=await import('../schematic_dimensions.js'),l=await import('../schematic_leaders.js');
for(const thickness of [4,5]){
const p=g.createProject({installation:{type:'baseplate-under-gl',depth:300},poles:[{type:'tapered',height:6000,upperDiameter:85,lowerDiameter:165,thickness:4},{height:2000,lowerDiameter:165,thickness}]});
const scene=g.buildSchematicGeometry(p),dims=d.buildPoleDimensions(scene.pole);
const opening=dims.dimensions.find(d=>d.id==='opening/height'),lower=dims.dimensions.find(d=>d.id==='pole-2/height');
assert.equal(lower.paper.offset-opening.paper.offset,8);
const leader=l.buildLeaderRequests(p,scene,{toPaper:p=>p}).find(r=>r.id==='pole-2/specification');
assert.equal(Boolean(leader),thickness!==4);
const diameter=dims.diameterReferences.find(d=>d.id==='pole-2/diameter-bottom');
assert.equal(Boolean(diameter),thickness===4);
if(diameter){assert.equal(diameter.label,'\u00D8165');assert.equal(diameter.engineering.start.y,-300);assert.equal(diameter.engineering.end.x-diameter.engineering.start.x,165);}
}
console.log('PASS adjacent taper/straight annotation and Under GL opening column spacing');
})().catch(e=>{console.error(e);process.exitCode=1});
