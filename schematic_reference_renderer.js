import { DIMENSION_STYLE, createDimensionTextCache, createCanvasTextMeasurer } from './schematic_dimensions.js';
import { shiftDimensionLanes } from './schematic_leaders.js';
/** Fixed datum annotations. All offsets are paper mm; elevations are engineering mm. */
export function renderDatumReferences(svg, scene, transform, document) {
  const ns=svg.namespaceURI;
  const el=(parent,name,attrs,text)=>{
    const node=document.createElementNS(ns,name);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
    if(text!==undefined)node.textContent=text;
    parent.append(node);return node;
  };
  const root=el(svg,'g',{'data-layer':'datum-references',fill:'none',stroke:'#444','stroke-width':0.18});
  const line=(parent,a,b)=>el(parent,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y});
  const label=(parent,x,y,text)=>el(parent,'text',{x,y,fill:'#111',stroke:'none','font-family':'Arial, sans-serif','font-size':DIMENSION_STYLE.fontSize},text);
  const gl=transform.toPaper({x:0,y:0});
  const ground=el(root,'g',{'data-reference-id':'ground-level'});
  const gap=1;
  const measure=createDimensionTextCache(createCanvasTextMeasurer(document.createElement('canvas')));
  const plate=scene.components.find(c=>c.type==='baseplate');
  const radius=plate ? Math.max(...plate.primitives.flatMap(p=>p.points||[]).map(p=>p.x)) : scene.pole.bounds.maxX;
  const objectHalf=transform.lengthToPaper(radius);
  const half=Math.max(18,objectHalf+4+measure.measure('G.L.',{fontSize:DIMENSION_STYLE.fontSize}).width+2);
  const target=transform.toPaper({x:radius,y:scene.pole.crossSection.y});
  const inspectionTextX=target.x+8;
  const inspectionEnd=Math.max(target.x+24,inspectionTextX+measure.measure('検討部',{fontSize:DIMENSION_STYLE.fontSize}).width+2);
  const nearbyColumns=[...svg.querySelectorAll('[data-dimension-id] line')]
    .filter(n=>Math.abs(+n.getAttribute('x1')-n.getAttribute('x2'))<1e-8 &&
      Math.abs(+n.getAttribute('y1')-n.getAttribute('y2'))>5 &&
      [gl.y,target.y].some(y=>Math.min(+n.getAttribute('y1'),+n.getAttribute('y2'))<=y &&
      Math.max(+n.getAttribute('y1'),+n.getAttribute('y2'))>=y))
    .map(n=>+n.getAttribute('x1'));
  const leftShift=Math.max(0,...nearbyColumns.filter(x=>x<gl.x).map(x=>x-(gl.x-half-2*gap)));
  const rightShift=Math.max(0,...nearbyColumns.filter(x=>x>gl.x).map(x=>Math.max(gl.x+half,inspectionEnd)+2*gap-x));
  if(leftShift)shiftDimensionLanes(svg,leftShift,{side:'left'});
  if(rightShift)shiftDimensionLanes(svg,rightShift,{side:'right'});
  line(ground,{x:gl.x-half,y:gl.y},{x:gl.x+half,y:gl.y});
  const lowest=scene.pole.segments.filter(s=>s.region==='above-gl').at(-1);
  const moveGLRight=scene.pole.installation.type==='baseplate-under-gl' && lowest.lowerDiameter===lowest.upperDiameter && transform.lengthToPaper(lowest.topY-lowest.bottomY)<12;
  label(ground,moveGLRight?gl.x+objectHalf+4:gl.x-half+1,gl.y-1,'G.L.');
  const inspection=el(root,'g',{'data-reference-id':'inspection'});
  line(inspection,target,{x:inspectionEnd,y:target.y});
  for(const sign of [-1,1])line(inspection,target,{x:target.x+2.5,y:target.y+sign*0.75});
  label(inspection,inspectionTextX,target.y-1,'検討部');
  // Dimension extension strokes stop short of datum strokes; engineering
  // elevations and the vertical dimension arrows remain unchanged.
  const references=[{y:gl.y,left:gl.x-half,right:gl.x+half},
    {y:target.y,left:target.x,right:inspectionEnd}];
  for(const n of svg.querySelectorAll('[data-dimension-id] line')) {
    const y=+n.getAttribute('y1');
    if(Math.abs(y-n.getAttribute('y2'))>1e-8)continue;
    for(const ref of references) {
      if(Math.abs(y-ref.y)>1e-8)continue;
      const a=+n.getAttribute('x1'),b=+n.getAttribute('x2');
      if(a>b && a>=ref.left-gap && b<ref.left-gap)n.setAttribute('x1',ref.left-gap);
      if(a<b && a<=ref.right+gap && b>ref.right+gap)n.setAttribute('x1',ref.right+gap);
    }
  }
}
