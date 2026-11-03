const {chromium}=require('@playwright/test');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();await p.goto('http://127.0.0.1:8080');const results=await p.evaluate(()=>[0,180].map(fixAngle=>{
 const wire={height:4500,fixAngle},g=getOHWWireGeometry(165,wire);
 const root=document.getElementById('drawing-content');root.replaceChildren();const engine=new DrawingEngine(root,{x:105,y:1550},0.3);
 drawOHWHookBand(engine,{poles:[{Lower_D:165,Upper_D:165,height:5000}],overHeadWire:[wire]});
 const arc=[...root.querySelectorAll('path')].at(-1),length=arc.getTotalLength();
 const tip=engine.toSvg(g.middle.x,g.middle.y);let distance=Infinity;
 for(let i=0;i<=2000;i++){const q=arc.getPointAtLength(length*i/2000);distance=Math.min(distance,Math.hypot(q.x-tip.x,q.y-tip.y));}
 return {dx:Math.abs(g.outer.x-g.attachment.x),dy:g.outer.y-g.attachment.y,distance};
}));for(const r of results){assert(Math.abs(r.dx-375.8770483)<1e-6);assert(Math.abs(r.dy+136.8080573)<1e-6);assert(r.distance<0.05);}console.log('PASS mirrored 20-degree rotation, fixed hook, 375.877mm projection and leader midpoint on SVG arc');}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
