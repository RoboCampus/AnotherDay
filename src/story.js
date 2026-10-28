import * as THREE from 'three';
import * as L from './layout.js';
import { audio } from './audio.js';
import { createCharacter, animate, addLabel, LOOKS, OLIVE } from './character.js';
import { soldier } from './npcs.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (k) => k * k * (3 - 2 * k);

const SPEAKERS = {
  argaman: ['ARGAMAN', '#d08cff', 'argaman'],
  gate: ['GATE GUARD', '#9fd3ff', 'gate'],
  nice: ['NICE SOLDIER', '#7ef0a0', 'nice'],
  officer: ['BLUE OFFICER', '#7fb4ff', 'officer'],
  meteo: ['METEOROLOGIST', '#ffe082', 'meteo'],
  amir: ['AMIR', '#ff5a5a', 'gate'],
  shonchik: ['SHONCHIK', '#7ef0a0', 'wide'],
  shaikale: ['SHAIKALE POOPALE', '#7fb4ff', 'officer'],
  // Argaman's office
  wide: ['WIDE GUY', '#ffb74d', 'wide'],
  tall: ['TALL GUY', '#c5e1a5', 'tall'],
  monkey: ['MONKEY', '#bcaaa4', 'monkey'],
  kipa: ['KIPA GUY', '#90caf9', 'kipa'],
  beard: ['BEARDED SOLDIER', '#a5d6a7', 'beard'],
  stranger: ['OFFICER', '#ffcc80', 'gate'],
};

// Runs one generator "script" at a time. A script yields:
//   a number      – wait that many seconds
//   { skip: s }   – wait s seconds, E / Enter skips (dialogue)
//   a function    – wait until it returns true
//   null          – wait one frame
class Runner {
  constructor(ctx) {
    this.ctx = ctx;
    this.co = null;
  }

  run(gen) {
    this.co = gen;
    this.wait = 0;
    this.until = null;
    this.advance();
  }

  update(dt) {
    if (!this.co) return;
    if (this.until) {
      if (!this.until()) return;
      this.until = null;
    } else if (this.wait > 0) {
      const input = this.ctx.input;
      if (this.skip && (input.hit('KeyE') || input.hit('Enter'))) this.wait = 0;
      else if ((this.wait -= dt) > 0) return;
    }
    this.advance();
  }

  advance() {
    while (this.co) {
      const co = this.co;
      const r = co.next();
      if (this.co !== co) return; // the script started another one
      if (r.done) {
        this.co = null;
        return;
      }
      const v = r.value;
      this.wait = 0;
      this.until = null;
      this.skip = false;
      if (v == null) return;
      if (typeof v === 'number') {
        if (v > 0) {
          this.wait = v;
          return;
        }
      } else if (typeof v === 'function') {
        if (!v()) {
          this.until = v;
          return;
        }
      } else if (v.skip != null) {
        this.wait = v.skip;
        this.skip = true;
        return;
      }
    }
  }
}

export class Story {
  constructor(ctx) {
    this.ctx = ctx;
    this.runner = new Runner(ctx);
    this.phase = 'menu';
    this.time = 0;
    this.playTime = 0;
    this.throws = 0;
    this.cp = 0;
    this.tweens = [];
    this.nice = null;
    this.complainT = 0;
    this.lineT = 0;
    this.poopCount = 0;
    // the blue officer in the lobby of Argaman's building
    const o = createCharacter({ ...LOOKS.officer, beard: true, hair: '#111' });
    addLabel(o, 'BLUE OFFICER', '#7fb4ff');
    o.root.visible = false; // he only shows up through the office window
    o.root.rotation.order = 'YXZ'; // so he can lean into his flight
    ctx.scene.add(o.root);
    this.officer = { ch: o, pos: o.root.position, talk: false, heading: Math.PI / 2, mode: 'strain', lean: 0, flying: false };
  }

  // ------------------------------------------------------------------ helpers
  *say(who, text, dur = null) {
    const [name, color, voice] = SPEAKERS[who];
    const d = dur ?? Math.max(1.8, 1 + text.length * 0.055);
    this.ctx.hud.subtitle(name, text, color);
    audio.say(text, voice);
    this.setTalk(who, true, d);
    yield { skip: d };
    this.setTalk(who, false, 0);
    this.ctx.hud.subtitle(null, null);
  }

  setTalk(who, on, d) {
    const { player, line } = this.ctx;
    if (who === 'argaman') player.talk = on;
    else if (who === 'gate') line.guards[0].talkT = on ? d : 0;
    else if (who === 'nice' && this.nice) this.nice.talk = on;
    else if (who === 'officer') this.officer.talk = on;
    else if (who === 'amir') this.ctx.amir.talk = on;
    else if (who === 'shonchik') this.ctx.shonchik.talk = on;
    else if (who === 'shaikale') this.ctx.shaikale.talk = on;
    else if (who === 'stranger' && this.stranger) this.stranger.talk = on;
    else {
      const c = this.ctx.city.building.floor14.crew[who];
      if (c) c.talk = on;
    }
  }

  *wait(s) {
    yield s;
  }

  *tween(d, fn) {
    const t0 = this.time;
    fn(0);
    while (this.time - t0 < d) {
      fn(Math.min(1, (this.time - t0) / d));
      yield null;
    }
    fn(1);
  }

  bgTween(d, fn) {
    this.tweens.push({ t: 0, d, fn });
  }

  *fadeOut(d = 0.5) {
    yield* this.tween(d, (k) => this.ctx.hud.fade(k));
  }

  *fadeIn(d = 0.5) {
    yield* this.tween(d, (k) => this.ctx.hud.fade(1 - k));
  }

  cam(pos, look, speed = 3, snap = false) {
    const p = this.ctx.player;
    p.camOverride = { pos, look, speed };
    if (snap) p.snapCamera();
  }

  uncam() {
    const p = this.ctx.player;
    p.camOverride = null;
  }

  // ------------------------------------------------------------------ the story
  start() {
    this.runner.run(this.intro());
  }

