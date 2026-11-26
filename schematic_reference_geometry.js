/** Fixed prototype details in engineering mm; paper annotations live elsewhere. */
export const OPENING_DETAIL = Object.freeze({ centerHeight: 750, cutHeight: 600,
  endAllowance: 40, projection: 22.7, flangeWidth: 20, faceWidth: 61.2,
  coverProjection: 3.8, coverThickness: 4.5, centerlineExtension: 100 });

export function buildReferenceGeometry(pole, components, diameterAt) {
  const result = [], d = OPENING_DETAIL;
  const line = (id, points) => result.push({ id, type: 'centerline',
    primitives: [{ kind: 'polyline', role: 'centerline', points }] });
  const topExtension=components.some(c=>c.type==='top-adapter')?220:100;
  line('pole/centerline', [{ x: 0, y: pole.bottomY - 100 }, { x: 0, y: pole.topY + topExtension }]);
  for (const body of components.filter(c => c.type === 'arm')) {
    const p = body.primitives[0].points;
    const start = { x: (p[0].x+p[3].x)/2, y: (p[0].y+p[3].y)/2 };
    const end = { x: (p[1].x+p[2].x)/2, y: (p[1].y+p[2].y)/2 };
    const length = Math.hypot(end.x-start.x,end.y-start.y);
    line(`${body.sourceId}/centerline`, [start, { x: end.x+(end.x-start.x)*220/length,
      y: end.y+(end.y-start.y)*220/length }]);
  }
  if (pole.topY < d.centerHeight + d.cutHeight/2 + d.endAllowance + d.coverThickness) {
    return { components: result, issues: [{ code: 'opening-clearance', message: 'Pole is too short for the standard opening detail.' }] };
  }
  const radius = diameterAt(pole, d.centerHeight)/2;
  const x = -radius-d.projection, bottom = d.centerHeight-d.cutHeight/2-d.endAllowance;
  const top = d.centerHeight+d.cutHeight/2+d.endAllowance;
  const rectangle = (left, right, low, high, fill='none') => ({ kind: 'polyline', closed: true, fill,
    points: [{x:left,y:low},{x:right,y:low},{x:right,y:high},{x:left,y:high}] });
  result.push({ id: 'opening', type: 'opening', anchor: {x,y:d.centerHeight}, primitives: [
    rectangle(x+d.flangeWidth,x+d.faceWidth,bottom,top,'paper'),
    rectangle(x,x+d.flangeWidth,bottom,top-2),
    rectangle(x-d.coverProjection,x+d.faceWidth,top,top+d.coverThickness)
  ] });
  line('opening/centerline', [{x:x-d.centerlineExtension,y:d.centerHeight},
    {x:radius+d.centerlineExtension,y:d.centerHeight}]);
  // Centerlines remain visible over opaque faces, as in the original drawing.
  return { components: [...result.filter(c=>c.type!=='centerline'),...result.filter(c=>c.type==='centerline')], issues: [] };
}
