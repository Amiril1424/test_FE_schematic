/** Paper-mm renderer for pole dimensions only. */
export function renderPoleDimensions(svg, data, transform, poleLeft, document) {
 const ns='http://www.w3.org/2000/svg';
 const el=(parent,name,attrs,text)=>{const n=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;parent.append(n);return n;};
 const root=el(svg,'g',{'data-layer':'pole-dimensions',fill:'none',stroke:'#444','stroke-width':0.18});
 const line=(g,a,b)=>el(g,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y});
 const text=(g,x,y,label,s,rotate=false)=>el(g,'text',{x,y,fill:'#111',stroke:'none','font-family':s.fontFamily,'font-size':s.fontSize,'text-anchor':'middle',...(rotate?{transform:`rotate(-90 ${x} ${y})`}:{})},label);
 const arrow=(g,p,dx,dy,s)=>{const w=s.arrowWidth/2,l=s.arrowLength;line(g,p,{x:p.x+dx*l-dy*w,y:p.y+dy*l+dx*w});line(g,p,{x:p.x+dx*l+dy*w,y:p.y+dy*l-dx*w});};
 for(const dim of data.dimensions){
  const s=dim.paper.style,a=transform.toPaper(dim.engineering.start),b=transform.toPaper(dim.engineering.end),x=poleLeft-dim.paper.offset;
  const g=el(root,'g',{'data-dimension-id':dim.id});
  line(g,{x,y:a.y},{x,y:b.y});
  for(const p of [a,b])line(g,{x:poleLeft-s.extensionGap,y:p.y},{x:x-s.extensionOverrun,y:p.y});
  const short=Math.abs(a.y-b.y)<2*s.arrowLength+s.fontSize;
  arrow(g,{x,y:a.y},0,short?1:-1,s);arrow(g,{x,y:b.y},0,short?-1:1,s);
  if(short){line(g,{x,y:a.y},{x,y:a.y+2*s.arrowLength});line(g,{x,y:b.y},{x,y:b.y-2*s.arrowLength});}
  text(g,x-s.textGap,(a.y+b.y)/2,dim.label,s,true);
  if(dim.note)text(g,x+s.fontSize+s.textGap,(a.y+b.y)/2,dim.note,s,true);
 }
 for(const dim of data.diameterReferences){
  const s=dim.paper.style,a=transform.toPaper(dim.engineering.start),b=transform.toPaper(dim.engineering.end);
  const sign=dim.side==='above'?-1:1, shift=18, y=a.y+sign*14;
  const g=el(root,'g',{'data-dimension-id':dim.id,'data-dimension-kind':'diameter','data-source-id':dim.sourceIds[0],'data-reference-elevation':dim.engineering.start.y});
  line(g,a,{x:a.x+shift,y});line(g,b,{x:b.x+shift,y});
  line(g,{x:a.x+shift-6,y},{x:b.x+shift+6,y});
  arrow(g,{x:a.x+shift,y},-1,0,s);arrow(g,{x:b.x+shift,y},1,0,s);
  text(g,(a.x+b.x)/2+shift,y-s.textGap,dim.label,s);
 }
}