  *intro() {
    const { player, hud, train, guards } = this.ctx;
    const P = L.PLATFORM, z = L.START.z;
    this.phase = 'intro';
    guards.active = false;
    hud.fade(1);
    player.place(L.TRACK_X + 0.6, z, Math.PI / 2, P.y);
    player.state = 'frozen';
    this.cam(V(147.2, P.y + 2.3, z + 6.5), V(140.8, P.y + 1.4, z), 2, true);
    yield 0.3;
    yield* this.fadeIn(1.2);
    hud.title('ARGAMAN', 'Mission: get to the office', 3.5);
    hud.subtitle('', 'Tel Aviv · HaShalom station', '#fff');
    yield 2;
    hud.subtitle(null, null);
    audio.chime();
    yield 0.8;
    yield* this.tween(0.9, (k) => train.openDoor(k));
    player.walkTo(143.6, z, 2.4);
    yield () => player.arrived;
    player.state = 'frozen';
    player.heading = Math.PI;
    yield* this.say('argaman', 'Okay. Another day at the Kirya.');
    yield* this.tween(0.6, (k) => train.openDoor(1 - k));
    train.depart();
    // "we see before us the Kirya"
    yield* this.fadeOut(0.5);
    const MC = L.MATCAL;
    // from the Begin / HaShalom corner (Azrieli blocks the view from the bridge itself)
    this.cam(V(32, 8, 14), V(MC.tx, 48, MC.tz), 1, true);
    yield* this.fadeIn(0.6);
    hud.title('THE KIRYA', 'IDF headquarters · Tel Aviv', 4.5);
    this.ctx.player.camOverride.look = V(-150, 6, -222);
    this.ctx.player.camOverride.speed = 0.35;
    yield* this.say('argaman', 'There it is. The Kirya. The gate is on Kaplan Street, by the Matcal tower.', 4.5);
    // the meteorologists
    const g = guards.list[0];
    g.waitT = 8; // hold still for the close-up
    yield* this.fadeOut(0.3);
    this.cam(V(g.pos.x - 2.6, 2.2, g.pos.z + 3.4), V(g.pos.x, 1.9, g.pos.z), 1.5, true);
    yield* this.fadeIn(0.3);
    yield 1.2;
    hud.bubble(g, 'Humidity 64%. Chance of Argaman: zero.');
    audio.say('Humidity sixty four percent. Chance of Argaman: zero.', 'meteo');
    yield 2.6;
    yield* this.say('argaman', "Meteorologists. If they see me, they throw me away from the Kirya. At two hundred kilometers per hour.", 4.8);
    yield* this.fadeOut(0.5);
    this.uncam();
    player.place(143.4, 42, Math.PI); // on the platform, facing the stairs up to the bridge
    player.pitch = -0.12;
    player.snapCamera();
    this.beginSneak();
    yield* this.fadeIn(0.6);
  }

  beginSneak() {
    const { player, hud, guards } = this.ctx;
    this.phase = 'sneak';
    player.state = 'free';
    guards.active = true;
    hud.objective('Reach the line at the Kirya gate (Kaplan St) without being seen by the meteorologists');
    hud.hint('<b>WASD</b> move · <b>Shift</b> run (noisy) · <b>C</b> sneak · <b>Space</b> jump<br><b>F / click</b> throw the kipa to stun meteorologists · crouch in a <b>bush</b> to hide');
  }

  thrown(by) {
    this.throws++;
    if (by === this.ctx.amir) this.ctx.hud.title('ZAPPED!', 'Amir sees everything. Out the door at 200 km/h', 2.8);
    else this.ctx.hud.title('YEET!', 'Thrown away from the Kirya at 200 km/h', 2.6);
    this.runner.run(this.respawn());
  }

  *respawn() {
    const { player, hud, guards, andrey } = this.ctx;
    yield () => player.flight?.landed && player.flight.landT > 1.3;
    yield* this.fadeOut(0.5);
    guards.reset();
    andrey.vanish();
    this.ctx.amir.reset();
    const cp = L.CHECKPOINTS[this.cp];
    player.state = 'free';
    player.flight = null;
    player.place(cp.x, cp.z, cp.heading);
    hud.speed(null);
    hud.stats(this.throws, this.ctx.phone.missed);
    yield* this.fadeIn(0.5);
    if (this.cp >= 3) hud.toast('Tip: hide behind pillars and groups of soldiers while Amir looks your way', 4.5);
    else if (this.cp >= 2) hud.toast('Tip: press Q. Meteorologists cannot resist Andrey.', 4);
    else hud.toast(this.throws === 1 ? 'Tip: hold C to sneak, and crouch in bushes to hide' : `Thrown ×${this.throws}. Watch the cones on the minimap.`, 4);
  }

  *joinLine() {
    const { line, hud, guards, phone, marker } = this.ctx;
    line.join();
    this.phase = 'queue';
    this.lineT = 0;
    guards.active = false;
    marker.hide();
    hud.prompt(null);
    hud.objective('Wait in line to talk to the gate guards');
    hud.hint('<b>Y</b> answer · <b>N</b> decline · <b>WASD</b> leave the line (you lose your place)');
    phone.start(3);
    yield* this.say('argaman', 'Great. A line.', 1.8);
  }

  leaveLine() {
    const { line, hud, phone, player } = this.ctx;
    line.leave();
    phone.stop();
    player.state = 'free';
    player.mode = null;
    this.beginSneak();
    hud.toast('You left the line! Back to the end of it.', 3, '#ffb020');
  }

