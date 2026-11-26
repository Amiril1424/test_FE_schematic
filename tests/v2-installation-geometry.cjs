const assert = require('node:assert/strict');

(async () => {
  const { createProject, buildPoleInstallationGeometry: build, createPoleGeometryQueries } =
    await import('../schematic_Lighting_1a.js');
  const poles = [{ type: 'tapered', height: 4000, lowerDiameter: 165,
    upperDiameter: 85, thickness: 4, upperThickness: 3, material: 'STK400' }];
  for (const type of ['on-gl', 'embedment', 'baseplate-under-gl']) {
    const project = createProject({ poles, installation: { type, depth: type === 'on-gl' ? 0 : 1000 } });
    const before = JSON.stringify(project);
    const scene = build(project);
    assert.equal(JSON.stringify(project), before);
    assert.equal(scene.pole.segments[0].material, 'STK400');
    assert.equal(scene.pole.segments[0].upperThickness, 3);
    const queries = createPoleGeometryQueries(scene.pole);
    assert.equal(queries.getDiameterAtHeight(2000), 125);
    assert.equal(queries.getSegmentAtHeight(2000).poleId, 'pole-1');
    const plate = scene.components.find(c => c.type === 'baseplate');
    assert.equal(Boolean(plate), type !== 'embedment');
    assert.equal(scene.components.filter(c => c.type === 'rib').length, plate ? 3 : 0);
    if (plate) assert.equal(plate.primitives[0].points[0].y, scene.pole.bottomY);
    else assert.equal(scene.bounds.maxX, 82.5);
    const ids = scene.components.flatMap(c => [c.id, ...c.primitives.map(p => p.id)]);
    assert.equal(new Set(ids).size, ids.length);
    for (const primitive of scene.components.flatMap(c => c.primitives)) {
      for (const p of primitive.points ?? [primitive.start, primitive.end]) {
        assert(Number.isFinite(p.x) && Number.isFinite(p.y));
        assert(p.x >= scene.bounds.minX && p.x <= scene.bounds.maxX);
        assert(p.y >= scene.bounds.minY && p.y <= scene.bounds.maxY);
      }
      if (primitive.kind === 'arc') assert(Math.hypot(primitive.end.x - primitive.start.x,
        primitive.end.y - primitive.start.y) <= primitive.radius * 2);
    }
    if (type !== 'on-gl') {
      assert.equal(scene.pole.segments.at(-1).upperThickness, 4);
      const buried = scene.components.find(c => c.id.endsWith('/below-gl'));
      assert(!buried.primitives.some(p => p.id.endsWith('/top')));
    }
    assert.doesNotThrow(() => JSON.stringify(scene));
  }
  assert.throws(() => build(createProject({ poles: [{ height: 1000, lowerDiameter: 400, thickness: 4 }] })), /too narrow/);
  console.log('PASS installation geometry: all types, taper, metadata, IDs, bounds, relief and invalid plate fit');
})().catch(error => { console.error(error); process.exitCode = 1; });
