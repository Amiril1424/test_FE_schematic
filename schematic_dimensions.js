/** Stage 4.1–4.2. Pure dimension data and paper-mm typography; no placement/rendering. */
export const DIMENSION_STYLE = Object.freeze({
  fontFamily: 'Arial, sans-serif', fontSize: 3.5, fontWeight: 'normal', fontStyle: 'normal',
  letterSpacing: 0, lineHeight: 1.2,
  arrowShape: 'open', arrowLength: 2.5, arrowWidth: 1.5,
  textGap: 1, textEndPadding: 1, extensionGap: 1, extensionOverrun: 2,
  initialOffset: 30, armOffset: 10, columnSpacing: 8, rowSpacing: 8, strokeWidth: 0.18
});

export function createDimensionStyle(overrides = {}) {
  const style = { ...DIMENSION_STYLE, ...overrides };
  for (const key of Object.keys(overrides)) if (!(key in DIMENSION_STYLE)) throw new TypeError(`Unknown style: ${key}`);
  for (const key of ['fontFamily', 'fontWeight', 'fontStyle']) {
    if (typeof style[key] !== 'string' || !style[key].trim()) throw new TypeError(`Invalid ${key}`);
  }
  for (const key of Object.keys(style).filter(k => typeof DIMENSION_STYLE[k] === 'number')) {
    if (!Number.isFinite(style[key]) || style[key] < 0 || (key !== 'letterSpacing' && style[key] === 0)) throw new RangeError(`Invalid ${key}`);
  }
  if (!['open', 'filled'].includes(style.arrowShape)) throw new TypeError('Invalid arrow shape');
  return Object.freeze(style);
}

/** Projected endpoint distance in engineering mm; no scale participates in the value. */
export function createDimension({ id, sourceIds, start, end, direction, side, prefix = '', precision = 0, style = {} }) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('Dimension ID required');
  if (!Array.isArray(sourceIds) || !sourceIds.length || sourceIds.some(id => typeof id !== 'string' || !id.trim())) throw new TypeError('Source IDs required');
  for (const p of [start, end]) if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError('Finite engineering points required');
  if (!['horizontal', 'vertical'].includes(direction)) throw new TypeError('Invalid direction');
  if (!(direction === 'vertical' ? ['left', 'right'] : ['above', 'below']).includes(side)) throw new TypeError('Side incompatible with direction');
  if (!Number.isInteger(precision) || precision < 0 || precision > 6 || typeof prefix !== 'string') throw new TypeError('Invalid label format');
  const value = Math.abs(direction === 'vertical' ? end.y - start.y : end.x - start.x);
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('Dimension must have positive finite extent');
  return { id, sourceIds: [...new Set(sourceIds)], direction, side,
    engineering: { units: 'mm', start: { ...start }, end: { ...end }, value },
    label: `${prefix}${Number(value.toFixed(precision))}`,
    paper: { units: 'mm', style: createDimensionStyle(style) } };
}

/** Inject a synchronous measurer returning {width,height} in PAPER mm.
 * Keep one cache per generation. Clear after font loading or a font resource change.
 * Every supported style field is part of the key, so style changes never reuse stale metrics.
 */
export function createDimensionTextCache(measureText) {
  if (typeof measureText !== 'function') throw new TypeError('Text measurer required');
  const cache = new Map();
  return {
    measure(text, overrides = {}) {
      if (typeof text !== 'string') throw new TypeError('Text must be a string');
      const style = createDimensionStyle(overrides);
      const key = JSON.stringify([text, ...Object.keys(DIMENSION_STYLE).map(k => style[k])]);
      if (!cache.has(key)) {
        const metrics = measureText(text, style);
        if (!metrics || !Number.isFinite(metrics.width) || !Number.isFinite(metrics.height) || metrics.width < 0 || metrics.height < 0) throw new TypeError('Invalid paper-mm text metrics');
        cache.set(key, Object.freeze({ width: metrics.width, height: metrics.height }));
      }
      return cache.get(key);
    },
    clear() { cache.clear(); },
    get size() { return cache.size; }
  };
}