  *gate() {
    const { player, hud, line, phone, fx, city } = this.ctx;
    this.phase = 'gate';
    line.running = false;
    hud.prompt(null);
    hud.hint('<b>E</b> skip dialogue');
    player.walkTo(-135.3, -226.3, 1.6);
    yield () => player.arrived;
    player.state = 'frozen';
    const gg = line.guards[0];
    player.face(gg.pos.x, gg.pos.z);
    gg.heading = Math.atan2(player.pos.x - gg.pos.x, player.pos.z - gg.pos.z);
    this.cam(V(-132.6, 2.3, -230.8), V(-136.6, 1.45, -225.6), 2.5);
    yield* this.say('argaman', "Hi. I'm Argaman. I need to get in.");
    yield* this.say('gate', "You can't enter. There's no permission.");
    yield* this.say('argaman', 'But... I work here. Level fourteen.');
    yield* this.say('gate', 'No permission. Ein ishur.');
    yield 0.4;
    // a nice soldier comes over from inside the Kirya
    const ch = soldier({ cap: 'beret', beret: '#4f6b2d', ponytail: true, hair: '#6b4a2b', skin: '#e8c09a' });
    addLabel(ch, 'NICE SOLDIER', '#7ef0a0');
    this.ctx.scene.add(ch.root);
    this.nice = { ch, pos: V(-150, 0, -192), heading: Math.PI, target: V(-145.6, 0, -220.6), talk: false, mode: null };
    this.cam(V(-139, 3.2, -231.5), V(-147, 1.4, -214), 1.6);
    yield* this.say('nice', 'Argaman! Hey! Wait, don\'t go anywhere!', 2.6);
    yield () => !this.nice.target;
    this.nice.heading = Math.atan2(player.pos.x - this.nice.pos.x, player.pos.z - this.nice.pos.z);
    yield* this.say('nice', "He's with me. Open the gate for him.");
    yield* this.say('gate', 'Still no permission.');
    this.nice.mode = 'cheer';
    yield* this.say('nice', 'Fine. Then we ask for a higher permission.', 2.6);
    // the storm
    phone.stop();
    this.cam(V(-122, 10, -250), V(-150, 5, -220), 1.2);
    audio.rumble();
    yield* this.tween(2.2, (k) => this.ctx.setStorm(k));
    yield 0.6;
    const hit = V((L.GATE.x0 + L.GATE.x1) / 2, 0.5, L.KIRYA.z0);
    fx.lightning.strike(hit);
    hud.flash();
    audio.thunder();
    this.ctx.shake = 1.4;
    fx.emit(V(hit.x, 1.5, hit.z), 160, { color: '#bfe0ff', speed: 14, life: 1.2 });
    fx.emit(V(hit.x, 1, hit.z), 60, { color: '#ffb84d', speed: 8, life: 1.6 });
    for (const g of line.guards) g.down = true;
    this.nice.mode = null;
    yield* this.tween(0.45, (k) => city.gate.set(k));
    // right as the gates open, the guards jump up with one last question
    yield 0.9;
    for (const g of line.guards) g.down = false;
    this.bgTween(3, (k) => this.ctx.setStorm(1 - k));
    this.cam(V(-132.6, 2.3, -230.8), V(-136.6, 1.45, -225.6), 3);
    yield* this.say('gate', 'Wait! Do you have sivug?', 2.2);
    yield 1.1; // Argaman stares
    yield* this.say('gate', '...Never mind.', 1.8);
    this.nice.heading = Math.atan2(player.pos.x - this.nice.pos.x, player.pos.z - this.nice.pos.z);
    this.nice.mode = 'wave';
    yield* this.say('nice', 'Welcome in, Argaman! Your building is right there, on the right.', 3.4);
    yield* this.say('nice', 'Careful, meteorologists guard it now. Need a distraction? Call Andrey.', 3.8);
    this.uncam();
    player.yaw = Math.PI * 0.05;
    this.enterKirya();
    const an = this.ctx.andrey;
    an.unlocked = true;
    an.cd = 0;
    hud.title('NEW ABILITY', 'Q · Summon Andrey', 3.5);
    hud.abilityNew('andrey');
    audio.ding();
    const B = L.BUILDING;
    this.ctx.marker.set(B.x1 + 2, 0, (L.DOOR.z0 + L.DOOR.z1) / 2);
  }

  // Through the gate: the inner patrols take over, checkpoint just inside.
  enterKirya() {
    const { player, hud, guards } = this.ctx;
    player.state = 'free';
    this.phase = 'inside';
    this.cp = 2;
    guards.zone = 'in';
    guards.active = true;
    hud.objective('Get into your building (on the right). Meteorologists guard it: distract them with Andrey');
    hud.hint('<b>WASD</b> move · <b>Shift</b> run · <b>C</b> sneak<br><b>Q</b> summon Andrey: he runs where you look and every meteorologist nearby stares at him');
  }

  *lobby() {
    const { player, hud, marker, guards } = this.ctx;
    this.phase = 'lobby';
    guards.active = false;
    marker.hide();
    player.state = 'frozen';
    player.vel.set(0, 0, 0);
    hud.hint('<b>E</b> skip dialogue');
    // the hall: soldiers everywhere, meteorologists among them, and Amir at the entrance to the Pit
    const A = L.AMIR;
    this.cam(V(A.x + 2.2, 2.4, A.z - 4.2), V(A.x, 1.9, A.z), 1.6, true);
    hud.title('AMIR', 'Guards the entrance to the Pit', 3);
    yield 1.2;
    yield* this.say('argaman', 'Amir. Guarding the Pit. Red eyes, sees everything.', 3);
    this.cam(V(-196, 9, -150), V(-214, 0, -182), 1.2);
    yield* this.say('argaman', "His eyes are shielded. I'll hide while he looks this way. If he gets tired, maybe that shield drops.", 4.2);
    this.uncam();
    player.yaw = player.heading;
    player.state = 'free';
    this.phase = 'lobbyFree';
    this.cp = 3;
    guards.active = true;
    hud.objective('Get to the line for the elevators. Stay out of sight of the meteorologists, and of Amir guarding the Pit');
    hud.hint('<b>WASD</b> move · <b>C</b> sneak · <b>E</b> interact · <b>Q</b> Andrey<br>Amir (red eyes) ignores Andrey: hide behind pillars or groups of soldiers while he looks your way');
    const es = this.ctx.elevator.endSlot;
    marker.set(es.x, 0, es.z, false);
  }

  // wait until fn() is true, or max seconds at most
  *until(fn, max) {
    const t0 = this.time;
    yield () => fn() || this.time - t0 > max;
  }

