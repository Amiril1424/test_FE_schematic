const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const load=f=>import('../'+f);const g=await load('schematic_Lighting_1a.js'),d=await load('schematic_dimensions.js');
for(const type of ['on-gl','embedment','baseplate-under-gl']){
const p=g.createProject({installation:{type,depth:type==='on-gl'?0:300},poles:[{height:4000,lowerDiameter:114,thickness:4},{height:2000,lowerDiameter:165,thickness:4}],arms:[{height:4800,length:1000,diameter:60.5,thickness:3.2}],overheadWires:[{height:4500,diameter:12,weight:0.2,span:5000},{height:4000,diameter:12,weight:0.2,span:5000}],directObjects:[{height:type==='baseplate-under-gl'?5100:4800,areaFront:0.24,areaSide:0.1,quantity:2}]});
const scene=g.buildSchematicGeometry(p),pole=d.buildPoleDimensions(scene.pole),result=d.buildObjectHeightDimensions(p,scene,pole);
assert.equal(result.dimensions.length,3);assert.deepEqual(result.dimensions.map(x=>x.hIndex),[4,5,6]);assert.equal(result.dimensions[0].sourceIds.length,2);assert.equal(result.dimensions[0].engineering.value,type==='baseplate-under-gl'?5100:4800);assert.equal(result.dimensions[1].references[0].kind,'ohw');
}console.log('PASS object heights: mixed sorting, merged elevations, installation datum and sequential H indices');})().catch(e=>{console.error(e);process.exitCode=1});
