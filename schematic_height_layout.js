import { analyzeDrawingSpace } from './schematic_leaders.js';

/** Compact finalized height columns using only obstacles within each height span.
 * Geometry and leaders are fixed. Extension origins and engineering values never move.
 */
export function compactObjectHeightDimensions(svg,{clearance=5,columnSpacing=8}={}) {
  const {obstacles}=analyzeDrawingSpace(svg,{includeLeaders:true,excludeObjectHeights:true});
  const groups=[...svg.querySelectorAll('[data-layer="object-height-dimensions"] [data-dimension-id]')];
  // One shared envelope keeps adjacent columns at the same paper spacing.
  const commonEdge=Math.max(...[...groups].reverse().map((group,index)=>{
    const main=group.querySelectorAll('line')[2],top=Math.min(+main.getAttribute('y1'),+main.getAttribute('y2')),bottom=Math.max(+main.getAttribute('y1'),+main.getAttribute('y2'));
    return Math.max(...obstacles.filter(o=>o.bounds.maxY>=top-1&&o.bounds.minY<=bottom+1).map(o=>o.bounds.maxX))-index*columnSpacing;
  }));
  let previous=-Infinity;
  const moves=[];
  // Shortest/innermost first; the higher columns remain outside the lower ones.
  for(const group of groups.reverse()) {
    const lines=[...group.querySelectorAll('line')],main=lines[2];
    const original=+main.getAttribute('x1');
    const top=Math.min(+main.getAttribute('y1'),+main.getAttribute('y2'));
    const bottom=Math.max(+main.getAttribute('y1'),+main.getAttribute('y2'));
    const edge=Math.max(...obstacles.filter(o=>o.bounds.maxY>=top-1&&o.bounds.minY<=bottom+1).map(o=>o.bounds.maxX));
    const x=Math.max(commonEdge+clearance,previous+columnSpacing);
    previous=x;
    const delta=x-original;
    if(Math.abs(delta)<0.01)continue;
    lines.forEach((line,i)=>{
      if(i>=2)line.setAttribute('x1',+line.getAttribute('x1')+delta);
      line.setAttribute('x2',+line.getAttribute('x2')+delta);
    });
    for(const text of group.querySelectorAll('text'))text.setAttribute('transform',`translate(${delta} 0) ${text.getAttribute('transform')||''}`);
    moves.push({id:group.dataset.dimensionId,from:original,to:x});
  }
  return {units:'mm',moves};
}