  // ------------------------------------------------------------------ the elevator
  *elevatorLine() {
    const { player, hud, marker, guards, andrey, elevator: ev } = this.ctx;
    this.phase = 'elevatorLine';
    guards.active = false;
    andrey.vanish();
    hud.prompt(null);
    marker.hide();
    const s = ev.endSlot;
    player.walkTo(s.x, s.z, 1.6);
    yield* this.until(() => player.arrived, 4);
    player.state = 'frozen';
    player.heading = -Math.PI / 2;
    hud.objective('Wait for the elevator');
    hud.hint('<b>E</b> skip dialogue');
    yield* this.say('argaman', 'Of course. Another line.', 2.2);
    audio.ding();
    yield* this.tween(0.8, (k) => this.ctx.city.building.setElevator('lobby', k));
    ev.boardLine();
    ev.lineBoarded = true;
    yield* this.until(() => ev.seated, 12);
    this.phase = 'elevatorFull';
    hud.objective('Try to squeeze into the lift');
    this.cam(V(-217, 2.8, -183), V(-222.7, 1.1, -188), 3, true);
    ev.prepareKick();
    // Walk all the way to the doorway, then step inside before being refused.
    player.walkTo(ev.door.x, ev.door.z, 2.4);
    yield* this.until(() => player.arrived, 6);
    player.walkTo(L.CORE.x1 - 0.3, ev.door.z, 1.3);
    yield* this.until(() => player.arrived, 2);
    player.state = 'frozen';
    player.vel.set(0, 0, 0);
    player.heading = -Math.PI / 2;
    hud.title('LIFT FULL', 'No room left', 2.4);
    yield* this.say('stranger', 'Full. No more places.', 1.8);
    yield* this.say('argaman', 'I only need one place.', 1.7);
    this.phase = 'elevatorKick';
    hud.objective('Kicked out of the full lift');
    hud.subtitle('OFFICER', 'No room. Out!', '#9fd3ff');
    audio.say('No room. Out!', 'gate');
    ev.kick();
    yield 0.22;
    const from = player.pos.clone(), landingX = L.CORE.x1 + 4.6;
    // Script this short knockback independently of the meteorologists' long throws.
    player.state = 'grabbed';
    player.vel.set(0, 0, 0);
    audio.whoosh();
    audio.splat();
    this.ctx.shake = Math.max(this.ctx.shake || 0, 0.35);
    yield* this.tween(0.85, (k) => {
      player.pos.set(from.x + (landingX - from.x) * k, 0.72 * Math.sin(Math.PI * k), from.z);
    });
    ev.finishKick();
    player.pos.set(landingX, 0, from.z);
    player.state = 'frozen';
    player.mode = 'down';
    player.onGround = true;
    player.vy = 0;
    player.vel.set(0, 0, 0);
    audio.splat();
    this.ctx.fx.emit(player.pos.clone(), 24, { color: '#cbb894', speed: 4, life: 0.6 });
    hud.title('KICKED OUT', 'The lift is full', 2.2);
    yield 0.9;
    hud.subtitle(null, null);
    player.mode = null;
    yield* this.tween(0.7, (k) => this.ctx.city.building.setElevator('lobby', 1 - k));
    yield* this.bossIntro();
  }

  // The full lift draws Amir away from the Pit. His eye shield only drops after an attack.
  *bossIntro() {
    const { player, hud, amir, phone } = this.ctx;
    this.phase = 'bossIntro';
    phone.stop();
    hud.objective('The elevator is full. Amir wants the last place.');
    yield* this.fadeOut(0.35);
    amir.pos.set(-216, 0, -196);
    amir.offset = Math.atan2(6, 8) - Math.PI;
    player.place(-210, -188, Math.atan2(-6, -8), 0);
    player.state = 'frozen';
    this.cam(V(-205, 3.8, -185), V(-216, 1.5, -196), 3, true);
    yield* this.fadeIn(0.35);
    hud.title('AMIR', 'Boss fight · The last place in the lift', 3.2);
    yield* this.say('amir', 'That last place is mine, Argaman.', 2.5);
    yield* this.say('argaman', 'Then we have a problem.', 2);
    yield* this.say('amir', 'RED EYES. PRIORITY BOARDING.', 2.5);
    this.uncam();
    player.snapCamera();
    this.beginBossFight();
  }

  beginBossFight(retry = false) {
    const { player, amir, kipa, hud, guards, andrey, marker } = this.ctx;
    this.phase = 'bossFight';
    guards.active = false;
    andrey.vanish();
    player.mode = null;
    player.moveLocked = false;
    player.flight = null;
    player.onGround = true;
    player.place(-210, -188, Math.atan2(-6, -8), 0);
    player.pitch = -0.08;
    player.state = 'free';
    this.uncam();
    player.snapCamera();
    kipa.reset();
    if (retry) amir.retryBoss();
    else amir.startBoss();
    this.ctx.shonchik.reset();
    this.ctx.shaikale.reset();
    this.ctx.phone.startBoss();
    hud.prompt(null);
    hud.subtitle(null, null);
    hud.objective('Defeat Amir to earn a place in the lift');
    this.bossHint();
    marker.set(amir.pos.x, 0, amir.pos.z, false);
  }

  bossHint() {
    const special = this.ctx.amir.fight.round === 2 ? 'Shaikale Poopale' : 'the Shonchik satellite';
    this.ctx.hud.hint(`<b>WASD + Shift</b> run out of the landing circle · <b>F / click</b> kipa when his eyes turn gold<br>Land <b>3 kipa hits</b> to charge <b>R</b> ${special} · <b>Y / N</b> answer / decline ADAM`);
  }

  startSecondRound() {
    const { player, amir, kipa, phone, hud, marker } = this.ctx;
    player.place(-210, -188, Math.atan2(-6, -8), 0);
    player.state = 'free';
    player.mode = null;
    player.pitch = -0.08;
    amir.startRoundTwo();
    this.phase = 'bossFight';
    kipa.reset();
    phone.startBoss(4);
    this.uncam();
    player.snapCamera();
    hud.prompt(null);
    hud.subtitle(null, null);
    hud.title('ROUND TWO', 'New special · Shaikale Poopale', 3);
    hud.objective('Amir has healed. Charge Shaikale Poopale to finish the fight.');
    this.bossHint();
    marker.set(amir.pos.x, 0, amir.pos.z, false);
  }

