const assert = require('node:assert/strict');

(async () => {
 const api = await import('../schematic_dimensions.js');
 const start={x:0,y:-300}, end={x:0,y:4000};
 const dim=api.createDimension({id:'height',sourceIds:['pole-1'],start,end,direction:'vertical',side:'left',prefix:'H1='});
 assert.equal(dim.engineering.value,4300); assert.equal(dim.label,'H1=4300');start.y=100;assert.equal(dim.engineering.start.y,-300);
 let count=0; const cache=api.createDimensionTextCache((text,style)=>{count++;return {width:text.length*style.fontSize,height:style.fontSize};});
 cache.measure(dim.label);cache.measure(dim.label);assert.equal(count,1);
 cache.measure(dim.label,{fontWeight:'bold'});assert.equal(count,2);
 cache.clear();cache.measure(dim.label);assert.equal(count,3);
 assert.equal(api.dimensionTextFits(dim,10,cache).fits,false);assert.equal(api.dimensionTextFits(dim,100,cache).fits,true);
 assert.throws(()=>api.createDimensionStyle({fontSize:NaN}));
 assert.throws(()=>api.createDimension({...dim,start,end,direction:'vertical',side:'above'}));
 const horizontal=api.createDimension({id:'length',sourceIds:['arm-1'],start:{x:0,y:5},end:{x:-180,y:25},direction:'horizontal',side:'above',prefix:'L1='});
 assert.equal(horizontal.engineering.value,180);
 console.log('PASS dimension schema, engineering projections, paper styles, cache invalidation and fit decisions');
})().catch(e=>{console.error(e);process.exitCode=1;});
