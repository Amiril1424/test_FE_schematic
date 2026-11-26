const assert = require('node:assert/strict');


(async () => {
  const api = await import('../schematic_Lighting_1a.js');
  const { createProject, buildPoleGeometry, getPoleDiameterAtHeight: diameter,
    getPoleSurfacePoint: surface, getPoleSectionAtHeight: section, createPaperTransform } = api;
  const poles = [
    { type: 'tapered', height: 4000, lowerDiameter: 165, upperDiameter: 85, thickness: 4 },
    { height: 2000, lowerDiameter: 180, thickness: 4 }
  ];
  for (const type of ['on-gl', 'embedment', 'baseplate-under-gl']) {
    const depth = type === 'on-gl' ? 0 : 1200;
    const project = createProject({ poles, installation: { type, depth } });
    const before = JSON.stringify(project);
    const geometry = buildPoleGeometry(project);
    assert.equal(JSON.stringify(project), before);
    assert.equal(geometry.topY, 6000);
    assert.equal(geometry.bottomY, -depth);
    assert.equal(geometry.totalLength, 6000 + depth);
    assert.deepEqual(geometry.segments.slice(0, 2).map(s => [s.bottomY, s.topY]), [[2000, 6000], [0, 2000]]);
    assert.equal(diameter(geometry, 4000), 125);
    assert.equal(diameter(geometry, 2000), 180);
    assert.equal(diameter(geometry, 2000, 'upper'), 165);
    assert.equal(diameter(geometry, 2000, 'lower'), 180);
    assert.equal(section(geometry, 2000).poleId, 'pole-2');
    assert.deepEqual(surface(geometry, 2000), { x: 90, y: 2000 });
    assert.deepEqual(surface(geometry, 4000, 'left'), { x: -62.5, y: 4000 });
    assert.deepEqual(surface(geometry, 4000), { x: 62.5, y: 4000 });
    assert.equal(diameter(geometry, 6000), 85);
    assert.equal(diameter(geometry, -depth), 180);
    assert.equal(surface(geometry, 6001), null);
    assert.equal(diameter(geometry, -depth - 1), null);
    assert.equal(geometry.baseplate === null, type === 'embedment');
    if (geometry.baseplate) assert.equal(geometry.baseplate.bottomCenter.y, -depth);
    const referenceY = type === 'baseplate-under-gl' ? -depth : 0;
    assert.deepEqual(geometry.origin, { x: 0, y: 0 });
    assert.equal(geometry.crossSection.y, referenceY);
    assert.equal(api.elevationFromReference(geometry, 750), 750 - referenceY);
    assert.equal(api.elevationFromReference(geometry, 6000), 6000 - referenceY);
    assert.equal(api.elevationToGL(geometry, 750 - referenceY), 750);
  }
  // Largest diameter can belong to the upper section too; equal diameters are stable.
  for (const lowerDiameter of [200, 180]) {
    const joint = buildPoleGeometry(createProject({ poles: [
      { height: 2000, lowerDiameter, thickness: 4 }, poles[1]
    ] }));
    assert.equal(section(joint, 2000).poleId, 'pole-1');
    assert.equal(diameter(joint, 2000), lowerDiameter);
  }
  const taper = buildPoleGeometry(createProject({ poles: [poles[0]], installation: { type: 'embedment', depth: 1000 } }));
  assert.equal(diameter(taper, -500), 165);
  assert.equal(diameter(taper, 0), 165);
  assert.equal(diameter(taper, 2000), 125);
  assert.throws(() => buildPoleGeometry(createProject()));
  assert.throws(() => diameter(taper, NaN));
  assert.throws(() => surface(taper, 0, 'invalid'));
  const originOnPaper = { x: 100, y: 200 };
  const transform = createPaperTransform({ scale: 1 / 50, originOnPaper });
  originOnPaper.x = 0;
  assert.deepEqual(transform.toPaper({ x: 0, y: 0 }), { x: 100, y: 200 });
  for (const point of [{ x: -100, y: 6000 }, { x: 90, y: -1200 }]) {
    const actual = transform.toEngineering(transform.toPaper(point));
    assert(Math.abs(actual.x - point.x) < 1e-9);
    assert(Math.abs(actual.y - point.y) < 1e-9);
  }
  assert.equal(transform.lengthToPaper(1000), 20);
  assert.equal(transform.lengthToEngineering(20), 1000);
  for (const scale of [0, -1, Infinity, 'auto']) assert.throws(() => createPaperTransform({ scale }));
  console.log('PASS V2 geometry: installations, taper, joints, surface, bounds and paper transform');
})().catch(error => { console.error(error); process.exitCode = 1; });