  *bossRecovery() {
    const { player, amir, phone, hud, marker } = this.ctx;
    this.phase = 'bossRecovery';
    phone.stop();
    player.state = 'frozen';
    player.vel.set(0, 0, 0);
    marker.hide();
    hud.prompt(null);
    hud.hint('');
    hud.objective('Amir is retreating to the officer at the desk');
    hud.title('NOT OVER YET', 'Amir has a second wind', 2.4);
    amir.beginRecovery();
    this.cam(V(-214, 4.8, -178), V(-208, 1.5, -199), 3, true);
    yield* this.tween(3, (k) => amir.animateRetreat(k));
    // Hold the approved front oblique view through seating, healing, and departure.
    this.cam(V(-206.8, 2.05, -198.7), V(-203, 1, -201.8), 3, true);
    hud.objective('Amir is recovering');
    hud.subtitle('WOMAN OFFICER', 'Take a breath, Amir. One more round.', '#9fd3ff');
    audio.say('Take a breath, Amir. One more round.', 'nice');
    yield* this.tween(4.4, (k) => amir.animateHeal(k));
    hud.subtitle(null, null);
    hud.title('HP RESTORED', 'Amir is coming back for round two', 2.5);
    yield* this.tween(2.5, (k) => amir.animateReturn(k));
    this.startSecondRound();
  }

  *bossFinisher() {
    const { player, amir, shaikale, phone, hud, marker } = this.ctx;
    if (phone.blocksAttacks || !amir.useUltimate()) return;
    this.phase = 'bossFinisher';
    phone.stop();
    player.state = 'frozen';
    player.vel.set(0, 0, 0);
    player.mode = null;
    marker.hide();
    hud.prompt(null);
    hud.hint('');
    hud.objective('Shaikale Poopale: grab and fly');
    hud.title('SHAIKALE POOPALE', 'Final special · Grab and fly', 2.2);
    hud.toast('', 0);
    this.cam(V(-213, 4.5, -180), V(-209, 1.6, -194), 3, true);
    shaikale.start();
    hud.subtitle('SHAIKALE POOPALE', 'Express flight. One passenger!', '#7fb4ff');
    while (!shaikale.done) {
      if (shaikale.grabbed) {
        const cam = player.camOverride, p = shaikale.pos;
        cam.speed = 9;
        cam.pos.set(p.x - 6, Math.min(3.05, p.y + 1.2), p.z + 2.5);
        cam.look.set(p.x, Math.min(2.8, p.y + 0.4), p.z);
      }
      yield null;
    }
    hud.subtitle(null, null);
    yield* this.bossVictory();
  }

  *bossUltimate() {
    const { player, amir, shonchik, phone, hud, marker } = this.ctx;
    if (phone.blocksAttacks || !amir.useUltimate()) return;
    this.phase = 'bossUltimate';
    phone.stop();
    player.state = 'frozen';
    player.vel.set(0, 0, 0);
    player.mode = null;
    marker.hide();
    hud.prompt(null);
    hud.objective('Shonchik: satellite delivery');
    hud.hint('');
    hud.title('SHONCHIK', 'Ultimate · Satellite delivery', 1.6);
    hud.toast('', 0);
    this.cam(V(-211, 5, -177), V(-210, 1.8, -194), 2.5, true);
    shonchik.start();
    yield* this.say('shonchik', 'New satellite? Special delivery!', 2.5);
    yield () => shonchik.done;
    yield* this.bossRecovery();
  }

  *bossVictory() {
    const { player, amir, hud, marker } = this.ctx;
    this.phase = 'bossVictory';
    this.bossDefeated = true;
    this.ctx.phone.stop();
    amir.finishBoss();
    player.state = 'frozen';
    player.vel.set(0, 0, 0);
    marker.hide();
    hud.prompt(null);
    this.uncam();
    player.snapCamera();
    hud.title('PLACE SECURED', 'Amir defeated · Next stop: level 14', 3.5);
    hud.objective('Board the elevator');
    hud.hint('<b>E</b> skip dialogue');
    audio.fanfare();
    yield* this.say('argaman', 'That is one way to make room.', 2.5);
    yield* this.say('stranger', 'One place available. Going up.', 2.2);
    yield* this.elevatorRide();
  }