export function renderArmDimensions(svg, dimensions, transform, document, cache) {
 const ns='http://www.w3.org/2000/svg';
 const el=(parent,name,attrs,text)=>{const n=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;parent.append(n);return n;};
 const root=el(svg,'g',{'data-layer':'arm-dimensions',fill:'none',stroke:'#444','stroke-width':0.18});
 const line=(g,x1,y1,x2,y2)=>el(g,'line',{x1,y1,x2,y2});
 const arrow=(g,x,y,sign,s)=>{for(const v of [-1,1])line(g,x,y,x+sign*s.arrowLength,y+v*s.arrowWidth/2);};
 const groups=Map.groupBy(dimensions,d=>d.elevation);
 const occupied=[];
 for(const group of groups.values()) {
  const s=group[0].paper.style;
  let y=Math.min(...group.map(d=>transform.toPaper({x:0,y:d.clearanceY}).y))-s.armOffset;
  const top=transform.toPaper({x:0,y:group[0].poleTop}).y;
  if(y-top<transform.lengthToPaper(150))y=top-s.armOffset;
  while(occupied.some(v=>Math.abs(v-y)<s.rowSpacing))y-=s.rowSpacing;
  occupied.push(y);
  const paired=group.some(d=>d.engineering.end.x<0)&&group.some(d=>d.engineering.end.x>0);
  const shortGroup=group.some(d=>Math.abs(transform.toPaper(d.engineering.end).x-transform.toPaper(d.engineering.start).x)<cache.measure(d.label,s).width+2*(s.arrowLength+s.textEndPadding));
  let dot=false;
  for(const d of group){
   const a=transform.toPaper(d.engineering.start),b=transform.toPaper(d.engineering.end),sign=Math.sign(b.x-a.x),m=cache.measure(d.label,s);
   const outside=shortGroup||Math.abs(b.x-a.x)<m.width+2*(s.arrowLength+s.textEndPadding);
   const g=el(root,'g',{'data-dimension-id':d.id,'data-text-outside':outside});
   for(const p of [a,b])line(g,p.x,p.y-s.extensionGap,p.x,y-s.extensionOverrun);
   line(g,a.x,y,b.x,y);
   let tx=(a.x+b.x)/2;
   if(outside){
    const end=b.x+sign*(m.width+2*(s.textEndPadding+5)+s.arrowLength);
    line(g,b.x,y,end,y);arrow(g,b.x,y,sign,s);
    tx=b.x+sign*(s.arrowLength+s.textEndPadding+5+m.width/2);
    if(paired){if(!dot){el(root,'circle',{cx:a.x,cy:y,r:0.5,fill:'#444'});dot=true;}}
    else {arrow(g,a.x,y,-sign,s);line(g,a.x,y,a.x-sign*2*s.arrowLength,y);}
   }else {arrow(g,a.x,y,sign,s);arrow(g,b.x,y,-sign,s);}
   el(g,'text',{x:tx,y:y-s.textGap,fill:'#111',stroke:'none','font-family':s.fontFamily,'font-size':s.fontSize,'text-anchor':'middle'},d.label);
  }
 }
}

/** Heights on right: highest is the outermost column to avoid crossing lower labels. */
export function renderObjectHeightDimensions(svg,data,transform,rightEdge,document){
 const ns='http://www.w3.org/2000/svg';
 const el=(p,n,a,text)=>{const e=document.createElementNS(ns,n);for(const[k,v]of Object.entries(a))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;p.append(e);return e;};
 const root=el(svg,'g',{'data-layer':'object-height-dimensions',fill:'none',stroke:'#444','stroke-width':0.18});
 const line=(g,x1,y1,x2,y2)=>el(g,'line',{x1,y1,x2,y2});
 for(const [i,d]of data.dimensions.entries()){
  const s=d.paper.style,a=transform.toPaper(d.engineering.start),b=transform.toPaper(d.engineering.end);
  const x=rightEdge+s.initialOffset+(data.dimensions.length-1-i)*s.columnSpacing;
  const g=el(root,'g',{'data-dimension-id':d.id});
  for(const p of[a,b])line(g,p.x+s.extensionGap,p.y,x+s.extensionOverrun,p.y);
  line(g,x,a.y,x,b.y);
  for(const[p,sign]of[[a,-1],[b,1]])for(const side of[-1,1])line(g,x,p.y,x+side*s.arrowWidth/2,p.y+sign*s.arrowLength);
  el(g,'text',{x:x-s.textGap,y:(a.y+b.y)/2,transform:`rotate(-90 ${x-s.textGap} ${(a.y+b.y)/2})`,fill:'#111',stroke:'none','font-family':s.fontFamily,'font-size':s.fontSize,'text-anchor':'middle'},d.label);
 }
}
