import * as THREE from 'three';
import * as L from './layout.js';
import { createCharacter, animate, addRifle, addPhone, addLabel, OLIVE } from './character.js';
import { lerpAngle } from './player.js';

const SKINS = ['#d6a47c', '#c48a5e', '#e8c09a', '#8d5a3b', '#f1c8a4', '#a8714b'];
const HAIR = ['#1c140f', '#3a2416', '#6b4a2b', '#111', '#8a6a3a'];
const BERETS = ['#3a3f2a', '#5b2a6e', '#7a1f1f', '#2d2d2d', '#4f6b2d', '#6a5b2e'];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function soldier(o = {}) {
  const female = Math.random() < 0.45;
  return createCharacter({ shirt: OLIVE, pants: OLIVE, skin: pick(SKINS), hair: pick(HAIR), ponytail: female, beard: !female && Math.random() < 0.3, ...o });
}

function walkToward(e, tx, tz, speed, dt) {
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
  if (d < 0.08) return 0;
  const step = Math.min(d, speed * dt);
  e.pos.x += (dx / d) * step;
  e.pos.z += (dz / d) * step;
  e.heading = lerpAngle(e.heading, Math.atan2(dx, dz), Math.min(1, dt * 8));
  return step / dt;
}

// The line at the Kaplan gate checkpoint. It stands still until Argaman joins; then every few
// seconds the soldier at the front shows the gate guards their pass and goes through the turnstile.
export class Line {
  constructor(ctx) {
    this.ctx = ctx;
    this.entries = [];
    for (let i = 0; i < 15; i++) this.addNpc(this.slot(i).x, this.slot(i).z);
    for (const e of this.entries) e.ch.root.position.copy(e.pos);
    this.guards = L.GATE_GUARDS.map((p, i) => {
      const ch = soldier({ cap: 'beret', beret: '#2d2d2d', vest: '#3e4430' });
      addRifle(ch);
      addLabel(ch, i === 0 ? 'GATE GUARD' : 'GATE GUARD', '#9fd3ff');
      ch.root.position.set(p.x, 0, p.z);
      ch.root.rotation.y = Math.PI / 2;
      ctx.scene.add(ch.root);
      return { ch, pos: new THREE.Vector3(p.x, 0, p.z), heading: Math.PI / 2, talkT: 0, mode: 'idle2', down: false };
    });
    this.running = false;
    this.advT = 0;
    this.arriveT = 4;
    this.leaving = [];
    this.period = 3.4;
  }

  slot(i) {
    return { x: L.QUEUE.x + i * L.QUEUE.gap, z: L.QUEUE.z };
  }

  addNpc(x, z) {
    const ch = soldier({ cap: Math.random() < 0.5 ? 'beret' : null, beret: pick(BERETS), backpack: Math.random() < 0.5 ? '#3b3f2c' : null });
    addPhone(ch);
    this.ctx.scene.add(ch.root);
    const e = { kind: 'npc', ch, pos: new THREE.Vector3(x, 0, z), heading: -Math.PI / 2, jitter: (Math.random() - 0.5) * 0.35, phone: Math.random() < 0.4, look: 0 };
    this.entries.push(e);
    return e;
  }

  get playerIndex() {
    return this.entries.findIndex((e) => e.kind === 'player');
  }

  get endSlot() {
    return this.slot(this.entries.length);
  }

  join() {
    this.entries.push({ kind: 'player' });
    this.running = true;
    this.advT = 0;
  }

  leave() {
    const i = this.playerIndex;
    if (i >= 0) this.entries.splice(i, 1);
  }

  playerSlot() {
    return this.slot(this.playerIndex);
  }

  update(dt) {
    const ctx = this.ctx;
    if (this.running && this.entries.length) {
      this.advT += dt;
      const front = this.entries[0];
      if (front.kind === 'npc' && this.advT > this.period && front.pos.distanceTo(new THREE.Vector3(this.slot(0).x, 0, this.slot(0).z)) < 0.4) {
        this.advT = 0;
        this.entries.shift();
        front.path = [[L.TURNSTILE.x0 + 1, L.KIRYA.z0 - 1.5], [L.TURNSTILE.x0 + 1, L.KIRYA.z0 + 3], [L.TURNSTILE.x0 - 4 + Math.random() * 8, L.KIRYA.z0 + 30]];
        this.leaving.push(front);
        this.guards[0].talkT = 1.4;
      }
      // more soldiers keep arriving behind Argaman
      const pi = this.playerIndex;
      if (pi >= 0 && this.entries.length - pi - 1 < 5) {
        this.arriveT -= dt;
        if (this.arriveT <= 0) {
          this.arriveT = 5 + Math.random() * 4;
          const e = this.addNpc(-20, L.QUEUE.z + (Math.random() - 0.5));
          e.heading = -Math.PI / 2;
        }
      }
    }
    this.entries.forEach((e, i) => {
      if (e.kind !== 'npc') return;
      const s = this.slot(i);
      const v = walkToward(e, s.x, s.z + e.jitter, i < 2 ? 1.6 : 2.4, dt);
      if (v < 0.1) e.heading = lerpAngle(e.heading, -Math.PI / 2, Math.min(1, dt * 4));
      e.ch.root.position.copy(e.pos);
      e.ch.root.rotation.y = e.heading;
      animate(e.ch, { speed: v, mode: v > 0.1 ? 'walk' : e.phone ? 'phone' : 'idle2', look: e.look }, dt);
    });
    this.leaving = this.leaving.filter((e) => {
      const [tx, tz] = e.path[0];
      const v = walkToward(e, tx, tz, 1.8, dt);
      if (v === 0) e.path.shift();
      e.ch.root.position.copy(e.pos);
      e.ch.root.rotation.y = e.heading;
      animate(e.ch, { speed: v || 1, mode: 'walk' }, dt);
      if (!e.path.length) {
        ctx.scene.remove(e.ch.root);
        return false;
      }
      return true;
    });
    for (const g of this.guards) {
      g.talkT -= dt;
      g.ch.root.position.copy(g.pos);
      g.ch.root.rotation.y = g.heading;
      animate(g.ch, { speed: 0, mode: g.down ? 'down' : g.mode, talk: g.talkT > 0 }, dt);
    }
  }
}

// Soldiers walking around inside the Kirya between a few points on its streets.
// (kept out of the straight lines through Argaman's building and its hall)
const SPOTS = [[-150, -200], [-150, -160], [-150, -100], [-150, -40], [-170, -150], [-120, -130], [-100, -161], [-60, -161], [-200, -92], [-100, -92], [-170, -186]];
export class KiryaPeople {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    for (let i = 0; i < 9; i++) {
      const ch = soldier({ cap: Math.random() < 0.4 ? 'beret' : null, beret: pick(BERETS) });
      ctx.scene.add(ch.root);
      const [x, z] = pick(SPOTS);
      this.list.push({ ch, pos: new THREE.Vector3(x + Math.random() * 4, 0, z + Math.random() * 4), heading: 0, target: pick(SPOTS), speed: 1.3 + Math.random() * 0.5 });
    }
  }

  update(dt) {
    const p = this.ctx.player.pos;
    for (const e of this.list) {
      if (Math.abs(e.pos.x - p.x) > 220 || Math.abs(e.pos.z - p.z) > 220) continue;
      const v = walkToward(e, e.target[0], e.target[1], e.speed, dt);
      if (v === 0) e.target = pick(SPOTS);
      e.ch.root.position.copy(e.pos);
      e.ch.root.rotation.y = e.heading;
      animate(e.ch, { speed: v }, dt);
    }
  }
}