  *elevatorRide() {
    const { player, hud, city, elevator: ev, marker } = this.ctx;
    const bld = city.building, K = L.CAB, zc = L.ELEVATOR.z, OY = L.OFFICE_Y;
    this.phase = 'elevator';
    audio.ding();
    yield* this.tween(1.0, (k) => bld.setElevator('lobby', k));
    // the whole line goes in, then Argaman
    if (!ev.lineBoarded) {
      ev.boardLine();
      ev.lineBoarded = true;
      yield 0.45 * L.ELEV_LINE.n;
    }
    const [sx, sz] = ev.takeSlot();
    player.walkTo(ev.door.x, ev.door.z, 2.3);
    yield* this.until(() => player.arrived, 6);
    player.walkTo(sx, sz, 2);
    yield* this.until(() => player.arrived && ev.seated, 8);
    player.state = 'frozen';
    player.heading = Math.PI / 2;
    // inside the cab, from the back corner, over everybody's heads
    this.cam(V(K.x0 + 0.25, 2.65, K.z0 + 0.3), V(L.CORE.x1 + 1.5, 1.1, zc), 3, true);
    yield* this.tween(0.9, (k) => bld.setElevator('lobby', 1 - k));
    hud.elevator(0);
    // floors 1, 2, 3: the doors open and more and more people squeeze in
    const stops = [[5, 1, 'Floor one. Really?'], [7, 2, '...More?'], [9, 4, 'There is no more room. There is NO more room!']];
    for (let f = 1; f <= 3; f++) {
      const [n, officers, line] = stops[f - 1];
      audio.music(1.5);
      yield 1.5;
      hud.elevator(f);
      audio.ding();
      ev.landing.show(f);
      yield* this.tween(0.7, (k) => bld.setElevator('lobby', k));
      ev.floorStop(n, officers);
      if (f === 2) {
        hud.sms('DO NOT ANSWER', 'are you in the elevator?');
        audio.click();
      }
      yield* this.until(() => ev.seated, 9);
      yield* this.say('argaman', line, 2.2);
      if (f === 3) {
        // the doors will not close on the last ones
        for (let i = 0; i < 2; i++) {
          yield* this.tween(0.3, (k) => bld.setElevator('lobby', 1 - k * 0.65));
          audio.splat();
          this.ctx.shake = 0.25;
          yield* this.tween(0.3, (k) => bld.setElevator('lobby', 0.35 + k * 0.65));
        }
        ev.squeeze(0.8);
      }
      yield* this.tween(0.7, (k) => bld.setElevator('lobby', 1 - k));
      ev.landing.hide();
      ev.squeeze(0.92);
    }
    // floors 4-13: skipped
    yield* this.fadeOut(0.4);
    hud.title('FLOORS 4 – 13', 'Skipped. Nobody has time for that.', 2.4);
    audio.music(2.4);
    for (let f = 4; f <= 13; f++) {
      hud.elevator(f);
      yield 0.2;
    }
    // level 14: the cab, and everybody in it, is now the one up here
    ev.lift(OY);
    player.place(player.pos.x, player.pos.z, Math.PI / 2, OY);
    player.state = 'frozen';
    hud.elevator(14);
    // same camera as the whole ride, in the back of the cab, just one level higher
    this.cam(V(K.x0 + 0.25, OY + 2.65, K.z0 + 0.3), V(L.CORE.x1 + 1.5, OY + 1.1, zc), 3, true);
    yield* this.fadeIn(0.5);
    audio.ding();
    yield 0.8;
    hud.elevator(null);
    yield* this.tween(0.25, (k) => bld.setElevator('office', k));
    // ...and they explode out
    ev.explode();
    audio.whoosh();
    audio.splat();
    audio.say('Aaaaaaaaah!', 'meteo');
    this.ctx.shake = 0.9;
    yield 1.4;
    // an officer steps out of room 1402, down the corridor; he talks when Argaman gets close
    const ch = createCharacter({ shirt: OLIVE, pants: OLIVE, cap: 'beret', beret: '#2d2d2d', epaulettes: true, skin: '#e8c09a', hair: '#555', sleeves: 'long', belt: '#3b3a2a' });
    this.ctx.scene.add(ch.root);
    this.stranger = { ch, pos: ch.root.position, heading: Math.PI * 1.5, talk: false, spoke: false };
    this.stranger.pos.set(-213.5, OY, -187.6);
    this.uncam();
    player.yaw = Math.PI / 2;
    player.state = 'free';
    this.phase = 'office';
    hud.objective('Go down the corridor, then right: your office');
    hud.hint('<b>WASD</b> move · <b>Shift</b> run');
    marker.set((L.CORRIDOR2.x0 + L.CORRIDOR2.x1) / 2, OY, L.OFFICE.z0 - 1, false);
    yield* this.say('argaman', '...Level fourteen.', 1.8);
  }

  // the officer on 14 who has never seen Argaman before (Argaman keeps walking if he wants)
  *strangerTalk() {
    this.stranger.spoke = true;
    yield* this.say('stranger', 'Do I know you?', 1.8);
    yield* this.say('stranger', 'Never seen you here in my life.', 2.4);
    yield* this.say('argaman', '...Hi.', 1.4);
  }

  // ------------------------------------------------------------------ the office
  // Argaman walks in, says good morning, and while he is still looking around (he keeps control,
  // the camera stays his) the blue officer comes through the window on a jet of poop. No warning.
  *officerCrash() {
    const { hud, marker, city, poop, fx } = this.ctx;
    const f14 = city.building.floor14, OY = L.OFFICE_Y, B = L.BUILDING;
    this.phase = 'crash';
    marker.hide();
    hud.objective('');
    yield* this.say('argaman', 'Morning, everyone.', 1.8);
    yield* this.say('wide', "Argaman! You're inside!", 2);
    yield* this.say('monkey', 'Ooh ooh! Aah aah!', 1.6);
    yield* this.say('beard', 'Baruch Hashem.', 1.6);
    yield 1.2 + Math.random() * 1.5;
    // from just below the window, straight up and in
    const o = this.officer, x = -198.5;
    const start = V(x, OY - 14, -165), top = V(x, OY + 2.5, -166), win = V(x, OY + 1.0, -171.7);
    o.flying = true;
    o.ch.root.visible = true;
    o.mode = 'cheer';
    o.heading = Math.PI;
    o.lean = 0;
    o.pos.copy(start);
    poop.emitter = { pos: V(), dir: V(0, -1, 0.3), rate: 120, jet: true };
    audio.rumble();
    yield* this.tween(0.8, (k) => o.pos.lerpVectors(start, top, ease(k)));
    f14.lookAt(V(x, OY + 1.5, B.z1));
    let broke = false;
    yield* this.tween(0.35, (k) => {
      o.pos.lerpVectors(top, win, k);
      o.lean = k * 1.3;
      if (k > 0.5 && !broke) {
        broke = true;
        f14.breakWindow();
        audio.glass();
        fx.emit(V(x, OY + 2, B.z1 - 0.2), 140, { color: '#cfe8ff', speed: 7, life: 1.2, up: 1 });
        this.ctx.shake = 1.1;
      }
    });
    // superhero landing
    o.lean = 0;
    o.mode = 'strain';
    o.flying = false;
    o.pos.copy(win).setY(OY);
    audio.splat();
    poop.emitter = { pos: V(x, OY + 0.8, win.z + 0.25), dir: V(0, 0, 1), rate: 5 };
    hud.bubble(this.crewMember('monkey'), 'AAH AAH AAH!!', true);
    yield 1.2;
    yield* this.say('officer', '...Good morning.', 2);
    yield* this.say('kipa', 'Can someone close the window?', 2.2);
    f14.lookAt(null);
    this.phase = 'officeFree';
    hud.objective('Sit down at your desk');
    hud.hint('<b>WASD</b> move · <b>E</b> sit');
    marker.set(L.CHAIR.x, OY, L.CHAIR.z, false);
  }

  crewMember(who) {
    return this.ctx.city.building.floor14.crew[who];
  }

