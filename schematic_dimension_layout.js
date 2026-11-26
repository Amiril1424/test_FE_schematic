import { arrangeDiameterCallouts } from './schematic_diameter_layout.js';
/** Stage 4.6: finalize initial label positions and export paper-mm obstacles.
 * Run with the SVG mounted (temporarily if necessary) after fonts are ready.
 * Geometry/extension anchors never move. Unresolved layouts are reported explicitly.
 */
export function finalizeDimensionLayout(svg, document) {
 const host=document.createElement('div');
 const detached=!svg.isConnected;
 if(detached){host.style.cssText='position:absolute;left:-10000px;top:0;visibility:hidden';document.body.append(host);host.append(svg);}
 const box=node=>{
  const b=node.getBBox(), m=svg.getCTM().inverse().multiply(node.getCTM());
  const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
  return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
 };
 const overlaps=(a,b,gap=0.5)=>a.minX<b.maxX+gap&&a.maxX>b.minX-gap&&a.minY<b.maxY+gap&&a.maxY>b.minY-gap;
 const labels=[...svg.querySelectorAll('[data-dimension-id] text')];
 const accepted=[],issues=arrangeDiameterCallouts(svg);
 const lines=[...svg.querySelectorAll('[data-dimension-id] line')].map(node=>({id:node.closest('[data-dimension-id]').dataset.dimensionId,bounds:box(node)}));
 for(const label of labels){
  const original=label.getAttribute('transform')||'', group=label.closest('[data-dimension-id]');
  const rotated=original.includes('rotate');
  let found=false;
  for(let attempt=0;attempt<49;attempt++){
   const shift=attempt===0?0:Math.ceil((attempt%25)/2)*4*(attempt%2?1:-1);
   const extra=attempt>=25 ? -6 : 0;
   label.setAttribute('transform',`translate(${rotated?extra:shift} ${rotated?shift:extra}) ${original}`);
   const b=box(label);
   if(b.minX>=5&&b.maxX<=205&&b.minY>=5&&b.maxY<=292&&!accepted.some(a=>overlaps(a,b))&&!lines.some(line=>line.id!==group.dataset.dimensionId&&overlaps(line.bounds,b,0.25))){accepted.push(b);found=true;break;}
  }
  if(!found){label.setAttribute('transform',original);accepted.push(box(label));issues.push({dimensionId:group.dataset.dimensionId,code:'label-space',message:'No clear initial label position; review layout.'});}
 }
 const obstacles=[];
 for(const node of svg.querySelectorAll('[data-layer] line,[data-layer] circle,[data-layer] text')){
  const bounds=box(node),kind=node.tagName==='text'?'text':node.tagName==='circle'?'dot':node.dataset.role||'line';
  const padding=kind==='text'?0.5:0.15;
  obstacles.push({dimensionId:node.closest('[data-dimension-id]')?.dataset.dimensionId??null,kind,
   bounds:{minX:bounds.minX-padding,minY:bounds.minY-padding,maxX:bounds.maxX+padding,maxY:bounds.maxY+padding}});
 }
 const result={units:'mm',space:'paper',obstacles,issues};
 svg.dimensionLayout=result;
 const metadata=document.createElementNS('http://www.w3.org/2000/svg','metadata');metadata.dataset.dimensionLayout='';metadata.textContent=JSON.stringify(result);svg.append(metadata);
 if(detached){host.removeChild(svg);host.remove();}
 return result;
}
