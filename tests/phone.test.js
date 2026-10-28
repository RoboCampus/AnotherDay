import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/phone.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export class Phone', 'class Phone');

function fixture() {
  const events = [];
  const recorder = (source) => new Proxy({}, {
    get: (_, method) => (...args) => events.push({ source, method, args }),
  });
  const Phone = vm.runInNewContext(`${source}\nPhone`, { audio: recorder('audio') }, { filename: 'src/phone.js' });
  const pressed = new Set();
  const ctx = {
    player: { mode: null, state: 'free' }, story: { phase: 'bossFight' },
    hud: recorder('hud'), input: { hit: (key) => pressed.has(key) },
  };
  const phone = new Phone(ctx);
  ctx.phone = phone;
  function step(keys = [], dt = 0.05) {
    for (const key of keys) pressed.add(key);
    phone.update(dt);
    pressed.clear();
  }
  function ringAdam() {
    phone.startBoss(0);
    step();
    assert.ok(phone.call);
    assert.equal(phone.call.caller, 'ADAM');
    assert.equal(phone.call.state, 'ringing');
  }
  return { ctx, phone, events, step, ringAdam };
}

test('answering ADAM asks about the satellite and blocks attacks until the conversation ends', () => {
  const f = fixture();
  f.ringAdam();
  assert.equal(f.phone.blocksAttacks, false, 'ringing alone does not block attacks');
  f.step(['KeyY']);
  assert.equal(f.phone.call.state, 'talking');
  assert.equal(f.phone.adamAnswered, 1);
  assert.equal(f.phone.blocksAttacks, true);
  assert.equal(f.ctx.player.mode, 'phone');
  const dialogue = f.events.filter(({ source, method }) => source === 'hud' && method === 'phoneTalk');
  assert.ok(dialogue.some(({ args }) => args.some((arg) => typeof arg === 'string' && /satellite/i.test(arg))));
  for (let i = 0; i < 300 && f.phone.call; i++) f.step();
  assert.equal(f.phone.call, null);
  assert.equal(f.phone.blocksAttacks, false);
  assert.equal(f.ctx.player.mode, null);
  assert.equal(f.phone.adamMissed, 0);
});

test('declining ADAM preserves normal attacks and records a missed call', () => {
  const f = fixture();
  f.ringAdam();
  f.step(['KeyN']);
  assert.equal(f.phone.call, null);
  assert.equal(f.phone.blocksAttacks, false);
  assert.equal(f.ctx.player.mode, null);
  assert.equal(f.phone.adamAnswered, 0);
  assert.equal(f.phone.adamMissed, 1);
  assert.equal(f.events.some(({ method }) => method === 'phoneTalk'), false);
});

test('an unanswered ADAM call times out without blocking attacks', () => {
  const f = fixture();
  f.ringAdam();
  f.step([], 8);
  assert.equal(f.phone.call, null);
  assert.equal(f.phone.blocksAttacks, false);
  assert.equal(f.phone.adamAnswered, 0);
  assert.equal(f.phone.adamMissed, 1);
  assert.equal(f.ctx.player.mode, null);
});

test('stopping boss calls clears attack blocking and restores the original caller', () => {
  const f = fixture();
  f.ringAdam();
  f.step(['KeyY']);
  assert.equal(f.phone.blocksAttacks, true);
  f.phone.stopBoss();
  assert.equal(f.phone.active, false);
  assert.equal(f.phone.call, null);
  assert.equal(f.phone.blocksAttacks, false);
  assert.equal(f.ctx.player.mode, null);
  f.ctx.story.phase = 'queue';
  f.phone.start(0);
  f.step();
  assert.ok(f.phone.call);
  assert.notEqual(f.phone.call.caller, 'ADAM');
  const rings = f.events.filter(({ source, method }) => source === 'hud' && method === 'phoneRing');
  assert.ok(rings[0].args.includes('ADAM'));
  assert.ok(rings.at(-1).args.includes('DO NOT ANSWER'));
});
