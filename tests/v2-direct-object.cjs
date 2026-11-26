const assert = require('node:assert/strict');

(async () => {
  const api = await import('../schematic_Lighting_1a.js');
  const input = { poles: [{ height: 4000, lowerDiameter: 165, thickness: 4 }],
    directObjects: [{ name: 'Box', areaFront: 0.24, areaSide: 0.1, height: 3000, quantity: 1 }] };
  for (const type of ['on-gl', 'embedment', 'baseplate-under-gl']) {
    const project = api.createProject({ ...input, installation: { type, depth: type === 'on-gl' ? 0 : 300 } });
    assert(api.validateProject(project).valid);
    const [reference] = api.getDirectObjectReferences(project);
    assert.equal(reference.center.y, type === 'baseplate-under-gl' ? 2700 : 3000);
    assert.equal(reference.rightSurface.x, 82.5);
    assert.equal(reference.poleGap, 50);
    assert(Math.abs(reference.boxSize.width * reference.boxSize.height - 240000) < 1e-8);
    assert(Math.abs(reference.boxSize.width / reference.boxSize.height - 2 / 3) < 1e-12);
  }
  for (const field of ['areaFront', 'areaSide', 'height', 'quantity']) {
    const project = api.createProject(input); project.directObjects[0][field] = -1;
    assert(!api.validateProject(project).valid);
  }
  const values = { 'installation-type': 'on-gl', 'installation-depth': '0',
    'pole-count': '1', 'arm-count': '0', 'do-count': '3', 'ohw-count': '0',
    'pole-1-type': 'straight', 'pole-1-name': '', 'pole-1-material': 'STK400',
    'pole-1-diameter': '165', 'pole-1-thickness': '4', 'pole-1-height': '4000', 'pole-1-quantity': '1' };
  for (let i = 1; i <= 3; i++) for (const [key, value] of Object.entries({ name: `Box ${i}`, 'area-front': '0.24', 'area-side': '0.1', height: '3000', quantity: '1' })) values[`do-${i}-${key}`] = value;
  const root = { querySelector(selector) { const id = selector.match(/id="([^"]+)"/)[1]; return id in values ? { value: values[id] } : null; } };
  const project = api.readProjectFromForm(root);
  assert.equal(project.directObjects.length, 3); assert(api.validateProject(project).valid);
  assert.equal(project.directObjects[2].areaFront, 0.24);
  assert.deepEqual(api.getDirectObjectReferences(project).map(p => p.side), ['right', 'left', 'center']);
  project.directObjects[2].height = 2500;
  assert.deepEqual(api.getDirectObjectReferences(project).map(p => p.side), ['right', 'left', 'right']);
  const repeated = api.createProject(input); repeated.directObjects[0].quantity = 3;
  assert.deepEqual(api.getDirectObjectReferences(repeated).map(p => p.side), ['right', 'left', 'center']);
  repeated.directObjects[0].quantity = 4; assert(!api.validateProject(repeated).valid);
  values['do-count'] = '0'; assert.equal(api.readProjectFromForm(root).directObjects.length, 0);
  console.log('PASS Direct Object fields, validation, installation datum, areas and box proportions');
})().catch(error => { console.error(error); process.exitCode = 1; });
