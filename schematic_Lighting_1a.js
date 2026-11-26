import { buildReferenceGeometry } from './schematic_reference_geometry.js';
/**
 * Schematic V2 — tahap 1: data engineering, validasi, dan adapter form.
 * Tidak menggambar SVG, memasang event, atau membaca document secara otomatis.
 * Panjang: mm; sudut: degree; berat OHW: kg/m. Pole berurutan atas -> bawah.
 * Height arm = elevasi center ujung arm dari G.L., bukan titik pangkal.
 * Simpan ID yang dihasilkan bersama project; pertahankan ID saat urutan berubah.
 *
 * Pemakaian React/data langsung:
 *   const project = createProject({ poles: [...], arms: [...] });
 *   const result = validateProject(project);
 * Pemakaian HTML:
 *   const project = readProjectFromForm(document.getElementById('parameters'));
 *   const result = validateProject(project);
 * Engine tahap berikutnya hanya menerima project setelah result.valid === true.
 */

/** Membuat snapshot baru. Angka dari API harus number; adapter menangani string HTML. */
export function createProject(input = {}) {
  const list = (name, prefix, defaults) => {
    const items = input[name] ?? [];
    if (!Array.isArray(items)) throw new TypeError(`${name} harus array.`);
    return items.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new TypeError(`${name}[${index}] harus object.`);
      }
      const copy = structuredClone(item);
      return { id: `${prefix}-${index + 1}`, name: '', ...defaults, ...copy };
    });
  };
  const poles = list('poles', 'pole', { type: 'straight', material: 'STK400', quantity: 1 })
    .map(pole => ({ ...pole,
      upperDiameter: pole.type === 'straight' ? pole.lowerDiameter : pole.upperDiameter,
      upperThickness: pole.upperThickness ?? pole.thickness
    }));
  const topHeight = poles.reduce((sum, pole) => sum + pole.height, 0)
    + (input.installation?.type === 'baseplate-under-gl' ? input.installation.depth : 0);
  return {
    schemaVersion: 1,
    // Pole heights describe the above-GL sections; depth adds a portion below GL.
    // Geometry stage: bottom y = -depth; embedment has no baseplate, other types do.
    installation: { type: 'on-gl', depth: 0, ...structuredClone(input.installation ?? {}) },
    poles,
    arms: list('arms', 'arm', { type: 'straight', material: 'STK400', fixAngle: 0, verticalAngle: 0 }),
    // Areas in m²; height is the object's center elevation above the installation datum.
    // Box is a schematic representation, independent of future physical object types.
    directObjects: list('directObjects', 'object', { type: 'box', attachment: 'pole-side', quantity: 1 })
      // The top mounting uses the legacy lighting symbol, not a side box.
      .map(object => Number.isFinite(object.height) && object.height === topHeight
        ? { ...object, type: 'lighting', attachment: 'pole-top' } : object)
      .map(object=>object.attachment==='pole-top' ? {
        areaFront:0.12,areaSide:0,height:poles.reduce((sum,p)=>sum+p.height,0)+(input.installation?.type==='baseplate-under-gl'?input.installation.depth:0),
        ...object
      } : object),
    overheadWires: list('overheadWires', 'wire', { fixAngle: 0 }),
    drawingSettings: {
      units: 'mm', pageWidth: 210, pageHeight: 297, scale: 'auto',
      ...structuredClone(input.drawingSettings ?? {})
    }
  };
}

