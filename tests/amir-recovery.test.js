import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as L from '../src/layout.js';
import { BossFight, BOSS_ATTACK, BOSS_ARENA, BOSS_POSITION } from '../src/boss-fight.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  setScalar(k) { return this.set(k, k, k); }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerpVectors(a, b, k) { return this.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); }
}
const node = () => ({ position: new Vector3(), rotation: new Vector3(), scale: new Vector3(1, 1, 1), visible: true });
function character() {
  return {
    root: node(), body: node(), hips: node(), spine: node(), neck: node(), head: node(), mouth: node(), label: node(),
    legs: [-1, 1].map((s) => ({ s, hip: node(), kn: node(), ft: node() })),
    arms: [-1, 1].map((s) => ({ s, sh: node(), el: node(), hand: node() })),
    phase: 0, t: 0,
  };
}
const source = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
// Use the actual shared pose animator too, with unrendered transform fixtures.
class Geometry {}
const animate = vm.runInNewContext(`${source('../src/character.js')}\nanimate`, {
  THREE: { SphereGeometry: Geometry, BoxGeometry: Geometry, CylinderGeometry: Geometry },
}, { filename: 'src/character.js' });
const Amir = vm.runInNewContext(`${source('../src/amir.js')}\nAmir`, {
  THREE: { Vector3 }, L, animate, BossFight, BOSS_ATTACK, BOSS_ARENA, BOSS_POSITION,
  audio: new Proxy({}, { get: () => () => {} }),
}, { filename: 'src/amir.js' });

function fixture() {
  const ch = character(), woman = character();
  ch.root.position.set(BOSS_POSITION.x, BOSS_POSITION.y, BOSS_POSITION.z);
  woman.root.position.set(-200.5, 0, -203.3);
  const player = { pos: new Vector3(-210, 0, -188) };
  const fight = new BossFight();
  fight.start(player.pos);
  for (let i = 0; i < 3; i++) {
    fight.update(BOSS_ATTACK.lock, player.pos);
    fight.update(BOSS_ATTACK.windup - BOSS_ATTACK.lock + BOSS_ATTACK.fire, { x: -206, y: 0, z: -188 });
    assert.equal(fight.hit(), true);
    if (i < 2) fight.update(BOSS_ATTACK.recover, player.pos);
  }
  assert.equal(fight.beginUltimate(), true);
  assert.equal(fight.finishUltimate(), true);
  const color = () => ({ set() {}, setRGB() {} });
  // Bypass all mesh creation while keeping the real recovery/model methods.
  const amir = Object.assign(Object.create(Amir.prototype), {
    ctx: { player, story: { phase: 'bossRecovery' } }, ch, pos: ch.root.position,
    womanOfficer: woman, fight, state: 'boss', t: 0, recoveryMode: null,
    recoveryProgress: 0, recoveryPath: [], rays: [], on: false,
    bossBody: { off: false }, icon: node(), fan: node(), bossBounds: node(),
    eyeMat: { color: color() }, glowMat: { color: color(), opacity: 1 },
    lasers: [], thrownPeople: {}, recoveryChair: { ...node(), visible: false },
  });
  amir.beginRecovery();
  amir.animateRetreat(1);
  function frame(dt = 1 / 60) { amir.update(dt); }
  return { amir, ch, woman, fight, frame };
}
const position = (v) => [v.x, v.y, v.z];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

function assertCrouched(ch) {
  near(ch.body.position.y, -0.67);
  near(ch.body.position.z, -0.35);
  near(ch.spine.rotation.x, 0.08);
  near(ch.head.rotation.x, -0.08);
  for (const leg of ch.legs) {
    near(leg.hip.rotation.x, -Math.PI / 2);
    near(leg.kn.rotation.x, 2.55);
    near(leg.ft.rotation.x, -0.98);
  }
  for (const arm of ch.arms) {
    near(arm.sh.rotation.x, -0.08);
    near(arm.el.rotation.x, -0.15);
  }
  assert.deepEqual(position(ch.root.scale), [1, 1, 1], 'crouching preserves the full-size actor');
}
function facingDot(heading, from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  return (Math.sin(heading) * dx + Math.cos(heading) * dz) / Math.hypot(dx, dz);
}

test('Amir sits behind the desk while the officer crouches before entering its opening', () => {
  const { amir, ch, woman, fight, frame } = fixture();
  amir.animateHeal(0.08);
  frame();
  assertCrouched(woman);
  assert.deepEqual(position(woman.root.position), [-200.5, 0, -203.3], 'the officer crouches at home before moving');
  amir.animateHeal(0.14);
  frame();
  assertCrouched(woman);
  assert.ok(woman.root.position.x < -200.5 && woman.root.position.x > -203.3, 'the approach preserves the crouch');
  assert.ok(woman.root.position.z > -203.3 && woman.root.position.z < -201.5);
  amir.animateHeal(0.28);
  frame();
  assertCrouched(woman);
  near(amir.pos.x, -202.8);
  near(amir.pos.y, 0.61);
  near(amir.pos.z, -203.2);
  assert.ok(amir.pos.z < -201.8, 'the chair remains behind the desk');
  near(ch.root.rotation.y, 0);
  near(woman.root.position.x, -203.3);
  near(woman.root.position.z, -201.5);
  near(woman.root.position.y, 0);
  assert.ok(woman.root.position.x > -205 && woman.root.position.x < -202.6, 'the officer stays inside the central desk opening');
  near(woman.root.rotation.y, Math.PI);
  assert.ok(woman.root.position.z > -201.8 && woman.root.position.z < -200.4, 'the officer crouches beneath the desk');
  assert.ok(facingDot(woman.root.rotation.y, woman.root.position, { x: -206.8, z: -198.7 }) < -0.5, 'the officer faces away from the recovery camera');
  assert.ok(ch.legs.every((leg) => leg.hip.rotation.x < -1), 'Amir is sitting with bent thighs');
  assert.equal(amir.recoveryChair.visible, true);
  assert.equal(ch.label.visible, false);
  assert.equal(woman.label.visible, false);
  assert.equal(amir.recoveryBeat, 'shaking');
  assert.equal(fight.health, 0);
});

