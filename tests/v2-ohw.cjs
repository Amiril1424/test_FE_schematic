const assert = require('node:assert/strict');

(async () => {
  const api = await import('../schematic_Lighting_1a.js');
  const make = (fixAngle, height = 4000) => api.createProject({
    poles: [{ type: 'tapered', height: 4000, lowerDiameter: 165, upperDiameter: 85, thickness: 4 },
      { height: 2000, lowerDiameter: 180, thickness: 4 }],
    overheadWires: [{ name: 'Wire', height, diameter: 12, weight: 0.19, span: 5000, fixAngle }]
  });
  const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
  for (const fix of [0, 90, 91, 180, 270, 271, 360]) {
    const project = make(fix), before = JSON.stringify(project);
    const scene = api.buildOHWGeometry(project), ref = scene.attachments[0];
    assert.equal(JSON.stringify(project), before);
    assert.equal(scene.components.length, 3); assert.equal(scene.issues.length, 0);
    assert.equal(ref.diameter, 125);
    const side = fix > 90 && fix <= 270 ? -1 : 1;
    assert.equal(Math.sign(ref.cableOuter.x), side);
    near(Math.hypot(ref.cableOuter.x - ref.cableAttachment.x, ref.cableOuter.y - ref.cableAttachment.y), 400);
    near(ref.cableOuter.y - ref.cableAttachment.y, -400 * Math.sin(Math.PI / 9));
    near(Math.abs(ref.cableOuter.x - ref.cableAttachment.x), 400 * Math.cos(Math.PI / 9));
    const cable = scene.components[2].primitives[0];
    for (const point of [cable.start, cable.end, ref.cableMiddle, ref.cableLowest]) {
      near(Math.hypot(point.x - cable.center.x, point.y - cable.center.y), 250);
      assert(point.x >= scene.bounds.minX && point.x <= scene.bounds.maxX);
      assert(point.y >= scene.bounds.minY && point.y <= scene.bounds.maxY);
    }
    assert.deepEqual(ref.cableAttachment, scene.components[1].primitives[1].center);
    assert.equal(ref.bandRight.y, 4000);
  }
  assert.equal(api.buildOHWGeometry(make(0, 2000)).attachments[0].diameter, 180);
  const under = make(0); under.installation = { type: 'baseplate-under-gl', depth: 1000 };
  assert.equal(api.buildOHWGeometry(under).attachments[0].poleCenter.y, 4000);
  const multiple = make(0); multiple.overheadWires.push({ ...multiple.overheadWires[0], id: 'wire-2', fixAngle: 180, height: 3000 });
  const scene = api.buildOHWGeometry(multiple);
  assert.equal(scene.components.length, 6);
  assert.equal(new Set(scene.components.map(c => c.id)).size, 6);
  multiple.overheadWires = []; assert.equal(api.buildOHWGeometry(multiple).bounds, null);
  console.log('PASS OHW geometry: taper, joint, fix-angle boundaries, R250/chord400/drop20, anchors, installation and multiple wires');
})().catch(error => { console.error(error); process.exitCode = 1; });