/** Validasi data tanpa DOM. Geometri sambungan/rib/collision menjadi tahap terpisah. */
export function validateProject(project) {
  const errors = [];
  const error = (path, message) => errors.push({ path, message });
  const number = (value, path, min = 0, inclusive = false) => {
    if (!Number.isFinite(value) || (inclusive ? value < min : value <= min)) {
      error(path, `Harus angka terbatas ${inclusive ? '>=' : '>'} ${min}.`);
    }
  };
  const choice = (value, path, allowed) => {
    if (!allowed.includes(value)) error(path, `Pilihan yang didukung: ${allowed.join(', ')}.`);
  };
  const angle = (value, path) => {
    if (!Number.isFinite(value) || value < 0 || value > 360) error(path, 'Sudut harus 0–360 derajat.');
  };
  const quantity = (value, path) => {
    if (!Number.isInteger(value) || value < 1) error(path, 'Quantity harus bilangan bulat positif.');
  };
  if (!project || typeof project !== 'object') {
    return { valid: false, errors: [{ path: 'project', message: 'Project harus object.' }] };
  }
  if (project.schemaVersion !== 1) error('schemaVersion', 'Versi schema tidak didukung.');
  const installation = project.installation ?? {};
  choice(installation.type, 'installation.type', ['on-gl', 'embedment', 'baseplate-under-gl']);
  if (installation.type === 'on-gl') {
    if (installation.depth !== 0) error('installation.depth', 'On GL harus memakai depth 0.');
  } else {
    number(installation.depth, 'installation.depth');
  }
  const ids = new Set();
  const groups = {};
  for (const key of ['poles', 'arms', 'directObjects', 'overheadWires']) {
    groups[key] = Array.isArray(project[key]) ? project[key] : [];
    if (!Array.isArray(project[key])) error(key, 'Harus array.');
    groups[key].forEach((item, index) => {
      const path = `${key}[${index}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        error(path, 'Harus object.'); return;
      }
      if (typeof item.id !== 'string' || !item.id.trim()) error(`${path}.id`, 'ID wajib diisi.');
      else if (ids.has(item.id)) error(`${path}.id`, 'ID harus unik dalam project.');
      else ids.add(item.id);
      if (typeof item.name !== 'string') error(`${path}.name`, 'Name harus string.');
    });
  }
  if (!groups.poles.length) error('poles', 'Minimal satu pole.');
  const each = (key, fn) => groups[key].forEach((item, i) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) fn(item, `${key}[${i}]`);
  });
  const material = (item, path) => {
    if (typeof item.material !== 'string' || !item.material.trim()) error(`${path}.material`, 'Material wajib diisi.');
  };
  each('poles', (pole, path) => {
    choice(pole.type, `${path}.type`, ['straight', 'tapered']);
    material(pole, path); quantity(pole.quantity, `${path}.quantity`);
    for (const field of ['height', 'lowerDiameter', 'upperDiameter', 'thickness', 'upperThickness']) number(pole[field], `${path}.${field}`);
    if (pole.type === 'straight' && pole.lowerDiameter !== pole.upperDiameter) error(path, 'Diameter straight harus sama.');
    if (pole.type === 'tapered' && pole.upperDiameter > pole.lowerDiameter) error(path, 'Diameter atas taper tidak boleh melebihi diameter bawah.');
    if (2 * pole.thickness >= pole.lowerDiameter) error(`${path}.thickness`, 'Thickness harus lebih kecil dari radius bawah.');
    if (2 * pole.upperThickness >= pole.upperDiameter) error(`${path}.upperThickness`, 'Thickness harus lebih kecil dari radius atas.');
  });
  const totalHeight = groups.poles.reduce((sum, pole) => sum + (pole?.height ?? NaN), 0);
  const height = (value, path) => {
    number(value, path, 0, true);
    if (Number.isFinite(totalHeight) && value > totalHeight) error(path, 'Height melebihi tinggi total pole.');
  };
  each('arms', (arm, path) => {
    choice(arm.type, `${path}.type`, ['straight']); material(arm, path);
    for (const field of ['diameter', 'thickness', 'length']) number(arm[field], `${path}.${field}`);
    height(arm.height, `${path}.height`); angle(arm.fixAngle, `${path}.fixAngle`);
    if (!Number.isFinite(arm.verticalAngle) || Math.abs(arm.verticalAngle) >= 90) error(`${path}.verticalAngle`, 'Vertical angle harus lebih dari -90 dan kurang dari 90.');
    if (2 * arm.thickness >= arm.diameter) error(`${path}.thickness`, 'Thickness harus lebih kecil dari radius arm.');
  });
  each('overheadWires', (wire, path) => {
    number(wire.diameter, `${path}.diameter`); number(wire.span, `${path}.span`);
    number(wire.weight, `${path}.weight`, 0, true);
    height(wire.height, `${path}.height`); angle(wire.fixAngle, `${path}.fixAngle`);
  });
  const objectCountsAtHeight = new Map();
  each('directObjects', (object, path) => {
    choice(object.type, `${path}.type`, ['box','lighting']);
    choice(object.attachment, `${path}.attachment`, ['pole-side','pole-top']);
    if(object.attachment==='pole-top' && (object.type!=='lighting'||object.quantity!==1))error(path,'Pole-top supports one lighting object.');
    if(object.type==='lighting' && object.attachment!=='pole-top')error(path,'Direct lighting uses pole-top attachment.');
    number(object.areaFront, `${path}.areaFront`);
    number(object.areaSide, `${path}.areaSide`, 0, true);
    number(object.height, `${path}.height`, 0, true);
    const datumY = installation.type === 'baseplate-under-gl' ? -installation.depth : 0;
    if (Number.isFinite(totalHeight) && object.height + datumY > totalHeight) {
      error(`${path}.height`, 'Center object melebihi tinggi total pole.');
    }
    if(object.attachment==='pole-top' && object.height+datumY!==totalHeight)error(`${path}.height`,'Pole-top lighting must be at the pole top.');
    quantity(object.quantity, `${path}.quantity`);
    if (Number.isFinite(object.height) && Number.isInteger(object.quantity) && object.quantity > 0) {
      const count = (objectCountsAtHeight.get(object.height) ?? 0) + object.quantity;
      objectCountsAtHeight.set(object.height, count);
      if (count > 3) error(`${path}.quantity`, 'Maksimal 3 Direct Object pada elevasi yang sama.');
    }
  });
  if(groups.directObjects.filter(o=>o?.attachment==='pole-top').length>1)error('directObjects','Only one pole-top lighting is supported.');
  const settings = project.drawingSettings ?? {};
  choice(settings.units, 'drawingSettings.units', ['mm']);
  number(settings.pageWidth, 'drawingSettings.pageWidth'); number(settings.pageHeight, 'drawingSettings.pageHeight');
  if (settings.scale !== 'auto') number(settings.scale, 'drawingSettings.scale'); // paper mm / engineering mm
  return { valid: errors.length === 0, errors };
}

/** Satu-satunya bagian yang mengenal HTML. Membaca row aktif saja, tanpa event/render. */
export function readProjectFromForm(root) {
  if (!root || typeof root.querySelector !== 'function') throw new TypeError('Root form diperlukan.');
  const text = id => {
    const field = root.querySelector(`[id="${id}"]`);
    if (!field) throw new Error(`Input tidak ditemukan: ${id}`);
    return field.value.trim();
  };
  const numeric = (id, fallback = null) => {
    const value = text(id);
    if (!value) return fallback;
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  };
  const rows = (id, max, read) => {
    const count = numeric(id);
    if (!Number.isInteger(count) || count < (id === 'pole-count' ? 1 : 0) || count > max) {
      throw new Error(`Jumlah tidak valid: ${id}`);
    }
    return Array.from({ length: count }, (_, i) => read(i + 1));
  };
  return createProject({
    installation: {
      type: text('installation-type'),
      depth: text('installation-type') === 'on-gl' ? 0 : numeric('installation-depth')
    },
    poles: rows('pole-count', 3, i => {
      const p = `pole-${i}`, type = text(`${p}-type`);
      return { id: p, name: text(`${p}-name`), type, material: text(`${p}-material`),
        lowerDiameter: numeric(`${p}-diameter`),
        upperDiameter: type === 'tapered' ? numeric(`${p}-upper-diameter`) : numeric(`${p}-diameter`),
        thickness: numeric(`${p}-thickness`),
        upperThickness: type === 'tapered' ? numeric(`${p}-upper-thickness`) : numeric(`${p}-thickness`),
        height: numeric(`${p}-height`), quantity: numeric(`${p}-quantity`) };
    }),
    arms: rows('arm-count', 2, i => {
      const p = `arm-${i}`;
      return { id: p, name: text(`${p}-name`), type: text(`${p}-type`), material: text(`${p}-material`),
        diameter: numeric(`${p}-diameter`), thickness: numeric(`${p}-thickness`),
        height: numeric(`${p}-height`), length: numeric(`${p}-length`),
        fixAngle: numeric(`${p}-fix-angle`, 0), verticalAngle: numeric(`${p}-vertical-angle`, 0) };
    }),
    directObjects: rows('do-count', 3, i => ({
      id: `object-${i}`, name: text(`do-${i}-name`), quantity: numeric(`do-${i}-quantity`),
      areaFront: numeric(`do-${i}-area-front`), areaSide: numeric(`do-${i}-area-side`),
      height: numeric(`do-${i}-height`)
    })),
    overheadWires: rows('ohw-count', 4, i => {
      const p = `ohw-${i}`;
      return { id: `wire-${i}`, name: text(`${p}-name`), diameter: numeric(`${p}-diameter`),
        weight: numeric(`${p}-weight`), height: numeric(`${p}-height`), span: numeric(`${p}-span`),
        fixAngle: numeric(`${p}-fix-angle`, 0) };
    })
  });
}

/**
 * Stage 2: engineering geometry only (mm, Y up). Input order stays top -> bottom.
 * The underground extension is straight, using the lowest pole's lower diameter.
 * Baseplate is an attachment reference, not a plate shape/dimension at this stage.
 */
export function buildPoleGeometry(project) {
  const validation = validateProject(project);
  if (!validation.valid) {
    throw new TypeError(validation.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
  }
  const topY = project.poles.reduce((sum, pole) => sum + pole.height, 0);
  if (!Number.isFinite(topY)) throw new RangeError('Total pole height must be finite.');
  let bottomY = 0;
  const segments = project.poles.slice().reverse().map(pole => {
    const segment = makePoleSegment(pole, 'above-gl', bottomY,
      bottomY + pole.height, pole.lowerDiameter, pole.upperDiameter);
    bottomY = segment.topY;
    return segment;
  }).reverse();
  const lowest = project.poles.at(-1);
  const { type, depth } = project.installation;
  if (depth > 0) {
    segments.push(makePoleSegment(lowest, 'below-gl', -depth, 0,
      lowest.lowerDiameter, lowest.lowerDiameter));
  }
  const radius = Math.max(...segments.map(s => Math.max(s.lowerDiameter, s.upperDiameter))) / 2;
  return {
    units: 'mm', yAxis: 'up', origin: { x: 0, y: 0 },
    topY, bottomY: -depth, aboveGroundHeight: topY, totalLength: topY + depth,
    installation: { type, depth, undergroundProfile: 'constant-lower-diameter' },
    // Distinguish the global GL origin from the local engineering reference.
    // Under GL uses the underside of the plate as its measurement zero.
    reference: {
      kind: type === 'baseplate-under-gl' ? 'baseplate-bottom' : 'ground-level',
      point: { x: 0, y: type === 'baseplate-under-gl' ? -depth : 0 }
    },
    crossSection: { x: 0, y: type === 'baseplate-under-gl' ? -depth : 0 },
    baseplate: type === 'embedment' ? null : { bottomCenter: { x: 0, y: -depth } },
    segments,
    bounds: { minX: -radius, maxX: radius, minY: -depth, maxY: topY }
  };
}

function makePoleSegment(pole, region, bottomY, topY, lowerDiameter, upperDiameter) {
  return {
    poleId: pole.id, region, bottomY, topY, lowerDiameter, upperDiameter,
    material: pole.material, lowerThickness: pole.thickness,
    upperThickness: region === 'below-gl' ? pole.thickness : pole.upperThickness,
    // Outline vertices, not SVG coordinates. Closure is the renderer's responsibility.
    outline: [
      { x: -lowerDiameter / 2, y: bottomY },
      { x: lowerDiameter / 2, y: bottomY },
      { x: upperDiameter / 2, y: topY },
      { x: -upperDiameter / 2, y: topY }
    ]
  };
}

/** Shared query facade. Geometry itself remains serializable data with no DOM dependency. */
export function createPoleGeometryQueries(geometry) {
  return {
    getSegmentAtHeight: (height, jointSide) => getPoleSectionAtHeight(geometry, height, jointSide),
    getDiameterAtHeight: (height, jointSide) => getPoleDiameterAtHeight(geometry, height, jointSide),
    getSurfacePoint: (height, side, jointSide) => getPoleSurfacePoint(geometry, height, side, jointSide)
  };
}

// Schematic defaults from the legacy detail, not structural design calculations.
export const BASEPLATE_DETAIL = Object.freeze({
  width: 350, thickness: 25, ribHeight: 180, ribThickness: 12,
  edgeInset: 10, toeHeight: 20, tipWidth: 10, scallopRadius: 25
});

/**
 * Stage 3a: pole and installation primitives only. No scale, SVG, dimensions or leaders.
 * Closed section outlines are metadata; visible edges are separate so GL is not
 * accidentally drawn as a seam between the shaft and its underground extension.
 */
export function buildPoleInstallationGeometry(project, detail = BASEPLATE_DETAIL) {
  const pole = buildPoleGeometry(project);
  const queries = createPoleGeometryQueries(pole);
  const components = [];
  const polyline = (id, points, closed = false) => ({ id, kind: 'polyline', points, closed });
  const plateY = pole.baseplate?.bottomCenter.y;
  if (pole.baseplate) {
    for (const key of Object.keys(BASEPLATE_DETAIL)) {
      if (!Number.isFinite(detail[key]) || detail[key] <= 0) throw new RangeError(`Invalid baseplate detail: ${key}`);
    }
    if (detail.toeHeight >= detail.ribHeight) throw new RangeError('Rib toe must be below its tip.');
    if (plateY + detail.thickness + detail.ribHeight > pole.segments.at(-1).topY) {
      // An underground extension may end inside the rib height: the physical lowest
      // pole continues above GL, so use that pole\'s above-ground section top instead.
      const lowestTop = pole.segments.find(s => s.poleId === project.poles.at(-1).id).topY;
      if (plateY + detail.thickness + detail.ribHeight > lowestTop) throw new RangeError('Base rib exceeds lowest pole section.');
    }
  }
  for (const segment of pole.segments) {
    const id = `${segment.poleId}/${segment.region}`;
    // Baseplate covers the lowest 25 mm; keep engineering elevations unchanged.
    const bottom = pole.baseplate ? Math.max(segment.bottomY, plateY + detail.thickness) : segment.bottomY;
    if (bottom >= segment.topY) continue;
    const leftBottom = { x: -diameterWithinSection(segment, bottom) / 2, y: bottom };
    const rightBottom = { x: -leftBottom.x, y: bottom };
    const leftTop = { x: -segment.upperDiameter / 2, y: segment.topY };
    const rightTop = { x: -leftTop.x, y: segment.topY };
    const primitives = [polyline(`${id}/left`, [leftBottom, leftTop]), polyline(`${id}/right`, [rightBottom, rightTop])];
    if (segment.region === 'above-gl') primitives.push(polyline(`${id}/top`, [leftTop, rightTop]));
    if (!pole.baseplate && segment.bottomY === pole.bottomY) primitives.push(polyline(`${id}/bottom`, [leftBottom, rightBottom]));
    components.push({ id, type: 'pole', sourceId: segment.poleId, primitives });
  }
  if (pole.baseplate) {
    const d = detail, top = plateY + d.thickness, half = d.width / 2;
    const tipY = top + d.ribHeight;
    const surface = queries.getSurfacePoint(tipY, 'right');
    const footRadius = queries.getDiameterAtHeight(top) / 2;
    if (half - d.edgeInset <= Math.max(surface.x + d.tipWidth, footRadius + d.scallopRadius)) {
      throw new RangeError('Baseplate too narrow for pole and rib clearance.');
    }
    const primitives = [polyline('installation/baseplate/face', [
      { x: -half, y: plateY }, { x: half, y: plateY }, { x: half, y: top }, { x: -half, y: top }
    ], true)];
    components.push({ id: 'installation/baseplate', type: 'baseplate', primitives });
    for (const side of [-1, 1]) {
      const id = `installation/rib/${side < 0 ? 'left' : 'right'}`;
      const scallopEndY = top + d.scallopRadius;
      const endX = queries.getDiameterAtHeight(scallopEndY) / 2;
      components.push({ id, type: 'rib', primitives: [
        polyline(`${id}/edge`, [
          { x: side * (half - d.edgeInset), y: top },
          { x: side * (half - d.edgeInset), y: top + d.toeHeight },
          { x: side * (surface.x + d.tipWidth), y: tipY },
          { x: side * surface.x, y: tipY }
        ]),
        // Circular relief; direction is expressed in engineering Y-up coordinates.
        { id: `${id}/scallop`, kind: 'arc', radius: d.scallopRadius, clockwise: side < 0,
          start: { x: side * (footRadius + d.scallopRadius), y: top },
          end: { x: side * endX, y: scallopEndY } }
      ] });
    }
    components.push({ id: 'installation/rib/center', type: 'rib', primitives: [
      polyline('installation/rib/center/edge', [
        { x: -d.ribThickness / 2, y: top }, { x: -d.ribThickness / 2, y: tipY },
        { x: d.ribThickness / 2, y: tipY }, { x: d.ribThickness / 2, y: top }
      ])
    ] });
  }
  const halfWidth = Math.max(pole.bounds.maxX, pole.baseplate ? detail.width / 2 : 0);
  return { units: 'mm', yAxis: 'up', pole, components,
    bounds: { minX: -halfWidth, maxX: halfWidth, minY: pole.bottomY, maxY: pole.topY } };
}

/** At joints attachments use the larger actual diameter; ties retain the upper section. */
export function getPoleSectionAtHeight(geometry, height, jointSide = 'largest') {
  if (!Number.isFinite(height)) throw new TypeError('Height must be finite engineering mm.');
  if (!['largest', 'upper', 'lower'].includes(jointSide)) throw new TypeError('Joint side must be largest, upper or lower.');
  const matches = s => height >= s.bottomY && height <= s.topY;
  if (jointSide === 'upper') return geometry.segments.find(matches) ?? null;
  if (jointSide === 'lower') return geometry.segments.findLast(matches) ?? null;
  let selected = null;
  for (const segment of geometry.segments) {
    if (matches(segment) && (!selected || diameterWithinSection(segment, height) > diameterWithinSection(selected, height))) {
      selected = segment;
    }
  }
  return selected;
}

/** Linear interpolation within the selected section; no extrapolation outside pole. */
export function getPoleDiameterAtHeight(geometry, height, jointSide = 'largest') {
  const segment = getPoleSectionAtHeight(geometry, height, jointSide);
  return segment ? diameterWithinSection(segment, height) : null;
}

function diameterWithinSection(segment, height) {
  const fraction = (height - segment.bottomY) / (segment.topY - segment.bottomY);
  return segment.lowerDiameter + (segment.upperDiameter - segment.lowerDiameter) * fraction;
}

export function getPoleSurfacePoint(geometry, height, side = 'right', jointSide = 'largest') {
  if (!['left', 'right'].includes(side)) throw new TypeError('Surface side must be left or right.');
  const diameter = getPoleDiameterAtHeight(geometry, height, jointSide);
  return diameter === null ? null : { x: (side === 'left' ? -1 : 1) * diameter / 2, y: height };
}

/** Convert GL elevation to/from the installation measurement datum (still engineering mm). */
export function elevationFromReference(geometry, elevation) {
  if (!Number.isFinite(elevation)) throw new TypeError('Elevation must be finite.');
  return elevation - geometry.reference.point.y;
}

export function elevationToGL(geometry, heightFromReference) {
  if (!Number.isFinite(heightFromReference)) throw new TypeError('Height must be finite.');
  return heightFromReference + geometry.reference.point.y;
}

export const DIRECT_OBJECT_DETAIL = Object.freeze({ widthRatio: 0.4, heightRatio: 0.6, poleGap: 50 });

/** Engineering dimensions of the temporary box; Area Side remains independent load data. */
export function getDirectObjectBoxSize(areaFront) {
  if (!Number.isFinite(areaFront) || areaFront <= 0) throw new RangeError('Area Front must be positive m².');
  const { widthRatio, heightRatio } = DIRECT_OBJECT_DETAIL;
  const rootAreaMM = Math.sqrt(areaFront) * 1000;
  return { width: rootAreaMM * Math.sqrt(widthRatio / heightRatio),
    height: rootAreaMM * Math.sqrt(heightRatio / widthRatio) };
}

/** Stage 2 references and sizes only: no box outlines, dimension lines or leaders. */
export function getDirectObjectReferences(project, poleGeometry = buildPoleGeometry(project)) {
  const validation = validateProject(project);
  if (!validation.valid) throw new TypeError(validation.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
  const slotsAtHeight = new Map();
  return project.directObjects.flatMap(object => {
    if(object.attachment==='pole-top')return [{id:`${object.id}/instance-1`,sourceId:object.id,
      attachment:'pole-top',boxSize:{width:600,height:200},center:{x:200,y:poleGeometry.topY+100},
      poleCenter:{x:0,y:poleGeometry.topY},poleGap:0,side:'center'}];
    const y = elevationToGL(poleGeometry, object.height);
    const boxSize = getDirectObjectBoxSize(object.areaFront);
    const radius = getPoleDiameterAtHeight(poleGeometry, y) / 2;
    return Array.from({ length: object.quantity }, (_, index) => {
      const slot = slotsAtHeight.get(y) ?? 0;
      slotsAtHeight.set(y, slot + 1);
      const side = ['right', 'left', 'center'][slot];
      const sign = side === 'right' ? 1 : side === 'left' ? -1 : 0;
      return { id: `${object.id}/instance-${index + 1}`, sourceId: object.id,
        boxSize: { ...boxSize }, poleGap: DIRECT_OBJECT_DETAIL.poleGap, side,
        center: { x: sign * (radius + DIRECT_OBJECT_DETAIL.poleGap + boxSize.width / 2), y },
        poleCenter: { x: 0, y },
        leftSurface: getPoleSurfacePoint(poleGeometry, y, 'left'),
        rightSurface: getPoleSurfacePoint(poleGeometry, y, 'right') };
    });
  });
}

/**
 * Sole engineering <-> paper conversion. Paper is mm, Y down (SVG viewBox in mm).
 * scale = paper mm / engineering mm, e.g. 1/50. Auto-fit is a later layout stage.
 * originOnPaper locates engineering GL (0,0) on the page.
 * Fonts/arrows already in paper mm must NOT pass through this transform.
 */
export function createPaperTransform({ scale, originOnPaper = { x: 0, y: 0 } }) {
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Scale must be finite and positive.');
  const point = value => {
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      throw new TypeError('Point must contain finite x and y.');
    }
  };
  point(originOnPaper);
  const { x, y } = originOnPaper; // Capture a snapshot; caller mutation cannot move the drawing.
  const length = value => {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Length must be finite and nonnegative.');
  };
  return {
    toPaper(value) { point(value); return { x: x + value.x * scale, y: y - value.y * scale }; },
    toEngineering(value) { point(value); return { x: (value.x - x) / scale, y: (y - value.y) / scale }; },
    lengthToPaper(value) { length(value); return value * scale; },
    lengthToEngineering(value) { length(value); return value / scale; }
  };
}

export const ARM_DETAIL = Object.freeze({ adapterLength: 120, adapterDiameter: 60.5,
  ribLength: 100, ribHeight: 100, endFlat: 10, reliefRadius: 25 });
export const ARM_OBJECT_DEFAULT = Object.freeze({ type: 'lighting', length: 600, height: 200 });

/** Engineering mm. 400 is the cable chord, not its radius (R250). */
export const OHW_DETAIL = Object.freeze({ thickness: 3, height: 30, centerGap: 10,
  hookRadius: 12, neckLength: 16.5, wireChord: 400, wireRadius: 250, wireDropAngle: 20 });

/** Stage 3: OHW installation. Heights remain GL-relative, including Under GL. */
export function buildOHWGeometry(project, poleGeometry = buildPoleGeometry(project)) {
  const validation = validateProject(project);
  if (!validation.valid) throw new TypeError(validation.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
  const result = { units: 'mm', yAxis: 'up', components: [], attachments: [], issues: [], bounds: null };
  const d = OHW_DETAIL;
  for (const wire of project.overheadWires) {
    const diameter = getPoleDiameterAtHeight(poleGeometry, wire.height);
    if (!(diameter > d.centerGap)) {
      result.issues.push({ sourceId: wire.id, code: 'ohw-attachment', message: 'OHW needs a pole diameter greater than the band center gap at its elevation.' });
      continue;
    }
    const side = wire.fixAngle > 90 && wire.fixAngle <= 270 ? -1 : 1;
    const outer = diameter / 2 + d.thickness;
    const point = (outward, up = 0) => ({ x: side * outward, y: wire.height + up });
    const hookX = outer + d.neckLength + d.hookRadius;
    const hookCenter = point(hookX);
    const hookTop = point(hookX, d.hookRadius), hookBottom = point(hookX, -d.hookRadius);
    const neckEnd = point(outer + d.neckLength);
    const add = (suffix, type, primitives) => {
      result.components.push({ id: `${wire.id}/${suffix}`, sourceId: wire.id, type,
        primitives: primitives.map((primitive, index) => ({ id: `${wire.id}/${suffix}/${index + 1}`, ...primitive })) });
    };
    add('band', 'ohw-band', [[-outer, -d.centerGap / 2], [d.centerGap / 2, outer]].map(([left, right]) => ({
      kind: 'polyline', closed: true, points: [point(left, -d.height / 2), point(right, -d.height / 2),
        point(right, d.height / 2), point(left, d.height / 2)]
    })));
    add('hook', 'ohw-hook', [
      { kind: 'polyline', closed: false, points: [point(outer), neckEnd] },
      { kind: 'arc', start: hookTop, end: hookBottom, center: hookCenter, radius: d.hookRadius, clockwise: side === 1 },
      { kind: 'arc', start: hookBottom, end: neckEnd, center: hookCenter, radius: d.hookRadius, clockwise: side === 1 }
    ]);
    const angle = d.wireDropAngle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const rise = Math.sqrt(d.wireRadius ** 2 - (d.wireChord / 2) ** 2);
    // Rotate the cable only; the hook and band retain their original orientation.
    const cablePoint = (along, up) => point(hookX + along * cos + up * sin, -along * sin + up * cos);
    const attachment = cablePoint(0, 0), end = cablePoint(d.wireChord, 0);
    const center = cablePoint(d.wireChord / 2, rise);
    const middle = cablePoint(d.wireChord / 2, rise - d.wireRadius);
    const lowest = { x: center.x, y: center.y - d.wireRadius };
    add('cable', 'ohw-cable', [{ kind: 'arc', start: end, end: attachment, center,
      radius: d.wireRadius, clockwise: side === 1 }]);
    // Exact anchors are shared with future dimensions/leaders, rather than recomputed.
    result.attachments.push({ id: `${wire.id}/reference`, sourceId: wire.id, diameter,
      poleCenter: { x: 0, y: wire.height }, bandRight: { x: outer, y: wire.height },
      cableAttachment: attachment, cableOuter: end, cableMiddle: middle, cableLowest: lowest });
    // For this fixed 20° minor arc, endpoints bound X and the downward cardinal
    // point bounds Y. The full hook circle gives conservative hook bounds.
    const bounds = { minX: Math.min(-outer, end.x, hookCenter.x - d.hookRadius),
      maxX: Math.max(outer, end.x, hookCenter.x + d.hookRadius),
      minY: Math.min(wire.height - d.height / 2, lowest.y), maxY: wire.height + d.height / 2 };
    result.bounds = result.bounds ? {
      minX: Math.min(result.bounds.minX, bounds.minX), maxX: Math.max(result.bounds.maxX, bounds.maxX),
      minY: Math.min(result.bounds.minY, bounds.minY), maxY: Math.max(result.bounds.maxY, bounds.maxY)
    } : bounds;
  }
  return result;
}

/** Stage 3b. Reuse an existing pole geometry so installation is calculated only once. */
export function buildArmGeometry(project, poleGeometry = buildPoleGeometry(project)) {
  const validation = validateProject(project);
  if (!validation.valid) throw new TypeError(validation.errors.map(e => `${e.path}: ${e.message}`).join('\n'));
  const result = { units: 'mm', yAxis: 'up', components: [], attachments: [], issues: [] };
  for (const arm of project.arms) {
    const connection = findArmConnection(poleGeometry, arm);
    if (!connection) {
      result.issues.push({ sourceId: arm.id, code: 'arm-connection', message: 'Arm connection must fit on one pole section and end beyond its surface.' });
      continue;
    }
    const { cos, sin, direction, bottom, top, tip, actualLength } = connection;
    const mirror = p => ({ x: direction * p.x, y: p.y });
    const local = (along, across) => mirror({ x: tip.x + along * cos - across * sin,
      y: tip.y + along * sin + across * cos });
    const add = (suffix, type, primitive, extra = {}) => result.components.push({
      id: `${arm.id}/${suffix}`, sourceId: arm.id, type, ...extra,
      primitives: [{ id: `${arm.id}/${suffix}/outline`, ...primitive }]
    });
    const half = arm.diameter / 2;
    add('body', 'arm', { kind: 'path', points: [mirror(bottom), local(0, -half), local(0, half), mirror(top)],
      closingArc: { radius: Math.max(0.678 * arm.diameter, Math.hypot(top.x - bottom.x, top.y - bottom.y) / 2),
        clockwise: direction < 0 }, closed: true, fill: 'paper' },
    { material: arm.material, thickness: arm.thickness, connection: { bottom: mirror(bottom), top: mirror(top) } });

    const d = ARM_DETAIL;
    const lowerY = bottom.y - d.ribHeight;
    const edge = [];
    for (const segment of [...poleGeometry.segments].reverse()) {
      const low = Math.max(lowerY, segment.bottomY), high = Math.min(bottom.y, segment.topY);
      if (low < high) for (const y of [low, high]) edge.push({ x: diameterWithinSection(segment, y) / 2, y });
    }
    const near = edge.at(-2);
    const edgeLength = near ? Math.hypot(near.x - bottom.x, near.y - bottom.y) : 0;
    if (lowerY >= poleGeometry.bottomY && actualLength - bottom.distance >= d.ribLength && edgeLength >= d.reliefRadius) {
      const lower = edge[0];
      const ribTip = { x: bottom.x + d.ribLength * cos, y: bottom.y + d.ribLength * sin };
      const points = [
        { x: bottom.x + d.reliefRadius * cos, y: bottom.y + d.reliefRadius * sin }, ribTip,
        { x: ribTip.x + d.endFlat * sin, y: ribTip.y - d.endFlat * cos },
        { x: lower.x + d.endFlat, y: lower.y }, ...edge.slice(0, -1),
        { x: bottom.x + (near.x - bottom.x) * d.reliefRadius / edgeLength,
          y: bottom.y + (near.y - bottom.y) * d.reliefRadius / edgeLength }
      ];
      add('rib', 'arm-rib', { kind: 'path', points: points.map(mirror), closed: true,
        closingArc: { radius: d.reliefRadius, clockwise: direction < 0 } });
    } else result.issues.push({ sourceId: arm.id, code: 'arm-rib-clearance', message: 'Rib cannot fit the available arm length or pole edge.' });

    add('adapter', 'arm-adapter', { kind: 'polyline', closed: true, fill: 'paper', points: [
      local(0, -d.adapterDiameter / 2), local(0, d.adapterDiameter / 2),
      local(d.adapterLength, d.adapterDiameter / 2), local(d.adapterLength, -d.adapterDiameter / 2)
    ] });
    // Attachment frame is independent of the object's shape. Future object builders
    // can consume this frame and their own dimensions without changing arm geometry.
    const attachment = { id: `${arm.id}/tip`, sourceId: arm.id, origin: mirror(tip),
      axis: { x: direction * cos, y: sin }, normal: { x: -direction * sin, y: cos } };
    result.attachments.push(attachment);
    result.components.push(buildArmObjectGeometry(attachment));
  }
  return result;
}

/** Box lighting today; dimensions supplied here can later come from an input adapter. */
export function buildArmObjectGeometry(attachment, specification = ARM_OBJECT_DEFAULT) {
  const { type, length, height } = specification;
  if (type !== 'lighting') throw new TypeError(`Unsupported arm object: ${type}`);
  if (![length, height].every(n => Number.isFinite(n) && n > 0)) throw new RangeError('Arm object dimensions must be positive.');
  const point = (along, across) => ({
    x: attachment.origin.x + along * attachment.axis.x + across * attachment.normal.x,
    y: attachment.origin.y + along * attachment.axis.y + across * attachment.normal.y
  });
  const id = `${attachment.sourceId}/object`;
  return { id, sourceId: attachment.sourceId, attachmentId: attachment.id, type: 'arm-lighting',
    dimensions: { length, height }, primitives: [{ id: `${id}/outline`, kind: 'polyline', closed: true,
      fill: 'none', points: [point(0, -height / 2), point(length, -height / 2), point(length, height / 2), point(0, height / 2)] }] };
}

function findArmConnection(geometry, arm) {
  const radians = arm.verticalAngle * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const actualLength = arm.length / cos;
  const axisY = arm.height - actualLength * sin;
  const offset = { x: -sin * arm.diameter / 2, y: cos * arm.diameter / 2 };
  const candidates = [];
  for (const segment of geometry.segments) {
    const taper = (segment.lowerDiameter - segment.upperDiameter) / (segment.topY - segment.bottomY);
    const denominator = 2 * cos + taper * sin;
    if (denominator <= 1e-9) continue;
    const intersect = sign => {
      const x = sign * offset.x, y = axisY + sign * offset.y;
      const distance = (segment.lowerDiameter - taper * (y - segment.bottomY) - 2 * x) / denominator;
      return { x: x + distance * cos, y: y + distance * sin, distance };
    };
    const bottom = intersect(-1), top = intersect(1);
    if ([bottom, top].every(p => p.y >= segment.bottomY && p.y <= segment.topY && p.distance >= 0 && p.distance < actualLength)) {
      candidates.push({ bottom, top });
    }
  }
  // If both sections qualify at a boundary, prefer the outermost surface.
  candidates.sort((a, b) => (b.bottom.x + b.top.x) - (a.bottom.x + a.top.x));
  if (!candidates.length) return null;
  return { ...candidates[0], cos, sin, actualLength, tip: { x: arm.length, y: arm.height },
    direction: arm.fixAngle > 90 && arm.fixAngle <= 270 ? -1 : 1 };
}

/** Complete stage-3 scene in engineering coordinates. Bounds conservatively include arcs. */
export function buildSchematicGeometry(project) {
  const installation = buildPoleInstallationGeometry(project);
  const arms = buildArmGeometry(project, installation.pole);
  const wires = buildOHWGeometry(project, installation.pole);
  const objects = getDirectObjectReferences(project, installation.pole).map(ref => {
    const { x, y } = ref.center, w = ref.boxSize.width / 2, h = ref.boxSize.height / 2;
    return { id: ref.id, sourceId: ref.sourceId, type: 'direct-object', reference: ref,
      primitives: [{ id: `${ref.id}/outline`, kind: 'polyline', closed: true, fill: 'none',
        points: [{ x: x-w, y: y-h }, { x: x+w, y: y-h }, { x: x+w, y: y+h }, { x: x-w, y: y+h }] }] };
  });
  const components = [...installation.components, ...arms.components, ...objects, ...wires.components];
  for(const object of objects.filter(c=>c.reference.attachment==='pole-top')) {
    const y=installation.pole.topY;
    components.push({id:`${object.sourceId}/adapter`,sourceId:object.sourceId,type:'top-adapter',
      primitives:[{kind:'polyline',closed:true,points:[{x:-30.25,y},{x:30.25,y},{x:30.25,y:y+120},{x:-30.25,y:y+120}]}]});
  }
  const references = buildReferenceGeometry(installation.pole, components, getPoleDiameterAtHeight);
  components.push(...references.components);
  const bounds = { ...installation.bounds };
  const include = (p, margin = 0) => {
    bounds.minX = Math.min(bounds.minX, p.x-margin); bounds.maxX = Math.max(bounds.maxX, p.x+margin);
    bounds.minY = Math.min(bounds.minY, p.y-margin); bounds.maxY = Math.max(bounds.maxY, p.y+margin);
  };
  for (const component of components) for (const p of component.primitives) {
    for (const point of p.points ?? [p.start, p.end]) include(point);
    if (p.kind === 'arc') {
      if (p.center) include(p.center, p.radius);
      else { include(p.start, 2*p.radius); include(p.end, 2*p.radius); }
    }
    if (p.closingArc) { include(p.points[0], 2*p.closingArc.radius); include(p.points.at(-1), 2*p.closingArc.radius); }
  }
  return { units: 'mm', yAxis: 'up', pole: installation.pole, components, bounds,
    issues: [...arms.issues, ...wires.issues, ...references.issues] };
}