  *ending() {
    const { player, hud, marker, phone } = this.ctx;
    this.phase = 'end';
    marker.hide();
    hud.prompt(null);
    hud.objective('');
    hud.hint('');
    player.state = 'frozen';
    player.place(L.CHAIR.x, L.CHAIR.z, 0, L.OFFICE_Y);
    player.mode = 'sit';
    const OY = L.OFFICE_Y;
    this.cam(V(-194.7, OY + 1.9, -171.5), V(L.CHAIR.x, OY + 1.1, L.CHAIR.z), 2, true);
    yield 0.8;
    yield* this.say('argaman', "I'm in.", 1.8);
    hud.sms('DO NOT ANSWER', 'are you inside?');
    audio.click();
    yield 1.6;
    yield* this.say('argaman', '...Yes.', 1.6);
    audio.fanfare();
    const look = V(L.CHAIR.x, OY + 1, L.CHAIR.z);
    this.cam(V(-202.6, OY + 3.3, -176.8), V(-197.5, OY + 0.8, -172.5), 0.6); // the whole office: crew, officer, broken window
    yield 2.2;
    const t = this.playTime, mm = Math.floor(t / 60), ss = String(Math.floor(t % 60)).padStart(2, '0');
    hud.end(
      `Time: <b>${mm}:${ss}</b><br>Thrown by meteorologists at 200 km/h: <b>${this.throws}</b><br>` +
      `Calls from DO NOT ANSWER: <b>${phone.answered + phone.missed}</b> (${phone.missed} missed)<br>` +
      `Meteorologists knocked out by kipa: <b>${this.ctx.kipa.bonks}</b><br>` +
      (this.bossDefeated ? 'Amir: <b>defeated</b><br>' : '') +
      `Poops witnessed: <b>${this.poopCount}</b>`,
    );
  }