/** Browser adapter: call after document.fonts.ready. No global document access. */
export function createCanvasTextMeasurer(canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  const pxPerMM = 96 / 25.4;
  return (text, style) => {
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize * pxPerMM}px ${style.fontFamily}`;
    const lines = text.split('\n');
    const width = Math.max(...lines.map(line => context.measureText(line).width / pxPerMM + Math.max(0, [...line].length - 1) * style.letterSpacing));
    return { width, height: lines.length * style.fontSize * style.lineHeight };
  };
}

/** Layout decision only: caller supplies span already converted to paper mm. */
export function dimensionTextFits(dimension, spanPaperMM, cache) {
  if (!Number.isFinite(spanPaperMM) || spanPaperMM < 0) throw new RangeError('Invalid paper span');
  const style = dimension.paper.style;
  const metrics = cache.measure(dimension.label, style);
  const requiredWidth = metrics.width + 2 * (style.arrowLength + style.textEndPadding);
  return { fits: spanPaperMM >= requiredWidth, requiredWidth, availableWidth: spanPaperMM, metrics };
}

/** Stage 4.3: pole dimension definitions; columns count outward from the pole.
 * openingHeight is the opening CENTER elevation above GL, not a buried-base height.
 * No object-height inputs are reinterpreted here; datum is returned for later stages.
 */
export function buildPoleDimensions(pole, { openingHeight = 750, style = {} } = {}) {
  const settings = createDimensionStyle(style);
  const segments = pole.segments.filter(s => s.region === 'above-gl');
  if (!segments.length) throw new TypeError('Pole geometry required');
  const lowest = segments.at(-1), depth = pole.installation.depth;
  const under = pole.installation.type === 'baseplate-under-gl';
  const embed = pole.installation.type === 'embedment';
  const separateBuried = under && lowest.lowerDiameter !== lowest.upperDiameter;
  if (!Number.isFinite(openingHeight) || openingHeight <= 0 || openingHeight > pole.topY) throw new RangeError('Opening center must be on the above-GL pole');
  const dimensions = [], diameterReferences = [];
  let nextIndex = 1;
  const add = (id, sources, bottom, top, column, indexed = false) => {
    const index = indexed ? nextIndex++ : null;
    const dim = createDimension({ id, sourceIds: sources, start: { x: 0, y: bottom }, end: { x: 0, y: top },
      direction: 'vertical', side: 'left', prefix: index ? `H${index}=` : '', style: settings });
    dim.hIndex = index;
    dim.paper.column = column;
    dim.paper.offset = settings.initialOffset + column * settings.columnSpacing;
    dimensions.push(dim);
  };
  // Inner -> outer: depth/opening/segments/total. Taper under GL shares the
  // segment column for its buried H; opening remains closer to the pole.
  const segmentColumn = 2, totalColumn = 3;
  add('pole/height-total', segments.map(s => s.poleId), under ? -depth : 0, pole.topY, totalColumn, true);
  if (segments.length > 1 || separateBuried) {
    segments.forEach((s, i) => add(`${s.poleId}/height`, [s.poleId],
      under && !separateBuried && i === segments.length - 1 ? -depth : s.bottomY,
      s.topY, segmentColumn, true));
  }
  if (depth > 0) {
    // Embedment depth continues the above-GL H1 column below ground.
    const depthColumn = embed ? totalColumn : separateBuried ? segmentColumn : 0;
    add('installation/depth', [lowest.poleId], -depth, 0, depthColumn, separateBuried);
    if (embed) add('installation/full-length', segments.map(s => s.poleId), -depth, pole.topY, 4);
  }
  add('opening/height', [lowest.poleId], under && !separateBuried ? -depth : 0, openingHeight, 1);
  // The load centroid shares its segment's H index; it must not consume an object index.
  for (const segment of segments.filter(s=>s.lowerDiameter !== s.upperDiameter)) {
    const length=segment.topY-segment.bottomY;
    const height=Math.round(length*(segment.lowerDiameter+2*segment.upperDiameter)/(3*(segment.lowerDiameter+segment.upperDiameter)));
    const parent=dimensions.find(d=>d.id===`${segment.poleId}/height`) || dimensions[0];
    const dim=createDimension({id:`${segment.poleId}/load-center`,sourceIds:[segment.poleId],
      start:{x:0,y:segment.bottomY},end:{x:0,y:segment.bottomY+height},direction:'vertical',side:'left',
      prefix:`H${parent.hIndex}'=`,style:settings});
    dim.hIndex=parent.hIndex; dim.note='(荷重中心高さ)'; dim.paper.column=segment.bottomY>=openingHeight ? 1 : 1.5; // Share only disjoint elevation spans.
    dimensions.push(dim);
  }
  // Taper end diameters remain explicit, even next to a matching straight segment.
  for (const segment of segments.filter(s=>s.lowerDiameter !== s.upperDiameter)) {
    for(const [end,y,diameter,side] of [['top',segment.topY,segment.upperDiameter,'below'],['bottom',segment.bottomY,segment.lowerDiameter,'above']]) {
      if(separateBuried && y===0)continue;
      const dim=createDimension({id:`${segment.poleId}/diameter-${end}`,sourceIds:[segment.poleId],
        start:{x:-diameter/2,y},end:{x:diameter/2,y},direction:'horizontal',side,prefix:'Ø',precision:3,style:settings});
      diameterReferences.push(dim);
    }
  }
  const diameterOnly=getDiameterOnlyPoleIds(segments);
  for (const segment of segments.filter(s=>diameterOnly.has(s.poleId))) {
    for(const [end,y] of [['top',segment.topY],['bottom',under&&segment===lowest?-depth:segment.bottomY]]){
      const existing=diameterReferences.find(d=>d.engineering.start.y===y&&d.engineering.value===segment.lowerDiameter);
      if(existing){if(!existing.sourceIds.includes(segment.poleId))existing.sourceIds.push(segment.poleId);continue;}
      diameterReferences.push(createDimension({id:`${segment.poleId}/diameter-${end}`,sourceIds:[segment.poleId],
        start:{x:-segment.lowerDiameter/2,y},end:{x:segment.lowerDiameter/2,y},
        direction:'horizontal',side:'above',prefix:'\u00D8',precision:3,style:settings}));
    }
  }
  if (separateBuried) {
    for (const [name, y, placement] of [['gl', 0, 'above'], ['baseplate', -depth, 'below']]) {
      const radius = lowest.lowerDiameter / 2;
      const dim = createDimension({ id: `installation/diameter-${name}`, sourceIds: [lowest.poleId],
        start: { x: -radius, y }, end: { x: radius, y }, direction: 'horizontal', side: placement,
        prefix: 'Ø', precision: 3, style: settings });
      dim.kind = 'diameter'; dim.paper.placement = { side: 'right', direction: placement };
      diameterReferences.push(dim);
    }
  }
  // Compact only occupied columns; single-section poles must not leave empty lanes.
  const columns=[...new Set(dimensions.map(d=>d.paper.column))].sort((a,b)=>a-b);
  for(const dimension of dimensions){
    dimension.paper.column=columns.indexOf(dimension.paper.column);
    dimension.paper.offset=settings.initialOffset+dimension.paper.column*settings.columnSpacing;
  }
  return { dimensions, diameterReferences, nextHIndex: nextIndex,
    objectHeightDatumY: under ? -depth : 0,
    openingDatumY: under && !separateBuried ? -depth : 0,
    underGLMode: under ? (separateBuried ? 'separate-straight-extension' : 'combined-lowest-section') : null };
}

