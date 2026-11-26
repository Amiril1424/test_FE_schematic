import { finalizeDimensionLayout } from './schematic_dimension_layout.js';
import { renderDatumReferences } from './schematic_reference_renderer.js';
import { createDimensionTextCache, createCanvasTextMeasurer } from './schematic_dimensions.js';
import { renderPoleDimensions, renderArmDimensions, renderObjectHeightDimensions } from './schematic_dimension_renderer.js';
import { createPaperTransform } from './schematic_Lighting_1a.js';
/** Geometry and dimension preview. Leaders are not included. */
export function renderGeometryPreview(scene, document, dimensions = null, armDimensions = [], objectHeights = null, options = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 210 297'); svg.setAttribute('width', '210mm'); svg.setAttribute('height', '297mm');
  const b = scene.bounds, reserve = dimensions ? 65 : 0, scale = (options.scaleMultiplier ?? 1) * Math.min((180-reserve-(objectHeights ? 15+objectHeights.dimensions.length*8 : 0))/(b.maxX-b.minX), (dimensions || armDimensions.length ? 235 : 267)/(b.maxY-b.minY));
  const t = createPaperTransform({ scale, originOnPaper: { x: 105+reserve/2-(objectHeights ? 15+objectHeights.dimensions.length*8 : 0)/2-(b.minX+b.maxX)*scale/2, y: 148.5+(b.minY+b.maxY)*scale/2 } });
  const point = p => { const q = t.toPaper(p); return `${q.x} ${q.y}`; };
  const arc = (a, end) => `A ${t.lengthToPaper(a.radius)} ${t.lengthToPaper(a.radius)} 0 0 ${a.clockwise ? 1 : 0} ${point(end)}`;
  const geometryLayer = document.createElementNS(ns, 'g'); geometryLayer.dataset.layer = 'geometry'; svg.append(geometryLayer);
  for (const component of scene.components) {
    const group = document.createElementNS(ns, 'g'); group.dataset.componentId = component.id;
    for (const p of component.primitives) {
      const path = document.createElementNS(ns, 'path');
      let d;
      if (p.kind === 'arc') d = `M ${point(p.start)} ${arc(p,p.end)}`;
      else {
        d = p.points.map((v,i) => `${i ? 'L' : 'M'} ${point(v)}`).join(' ');
        if (p.closingArc) d += ` ${arc(p.closingArc,p.points[0])}`;
        if (p.closed) d += ' Z';
      }
      path.setAttribute('d',d); path.setAttribute('fill',p.fill === 'paper' || component.type === 'baseplate' ? 'white' : 'none');
      path.setAttribute('stroke','#222'); path.setAttribute('stroke-width','0.25'); group.append(path);
      if(p.role === 'centerline') {
        path.setAttribute('stroke-width','0.12');
        path.setAttribute('stroke-dasharray','6 1 1 1');
        path.dataset.role = 'centerline';
      }
    }
    geometryLayer.append(group);
  }
  if (dimensions) renderPoleDimensions(svg, dimensions, t, t.toPaper({x:scene.pole.bounds.minX,y:0}).x, document);
  if (armDimensions.length) renderArmDimensions(svg, armDimensions, t, document, createDimensionTextCache(createCanvasTextMeasurer(document.createElement('canvas'))));
  if (objectHeights) renderObjectHeightDimensions(svg, objectHeights, t, t.toPaper({x:scene.bounds.maxX,y:0}).x, document);
  if(dimensions)renderDatumReferences(svg,scene,t,document);
  svg.engineeringTransform = t;
  finalizeDimensionLayout(svg, document);
  return svg;
}