  // ------------------------------------------------------------------ per-frame
  update(dt) {
    const ctx = this.ctx, { player, hud, line, input, phone } = ctx;
    this.time += dt;
    if (this.phase !== 'menu' && this.phase !== 'end') this.playTime += dt;
    this.tweens = this.tweens.filter((tw) => {
      tw.t += dt;
      tw.fn(Math.min(1, tw.t / tw.d));
      return tw.t < tw.d;
    });
    this.runner.update(dt);
    hud.speed(player.state === 'thrown' && !player.flight?.landed && !player.flight?.splat ? player.speed * 3.6 : null);

    if (this.phase === 'sneak') {
      if (this.cp === 0 && player.pos.x < 40 && player.pos.z < 0 && player.state === 'free') {
        this.cp = 1;
        hud.toast('Checkpoint', 1.5, '#7ad06a');
      }
      const s = line.endSlot;
      ctx.marker.set(s.x + 0.6, 0, s.z);
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (player.state === 'free' && d < 2.6) {
        hud.prompt('<b>E</b> Get in line');
        if (input.hit('KeyE')) this.runner.run(this.joinLine());
      } else hud.prompt(null);
      // trying to skip the line
      this.complainT -= dt;
      if (player.state === 'free' && player.pos.x < L.QUEUE.x + 3 && player.pos.x > L.GATE.x0 - 4 && player.pos.z < -221 && player.pos.z > -232 && this.complainT <= 0) {
        this.complainT = 4;
        hud.bubble(line.guards[0], 'End of the line, please!');
        audio.say('End of the line, please!', 'gate');
      }
    } else if (this.phase === 'queue') {
      this.lineT += dt;
      this.missileT = (this.missileT ?? 8) - dt;
      if (this.missileT <= 0) {
        this.missileT = 22 + Math.random() * 14;
        ctx.missiles.launch();
      }
      const i = line.playerIndex, s = line.slot(i);
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (d > 0.2) {
        if (player.state !== 'auto' || player.autoTarget?.x !== s.x) player.walkTo(s.x, s.z, 1.5);
      } else if (player.state === 'auto' && player.arrived) player.state = 'frozen';
      if (player.state === 'frozen') player.heading = -Math.PI / 2;
      hud.prompt(`Place in line: <b>${i + 1}</b>`);
      const moved = ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some((k) => input.hit(k));
      if (moved && this.lineT > 1 && !phone.call) this.leaveLine();
      else if (i === 0 && d < 0.3 && line.advT > line.period * 0.6) this.runner.run(this.gate());
    } else if (this.phase === 'inside') {
      if (!this.lastCall && player.pos.z > -216) {
        this.lastCall = true;
        phone.forceCall('Are you inside?', 'Yes. I am inside.');
        hud.hint('<b>Y</b> answer · <b>N</b> decline');
      }
      const LB = L.LOBBY;
      if (player.state === 'free' && player.pos.x < LB.x1 - 1.2 && player.pos.x > LB.x0 && player.pos.z > LB.z0 && player.pos.z < LB.z1 && player.pos.y < 5) this.runner.run(this.lobby());
    } else if (this.phase === 'lobbyFree') {
      const s = ctx.elevator.endSlot;
      const d = Math.hypot(player.pos.x - s.x, player.pos.z - s.z);
      if (d < 2.4 && player.state === 'free') {
        hud.prompt('<b>E</b> Get in line for the elevator');
        if (input.hit('KeyE')) this.runner.run(this.elevatorLine());
      } else hud.prompt(null);
    } else if (this.phase === 'bossFight') {
      const fight = ctx.amir.fight;
      // Keep the encounter in the clear part of the hall, away from the Pit and the lift cab.
      player.pos.x = Math.max(-222, Math.min(-200, player.pos.x));
      player.pos.z = Math.max(-199.5, Math.min(-182.5, player.pos.z));
      if (fight.won) this.runner.run(this.bossVictory());
      else if (fight.lost) {
        ctx.phone.stop();
        player.state = 'frozen';
        player.vel.set(0, 0, 0);
        hud.prompt('<b>E / Enter</b> Retry the boss fight');
        if (input.hit('KeyE') || input.hit('Enter')) this.beginBossFight(true);
      } else if (fight.ultimateReady) {
        hud.prompt(ctx.phone.blocksAttacks ? 'On call with ADAM · attacks blocked until he hangs up' : fight.round === 2 ? '<b>R</b> SHAIKALE POOPALE · FINAL SPECIAL' : '<b>R</b> Summon Shonchik · SATELLITE ULTIMATE');
        if (input.hit('KeyR') && !ctx.phone.blocksAttacks) this.runner.run(fight.round === 2 ? this.bossFinisher() : this.bossUltimate());
      } else hud.prompt(null);
    } else if (this.phase === 'office') {
      const st = this.stranger;
      if (st && !st.spoke && player.pos.y > 30 && Math.hypot(player.pos.x - st.pos.x, player.pos.z - st.pos.z) < 3.2) this.runner.run(this.strangerTalk());
      if (player.state === 'free' && player.pos.y > 30 && L.inRect(player.pos.x, player.pos.z, L.OFFICE) && player.pos.z > L.OFFICE.z0 + 0.6) this.runner.run(this.officerCrash());
    } else if (this.phase === 'officeFree') {
      const d = Math.hypot(player.pos.x - L.CHAIR.x, player.pos.z - L.CHAIR.z);
      if (d < 1.7 && player.state === 'free') {
        hud.prompt('<b>E</b> Sit down at your desk');
        if (input.hit('KeyE')) this.runner.run(this.ending());
      } else hud.prompt(null);
    }

    // the officer on 14 who has never seen Argaman in his life
    if (this.stranger) {
      const st = this.stranger;
      // he watches Argaman once he gets close
      if (Math.abs(player.pos.y - st.pos.y) < 5 && Math.hypot(player.pos.x - st.pos.x, player.pos.z - st.pos.z) < 8) st.heading = Math.atan2(player.pos.x - st.pos.x, player.pos.z - st.pos.z);
      st.ch.root.rotation.y = st.heading;
      animate(st.ch, { mode: 'idle2', talk: st.talk, look: 0 }, dt);
      st.ch.head.rotation.y = 0;
      st.ch.head.rotation.x = st.talk ? 0.1 : -0.05; // looking him up and down
    }
    // the nice soldier walks over to the gate
    const n = this.nice;
    if (n) {
      let v = 0;
      if (n.target) {
        const dx = n.target.x - n.pos.x, dz = n.target.z - n.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.1) n.target = null;
        else {
          v = 2.6;
          n.pos.x += (dx / d) * Math.min(d, v * dt);
          n.pos.z += (dz / d) * Math.min(d, v * dt);
          n.heading = Math.atan2(dx, dz);
        }
      }
      n.ch.root.position.copy(n.pos);
      n.ch.root.rotation.y = n.heading;
      animate(n.ch, { speed: v, mode: n.mode || 'walk', talk: n.talk }, dt);
    }
    // the officer and his poop
    const o = this.officer;
    const d3 = player.pos.distanceTo(o.pos);
    if (o.ch.root.visible && (d3 < 70 || o.flying)) {
      animate(o.ch, { mode: o.mode, talk: o.talk }, dt);
      o.ch.root.rotation.y = o.heading;
      o.ch.root.rotation.x = o.lean;
      const em = ctx.poop.emitter;
      if (o.flying && em) {
        const sl = Math.sin(o.lean), cl = Math.cos(o.lean), fw = 0.9 * sl - 0.2 * cl;
        em.pos.set(o.pos.x + Math.sin(o.heading) * fw, o.pos.y + 0.9 * cl, o.pos.z + Math.cos(o.heading) * fw);
        ctx.fx.emit(em.pos, 4, { color: '#6b4423', speed: 2, up: -6, gravity: 4, life: 0.6, spread: 0.25 }); // exhaust
      }
      const fresh = ctx.poop.update(dt);
      if (d3 < 25 || o.flying) {
        this.poopCount += fresh;
        if (fresh && Math.random() < 0.35) audio.plop();
      }
    }
  }

  // Debug: jump to a part of the story (?debug → game.story.skipTo('gate'))
  skipTo(name) {
    const ctx = this.ctx, { player, line, guards, hud, city } = ctx;
    hud.fade(0);
    this.uncam();
    hud.subtitle(null, null);
    player.mode = null;
    if (name === 'sneak') {
      player.place(143.4, 42, Math.PI);
      this.beginSneak();
      this.runner.co = null;
    } else if (name === 'line') {
      this.beginSneak();
      const s = line.endSlot;
      player.place(s.x + 1, s.z, -Math.PI / 2);
      this.runner.run(this.joinLine());
    } else if (name === 'gate') {
      for (const e of line.entries) if (e.ch) ctx.scene.remove(e.ch.root);
      line.entries = [];
      guards.active = false;
      line.join();
      player.place(L.QUEUE.x, L.QUEUE.z, -Math.PI / 2);
      this.phase = 'queue';
      this.runner.run(this.gate());
    } else if (['inside', 'lobby', 'office', 'elevator', 'boss', 'ultimate', 'recovery', 'round2', 'finisher', 'boss-call', 'crash'].includes(name)) {
      city.gate.set(1);
      this.lastCall = true;
      this.enterKirya();
      ctx.andrey.unlocked = true;
      this.runner.co = null;
      if (name === 'inside') player.place(-150, -214, -0.9);
      if (name === 'lobby') {
        player.place(-182, -188, -Math.PI / 2);
        guards.active = false;
      }
      if (['boss', 'ultimate', 'recovery', 'round2', 'finisher', 'boss-call'].includes(name)) {
        ctx.elevator.boardLine();
        ctx.elevator.lineBoarded = true;
        this.beginBossFight();
        if (name === 'boss-call') ctx.phone.timer = 0;
        if (name === 'round2' || name === 'finisher') {
          ctx.amir.startBoss(2);
          this.bossHint();
        }
        if (['ultimate', 'recovery', 'finisher'].includes(name)) {
          for (let i = 0; i < 3; i++) {
            ctx.amir.fight.stage = 'recover';
            ctx.amir.fight.recoveryHit = false;
            ctx.amir.kipaHit();
          }
          if (name === 'recovery') {
            ctx.amir.useUltimate();
            ctx.amir.ultimateHit();
            this.runner.run(this.bossRecovery());
          }
        }
      }
      if (name === 'elevator') {
        const s = ctx.elevator.endSlot;
        this.phase = 'lobbyFree';
        player.place(s.x + 1.2, s.z, -Math.PI / 2);
        this.runner.run(this.elevatorLine());
      }
      if (name === 'office' || name === 'crash') {
        this.phase = 'office';
        guards.active = false;
        hud.objective('Go down the corridor, then right: your office');
        if (name === 'office') player.place(L.CORE.x1 + 2, L.ELEVATOR.z, Math.PI / 2, L.OFFICE_Y);
        else player.place(-198.2, -179, 0, L.OFFICE_Y);
        ctx.marker.set(-198.2, L.OFFICE_Y, L.OFFICE.z0 - 1, false);
      }
    }
  }
}
