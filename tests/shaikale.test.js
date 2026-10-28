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
  multiplyScalar(k) { return this.set(this.x * k, this.y * k, this.z * k); }
  addScaledVector(v, k) { return this.set(this.x + v.x * k, this.y + v.y * k, this.z + v.z * k); }
  lerpVectors(a, b, k) { return this.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); }
}
class Node {
  constructor(geometry, material) {
    this.position = new Vector3(); this.rotation = new Vector3(); this.scale = new Vector3(1, 1, 1);
    this.children = []; this.material = material; this.visible = true;
  }
  add(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  updateWorldMatrix() {}
  getWorldPosition(out) {
    out.copy(this.position);
    for (let parent = this.parent; parent; parent = parent.parent) out.add(parent.position);
    return out;
  }
}
class Material { constructor(options) { Object.assign(this, options); } }
class Geometry {}
const source = readFileSync(new URL('../src/shaikale.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export class Shaikale', 'class Shaikale');

function character() {
  const root = new Node(), hips = new Node();
  hips.position.y = 0.95; root.add(hips);
  return { root, hips, spine: new Node(), arms: [-1, 1].map((s) => ({ s, sh: new Node(), el: new Node() })) };
}

function fixture() {
  const hits = [];
  const THREE = { Vector3, Group: Node, Mesh: Node, ConeGeometry: Geometry, SphereGeometry: Geometry, MeshStandardMaterial: Material };
  const Shaikale = vm.runInNewContext(`${source}\nShaikale`, {
    THREE, LOOKS: { officer: {} }, createCharacter: character,
    animate() {}, addLabel() {}, audio: new Proxy({}, { get: () => () => {} }),
  });
  const amirCharacter = character();
  amirCharacter.root.position.set(-216, 0, -196);
  const officeEmitter = {};
  const ctx = {
    scene: { add() {} }, hud: { bubble() {} }, poop: { emitter: officeEmitter },
    amir: {
      ch: amirCharacter, pos: amirCharacter.root.position, fight: { stage: 'ultimate', won: false },
      ultimateHit() {
        hits.push({ x: this.pos.x, z: this.pos.z });
        this.fight.won = true;
      },
    },
  };
  const shaikale = new Shaikale(ctx);
  function until(time) { while (shaikale.active && shaikale.t < time - 1e-8) shaikale.update(1 / 60); }
  return { shaikale, ctx, hits, officeEmitter, until };
}

test('Shaikale grabs and carries Amir before winning beyond the actual doorway', () => {
  const { shaikale, ctx, hits, officeEmitter, until } = fixture();
  shaikale.start();
  until(1.5);
  assert.equal(shaikale.grabbed, false);
  assert.equal(hits.length, 0);
  until(2.1);
  assert.equal(shaikale.grabbed, true);
  assert.equal(ctx.amir.ch.root.visible, true);
  assert.ok(ctx.amir.pos.x > -216);
  assert.equal(hits.length, 0);
  until(3.8);
  assert.equal(hits.length, 0, 'grabbing or starting the exit cannot win early');
  assert.equal(shaikale.pos.z, -188, 'carry route uses the east-wall door gap');
  until(4.3);
  assert.equal(hits.length, 1);
  assert.ok(hits[0].x > -185, 'the boss is carried outside before the final hit');
  assert.equal(ctx.amir.ch.root.visible, false);
  assert.equal(shaikale.done, false);
  until(5.5);
  assert.equal(shaikale.done, true);
  assert.equal(shaikale.active, false);
  assert.equal(shaikale.ch.root.visible, false);
  assert.equal(shaikale.jet.visible, false);
  assert.equal(hits.length, 1);
  assert.equal(ctx.poop.emitter, officeEmitter, 'the office scene emitter is untouched');
  shaikale.reset();
  assert.equal(ctx.amir.ch.root.visible, false, 'a won fight keeps the carried-away boss hidden');
});

test('reset cancels a carried flight and restores Amir for an unfinished encounter', () => {
  const { shaikale, ctx, hits, until } = fixture();
  shaikale.start();
  until(2.2);
  assert.equal(shaikale.grabbed, true);
  shaikale.reset();
  shaikale.update(10);
  assert.equal(shaikale.active, false);
  assert.equal(shaikale.done, false);
  assert.equal(shaikale.grabbed, false);
  assert.equal(hits.length, 0);
  assert.equal(ctx.amir.ch.root.visible, true);
  assert.deepEqual([ctx.amir.pos.x, ctx.amir.pos.y, ctx.amir.pos.z], [-216, 0, -196]);
  assert.ok(shaikale.particles.every((particle) => !particle.mesh.visible && particle.life === 0));
  shaikale.start();
  until(4.6);
  assert.equal(hits.length, 1);
  assert.equal(shaikale.done, true);
});

test('finisher cleanup preserves the spawn position supplied by a new fight reset', () => {
  const { shaikale, ctx, until } = fixture();
  shaikale.start();
  until(2.2);
  ctx.amir.fight.stage = 'windup';
  ctx.amir.pos.set(-215, 0, -195);
  shaikale.reset();
  assert.deepEqual([ctx.amir.pos.x, ctx.amir.pos.y, ctx.amir.pos.z], [-215, 0, -195]);
  assert.equal(ctx.amir.ch.root.visible, true);
});
