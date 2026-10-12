const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
fs.mkdirSync('test-results',{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8080');
    await page.evaluate(()=>{
      window.testLeaders=[];
      const draw=DrawingEngine.prototype.drawLeader;
      DrawingEngine.prototype.drawLeader=function(target,elbow,top,bottom='',width=0,align='center'){
        const previous=new Set(this.root.children);
        draw.call(this,target,elbow,top,bottom,width,align);
        if(top.includes('(t') || (top.includes('t') && bottom==='STK400')) {
          window.testLeaders.push({engine:this,target,elbow,top,bottom,width,align,nodes:[...this.root.children].filter(n=>!previous.has(n))});
        }
      };
    });
    for(const scenario of [
      {name:'right',angle:0,length:1000},
      {name:'straight-mid-arm',angle:0,length:180,height:6500,straight:true,middleHeight:4000},
      {name:'straight-top-arm',angle:0,length:180,height:10000,straight:true,middleHeight:6000},
      {name:'single-short-top',angle:0,length:180,height:10000,threePoles:true},
      {name:'double-short-top',angle:0,length:180,height:10000,threePoles:true,count:2},
      {name:'left',angle:180,length:180,height:6001},
      {name:'opposite-short',angle:0,length:180,count:2},
      {name:'short-taper',angle:0,length:1000,shortTaper:true}
    ]) {
      await page.evaluate(s=>{
        window.testLeaders=[];
        const values={'pole-count':2,'arm-count':s.count||1,'do-count':0,
          'pole-1-type':'tapered','pole-1-diameter':165,'pole-1-upper-diameter':85,'pole-1-height':6000,'pole-1-thickness':4,
          'pole-2-type':'straight','pole-2-diameter':165,'pole-2-height':1997,'pole-2-thickness':4};
        if(s.shortTaper) Object.assign(values,{'pole-1-type':'straight','pole-1-diameter':85,'pole-1-height':6000,
          'pole-2-type':'tapered','pole-2-upper-diameter':85,'pole-2-height':400});
        if(s.threePoles) Object.assign(values,{'pole-count':3,'pole-1-type':'straight','pole-1-diameter':75,
          'pole-1-height':2500,'pole-2-type':'tapered','pole-2-diameter':175,'pole-2-upper-diameter':75,
          'pole-2-height':6000,'pole-3-type':'straight','pole-3-diameter':175,'pole-3-height':1600,'pole-3-thickness':4});
        if(s.straight) Object.assign(values,{'pole-count':3,'pole-1-type':'straight','pole-1-diameter':75,
          'pole-1-height':2500,'pole-2-type':'straight','pole-2-diameter':175,'pole-2-height':s.middleHeight,
          'pole-3-type':'straight','pole-3-diameter':195,'pole-3-height':1600,'pole-3-thickness':4});
        for(let i=1;i<=(s.count||1);i++) Object.assign(values,{
          [`arm-${i}-diameter`]:(s.threePoles||s.straight)?60.5:76.3,[`arm-${i}-thickness`]:(s.threePoles||s.straight)?3.2:3,[`arm-${i}-height`]:s.height||5001,
          [`arm-${i}-length`]:s.length,[`arm-${i}-fix-angle`]:i===2?180:s.angle,[`arm-${i}-vertical-angle`]:5});
        for(const [id,v] of Object.entries(values)) document.getElementById(id).value=v;
        window.dispatchEvent(new CustomEvent('schematic:regenerate'));
      },scenario);
      const result=await page.evaluate(()=>{
        return {status:document.getElementById('status').textContent,leaders:window.testLeaders.map(item=>{
          const {engine,target,elbow,top,bottom,width,align,nodes}=item;
          nodes.forEach(n=>n.remove());
          const saved=engine.dimensionSegments;
          engine.dimensionSegments=allowLeaderContact(getLeaderObstacles(engine),engine.toSvg(target.x,target.y));
          engine.fitObjectLeader(target,elbow,top,width,bottom,align,{minFactor:1,textClearance:4});
          const blocked=engine.lastLeaderFitBlocked;
          engine.dimensionSegments=saved;nodes.forEach(n=>engine.root.append(n));
          return {top,blocked,target};
        })};
      });
      await page.locator('#drawing').screenshot({path:`test-results/leaders-${scenario.name}.png`});
      assert(!result.status.includes('no clear'),JSON.stringify(result));
      assert.equal(result.leaders.length,scenario.straight?4:2,`${scenario.name}: pole and arm leaders required`);
      assert(result.leaders.every(l=>!l.blocked),`${scenario.name}: ${JSON.stringify(result)}`);
      const taper=result.leaders.find(l=>l.top.includes('(t'));
      if(scenario.shortTaper) assert(taper.target.y>400,'Short taper should use connected straight segment');
      else if(!scenario.straight) assert(taper.target.y>1997,'Taper leader must remain on taper segment');
      console.log(`PASS: ${scenario.name}: pole and arm leaders clear final objects, dimensions and other leaders.`);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
