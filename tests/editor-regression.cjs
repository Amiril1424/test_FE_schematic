const {chromium} = require('@playwright/test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const output = path.resolve(__dirname, '../test-results');
fs.mkdirSync(output, {recursive:true});
const baseline = execFileSync('git', ['show', 'schematic-before-svg-editor:schematic_test.js'], {encoding:'utf8'});
const fields = {'pole-count':'3','arm-count':'2','do-count':'0','ohw-count':'0'};
for (let i=1;i<=3;i++) Object.assign(fields, {
  [`pole-${i}-type`]:i===2?'tapered':'straight',
  [`pole-${i}-diameter`]:i===1?'75':'175',
  [`pole-${i}-upper-diameter`]:'75', [`pole-${i}-thickness`]:'4',
  [`pole-${i}-height`]:['2500','6000','1500'][i-1]
});
for (let i=1;i<=2;i++) Object.assign(fields, {
  [`arm-${i}-diameter`]:'60.5', [`arm-${i}-thickness`]:'3.2',
  [`arm-${i}-height`]:'9980', [`arm-${i}-length`]:'180',
  [`arm-${i}-fix-angle`]:i===1?'0':'180', [`arm-${i}-vertical-angle`]:'5'
});
async function fill(page) {
  await page.evaluate(values=>{
    for(const [id,value] of Object.entries(values)) document.getElementById(id).value=value;
    document.getElementById('parameters').dispatchEvent(new Event('change',{bubbles:true}));
  },fields);
  await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Poles: 3'));
}
async function metrics(page, selector) {
  return page.locator(selector).evaluate(root=>[...root.querySelectorAll('line,path,polyline,polygon,rect,circle,ellipse,text')].map(node=>{
    const box=node.getBBox(), style=getComputedStyle(node);
    return {tag:node.tagName,text:node.textContent,box:[box.x,box.y,box.width,box.height],
      stroke:style.stroke,width:style.strokeWidth,dash:style.strokeDasharray,fill:style.fill,font:style.fontFamily};
  }));
}
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1050}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
    await page.goto('http://127.0.0.1:8080');await fill(page);
    const original=await page.locator('#drawing-content').innerHTML();
    const before=await metrics(page,'#drawing-content');
    const legacy=await browser.newPage();
    await legacy.route('**/schematic_test.js',r=>r.fulfill({contentType:'text/javascript',body:baseline}));
    await legacy.goto('http://127.0.0.1:8080/?editor=off');await fill(legacy);
    assert.equal(await legacy.locator('#drawing-content').innerHTML(),original,'Stable baseline geometry changed');
    await legacy.close();
    await page.locator('#edit-schematic').click();
    await page.waitForFunction(()=>!document.getElementById('apply-schematic').disabled,{},{timeout:60000});
    await page.locator('#apply-schematic').click();
    const after=await metrics(page,'#edited-preview');
    assert.equal(after.length,before.length);
    before.forEach((a,i)=>{
      const b=after[i];assert.equal(b.tag,a.tag);assert.equal(b.text,a.text);
      for(const key of ['stroke','width','dash','fill','font']) assert.equal(b[key],a[key],`${i}: ${key}`);
      a.box.forEach((v,j)=>assert(Math.abs(v-b.box[j])<0.02,`${i}: bounding box changed`));
    });
    await page.locator('#edited-preview svg').screenshot({path:path.join(output,'tapered-roundtrip.png')});
    // Invalid regeneration must preserve the manual revision.
    const manual=await page.locator('#edited-preview').innerHTML();
    await page.locator('#pole-1-height').fill('-1');
    page.once('dialog',d=>d.accept());await page.locator('#regenerate-schematic').click();
    assert.equal(await page.locator('#edited-preview').innerHTML(),manual);
    assert(await page.locator('#edited-preview').isVisible());
    // Imported project validation rejects active SVG before replacing any state.
    const invalid=await page.evaluate(async()=>{
      const {validateSvg}=await import('./schematic_editor.js');
      return ['<script/>','<rect onclick="alert(1)"/>','<image href="https://example.com/a.svg"/>'].map(body=>{
        try{validateSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297">${body}</svg>`);return false;}
        catch{return true;}
      });
    });
    assert(invalid.every(Boolean));assert.deepEqual(errors,[]);
    console.log('PASS: stable geometry unchanged; tapered/two-arm/DO0 SVG roundtrip preserves text, bounds, strokes, dashes, fonts; invalid regeneration preserved manual SVG.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
