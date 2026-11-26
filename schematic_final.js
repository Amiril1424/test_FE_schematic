import {buildSchematicGeometry} from './schematic_Lighting_1a.js';
import {buildPoleDimensions,buildArmDimensions,buildObjectHeightDimensions} from './schematic_dimensions.js';
import {renderGeometryPreview} from './schematic_geometry_preview.js';
import {buildLeaderRequests,layoutSchematicLeaders} from './schematic_leaders.js';
import {compactObjectHeightDimensions} from './schematic_height_layout.js';

/** Stages 7–8. Bounded full rebuilds; font and arrow sizes stay in paper mm.
 * Returns diagnostics rather than claiming success when content cannot fit.
 */
export async function generateSchematicSVG(project, document, {margin=10,maxPasses=8}={}) {
 if(!Number.isFinite(margin)||margin<0||margin>=80)throw new RangeError('Invalid A4 margin');
 if(!Number.isInteger(maxPasses)||maxPasses<1||maxPasses>20)throw new RangeError('Invalid layout pass limit');
 await document.fonts.ready;
 const scene=buildSchematicGeometry(project),pole=buildPoleDimensions(scene.pole);
 const arms=buildArmDimensions(project,scene),objects=buildObjectHeightDimensions(project,scene,pole);
 const host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;top:0;visibility:hidden';document.body.append(host);
 let svg,leaderResult,bounds,fits=false,multiplier=1,passes=0,best=null;
 try {
  for(;passes<maxPasses;passes++){
   host.replaceChildren();
   svg=renderGeometryPreview(scene,document,pole,arms,objects,{scaleMultiplier:multiplier});host.append(svg);
   leaderResult=layoutSchematicLeaders(svg,buildLeaderRequests(project,scene,svg.engineeringTransform),document);
   svg.heightColumnLayout=compactObjectHeightDimensions(svg);
   const group=document.createElementNS(svg.namespaceURI,'g');group.setAttribute('id','drawing-content');
   for(const node of [...svg.children])if(node.tagName!=='metadata')group.append(node);
   svg.append(group);
   const b=group.getBBox();bounds={x:b.x-0.5,y:b.y-0.5,width:b.width+1,height:b.height+1};
   fits=bounds.width<=210-2*margin&&bounds.height<=297-2*margin;
   const score=(fits?0:10000)+leaderResult.issues.length*100+1/multiplier;
   if(!best||score<best.score)best={svg,leaderResult,bounds,fits,multiplier,score};
   if(fits&&leaderResult.issues.length===0){passes++;break;}
   if(passes===maxPasses-1)break;
   const ratio=Math.min((210-2*margin)/bounds.width,(297-2*margin)/bounds.height,0.94);
   // More scale can open vertical space between nearby OHW height levels.
   // Shrinking an already-fitting drawing would make that gap smaller.
   multiplier*=fits&&leaderResult.issues.length ? 1.12 : Math.min(0.94,ratio*0.97);
  }
  ({svg,leaderResult,bounds,fits,multiplier}=best);
  const tx=(210-bounds.width)/2-bounds.x,ty=(297-bounds.height)/2-bounds.y;
  svg.querySelector('#drawing-content').setAttribute('transform',`translate(${tx} ${ty})`);
  // IDs are deterministic and XML-safe; original engineering IDs remain in data attributes.
  let counter=0;
  for(const node of svg.querySelectorAll('[data-layer],[data-component-id],[data-dimension-id],[data-leader-id],[data-reference-id]'))node.setAttribute('id',`schematic-${++counter}`);
  for(const node of svg.querySelectorAll('metadata'))node.remove(); // Pre-centering obstacles are stale.
  const issues=[...scene.issues,...(svg.dimensionLayout?.issues||[]),...leaderResult.issues];
  if(!fits)issues.push({code:'page-overflow',message:'Content does not fit the requested A4 margins.'});
  const report={page:{width:210,height:297,units:'mm',margin},passes:Math.min(passes,maxPasses),scaleMultiplier:multiplier,
   bounds:{x:bounds.x+tx,y:bounds.y+ty,width:bounds.width,height:bounds.height},heightColumns:svg.heightColumnLayout,issues};
  const metadata=document.createElementNS(svg.namespaceURI,'metadata');metadata.setAttribute('id','schematic-report');metadata.textContent=JSON.stringify(report);svg.prepend(metadata);
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('role','img');
  svg.setAttribute('aria-label','Pole schematic');
  const serialized=new document.defaultView.XMLSerializer().serializeToString(svg);
  return {svg,svgString:serialized,report};
 } finally {if(svg?.parentNode===host)host.removeChild(svg);host.remove();}
}
