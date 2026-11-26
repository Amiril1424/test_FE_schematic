const assert = require('node:assert/strict');

(async () => {
  const api = await import('../schematic_Lighting_1a.js');
  const make = (fixAngle, verticalAngle = 5, length = 1000) => api.createProject({
    poles: [{ type: 'tapered', height: 6000, lowerDiameter: 165, upperDiameter: 85, thickness: 4 }],
    arms: [{ height: 4000, length, diameter: 76.3, thickness: 3.2, fixAngle, verticalAngle }]
  });
  for (const angle of [-5, 0, 5]) {
    const right = api.buildArmGeometry(make(0, angle));
    const left = api.buildArmGeometry(make(180, angle));
    assert.equal(right.issues.length, 0);
    assert.equal(right.components.length, 4);
    assert.equal(right.attachments[0].origin.y, 4000);
    assert.equal(right.attachments[0].origin.x, 1000);
    for (let i = 0; i < right.components.length; i++) {
      const r = right.components[i].primitives[0], l = left.components[i].primitives[0];
      r.points.forEach((p, j) => { assert.equal(l.points[j].x, -p.x); assert.equal(l.points[j].y, p.y); });
    }
    const body = right.components[0];
    for (const p of Object.values(body.connection)) assert(Math.abs(p.x - (165 - 80 * p.y / 6000) / 2) < 1e-9);
    const object = right.components.at(-1).primitives[0].points;
    assert(Math.abs(Math.hypot(object[1].x - object[0].x, object[1].y - object[0].y) - 600) < 1e-9);
    assert(Math.abs(Math.hypot(object[2].x - object[1].x, object[2].y - object[1].y) - 200) < 1e-9);
  }
  for (const fix of [0, 90, 91, 270, 271, 360]) {
    const scene = api.buildArmGeometry(make(fix));
    assert.equal(Math.sign(scene.attachments[0].origin.x), fix > 90 && fix <= 270 ? -1 : 1);
  }
  assert.equal(api.buildArmGeometry(make(0, 5, 180)).components.length, 4);
  assert.equal(api.buildArmGeometry(make(0, 5, 10)).issues[0].code, 'arm-connection');
  const scene = api.buildArmGeometry(make(0));
  assert.equal(api.buildArmObjectGeometry(scene.attachments[0], { type: 'lighting', length: 800, height: 250 }).dimensions.length, 800);
  const empty = make(0); empty.arms = [];
  assert.equal(api.buildArmGeometry(empty).components.length, 0);
  console.log('PASS arm geometry: taper contact, tip height, mirrored angles, adapter/rib/lighting and future dimensions');
})().catch(e => { console.error(e); process.exitCode = 1; });
