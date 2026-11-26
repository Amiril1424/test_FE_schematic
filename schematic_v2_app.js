import {readProjectFromForm,validateProject} from './schematic_Lighting_1a.js';
import {generateSchematicSVG} from './schematic_final.js';

/** HTML adapter only: the drawing engine has no editor or form dependencies. */
const form=document.getElementById('parameters');
const source=document.getElementById('drawing');
const status=document.getElementById('status');
let revision=0,timer;

function updateInstallationHint(){
  const type=document.getElementById('installation-type').value;
  document.getElementById('installation-note').textContent=type==='on-gl'
    ? 'On GL: depth diabaikan (0 mm).'
    : 'Isi depth positif dalam mm. Hasil gambar mengikuti installation type yang dipilih.';
}

async function generate(){
  clearTimeout(timer);
  const current=++revision;
  // Dispatch before awaiting anything: the editor can protect its manual revision.
  const allowed=window.dispatchEvent(new CustomEvent('schematic:before-generate',{cancelable:true}));
  if(!allowed)return {generated:false,blocked:true};
  try {
    const project=readProjectFromForm(form),validation=validateProject(project);
    if(!validation.valid)throw new Error(validation.errors.map(e=>`${e.path}: ${e.message}`).join(' · '));
    status.textContent='Membuat schematic V2…';
    const result=await generateSchematicSVG(project,document);
    if(current!==revision)return {generated:false,superseded:true};
    // Retain the SVG root: editor integration owns a stable reference to #drawing.
    source.replaceChildren(...[...result.svg.childNodes].map(node=>document.importNode(node,true)));
    source.setAttribute('width','210mm');source.setAttribute('height','297mm');
    source.setAttribute('viewBox','0 0 210 297');source.removeAttribute('aria-labelledby');
    source.setAttribute('aria-label','Schematic V2');
    status.textContent=result.report.issues.length
      ? `V2 — ${result.report.issues.length} catatan layout: ${result.report.issues.map(i=>i.message).join(' · ')}`
      : 'V2 — schematic siap. Edit Schematic untuk penyesuaian manual.';
    window.dispatchEvent(new CustomEvent('schematic:generated',{detail:{project,report:result.report}}));
    return {generated:true,blocked:false,report:result.report};
  }catch(error){
    if(current!==revision)return {generated:false,superseded:true};
    status.textContent=`Gagal generate: ${error.message}. Gambar sebelumnya dipertahankan.`;
    return {generated:false,blocked:false,status:status.textContent};
  }
}

function schedule(){
  ++revision;clearTimeout(timer);updateInstallationHint();
  timer=setTimeout(generate,250);
}
form.addEventListener('input',schedule);
form.addEventListener('change',schedule);
window.addEventListener('schematic:regenerate',event=>{
  const pending=generate();
  if(event.detail)event.detail.promise=pending;
});
for(const event of ['schematic:editor-opened','schematic:applied','schematic:restored']) {
  window.addEventListener(event,()=>{++revision;clearTimeout(timer);updateInstallationHint();});
}
updateInstallationHint();
generate();