/** Stage 4.4: only successful arm attachments receive dimensions. */
export function buildArmDimensions(project, scene, style = {}) {
 const elevations=[...new Set(project.arms.map(a=>a.height))].sort((a,b)=>b-a);
 return project.arms.filter(a=>scene.components.some(c=>c.id===`${a.id}/body`)).map(arm=>{
  const tip=scene.components.find(c=>c.id===`${arm.id}/adapter`).primitives[0].points;
  const end={x:(tip[0].x+tip[1].x)/2,y:(tip[0].y+tip[1].y)/2};
  const dim=createDimension({id:`${arm.id}/length`,sourceIds:[arm.id],start:{x:0,y:end.y},end,
   direction:'horizontal',side:'above',prefix:`L${elevations.indexOf(arm.height)+1}=`,style});
  dim.elevation=arm.height;dim.poleTop=scene.pole.topY;
  // Clear the arm body before applying the 150 engineering-mm top clearance rule.
  const points=scene.components.filter(c=>c.sourceId===arm.id).flatMap(c=>c.primitives.flatMap(p=>p.points??[]));
  dim.clearanceY=Math.max(end.y,...points.map(p=>p.y));
  return dim;
 });
}

/** Stage 4.5: one height dimension per GL elevation, irrespective of object type. */
export function buildObjectHeightDimensions(project, scene, poleDimensions, style = {}) {
 const settings=createDimensionStyle(style), groups=new Map();
 const add=(sourceId,kind,point)=>{
  if(!groups.has(point.y))groups.set(point.y,[]);
  groups.get(point.y).push({sourceId,kind,point});
 };
 for(const arm of project.arms){
  const adapter=scene.components.find(c=>c.id===`${arm.id}/adapter`);
  if(adapter){const [a,b]=adapter.primitives[0].points;add(arm.id,'arm',{x:(a.x+b.x)/2,y:(a.y+b.y)/2});}
 }
 for(const component of scene.components.filter(c=>c.type==='direct-object')){
  const ref=component.reference;
  if(ref.attachment==='pole-top')continue; // Pole H already specifies this mounting height.
  add(component.sourceId,'direct-object',{x:ref.center.x+ref.boxSize.width/2,y:ref.center.y});
 }
 for(const wire of project.overheadWires){
  const band=scene.components.find(c=>c.id===`${wire.id}/band`);
  if(band)add(wire.id,'ohw',{x:Math.max(...band.primitives.flatMap(p=>p.points.map(v=>v.x))),y:(band.primitives[0].points[0].y+band.primitives[0].points[2].y)/2});
 }
 let index=poleDimensions.nextHIndex;
 const dimensions=[];
 for(const [elevation,objects] of [...groups.entries()].sort((a,b)=>b[0]-a[0])){
  if(elevation===poleDimensions.objectHeightDatumY)continue; // No zero-length dimension.
  const point=objects.reduce((a,b)=>a.point.x>=b.point.x?a:b).point;
  const dim=createDimension({id:`objects/height/${objects.map(o=>o.sourceId).sort().join('+')}`,
   sourceIds:objects.map(o=>o.sourceId),start:{x:point.x,y:poleDimensions.objectHeightDatumY},end:point,
   direction:'vertical',side:'right',prefix:`H${index}=`,style:settings});
  dim.hIndex=index++;dim.references=objects;dim.paper.column=dimensions.length;
  dim.paper.offset=settings.initialOffset+dimensions.length*settings.columnSpacing;
  dimensions.push(dim);
 }
 return {dimensions,nextHIndex:index};
}

/** Straight sections connected to a taper through matching diameter/thickness joints. */
export function getDiameterOnlyPoleIds(segments) {
 const ordered=[...segments].filter(s=>s.region==='above-gl').sort((a,b)=>b.topY-a.topY);
 const result=new Set();let chain=[];
 const flush=()=>{if(chain.some(s=>s.lowerDiameter!==s.upperDiameter))for(const s of chain)if(s.lowerDiameter===s.upperDiameter)result.add(s.poleId);chain=[];};
 for(const segment of ordered){
  const upper=chain.at(-1);
  if(upper && !(upper.bottomY===segment.topY && upper.lowerDiameter===segment.upperDiameter && upper.lowerThickness===segment.upperThickness && upper.material===segment.material))flush();
  chain.push(segment);
 }
 flush();return result;
}
