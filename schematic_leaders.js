import { ANNOTATION_QUADRANTS, DIAGONAL_RUNS, WIRE_DIAGONAL_RUNS, LEADER_FALLBACK_RUNS, LEADER_TEXT_STYLE } from './schematic_annotation_policy.js';
import {getDiameterOnlyPoleIds,createDimensionTextCache,createCanvasTextMeasurer} from './schematic_dimensions.js';
const overlap=(a,b,p=0.8)=>a.minX<b.maxX+p&&a.maxX>b.minX-p&&a.minY<b.maxY+p&&a.maxY>b.minY-p;
const box=(a,b)=>({minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)});
/** Stage 5: SVG coordinates are paper mm. Sample curves once, not per candidate. */
export function analyzeDrawingSpace(svg,{includeLeaders=false,excludeObjectHeights=false}={}){
 const obstacles=[];
 for(const node of svg.querySelectorAll('path,line,circle,text')){
  if(!includeLeaders&&node.closest('[data-layer="leaders"]'))continue;
  if(excludeObjectHeights&&node.closest('[data-layer="object-height-dimensions"]'))continue;
  const m=svg.getCTM().inverse().multiply(node.getCTM());
  const convert=p=>({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
  const dimension=Boolean(node.closest('[data-dimension-id]'));
  const owner=node.closest('[data-component-id]')?.dataset.componentId;
  if(node.tagName==='path'){
   const length=node.getTotalLength(),n=Math.max(1,Math.ceil(length/2));
   let previous=convert(node.getPointAtLength(0));
   for(let i=1;i<=n;i++){const next=convert(node.getPointAtLength(length*i/n));obstacles.push({kind:node.dataset.role==='centerline'?'centerline':dimension?'dimension':'object',owner,bounds:box(previous,next)});previous=next;}
  }else if(node.tagName==='line'){
   const a=convert({x:+node.getAttribute('x1'),y:+node.getAttribute('y1')}),b=convert({x:+node.getAttribute('x2'),y:+node.getAttribute('y2')});
   const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/2));
   for(let i=0;i<n;i++)obstacles.push({kind:dimension?'dimension':'object',owner,bounds:box(
     {x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},
     {x:a.x+(b.x-a.x)*(i+1)/n,y:a.y+(b.y-a.y)*(i+1)/n})});
  }else{
   const b=node.getBBox();obstacles.push({kind:node.tagName==='text'?'text':dimension?'dimension':'object',owner,
    bounds:box(convert({x:b.x,y:b.y}),convert({x:b.x+b.width,y:b.y+b.height}))});
  }
 }
 return {units:'mm',space:'paper',obstacles};
}

