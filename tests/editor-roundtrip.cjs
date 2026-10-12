const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../test-results');
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge', headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1050},acceptDownloads:true});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{ if(msg.type()==='error') console.log('BROWSER:',msg.text()); });
  try {
    await page.goto('http://127.0.0.1:8080');
    await page.locator('#arm-count').selectOption('0');
    await page.locator('#pole-1-diameter').fill('114');
    await page.locator('#pole-1-thickness').fill('4');
    await page.locator('#pole-1-height').fill('5000');
    await page.locator('#do-count').selectOption('1');
    await page.waitForFunction(()=>!document.getElementById('edit-schematic').disabled);
    const original=await page.locator('#drawing-content').innerHTML();
    assert(original.includes('STK400'));
    await page.locator('#drawing').screenshot({path:path.join(output,'generated.png')});
    await page.locator('#edit-schematic').click();
    await page.waitForFunction(()=>!document.getElementById('apply-schematic').disabled,{},{timeout:60000});
    const frame=page.frames().find(frame=>frame.url().endsWith('/editor.html'));
    const summary=await frame.evaluate(()=>{
      const root=window.svgEditor.svgCanvas.getSvgContent();
      return {text:root.textContent,svg:window.svgEditor.svgCanvas.getSvgString(),count:root.querySelectorAll('text').length};
    });
    assert(summary.text.includes('STK400')); assert(summary.count>4);
    fs.writeFileSync(path.join(output,'editor-import.svg'),summary.svg);
    await page.screenshot({path:path.join(output,'editor.png')});
    // Move real selected SVG text using SVG-Edit's editing API.
    await frame.evaluate(()=>{
      const canvas=window.svgEditor.svgCanvas;
      const node=[...canvas.getSvgContent().querySelectorAll('text')].find(n=>n.textContent==='STK400');
      canvas.clearSelection(); canvas.addToSelection([node]);
      canvas.moveSelectedElements(12,8,false);
      canvas.changeSelectedAttribute('data-test','manual');
    });
    await page.locator('#apply-schematic').click();
    await page.waitForFunction(()=>!document.getElementById('schematic-editor-dialog').open);
    assert.equal(await page.locator('#drawing').isVisible(),false);
    assert.equal(await page.locator('#edited-preview svg').isVisible(),true);
    const applied=await page.locator('#edited-preview').innerHTML();
    await page.locator('#edited-preview svg').screenshot({path:path.join(output,'applied.png')});
    await page.locator('#pole-1-height').fill('5100');
    await page.waitForFunction(()=>document.getElementById('editor-status').textContent.includes('Parameter berubah'));
    assert.equal(await page.locator('#edited-preview').innerHTML(),applied);
    page.once('dialog',d=>d.dismiss());
    await page.locator('#regenerate-schematic').click();
    assert.equal(await page.locator('#edited-preview').innerHTML(),applied);
    // Cancel an editor session; applied version must survive unchanged.
    await page.locator('#edit-schematic').click();
    await page.waitForFunction(()=>!document.getElementById('apply-schematic').disabled);
    await page.locator('#cancel-schematic').click();
    assert.equal(await page.locator('#edited-preview').innerHTML(),applied);
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#save-project').click();
    const download=await downloadPromise;
    const projectPath=path.join(output,'roundtrip.json'); await download.saveAs(projectPath);
    const project=JSON.parse(fs.readFileSync(projectPath,'utf8'));
    assert.equal(project.parameters['pole-1-height'],'5000');
    assert.equal(project.draftParameters['pole-1-height'],'5100');
    assert(project.editedSvg && project.generatedSvg!==project.editedSvg);
    await page.reload();
    await page.locator('#project-file').setInputFiles(projectPath);
    await page.waitForFunction(()=>document.getElementById('editor-status').textContent.startsWith('Proyek dibuka'));
    assert.equal(await page.locator('#pole-1-height').inputValue(),'5100');
    assert.equal(await page.locator('#edited-preview svg').getAttribute('width'),'210mm');
    assert.equal(await page.locator('#edited-preview svg').getAttribute('height'),'297mm');
    const svgDownload=page.waitForEvent('download'); await page.locator('#download-svg').click();
    await (await svgDownload).saveAs(path.join(output,'final.svg'));
    page.once('dialog',d=>d.accept()); await page.locator('#regenerate-schematic').click();
    await page.waitForFunction(()=>!document.getElementById('drawing').hasAttribute('hidden'));
    assert((await page.locator('#drawing').textContent()).includes('5100'));
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: browser generate/import/edit/apply/cancel/stale guard/save/reopen/download/regenerate.');
  } catch(error) {
    await page.screenshot({path:path.join(output,'failure.png')});
    console.error('PAGE ERRORS',errors);
    console.error(await page.locator('#editor-loading').textContent());
    throw error;
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
