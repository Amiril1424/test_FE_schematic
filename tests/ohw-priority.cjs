const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage();await page.goto('http://127.0.0.1:8080');
  await page.evaluate(()=>{
   const values={'pole-count':1,'pole-1-diameter':165,'pole-1-height':8000,'pole-1-thickness':4,
    'arm-count':1,'arm-1-height':7000,'arm-1-diameter':76.3,'arm-1-thickness':4,'arm-1-length':1000,'arm-1-fix-angle':0,'arm-1-vertical-angle':5,
    'ohw-count':1,'ohw-1-height':6000,'ohw-1-diameter':12,'ohw-1-weight':0.8,'ohw-1-span':30000,'ohw-1-name':'Wire A','ohw-1-fix-angle':0};
   for(const[id,value]of Object.entries(values))document.getElementById(id).value=value;
   window.dispatchEvent(new CustomEvent('schematic:regenerate'));
  });
  assert(!(await page.locator('#status').textContent()).includes('no clear'));
  const positions=await page.evaluate(()=>{
   const texts=[...document.querySelectorAll('#drawing text')];
   const y=fragment=>texts.find(n=>n.textContent.includes(fragment)).getBBox().y;
   return {arm:y('76.3'),wire:y('Wire A'),pole:y('165'),text:document.getElementById('drawing').textContent};
  });
  assert(positions.arm<positions.wire && positions.wire<positions.pole);
  assert(positions.text.includes('H2=7000')&&positions.text.includes('H3=6000'));
  await page.locator('#drawing').screenshot({path:'test-results/ohw-priority.png'});
  console.log('PASS crowded arm/OHW: all leaders present, OHW below arm, pole relocated below OHW, H order preserved');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
