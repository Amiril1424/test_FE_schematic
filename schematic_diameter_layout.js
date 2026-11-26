import { ANNOTATION_QUADRANTS, DIAGONAL_RUNS, LOWER_DIAMETER_RUNS } from './schematic_annotation_policy.js';
/** Reposition diameter callouts as a unit; both engineering extension origins stay fixed. */
export function arrangeDiameterCallouts(svg) {
  const overlap=(a,b,p=0.35)=>a.x<b.x+b.width+p&&a.x+a.width>b.x-p&&a.y<b.y+b.height+p&&a.y+a.height>b.y-p;
  const segments=line=>{
    const a={x:+line.getAttribute('x1'),y:+line.getAttribute('y1')};
    const b={x:+line.getAttribute('x2'),y:+line.getAttribute('y2')};
    const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)));
    return Array.from({length:n},(_,i)=>({x:Math.min(a.x+(b.x-a.x)*i/n,a.x+(b.x-a.x)*(i+1)/n),
      y:Math.min(a.y+(b.y-a.y)*i/n,a.y+(b.y-a.y)*(i+1)/n),width:Math.abs(b.x-a.x)/n,height:Math.abs(b.y-a.y)/n}));
  };
  const issues=[];
  for(const group of svg.querySelectorAll('[data-dimension-kind="diameter"]')) {
    const lines=[...group.querySelectorAll('line')],text=group.querySelector('text');
    const runs=group.dataset.dimensionId.endsWith('diameter-top')?DIAGONAL_RUNS:LOWER_DIAMETER_RUNS;
    const original=lines.map(n=>['x1','y1','x2','y2'].map(k=>+n.getAttribute(k)));
    const tx=+text.getAttribute('x'),ty=+text.getAttribute('y');
    const obstacles=[...svg.querySelectorAll('[data-dimension-id] line')].filter(n=>!group.contains(n)).flatMap(segments);
    const labels=[...svg.querySelectorAll('[data-dimension-id] text')].filter(n=>!group.contains(n)).map(n=>{
      const b=n.getBBox(),m=svg.getCTM().inverse().multiply(n.getCTM());
      const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
      const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
      return{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
    });
    const geometry=[...svg.querySelectorAll('[data-layer="geometry"] path,[data-layer="leaders"] path')].flatMap(node=>{
      const length=node.getTotalLength(),count=Math.max(1,Math.ceil(length));
      return Array.from({length:count},(_,i)=>{
        const a=node.getPointAtLength(length*i/count),b=node.getPointAtLength(length*(i+1)/count);
        return {owner:node.closest('[data-component-id]')?.dataset.componentId,x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)};
      });
    });
    const occupied=[...obstacles,...labels,...geometry];
    const sourceId=group.dataset.sourceId||group.dataset.dimensionId.split('/')[0];
    // Diameter witness lines originate on the measured pole/plate section itself.
    // Only that measured assembly is exempt; labels still avoid all geometry.
    const strokeObstacles=occupied.filter(o=>!o.owner?.startsWith(sourceId+'/')&&
      !(group.dataset.dimensionId.endsWith('diameter-bottom')&&o.owner?.startsWith('installation/'))&&o.owner!=='pole/centerline');
    let placed=false;
    const move=(dx,dy)=>{
      lines.forEach((line,i)=>['x1','y1','x2','y2'].forEach((key,k)=>line.setAttribute(key,original[i][k]+(i<2&&k<2?0:k%2?dy:dx))));
      // Lower witness lines retain their measured origins as metadata, but their
      // visible strokes start outside the measured pole envelope (45-degree gap).
      if(!group.dataset.dimensionId.endsWith('diameter-top') && Number(group.dataset.referenceElevation)!==0) {
        const low=Math.min(original[0][0],original[1][0]),high=Math.max(original[0][0],original[1][0]);
        for(let i=0;i<2;i++) {
          const line=lines[i],a=original[i];
          const sx=Math.sign(+line.getAttribute('x2')-a[0]),sy=Math.sign(+line.getAttribute('y2')-a[1]);
          const distance=sy>0?0.5:(sx>0?high-a[0]:a[0]-low)+0.5;
          line.dataset.referenceX=a[0];line.dataset.referenceY=a[1];
          line.setAttribute('x1',a[0]+sx*distance);line.setAttribute('y1',a[1]+sy*distance);
        }
      }
      text.setAttribute('x',tx+dx);text.setAttribute('y',ty+dy);
      text.setAttribute('text-anchor','middle');
      const below=+lines[0].getAttribute('y2')>original[0][1];
      if(below) {
        const right=+lines[0].getAttribute('x2')>original[0][0];
        const ends=lines.slice(0,2).map(line=>+line.getAttribute('x2'));
        const edge=right?Math.max(...ends):Math.min(...ends);
        const x=edge+(right?4:-4);
        text.setAttribute('text-anchor',right?'start':'end');
        text.setAttribute('x',x);
        const width=text.getBBox().width;
        lines[2].setAttribute(right?'x2':'x1',x+(right?width+1:-width-1));
        group.dataset.textPosition=right?'outside-right':'outside-left';
      } else group.dataset.textPosition='center';
    };
    for(const quadrant of ANNOTATION_QUADRANTS) {
      for(const run of runs) {
        const dx=quadrant.x*run-(original[0][2]-original[0][0]);
        const dy=quadrant.y*run-(original[0][3]-original[0][1]);
        move(dx,dy);
        const bounds=text.getBBox();
        const witnesses=lines.slice(0,2).flatMap(line=>segments(line).slice(2));
        const strokes=lines.slice(2).flatMap(segments);
        if(bounds.x<5||bounds.x+bounds.width>205||bounds.y<5||bounds.y+bounds.height>292)continue;
        if(!occupied.some(o=>overlap(bounds,o))&&
          !witnesses.some(s=>strokeObstacles.some(o=>overlap(s,o,0.1)))&&
          !strokes.some(s=>occupied.some(o=>overlap(s,o,0.1)))) {
          group.dataset.quadrant=quadrant.id;group.dataset.diagonalRun=run;
          placed=true;break;
        }
      }
      if(placed)break;
    }
    if(!placed){
      move(runs[0]-(original[0][2]-original[0][0]),-runs[0]-(original[0][3]-original[0][1]));
      issues.push({dimensionId:group.dataset.dimensionId,code:'diameter-space',message:'Diameter callout requires layout review.'});
    }
  }
  return issues;
}