/** Stage 6 initial planner: stable priority, bounded candidate search, explicit failures. */
export function placeSchematicLeaders(svg,requests,document,cache=createDimensionTextCache(createCanvasTextMeasurer(document.createElement('canvas')))){
 svg.querySelector('[data-layer="leaders"]')?.remove();
 const space=analyzeDrawingSpace(svg);
 const style={fontSize:LEADER_TEXT_STYLE.fontSize,letterSpacing:LEADER_TEXT_STYLE.letterSpacing},results=[],issues=[];
 const ns='http://www.w3.org/2000/svg';
 const el=(parent,name,attrs,text)=>{const n=document.createElementNS(ns,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;parent.append(n);return n;};
 const root=el(svg,'g',{'data-layer':'leaders'});
 for(const request of requests){
  const width=Math.max(...request.rows.map(row=>cache.measure(row,style).width+(row.match(/ /g)?.length||0)*LEADER_TEXT_STYLE.wordSpacing))+2;
  const rowSpacing=LEADER_TEXT_STYLE.rowSpacing;
  const baseline=i=>i===0?-LEADER_TEXT_STYLE.aboveLineGap:LEADER_TEXT_STYLE.belowLineBaseline+(i-1)*rowSpacing;
  const bottom=Math.max(0.3,baseline(request.rows.length-1)+0.8);
  const runs=[...WIRE_DIAGONAL_RUNS,...LEADER_FALLBACK_RUNS];
  let tip=request.tip;
  let chosen=null; let bestScore=Infinity;
  // Above first; below is available when arm/dimension geometry blocks it.
  for(const anchor of [...(request.tips||[request.tip]).map(tip=>({tip,owner:request.owner})),...(request.alternatives||[])]){
  tip=anchor.tip;
  for(const quadrant of ANNOTATION_QUADRANTS){const vertical=quadrant.y;for(const horizontal of [quadrant.x]){for(const [run,rise] of runs.flatMap(run=>[...new Set([run,...runs,...(request.kind==='wire'?[1,0]:[])])].map(rise=>[run,rise]))){
   if(request.kind==='pole' && Math.sign(tip.x-request.poleX)!==horizontal)continue;
   if(request.kind!=='wire' && rise<4)continue;
   const rank=(Math.max(run,rise)>DIAGONAL_RUNS[0]?1000000:0)+(quadrant.id-1)*100000+runs.indexOf(run)*1000+Math.abs(run-rise)*10;
   if(rank>=bestScore)continue;
   const elbow={x:tip.x+horizontal*run,y:tip.y+vertical*rise};
   const left=horizontal>0?elbow.x:elbow.x-width;
   const bounds={minX:left,maxX:left+width,minY:elbow.y-LEADER_TEXT_STYLE.aboveLineGap-style.fontSize,maxY:elbow.y+bottom};
   if(bounds.minX<5||bounds.maxX>205||bounds.minY<5||bounds.maxY>292)continue;
   if(space.obstacles.some(o=>overlap(bounds,o.bounds)))continue;
   // Leaders may touch their source at the arrow, but must not cross other content.
   let blocked=false;
   for(let i=2;i<=20;i++){
    const a={x:tip.x+(elbow.x-tip.x)*(i-1)/20,y:tip.y+(elbow.y-tip.y)*(i-1)/20};
    const b={x:tip.x+(elbow.x-tip.x)*i/20,y:tip.y+(elbow.y-tip.y)*i/20};
    if(space.obstacles.some(o=>!(i<=3 && (o.owner===anchor.owner || (request.kind==='arm' && o.owner?.startsWith(anchor.owner.split('/')[0]+'/'))))&&overlap(box(a,b),o.bounds,0.1))){blocked=true;break;}
   }
   if(!blocked){
    const crossings=space.obstacles.filter(o=>o.kind==='dimension'&&overlap(box(tip,elbow),o.bounds,0)).length;
    const score=rank+crossings;
    if(score<bestScore){bestScore=score;chosen={elbow,left,bounds,horizontal,quadrant:quadrant.id,tip:{...tip},score};}
   }
  }}}
  }
  if(!chosen){issues.push({id:request.id,code:'leader-space',message:'No clear leader position within the bounded search.'});continue;}
  tip=chosen.tip;
  const {elbow,left,bounds,horizontal}=chosen;
  const g=el(root,'g',{'data-leader-id':request.id});
  el(g,'path',{d:`M ${tip.x} ${tip.y} L ${elbow.x} ${elbow.y} L ${elbow.x+horizontal*width} ${elbow.y}`,fill:'none',stroke:'#333','stroke-width':0.18});
  const dx=elbow.x-tip.x,dy=elbow.y-tip.y,l=Math.hypot(dx,dy);
  el(g,'path',{d:`M ${tip.x+dx/l*2-dy/l*0.6} ${tip.y+dy/l*2+dx/l*0.6} L ${tip.x} ${tip.y} L ${tip.x+dx/l*2+dy/l*0.6} ${tip.y+dy/l*2-dx/l*0.6}`,fill:'none',stroke:'#333','stroke-width':0.18});
  request.rows.forEach((row,i)=>el(g,'text',{x:left+1,y:elbow.y+baseline(i),'font-family':'Arial, sans-serif','font-size':style.fontSize,'letter-spacing':style.letterSpacing,'word-spacing':LEADER_TEXT_STYLE.wordSpacing,'xml:space':'preserve'},row));
  space.obstacles.push({kind:'text',bounds});
  for(let i=1;i<=20;i++)space.obstacles.push({kind:'leader',bounds:box({x:tip.x+(elbow.x-tip.x)*(i-1)/20,y:tip.y+(elbow.y-tip.y)*(i-1)/20},{x:tip.x+(elbow.x-tip.x)*i/20,y:tip.y+(elbow.y-tip.y)*i/20})});results.push({id:request.id,tip,...chosen});
 }
 svg.leaderLayout={units:'mm',placed:results,issues,obstacles:space.obstacles};
 return svg.leaderLayout;
}

/** Content and exact engineering anchors, independent of placement. */
export function buildLeaderRequests(project,scene,transform){
 const requests=[],seen=new Map(),toPaper=p=>transform.toPaper(p);
 const add=(id,owner,rows,points)=>requests.push({id,owner,rows,poleX:toPaper({x:0,y:0}).x,kind:owner.includes('/above-gl')?'pole':owner.endsWith('/body')?'arm':owner.endsWith('/cable')?'wire':'object',tips:points.map(toPaper),tip:toPaper(points[0]),side:points[0].x<0?-1:1});
 for(const arm of project.arms){
  const body=scene.components.find(c=>c.id===`${arm.id}/body`);if(!body)continue;
  const points=body.primitives[0].points;
  const tip={x:(points[2].x+points[3].x)/2,y:(points[2].y+points[3].y)/2};
  const lowerAnchors=[0.7,0.9].map(f=>({owner:body.id,tip:toPaper({x:points[0].x+(points[1].x-points[0].x)*f,y:points[0].y+(points[1].y-points[0].y)*f})}));
  const key=JSON.stringify([arm.height,arm.diameter,arm.thickness,arm.material]);
  if(seen.has(key)){const prior=seen.get(key);prior.alternatives.push({owner:body.id,tip:toPaper(tip)});}
  else {add(`${arm.id}/specification`,body.id,[`Ø${arm.diameter} × t${arm.thickness}`,arm.material],[tip]);requests.at(-1).alternatives=[{owner:body.id,tip:toPaper({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2})}];requests.at(-1).alternatives.push(...lowerAnchors,...[0.1,0.3,0.9].map(f=>({owner:body.id,tip:toPaper({x:points[3].x+(points[2].x-points[3].x)*f,y:points[3].y+(points[2].y-points[3].y)*f})})));seen.set(key,requests.at(-1));}
 }
 for(const component of scene.components.filter(c=>c.type==='arm-lighting')){
  const p=component.primitives[0].points;add(`${component.id}/leader`,component.id,['灯具'],[{x:(p[1].x+p[2].x)/2,y:(p[1].y+p[2].y)/2}]);
 }
 for(const wire of project.overheadWires){
  const cable=scene.components.find(c=>c.id===`${wire.id}/cable`);if(!cable)continue;
  const arc=cable.primitives[0];
  const middle={x:arc.center.x,y:arc.center.y-arc.radius};
  add(`${wire.id}/leader`,cable.id,[`架空線: ${wire.name}`,`計算外径Ø= ${wire.diameter} mm`,`単位重量W= ${wire.weight} kg/m`,`S= ${wire.span/1000} m`],[middle,arc.start]);
 }
 for(const object of project.directObjects){
  const components=scene.components.filter(c=>c.type==='direct-object'&&c.sourceId===object.id);
  if(components.length)add(`${object.id}/leader`,components[0].id,[object.name||(object.type==='lighting'?'灯具':'Direct Object')],components.map(c=>{const p=c.primitives[0].points;return {x:p[1].x,y:(p[1].y+p[2].y)/2};}));
 }
 const poleSegments=scene.pole.segments.filter(s=>s.region==='above-gl');
 const diameterOnly=getDiameterOnlyPoleIds(poleSegments);
 for(const segment of poleSegments){
  const tapered=segment.lowerDiameter!==segment.upperDiameter;
  const slope=(segment.lowerDiameter-segment.upperDiameter)/(segment.topY-segment.bottomY);
  const taperName=Math.abs(slope-0.01)<0.000005?'1/100テーパー':'温間スピニングテーパー';
  const thickness=segment.lowerThickness.toFixed(1);
  if(diameterOnly.has(segment.poleId))continue;
  const rows=tapered?[`${taperName}(t${thickness})`,`(JIS G3444 ${segment.material})`]:[`Ø${segment.lowerDiameter} × t${thickness}`,segment.material];
  const points=[];
  for(const fraction of [0.5,0.7,0.3,0.85,0.15])for(const side of [1,-1])points.push({x:side*(segment.lowerDiameter+(segment.upperDiameter-segment.lowerDiameter)*fraction)/2,y:segment.bottomY+(segment.topY-segment.bottomY)*fraction});
  add(`${segment.poleId}/specification`,`${segment.poleId}/above-gl`,rows,points);
 }
 const opening=scene.components.find(c=>c.type==='opening');
 if(opening){
  add('opening/leader',opening.id,['開口部'],[opening.anchor]);
 }
 return requests;
}

/** Move dimension lanes only; extension origins retain their object coordinates. */
export function shiftDimensionLanes(svg,amount,{side='both'}={}){
 for(const group of svg.querySelectorAll('[data-dimension-id]')){
  const layer=group.closest('[data-layer]').dataset.layer;
  const horizontal=layer==='arm-dimensions';
  if(side==='left'&&layer!=='pole-dimensions')continue;
  if(side==='right'&&layer!=='object-height-dimensions')continue;
  // Keep horizontal rows fixed. Expand vertical column bundles uniformly only when needed.
  if(horizontal)continue;
  if(!horizontal&&group.dataset.dimensionId.includes('diameter'))continue;
  const delta=horizontal?-amount:layer==='pole-dimensions'?-amount:amount;
  for(const line of group.querySelectorAll('line')){
   const x1=+line.getAttribute('x1'),x2=+line.getAttribute('x2'),y1=+line.getAttribute('y1'),y2=+line.getAttribute('y2');
   const extension=horizontal?Math.abs(x1-x2)<1e-8&&Math.abs(y1-y2)>4:Math.abs(y1-y2)<1e-8&&Math.abs(x1-x2)>4;
   const axis=horizontal?'y':'x';
   if(!extension)line.setAttribute(axis+'1',+(line.getAttribute(axis+'1'))+delta);
   line.setAttribute(axis+'2',+(line.getAttribute(axis+'2'))+delta);
  }
  for(const text of group.querySelectorAll('text'))text.setAttribute('transform',`translate(${horizontal?0:delta} ${horizontal?delta:0}) ${text.getAttribute('transform')||''}`);
 }

}

/** Bounded fallback: replan all leaders after expanding dimension lanes. */
export function layoutSchematicLeaders(svg,requests,document){
 const layers=[...svg.querySelectorAll('[data-layer]')].filter(n=>n.dataset.layer.endsWith('dimensions'));
 const snapshots=layers.map(n=>n.innerHTML);
 const cache=createDimensionTextCache(createCanvasTextMeasurer(document.createElement('canvas')));
 let best=null,bestMarkup=null,bestLayers=null;
 for(const amount of [0,8,16,24,32]){
  layers.forEach((n,i)=>n.innerHTML=snapshots[i]);
  svg.querySelector('[data-layer="leaders"]')?.remove();
  if(amount)shiftDimensionLanes(svg,amount);
  const result=placeSchematicLeaders(svg,requests,document,cache);
  result.dimensionShift=amount;
  result.score=result.placed.reduce((sum,p)=>sum+p.score,0)+amount*2;
  if(!best||result.issues.length<best.issues.length||(result.issues.length===best.issues.length&&result.score<best.score)){best=result;bestMarkup=svg.querySelector('[data-layer="leaders"]').outerHTML;bestLayers=layers.map(n=>n.innerHTML);}
  // Expand columns only when needed; do not expand a successful layout to improve a score.
  if(result.issues.length===0)break;

 }
 layers.forEach((n,i)=>n.innerHTML=bestLayers[i]);svg.querySelector('[data-layer="leaders"]')?.remove();
 const container=document.createElementNS('http://www.w3.org/2000/svg','g');container.innerHTML=bestMarkup;svg.append(container.firstElementChild);
 svg.leaderLayout=best;
 const finalSpace=analyzeDrawingSpace(svg);
 svg.dimensionLayout={units:'mm',space:'paper',obstacles:finalSpace.obstacles.filter(o=>o.kind==='dimension'||o.kind==='text'),issues:svg.dimensionLayout?.issues||[]};
 const metadata=svg.querySelector('metadata[data-dimension-layout]');if(metadata)metadata.textContent=JSON.stringify(svg.dimensionLayout);
 const leaderMetadata=document.createElementNS('http://www.w3.org/2000/svg','metadata');leaderMetadata.dataset.leaderLayout='';leaderMetadata.textContent=JSON.stringify(best);svg.querySelector('metadata[data-leader-layout]')?.remove();svg.append(leaderMetadata);
 return best;
}

