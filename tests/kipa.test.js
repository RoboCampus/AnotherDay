import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  setY(y) { this.y = y; return this; }
  sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
  length() { return Math.hypot(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  divideScalar(k) { return this.multiplyScalar(1 / k); }
  lerp(v, k) { return this.set(this.x + (v.x - this.x) * k, this.y + (v.y - this.y) * k, this.z + (v.z - this.z) * k); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, k) { this.x += v.x * k; this.y += v.y * k; this.z += v.z * k; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
  normalize() { return this.multiplyScalar(1 / (Math.hypot(this.x, this.y, this.z) || 1)); }
}

const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace(/^export /gm, '');
const audio = new Proxy({}, { get: () => () => {} });
const Kipa = vm.runInNewContext(`${source('../src/kipa.js')}\nKipa`, { THREE: { Vector3 }, audio }, { filename: 'src/kipa.js' });
const Phone = vm.runInNewContext(`${source('../src/phone.js')}\nPhone`, { audio }, { filename: 'src/phone.js' });

function fixture() {
  const pressed = new Set();
  const ctx = {
    story: { phase: 'bossFight' }, amir: { pos: new Vector3(-100, 0, -100), fight: { active: true, ultimateReady: false } },
    player: { pos: new Vector3(1, 0, 2), kipa: { visible: true }, mode: null },
    input: { hit: (key) => pressed.has(key) },
    hud: new Proxy({}, { get: () => () => {} }),
    guards: { list: [] }, fx: { emit() {} },
    world: { groundY: () => 0, solidAt: () => false, raycast: () => Infinity },
  };
  ctx.phone = new Phone(ctx);
  // Bypass mesh construction; exercise the real ready getter and throw guard.
  const kipa = Object.assign(Object.create(Kipa.prototype), {
    ctx, state: 'head', cd: 0, pos: new Vector3(), vel: new Vector3(),
    hit: new Set(), bonks: 0, mesh: { visible: false, position: new Vector3(), rotation: new Vector3() }, aimAssist: () => null,
  });
  function phoneStep(key) {
    if (key) pressed.add(key);
    ctx.phone.update(0.05);
    pressed.clear();
  }
  function ringAdam() { ctx.phone.startBoss(0); phoneStep(); }
  return { ctx, kipa, phoneStep, ringAdam };
}

function assertBlocked(kipa) {
  const before = { pos: { ...kipa.pos }, vel: { ...kipa.vel }, state: kipa.state, visible: kipa.mesh.visible };
  const unreadableDirection = new Proxy({}, { get() { throw new Error('a blocked throw read its direction'); } });
  assert.equal(kipa.ready, false);
  assert.equal(kipa.throw(unreadableDirection), false);
  assert.deepEqual({ pos: { ...kipa.pos }, vel: { ...kipa.vel }, state: kipa.state, visible: kipa.mesh.visible }, before);
}

test('the kipa stays blocked outside opening stealth and active boss combat', () => {
  for (const phase of ['menu', 'intro', 'queue', 'gate', 'inside', 'lobby', 'lobbyFree', 'elevatorLine', 'bossIntro', 'bossRecovery', 'bossUltimate', 'bossFinisher', 'bossVictory', 'elevator', 'office', 'officeFree', 'crash', 'end']) {
    const { ctx, kipa } = fixture();
    ctx.story.phase = phase;
    assertBlocked(kipa);
  }
  const { ctx, kipa } = fixture();
  ctx.amir.fight.active = false;
  assertBlocked(kipa);
});

test('a ringing ADAM call permits a normal kipa throw', () => {
  const { ctx, kipa, ringAdam } = fixture();
  ringAdam();
  assert.equal(ctx.phone.call.state, 'ringing');
  assert.equal(kipa.ready, true);
  assert.equal(kipa.throw(new Vector3(0, 0.1, 1)), true);
  assert.equal(kipa.state, 'out');
  assert.equal(kipa.mesh.visible, true);
  assert.equal(ctx.player.kipa.visible, false);
  assert.ok([kipa.pos.x, kipa.pos.y, kipa.pos.z, kipa.vel.x, kipa.vel.y, kipa.vel.z].every(Number.isFinite));
});

test('answering ADAM blocks throws and hanging up restores readiness', () => {
  const { ctx, kipa, ringAdam, phoneStep } = fixture();
  ringAdam();
  phoneStep('KeyY');
  assert.equal(ctx.phone.call.state, 'talking');
  assertBlocked(kipa);
  ctx.phone.hangup();
  assert.equal(kipa.ready, true);
});

test('cooldown and an airborne kipa block both stages; a charged ultimate blocks the boss throw', () => {
  for (const phase of ['sneak', 'bossFight']) {
    for (const change of [
      ({ kipa }) => { kipa.cd = 0.1; },
      ({ kipa }) => { kipa.state = 'out'; },
      ({ kipa }) => { kipa.state = 'back'; },
    ]) {
      const f = fixture();
      f.ctx.story.phase = phase;
      change(f);
      assertBlocked(f.kipa);
    }
  }
  const { ctx, kipa } = fixture();
  ctx.amir.fight.ultimateReady = true;
  assertBlocked(kipa);
});

test('opening stealth permits throwing without an active boss', () => {
  const { ctx, kipa } = fixture();
  ctx.story.phase = 'sneak';
  ctx.amir.fight.active = false;
  assert.equal(kipa.ready, true);
  assert.equal(kipa.throw(new Vector3(0, 0, 1)), true);
  assert.equal(kipa.state, 'out');
  assert.equal(kipa.mesh.visible, true);
  assert.equal(ctx.player.kipa.visible, false);
});

test('an opening-stage kipa targets a meteorologist, bonks once, returns and enters cooldown', () => {
  const { ctx, kipa } = fixture();
  ctx.story.phase = 'sneak';
  ctx.amir.fight.active = false;
  delete kipa.aimAssist; // Use the actual aim assistance and flight/collision implementation.
  const hits = [];
  const guard = {
    pos: new Vector3(1, 0, 6), bonkable: true,
    bonk(direction) { hits.push(direction.clone()); this.bonkable = false; },
  };
  ctx.guards.list.push(guard);
  assert.equal(kipa.throw(new Vector3(0, 0, 1)), true);
  assert.equal(kipa.target, guard);
  for (let i = 0; i < 600 && kipa.state !== 'head'; i++) {
    kipa.update(1 / 60);
    assert.ok([kipa.pos.x, kipa.pos.y, kipa.pos.z, kipa.vel.x, kipa.vel.y, kipa.vel.z].every(Number.isFinite));
  }
  assert.equal(hits.length, 1);
  assert.equal(kipa.bonks, 1);
  assert.ok(kipa.hit.has(guard));
  assert.equal(hits[0].y, 0);
  assert.ok([hits[0].x, hits[0].z].every(Number.isFinite));
  assert.equal(kipa.state, 'head');
  assert.equal(kipa.mesh.visible, false);
  assert.equal(ctx.player.kipa.visible, true);
  assert.equal(kipa.ready, false, 'catching the kipa starts its cooldown');
  kipa.update(3.9);
  assert.equal(kipa.ready, false);
  kipa.update(0.2);
  assert.equal(kipa.ready, true);
  assert.equal(hits.length, 1);
});
