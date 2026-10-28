import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as L from '../src/layout.js';
import { BossFight, BOSS_ATTACK } from '../src/boss-fight.js';

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  setY(y) { this.y = y; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new Vector3(this.x, this.y, this.z); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerpVectors(a, b, k) { return this.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k); }
}

function character() {
  return {
    root: { position: new Vector3(), rotation: {}, visible: true },
    head: { rotation: {} },
  };
}

// Exercise Story and its real generator runner; only browser rendering, audio,
// movement and the external encounter/elevator systems are replaced by fixtures.
const storySource = readFileSync(new URL('../src/story.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export class Story', 'class Story');

function fixture() {
  let story;
  const calls = { events: [], frames: [], startBoss: 0, retryBoss: 0, finishBoss: 0, useUltimate: 0, ultimateHit: 0, shonchik: 0, shaikale: 0, shaikaleReset: 0, recovery: 0, roundTwo: 0, retreat: [], heal: [], returning: [], phoneStart: 0, phoneStop: 0, boardLine: 0, prepareKick: 0, kick: 0, finishKick: 0, kipaReset: 0, explode: 0, lift: [], floorStops: [], hud: [] };
  const audio = new Proxy({}, { get: () => () => {} });
  const Story = vm.runInNewContext(`${storySource}\nStory`, {
    THREE: { Vector3 }, L, audio, createCharacter: character,
    soldier: character, animate() {}, addLabel() {}, LOOKS: { officer: {} }, OLIVE: '#526340',
  }, { filename: 'src/story.js' });
  function record(kind, details = {}) {
    calls.events.push({ kind, ...details, phase: story?.phase, pos: { ...player.pos } });
  }
  const pressed = new Set();
  const player = {
    pos: new Vector3(), vel: new Vector3(), state: 'free', heading: 0,
    yaw: 0, pitch: 0, crouch: 0, hidden: false, moveLocked: false,
    flight: null, mode: null, talk: false, camOverride: null, autoTarget: null,
    get arrived() { return this.autoTarget === null; },
    place(x, z, heading = this.heading, y = 0) {
      this.pos.set(x, y, z);
      this.heading = this.yaw = heading;
      this.vel.set(0, 0, 0);
      this.autoTarget = null;
    },
    walkTo(x, z) { record('walk', { x, z }); this.state = 'auto'; this.autoTarget = { x, z }; },
    face(x, z) { this.heading = Math.atan2(x - this.pos.x, z - this.pos.z); },
    snapCamera() {},
  };
  const elevator = {
    endSlot: { x: L.ELEV_LINE.x + L.ELEV_LINE.n * L.ELEV_LINE.gap, z: L.ELEV_LINE.z },
    door: { x: L.CORE.x1 + 0.5, z: L.ELEVATOR.z },
    seated: true, lineBoarded: false, boardHold: false, boarding: 0,
    boardLine() { record('boardLine'); calls.boardLine++; this.seated = false; this.boarding = 4; },
    prepareKick() { record('prepareKick'); calls.prepareKick++; },
    kick() { record('kick'); calls.kick++; },
    finishKick() { record('finishKick'); calls.finishKick++; },
    takeSlot() { return [L.CAB.x0 + 1, L.ELEVATOR.z]; },
    landing: { show() {}, hide() {} },
    floorStop(n, officers) { calls.floorStops.push([n, officers]); this.seated = false; this.boarding = 2; },
    squeeze() {},
    lift(y) { calls.lift.push(y); },
    explode() { calls.explode++; },
  };
  const amir = {
    pos: new Vector3(L.AMIR.x, 0, L.AMIR.z), fight: new BossFight(),
    get ultimateReady() { return this.fight.ultimateReady; },
    startBoss() { record('startBoss'); calls.startBoss++; this.fight.start(player.pos); },
    retryBoss() { calls.retryBoss++; this.fight.start(player.pos, undefined, this.fight.round); },
    beginRecovery() { calls.recovery++; this.state = 'recovering'; },
    animateRetreat(k) { calls.retreat.push(k); },
    animateHeal(k) { calls.heal.push(k); this.fight.heal(k <= 0.65 ? 0 : (k - 0.65) / 0.35); },
    animateReturn(k) { calls.returning.push(k); },
    startRoundTwo() { calls.roundTwo++; const resumed = this.fight.startRoundTwo(player.pos); this.state = 'boss'; return resumed; },
    useUltimate() { calls.useUltimate++; return this.fight.beginUltimate(); },
    ultimateHit() { calls.ultimateHit++; return this.fight.finishUltimate(); },
    finishBoss() { calls.finishBoss++; if (this.fight) this.fight.active = false; },
    reset() { this.fight.stop(); },
  };
  const hud = new Proxy({}, {
    get: (_, method) => (...args) => { record('hud', { method, args }); calls.hud.push({ method, args }); },
  });
  const ctx = {
    player, elevator, amir, hud, scene: { add() {}, remove() {} },
    input: { hit: (key) => pressed.has(key), key: () => false, reset: () => pressed.clear() },
    guards: { active: true, zone: 'in', reset() {}, list: [] },
    andrey: { vanish() {}, unlocked: true, cd: 0 },
    kipa: { reset() { calls.kipaReset++; }, bonks: 0 },
    marker: { hide() {}, set() {} },
    line: { guards: [{ pos: new Vector3(), talkT: 0 }] },
    shonchik: { active: false, done: false,
      start() { calls.shonchik++; this.active = true; this.done = false; },
      reset() { this.active = false; this.done = false; },
    },
    shaikale: { active: false, done: false, grabbed: false, pos: new Vector3(-210, 2, -188),
      start() { calls.shaikale++; this.active = true; this.done = false; this.grabbed = false; },
      reset() { calls.shaikaleReset++; this.active = false; this.done = false; this.grabbed = false; },
    },
    phone: { answered: 0, missed: 0, blocksAttacks: false, call: null, active: false,
      stop() { calls.phoneStop++; this.active = false; this.blocksAttacks = false; this.call = null; }, forceCall() {},
      startBoss() { calls.phoneStart++; this.active = true; this.blocksAttacks = false; },
      stopBoss() { this.stop(); },
    },
    city: { gate: { set() {} }, building: {
      setElevator(floor, amount) { record('door', { floor, amount }); },
      floor14: { crew: {}, lookAt() {}, breakWindow() {} },
    } },
    poop: { emitter: null, update: () => 0 },
    fx: { emit() {} }, world: { groundY: () => 0 },
  };
  story = new Story(ctx);
  ctx.story = story;
  player.place(elevator.endSlot.x + 1, elevator.endSlot.z, -Math.PI / 2);
  story.phase = 'lobbyFree';
  story.cp = 3;

  function step(keys = [], dt = 0.05) {
    for (const key of keys) pressed.add(key);
    story.update(dt);
    // Finish movement/boarding after the story tick, matching the main loop order.
    if (player.state === 'auto' && player.autoTarget) {
      player.pos.x = player.autoTarget.x;
      player.pos.z = player.autoTarget.z;
      player.autoTarget = null;
    }
    if (!elevator.boardHold && elevator.boarding > 0 && --elevator.boarding === 0) elevator.seated = true;
    calls.frames.push({ phase: story.phase, pos: { ...player.pos }, state: player.state, mode: player.mode });
    pressed.clear();
  }
  function until(predicate, description, frames = 5000) {
    for (let i = 0; i < frames && !predicate(); i++) step();
    assert.ok(predicate(), `${description}; phase=${story.phase}, runner=${Boolean(story.runner.co)}`);
  }
  function beginFight() {
    step(['KeyE']);
    until(() => story.phase === 'bossFight', 'the elevator line starts the Amir encounter');
    return amir.fight;
  }
  function chargeUltimate() {
    const fight = amir.fight;
    for (let i = 0; i < 3; i++) {
      fight.update(BOSS_ATTACK.lock, player.pos);
      fight.update(BOSS_ATTACK.windup - BOSS_ATTACK.lock + BOSS_ATTACK.fire, { x: player.pos.x + 4, y: player.pos.y, z: player.pos.z });
      assert.equal(fight.stage, 'recover');
      assert.equal(fight.hit(), true);
      if (i < 2) fight.update(BOSS_ATTACK.recover, player.pos);
    }
    assert.equal(fight.ultimateReady, true);
    assert.equal(fight.won, false, 'three kipa hits charge the ultimate rather than win');
    return fight;
  }
  function beginRoundTwo() {
    chargeUltimate();
    step(['KeyR']);
    assert.equal(story.phase, 'bossUltimate');
    assert.equal(amir.ultimateHit(), true);
    assert.equal(amir.fight.won, false, 'the satellite does not defeat Amir');
    assert.equal(amir.fight.health, 0);
    ctx.shonchik.done = true;
    ctx.shonchik.active = false;
    until(() => story.phase === 'bossFight' && amir.fight.round === 2, 'Amir heals and returns for round two');
    return amir.fight;
  }
  return { story, ctx, calls, step, until, beginFight, chargeUltimate, beginRoundTwo };
}

test('the queue boards before Argaman enters, is kicked out, and faces Amir', () => {
  const f = fixture();
  f.ctx.elevator.boardHold = true;
  f.step(['KeyE']);
  assert.equal(f.story.phase, 'elevatorLine');
  assert.equal(f.ctx.guards.active, false);
  f.until(() => f.calls.boardLine === 1, 'the waiting line boards');
  for (let i = 0; i < 20; i++) f.step();
  assert.notEqual(f.story.phase, 'bossFight');
  assert.equal(f.calls.startBoss, 0);
  f.ctx.elevator.boardHold = false;
  f.until(() => f.calls.frames.some(({ phase, pos }) => phase === 'elevatorFull' && pos.x < L.CORE.x1), 'Argaman crosses the lift threshold');
  f.until(() => f.story.phase === 'bossFight', 'Amir challenges Argaman after the ejection');
  const events = f.calls.events;
  const boarded = events.findIndex(({ kind }) => kind === 'boardLine');
  const prepared = events.findIndex(({ kind }) => kind === 'prepareKick');
  const approach = events.findIndex(({ kind, phase, x }) => kind === 'walk' && phase === 'elevatorFull' && x === f.ctx.elevator.door.x);
  const entry = events.findIndex(({ kind, phase, x }) => kind === 'walk' && phase === 'elevatorFull' && x < L.CORE.x1);
  const full = events.findIndex(({ kind, method, args }) => kind === 'hud' && method === 'subtitle' && typeof args[1] === 'string' && /full|no (?:more )?(?:places|space|room)/i.test(args[1]));
  const kick = events.findIndex(({ kind }) => kind === 'kick');
  const landed = events.findIndex(({ kind }) => kind === 'finishKick');
  const closed = events.findIndex(({ kind, floor, amount }, i) => i > landed && kind === 'door' && floor === 'lobby' && amount === 0);
  const boss = events.findIndex(({ kind }) => kind === 'startBoss');
  const order = [boarded, prepared, approach, entry, full, kick, landed, closed, boss];
  assert.ok(order.every((index) => index >= 0), 'the full-lift sequence includes every action');
  assert.ok(order.every((index, i) => i === 0 || index > order[i - 1]), 'entry, rejection, ejection, door closing and boss start occur in order');
  assert.ok(events[full].pos.x < L.CORE.x1, 'the full-lift dialogue happens after Argaman steps inside');
  const flight = f.calls.frames.filter(({ phase, state }) => phase === 'elevatorKick' && state === 'grabbed');
  assert.ok(flight.length >= 8, 'the ejection moves visibly across multiple frames');
  assert.ok(flight.some(({ pos }) => pos.y > 0.6), 'the kick has an airborne arc');
  assert.ok(flight.every(({ pos }, i) => i === 0 || pos.x >= flight[i - 1].pos.x), 'the kick carries Argaman east out of the cab');
  assert.ok(Math.abs(events[landed].pos.x - (L.CORE.x1 + 4.6)) < 1e-8);
  assert.ok(Math.abs(events[landed].pos.y) < 1e-8);
  assert.ok(f.calls.frames.some(({ phase, state, mode, pos }) => phase === 'elevatorKick' && state === 'frozen' && mode === 'down' && pos.x > L.CORE.x1), 'the landing pose remains visible before the lift closes');
  assert.equal(f.calls.prepareKick, 1);
  assert.equal(f.calls.kick, 1);
  assert.equal(f.calls.finishKick, 1);
  assert.equal(f.story.throws, 0, 'the scripted kick does not count as a meteorologist throw');
  assert.equal(f.calls.startBoss, 1);
  assert.equal(f.calls.kipaReset, 1);
  assert.equal(f.ctx.player.state, 'free');
  assert.equal(f.ctx.guards.active, false);
  assert.equal(f.calls.boardLine, 1);
  for (let i = 0; i < 20; i++) f.step();
  assert.equal(f.calls.startBoss, 1);
});

test('defeat freezes the player until E retries only the boss encounter', () => {
  const f = fixture();
  const firstFight = f.beginFight();
  firstFight.active = false;
  firstFight.lost = true;
  f.step();
  assert.equal(f.story.phase, 'bossFight');
  assert.equal(f.ctx.player.state, 'frozen');
  for (let i = 0; i < 20; i++) f.step();
  assert.equal(f.calls.retryBoss, 0);
  f.step(['KeyE']);
  assert.equal(f.calls.startBoss, 1);
  assert.equal(f.calls.retryBoss, 1);
  assert.equal(f.ctx.amir.fight.lost, false);
  assert.equal(f.ctx.amir.fight.stage, 'windup');
  assert.equal(f.ctx.amir.fight.health, f.ctx.amir.fight.maxHealth);
  assert.equal(f.ctx.amir.fight.playerHealth, f.ctx.amir.fight.maxPlayerHealth);
  assert.equal(f.ctx.player.state, 'free');
  assert.equal(f.calls.kipaReset, 2);
  assert.equal(f.calls.boardLine, 1);
  assert.equal(f.calls.finishBoss, 0);
  f.step();
  assert.equal(f.calls.retryBoss, 1);
});

test('satellite damage heals into round two and Shaikale carries Amir away before the onward story', () => {
  const f = fixture();
  const fight = f.beginFight();
  // Carry one real first-round injury through the recovery scene.
  fight.update(BOSS_ATTACK.windup + BOSS_ATTACK.fire, f.ctx.player.pos);
  assert.equal(fight.playerHealth, 2);
  fight.update(BOSS_ATTACK.recover, f.ctx.player.pos);
  f.step(['KeyR']);
  assert.equal(f.story.phase, 'bossFight', 'R requires a charged ultimate');
  assert.equal(f.calls.shonchik, 0);
  f.chargeUltimate();
  f.step();
  assert.equal(f.story.phase, 'bossFight');
  f.ctx.phone.blocksAttacks = true;
  f.step(['KeyR']);
  assert.equal(f.story.phase, 'bossFight', 'answering ADAM blocks the first ultimate');
  assert.equal(f.calls.shonchik, 0);
  f.ctx.phone.blocksAttacks = false;
  f.step(['KeyR']);
  assert.equal(f.story.phase, 'bossUltimate');
  f.until(() => f.calls.shonchik === 1, 'Shonchik arrives for the satellite ultimate');
  assert.equal(fight.won, false);
  assert.equal(f.calls.finishBoss, 0);
  assert.equal(f.ctx.amir.ultimateHit(), true);
  assert.equal(fight.health, 0);
  assert.equal(fight.stage, 'retreat');
  assert.equal(fight.won, false, 'the satellite only ends the first round');
  for (let i = 0; i < 20; i++) f.step();
  assert.equal(f.story.phase, 'bossUltimate', 'recovery waits for the rest of the satellite animation');
  f.ctx.shonchik.active = false;
  f.ctx.shonchik.done = true;
  f.until(() => f.story.phase === 'bossRecovery', 'Amir retreats after the satellite impact');
  assert.equal(f.ctx.player.state, 'frozen');
  assert.equal(f.ctx.phone.active, false);
  assert.equal(f.calls.finishBoss, 0);
  assert.equal(f.calls.lift.length, 0, 'the player does not board after round one');
  assert.equal(f.calls.boardLine, 1);
  f.until(() => f.calls.heal.some((k) => k > 0.5), 'the seated head-shaking beat plays');
  assert.equal(fight.health, 0);
  f.until(() => f.calls.heal.some((k) => k > 0.8), 'the recovery animation restores health after the pose');
  assert.ok(fight.health > 0 && fight.health < fight.maxHealth);
  f.until(() => f.story.phase === 'bossFight' && fight.round === 2, 'Amir returns for round two');
  assert.equal(f.calls.recovery, 1);
  assert.equal(f.calls.roundTwo, 1);
  assert.equal(fight.health, fight.maxHealth);
  assert.equal(fight.playerHealth, 2, 'Amir recovering does not heal the player');
  assert.equal(fight.hits, 0);
  assert.equal(fight.ultimateReady, false);
  assert.equal(fight.won, false);
  assert.equal(f.ctx.player.state, 'free');
  assert.equal(f.ctx.phone.active, true);
  assert.equal(f.calls.phoneStart, 2, 'ADAM resumes calling in round two');
  assert.equal(f.calls.startBoss, 1, 'round two does not restart round one');
  assert.ok(f.calls.retreat.includes(1));
  assert.ok(f.calls.heal.includes(1));
  assert.ok(f.calls.returning.includes(1));
  f.step(['KeyR']);
  assert.equal(f.story.phase, 'bossFight');
  assert.equal(f.calls.shaikale, 0, 'the second ultimate starts uncharged');
  f.chargeUltimate();
  f.ctx.phone.blocksAttacks = true;
  f.step(['KeyR']);
  assert.equal(f.story.phase, 'bossFight', 'answering ADAM also blocks the second ultimate');
  assert.equal(f.calls.shaikale, 0);
  f.ctx.phone.blocksAttacks = false;
  f.step(['KeyR']);
  assert.equal(f.story.phase, 'bossFinisher');
  f.until(() => f.calls.shaikale === 1, 'SHAIKALE POOPALE arrives');
  assert.equal(fight.won, false, 'summoning does not win before the grab');
  assert.equal(f.ctx.player.state, 'frozen');
  assert.equal(f.ctx.phone.active, false);
  f.ctx.shaikale.grabbed = true;
  for (let i = 0; i < 20; i++) f.step();
  assert.equal(f.story.phase, 'bossFinisher', 'carrying Amir does not skip the flight');
  assert.equal(fight.won, false);
  assert.equal(f.calls.finishBoss, 0);
  assert.equal(f.ctx.amir.ultimateHit(), true);
  assert.equal(fight.won, true);
  for (let i = 0; i < 20; i++) f.step();
  assert.equal(f.story.phase, 'bossFinisher', 'victory waits for the completed carry animation');
  f.ctx.shaikale.active = false;
  f.ctx.shaikale.done = true;
  f.until(() => f.story.phase === 'bossVictory', 'the completed flight defeats Amir');
  f.until(() => f.story.phase === 'office' && !f.story.runner.co, 'the elevator reaches the office corridor');
  assert.equal(f.calls.startBoss, 1);
  assert.equal(f.calls.finishBoss, 1);
  assert.equal(f.calls.boardLine, 1);
  assert.deepEqual(f.calls.floorStops, [[5, 1], [7, 2], [9, 4]]);
  assert.deepEqual(f.calls.lift, [L.OFFICE_Y]);
  assert.equal(f.calls.explode, 1);
  assert.equal(f.ctx.player.pos.y, L.OFFICE_Y);
  assert.equal(f.ctx.player.state, 'free');
  assert.ok(f.story.stranger, 'the existing officer on floor 14 still appears');
  for (let i = 0; i < 40; i++) f.step();
  assert.equal(f.calls.finishBoss, 1);
  assert.equal(f.calls.boardLine, 1);
  assert.equal(f.calls.explode, 1);
  f.ctx.player.place(-198.2, -174, 0, L.OFFICE_Y);
  f.step();
  assert.equal(f.story.phase, 'crash');
  f.until(() => f.story.phase === 'officeFree', 'the existing office arrival scene finishes');
  assert.equal(f.story.officer.ch.root.visible, true);
  f.ctx.player.place(L.CHAIR.x, L.CHAIR.z, 0, L.OFFICE_Y);
  f.step(['KeyE']);
  assert.equal(f.story.phase, 'end');
  f.until(() => f.calls.hud.some(({ method }) => method === 'end'), 'sitting at the desk completes the game');
  const endings = f.calls.hud.filter(({ method }) => method === 'end');
  assert.equal(endings.length, 1);
  assert.match(endings[0].args[0], /Amir: <b>defeated<\/b>/);
});


test('losing round two retries that round and resets the finisher without replaying the satellite', () => {
  const f = fixture();
  f.beginFight();
  const fight = f.beginRoundTwo();
  const resetsBeforeLoss = f.calls.shaikaleReset;
  f.ctx.shaikale.done = true;
  fight.active = false;
  fight.lost = true;
  fight.playerHealth = 0;
  f.step();
  assert.equal(f.ctx.player.state, 'frozen');
  assert.equal(f.ctx.phone.active, false);
  f.step(['KeyE']);
  assert.equal(f.story.phase, 'bossFight');
  assert.equal(fight.round, 2);
  assert.equal(fight.stage, 'windup');
  assert.equal(fight.health, fight.maxHealth);
  assert.equal(fight.playerHealth, fight.maxPlayerHealth);
  assert.equal(fight.hits, 0);
  assert.equal(fight.ultimateReady, false);
  assert.equal(f.ctx.player.state, 'free');
  assert.equal(f.ctx.phone.active, true);
  assert.equal(f.ctx.shaikale.done, false);
  assert.equal(f.calls.shaikaleReset, resetsBeforeLoss + 1);
  assert.equal(f.calls.retryBoss, 1);
  assert.equal(f.calls.startBoss, 1);
  assert.equal(f.calls.shonchik, 1);
  assert.equal(f.calls.roundTwo, 1);
  assert.equal(f.calls.boardLine, 1);
  assert.equal(f.calls.finishBoss, 0);
});
