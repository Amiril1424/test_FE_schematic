const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8080');
  const result=await page.evaluate(()=>{
   const poles=[{Lower_D:114.3,Upper_D:114.3,height:2000,type:'straight'},{Lower_D:200,Upper_D:139.8,height:4000,type:'tapered'}];
   const model={poles,arms:[],overHeadWire:[{height:4500,fixAngle:0},{height:3500,fixAngle:180},{height:4500,fixAngle:180}]};
   const labels=createHeightDimensionLabels(model),root=document.getElementById('drawing-content');root.replaceChildren();
   const engine=new DrawingEngine(root,{x:80,y:250},0.03),calls=[];
   drawOHWHookBand(engine,model);
   const original=engine.drawDimension.bind(engine);engine.drawDimension=(...args)=>{calls.push(args);return original(...args);};
   drawObjectHeightDimensions(engine,model,labels);
   const mixed=createHeightDimensionLabels({...model,arms:[{height:5000,fixAngle:0,length:1000},{height:4000,fixAngle:180,length:180}]});
   return {directions:[0,90,91,180,270,271,360].map(getOHWDirection),labels:labels.objects.map(x=>x.label),mixed:mixed.objects.map(x=>x.label),refs:calls.map(x=>x[1]),columns:calls.map(x=>x[5]),options:calls.map(x=>x[6])};
  });
  assert.deepEqual(result.directions,[1,1,-1,-1,-1,1,1]);
  assert.deepEqual(result.labels,['H4=4500','H5=3500']);
  assert.deepEqual(result.mixed,['H4=5000','H5=4500','H6=4000','H7=3500']);
  assert(Math.abs(result.refs[0].x-60.15)<1e-9);assert(Math.abs(result.refs[1].x-76.6625)<1e-9);
  assert.equal(result.columns[0]-result.columns[1],8);assert(result.options.every(x=>x.endGap===0));
  console.log('PASS OHW direction boundaries, adaptive band-edge references, shared/mixed H order and paper-space columns');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