test('both actors shake their heads after settling while HP remains empty', () => {
  const { amir, ch, woman, fight, frame } = fixture();
  amir.animateHeal(0.45);
  frame(0.03);
  const first = [ch.head.rotation.y, woman.head.rotation.y];
  frame(0.07);
  assert.notEqual(ch.head.rotation.y, first[0]);
  assert.notEqual(woman.head.rotation.y, first[1]);
  assert.equal(fight.health, 0);
  assert.equal(amir.recoveryBeat, 'shaking');
  near(amir.pos.y, 0.61);
  near(woman.root.position.x, -203.3);
  near(woman.root.position.z, -201.5);
  assertCrouched(woman);
});

test('HP starts growing only after the seating and head-shaking beats', () => {
  const { amir, fight, frame } = fixture();
  for (const k of [0, 0.15, 0.279, 0.28, 0.45, 0.649, 0.65]) {
    amir.animateHeal(k);
    frame();
    assert.equal(fight.health, 0, `HP must remain empty at progress ${k}`);
  }
  amir.animateHeal(0.8);
  frame();
  assert.equal(amir.recoveryBeat, 'healing');
  assert.ok(fight.health > 0 && fight.health < fight.maxHealth);
  amir.animateHeal(1);
  frame();
  assert.equal(fight.health, fight.maxHealth);
});

test('returning stands from the chair, restores the officer home and resumes round two at ground level', () => {
  const { amir, ch, woman, fight, frame } = fixture();
  fight.playerHealth = 2;
  amir.animateHeal(1);
  frame();
  amir.animateReturn(0.06);
  frame();
  assertCrouched(woman);
  assert.ok(woman.root.position.x > -203.3 && woman.root.position.x < -200.5, 'the officer returns home while crouched');
  near(woman.root.rotation.y, Math.PI);
  amir.animateReturn(0.12);
  frame();
  assertCrouched(woman);
  assert.deepEqual(position(woman.root.position), [-200.5, 0, -203.3]);
  amir.animateReturn(0.16);
  frame();
  assert.ok(woman.body.position.y > -0.67 && woman.body.position.y < 0, 'she stands only after reaching home');
  amir.animateReturn(0.2);
  frame();
  near(amir.pos.y, 0);
  assert.ok(woman.body.position.y >= -0.1);
  assert.deepEqual(position(woman.root.position), [-200.5, 0, -203.3]);
  amir.animateReturn(1);
  frame();
  assert.equal(amir.startRoundTwo(), true);
  assert.equal(amir.state, 'boss');
  assert.equal(amir.recoveryMode, null);
  assert.equal(amir.recoveryChair.visible, false);
  assert.equal(ch.label.visible, true);
  assert.equal(woman.label.visible, true);
  assert.equal(amir.bossBody.off, false);
  assert.deepEqual(position(amir.pos), [BOSS_POSITION.x, 0, BOSS_POSITION.z]);
  assert.deepEqual(position(woman.root.position), [-200.5, 0, -203.3]);
  assert.equal(fight.round, 2);
  assert.equal(fight.health, fight.maxHealth);
  assert.equal(fight.playerHealth, 2);
  assert.equal(fight.ultimateReady, false);
  near(ch.root.rotation.x, 0);
  near(ch.root.rotation.z, 0);
});

test('the recovery POV stays fixed throughout the shared pose and return', () => {
  const f = fixture();
  const Story = vm.runInNewContext(`${source('../src/story.js')}\nStory`, {
    THREE: { Vector3 }, audio: new Proxy({}, { get: () => () => {} }),
  }, { filename: 'src/story.js' });
  const ctx = f.amir.ctx;
  ctx.amir = f.amir;
  ctx.player.vel = new Vector3();
  ctx.player.snapCamera = () => {};
  ctx.phone = { stop() {} };
  ctx.marker = { hide() {} };
  ctx.hud = new Proxy({}, { get: () => () => {} });
  let resumed = 0;
  const story = Object.assign(Object.create(Story.prototype), {
    ctx, time: 0, startSecondRound() { resumed++; },
  });
  ctx.story = story;
  const script = story.bossRecovery();
  const snapshots = [];
  for (let i = 0; i < 1000; i++) {
    const next = script.next();
    if (next.done) break;
    if (f.amir.recoveryMode === 'heal' || f.amir.recoveryMode === 'return') {
      const camera = ctx.player.camOverride;
      assert.ok(camera);
      snapshots.push({ mode: f.amir.recoveryMode, pos: position(camera.pos), look: position(camera.look) });
    }
    story.time += 0.05;
    f.frame(0.05);
  }
  assert.equal(resumed, 1);
  assert.ok(snapshots.some(({ mode }) => mode === 'heal'));
  assert.ok(snapshots.some(({ mode }) => mode === 'return'));
  for (const snapshot of snapshots) {
    assert.deepEqual(snapshot.pos, snapshots[0].pos);
    assert.deepEqual(snapshot.look, snapshots[0].look);
  }
});
