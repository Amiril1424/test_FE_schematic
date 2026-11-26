const assert=require('node:assert/strict');
(async()=>{
 const g=await import('../schematic_Lighting_1a.js'),d=await import('../schematic_dimensions.js');
 for(const type of ['on-gl','embedment','baseplate-under-gl']){
  const input={installation:{type,depth:type==='on-gl'?0:300},poles:[{height:3000,lowerDiameter:89.1,thickness:3.2},{height:2000,lowerDiameter:139.8,thickness:4.5}]};
  const top=5000+(type==='baseplate-under-gl'?300:0);
  for(const height of [top,top-100]){
   const p=g.createProject({...input,directObjects:[{height,areaFront:0.1,areaSide:0.1,quantity:1}]});
   assert(g.validateProject(p).valid);
   const scene=g.buildSchematicGeometry(p),pole=d.buildPoleDimensions(scene.pole),objects=d.buildObjectHeightDimensions(p,scene,pole);
   assert.equal(p.directObjects[0].attachment,height===top?'pole-top':'pole-side');
   assert.equal(objects.dimensions.length,height===top?0:1);
   assert.equal(scene.components.filter(c=>c.type==='top-adapter').length,height===top?1:0);
   if(height===top){const ref=scene.components.find(c=>c.type==='direct-object').reference;assert.deepEqual(ref.boxSize,{width:600,height:200});}
  }
 }
 console.log('PASS automatic top lighting, adapter and no duplicate H across installations; lower objects retain box/dimension');
})().catch(e=>{console.error(e);process.exitCode=1});
