import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  setScalar(k) { return this.set(k, k, k); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  addScaledVector(v, k) { return this.set(this.x + v.x * k, this.y + v.y * k, this.z + v.z * k); }
  lerpVectors(a, b, k) { return this.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); }
}
class Node {
  constructor(geometry, material) {
    this.position = new Vector3(); this.rotation = new Vector3(); this.scale = new Vector3(1, 1, 1);
    this.children = []; this.material = material; this.visible = true; this.intensity = 0;
  }
  add(...children) { this.children.push(...children); }
}
class Material { constructor(options) { Object.assign(this, options); } }
class Geometry {}
const source = readFileSync(new URL('../src/shonchik.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export class Shonchik', 'class Shonchik');

function fixture() {
  let hits = 0;
  const THREE = {
    Vector3, Group: Node, Mesh: Node, PointLight: Node,
    BoxGeometry: Geometry, SphereGeometry: Geometry, RingGeometry: Geometry,
    MeshStandardMaterial: Material, MeshBasicMaterial: Material,
  };
  const Shonchik = vm.runInNewContext(`${source}\nShonchik`, {
    THREE, OLIVE: '#5f6638', mat: () => new Material({}),
    parts: {
      BOX: new Geometry(), CYL: new Geometry(), SPHERE: new Geometry(), cap: () => new Geometry(),
      part(geo, material, x, y, z, sx = 1, sy = 1, sz = 1) {
        const node = new Node(geo, material); node.position.set(x, y, z); node.scale.set(sx, sy, sz); return node;
      },
    },
    createCharacter: () => ({ root: new Node(), spine: new Node(), arms: [-1, 1].map((s) => ({ s, sh: new Node(), el: new Node() })) }),
    animate() {}, addLabel() {}, audio: new Proxy({}, { get: () => () => {} }),
  });
  const ctx = {
    scene: { add() {} }, amir: { pos: new Vector3(-216, 0, -196), ultimateHit() { hits++; } },
    hud: { bubble() {}, flash() {} }, fx: { emit() {} }, shake: 0,
  };
  return { shonchik: new Shonchik(ctx), hits: () => hits };
}

test('satellite impacts once before completion, then hides without clearing done', () => {
  const { shonchik, hits } = fixture();
  shonchik.start();
  for (let i = 0; i < 180; i++) shonchik.update(1 / 60);
  assert.equal(hits(), 0);
  assert.equal(shonchik.done, false);
  for (let i = 0; i < 90; i++) shonchik.update(1 / 60);
  assert.equal(hits(), 1);
  assert.equal(shonchik.done, true);
  assert.equal(shonchik.satellite.visible, false);
  for (let i = 0; i < 180; i++) shonchik.update(1 / 60);
  assert.equal(hits(), 1);
  assert.equal(shonchik.active, false);
  assert.equal(shonchik.ch.root.visible, false);
  assert.equal(shonchik.done, true);
});

test('reset cancels an in-flight satellite; a fresh start can land once', () => {
  const { shonchik, hits } = fixture();
  shonchik.start();
  shonchik.update(2.4);
  shonchik.reset();
  shonchik.update(10);
  assert.equal(hits(), 0);
  assert.equal(shonchik.done, false);
  assert.equal(shonchik.satellite.visible, false);
  shonchik.start();
  shonchik.update(4.3);
  shonchik.update(0.1);
  assert.equal(hits(), 1);
  assert.equal(shonchik.done, true);
});
