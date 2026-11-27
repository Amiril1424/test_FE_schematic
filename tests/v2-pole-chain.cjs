const assert=require('node:assert/strict');
(async()=>{const g=await import('../schematic_Lighting_1a.js'),d=await import('../schematic_dimensions.js'),l=await import('../schematic_leaders.js');
for(const changed of [false,true]){
const p=g.createProject({poles:[{height:1500,lowerDiameter:75,thickness:changed?5:4},{type:'tapered',height:5000,lowerDiameter:165,upperDiameter:75,thickness:4},{height:1900,lowerDiameter:165,thickness:4}]});
const scene=g.buildSchematicGeometry(p),dims=d.buildPoleDimensions(scene.pole),leaders=l.buildLeaderRequests(p,scene,{toPaper:p=>p});
assert.equal(leaders.some(r=>r.id==='pole-1/specification'),changed);assert(!leaders.some(r=>r.id==='pole-3/specification'));assert(leaders.some(r=>r.id==='pole-2/specification'));
for(const id of changed?['pole-3']:['pole-1','pole-3']){const seg=scene.pole.segments.find(s=>s.poleId===id);for(const y of [seg.topY,seg.bottomY])assert(dims.diameterReferences.some(d=>d.sourceIds.includes(id)&&d.engineering.start.y===y));}
}console.log('PASS straight-taper-straight chain, both diameters, shared joints and thickness mismatch');})().catch(e=>{console.error(e);process.exitCode=1});
