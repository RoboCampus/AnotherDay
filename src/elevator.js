import * as THREE from 'three';
import * as L from './layout.js';
import { createCharacter, animate, addPhone, OLIVE, LOOKS } from './character.js';
import { signTex } from './textures.js';
import { audio } from './audio.js';

const SKINS = ['#d6a47c', '#c48a5e', '#e8c09a', '#8d5a3b', '#f1c8a4', '#a8714b'];
const HAIR = ['#1c140f', '#3a2416', '#6b4a2b', '#111', '#8a6a3a'];
const BERETS = ['#3a3f2a', '#5b2a6e', '#7a1f1f', '#2d2d2d', '#4f6b2d', '#6a5b2e'];
const OUCH = ['Ow...', 'My back...', 'Next time: the stairs.', 'Who pressed 14?!', '...why.', 'Is it over?'];
const pick = (a) => a[(Math.random() * a.length) | 0];
const WALK = 2.3;
const _v = new THREE.Vector3();

function person(officer) {
  if (officer) {
    if (Math.random() < 0.5) return createCharacter({ ...LOOKS.officer, skin: pick(SKINS), hair: pick(HAIR) });
    return createCharacter({ shirt: OLIVE, pants: OLIVE, skin: pick(SKINS), hair: pick(HAIR), cap: 'beret', beret: pick(BERETS), epaulettes: true });
  }
  const female = Math.random() < 0.45;
  return createCharacter({ shirt: OLIVE, pants: OLIVE, skin: pick(SKINS), hair: pick(HAIR), ponytail: female, beard: !female && Math.random() < 0.3, cap: Math.random() < 0.4 ? 'beret' : null, beret: pick(BERETS) });
}

// The elevator: the line for it in the hall, everybody (Argaman too) packing into the cab, more
// people squeezing in on floors 1, 2 and 3, and all of them exploding out of the doors on 14.
export class Elevator {
  constructor(ctx) {
    this.ctx = ctx;
    this.people = [];
    this.squish = 1;
    const E = L.ELEV_LINE;
    for (let i = 0; i < E.n; i++) {
      const p = this.add(person(i === 3), E.x + i * E.gap, 0, E.z, -Math.PI / 2);
      p.mode = i % 3 === 1 ? 'phone' : 'idle2';
      if (p.mode === 'phone') addPhone(p.ch);
    }
    // while the line stands there, it hides whoever is behind it
    this.cover = ctx.world.add(E.x - 0.4, E.x + (E.n - 1) * E.gap + 0.4, E.z - 0.45, E.z + 0.45, 0, 1.8, { cam: false });
    // slots in the cab: back rows first; Argaman gets the one after the line
    const K = L.CAB;
    this.slots = [];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 6; c++) this.slots.push([K.x0 + 0.5 + r * 0.6, K.z0 + 0.45 + c * 0.7]);
    this.nextSlot = 0;
    this.landing = this.buildLanding();
  }

  add(ch, x, y, z, heading) {
    ch.root.position.set(x, y, z);
    this.ctx.scene.add(ch.root);
    const p = { ch, pos: ch.root.position, heading, mode: 'idle2', path: [], vel: new THREE.Vector3(), spin: 0, bubbleY: 2.4 };
    this.people.push(p);
    return p;
  }

  get endSlot() {
    const E = L.ELEV_LINE;
    return { x: E.x + E.n * E.gap, z: E.z };
  }

  // the cab door, just outside it
  get door() {
    return { x: L.CORE.x1 + 0.5, z: L.ELEVATOR.z };
  }

  takeSlot() {
    return this.slots[this.nextSlot++];
  }

  // everybody listed walks in, one after the other
  board(list, gap = 0.45) {
    list.forEach((p, i) => {
      const [sx, sz] = this.takeSlot();
      p.delay = i * gap;
      p.path = [[this.door.x, this.door.z], [sx, sz]];
      p.mode = 'walk';
      if (p.ch.phone) p.ch.phone.visible = false;
    });
  }

  boardLine() {
    this.cover.off = true;
    this.board(this.people.slice(0, L.ELEV_LINE.n));
  }

  // Bring the officer at the back of the crowded cab up to the doorway. This
  // borrows his existing seat, without consuming a slot in the later ride.
  prepareKick() {
    if (this.kickContext) return this.kickContext.person;
    const person = this.people[3];
    if (!person) return null;
    this.kickContext = { person, pos: person.pos.clone(), heading: person.heading };
    person.path = [[L.CORE.x1 - 0.85, L.ELEVATOR.z]];
    person.delay = 0;
    person.mode = 'walk';
    person.arrivalHeading = Math.PI / 2;
    return person;
  }

  kick() {
    const person = this.kickContext?.person;
    if (!person) return null;
    person.mode = 'kick';
    person.path = [];
    person.heading = Math.PI / 2;
    person.kickT = 0.4;
    return person;
  }

  finishKick() {
    const saved = this.kickContext;
    if (!saved) return null;
    const person = saved.person;
    person.path = [[saved.pos.x, saved.pos.z]];
    person.delay = 0;
    person.kickT = 0;
    person.mode = 'walk';
    person.arrivalHeading = saved.heading;
    this.kickContext = null;
    return person;
  }

  get seated() {
    return this.people.every((p) => p.mode !== 'walk');
  }

  // A fake landing for floors 1-3: a little room right outside the lobby cab doors, so what you
  // see through the open doors is a corridor, not the hall.
  buildLanding() {
    const g = new THREE.Group();
    const x0 = L.CORE.x1, x1 = x0 + 5, z0 = L.ELEVATOR.z - 3.5, z1 = L.ELEVATOR.z + 3.5, h = 3;
    const wallMat = new THREE.MeshStandardMaterial({ color: '#cfd8dc', roughness: 0.8, side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 - 0.1, h, z1 - z0), wallMat);
    room.position.set((x0 + x1) / 2 + 0.05, h / 2 + 0.01, (z0 + z1) / 2);
    g.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ color: '#5d6b7a', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2);
    g.add(floor);
    const signs = [1, 2, 3].map((f) => {
      const t = signTex([{ text: String(f), size: 120 }, { text: `קומה ${f}`, size: 30, rtl: true }], { bg: '#2b2f36', w: 256, h: 256 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 }));
      m.position.set(x1 - 0.1, 1.7, L.ELEVATOR.z);
      m.rotation.y = -Math.PI / 2;
      g.add(m);
      return m;
    });
    g.visible = false;
    this.ctx.scene.add(g);
    const tints = ['#cfd8dc', '#e6d8c0', '#d0e0cc'];
    return {
      show: (f) => {
        g.visible = true;
        signs.forEach((m, i) => (m.visible = i === f - 1));
        wallMat.color.set(tints[f - 1]);
      },
      hide: () => (g.visible = false),
      x1,
    };
  }

  // n new people appear on the landing and squeeze into the cab
  floorStop(n, officers) {
    const fresh = [];
    for (let i = 0; i < n; i++) {
      const p = this.add(person(i < officers), this.landing.x1 - 0.8 - (i % 3) * 0.9, 0, L.ELEVATOR.z - 1.6 + Math.floor(i / 3) * 1.1, -Math.PI / 2);
      p.ch.root.scale.x = this.squish;
      fresh.push(p);
    }
    this.board(fresh, 0.35);
    return fresh;
  }

  // the cab gets more crowded: everyone a bit thinner
  squeeze(k = 0.9) {
    this.squish *= k;
    for (const p of this.people) p.ch.root.scale.x = this.squish;
  }

  // up to 14: everyone in the cab moves up together
  lift(dy) {
    for (const p of this.people) p.pos.y += dy;
  }

  explode() {
    const out = _v.set(L.CORE.x1 + 3, 0, L.ELEVATOR.z);
    this.people.forEach((p, i) => {
      const dx = out.x - p.pos.x, dz = out.z - p.pos.z, d = Math.hypot(dx, dz);
      const speed = 8 + Math.random() * 8;
      p.vel.set((dx / d) * speed, 3 + Math.random() * 4, (dz / d) * speed + (Math.random() - 0.5) * 5);
      p.mode = 'fly';
      p.delay = (i % 6) * 0.03;
      p.spin = (Math.random() - 0.5) * 14;
      p.rx = 0;
      p.heading = Math.atan2(p.vel.x, p.vel.z);
    });
    this.ctx.player.vel.set(0, 0, 0);
  }

  update(dt) {
    const { player, world, hud } = this.ctx;
    const pp = player.pos;
    for (const p of this.people) {
      const near = Math.abs(p.pos.y - pp.y) < 20 && Math.abs(p.pos.x - pp.x) < 70 && Math.abs(p.pos.z - pp.z) < 70;
      p.ch.root.visible = near;
      if (!near) continue;
      let speed = 0;
      if (p.delay > 0) p.delay -= dt;
      else if (p.mode === 'walk') {
        const [tx, tz] = p.path[0];
        const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.1) {
          p.path.shift();
          if (!p.path.length) {
            p.mode = 'cab';
            p.heading = p.arrivalHeading ?? Math.PI / 2;
            p.arrivalHeading = null;
          }
        } else {
          speed = WALK;
          p.pos.x += (dx / d) * Math.min(d, speed * dt);
          p.pos.z += (dz / d) * Math.min(d, speed * dt);
          p.heading = Math.atan2(dx, dz);
        }
      } else if (p.mode === 'kick') {
        p.kickT = Math.max(0, p.kickT - dt);
        if (p.kickT === 0) p.mode = 'cab';
      } else if (p.mode === 'fly') {
        p.vel.y -= 14 * dt;
        const px = p.pos.x, pz = p.pos.z;
        p.pos.addScaledVector(p.vel, dt);
        p.rx += p.spin * dt;
        if (world.solidAt(_v.set(p.pos.x, p.pos.y + 0.9, p.pos.z))) {
          // slammed into a wall
          p.pos.x = px;
          p.pos.z = pz;
          p.vel.x *= -0.2;
          p.vel.z *= -0.2;
          if (Math.random() < 0.3) audio.splat();
        }
        const floor = world.groundY(p.pos.x, p.pos.z, p.pos.y + 1);
        if (p.pos.y <= floor && p.vel.y < 0) {
          p.pos.y = floor;
          p.mode = 'down';
          p.vel.y = 0;
          p.vel.x *= 0.5;
          p.vel.z *= 0.5;
          p.heading += (Math.random() - 0.5) * 2;
          if (Math.random() < 0.12) hud.bubble(p, pick(OUCH));
        }
      } else if (p.mode === 'down') {
        // slide to a stop
        const f = Math.max(0, 1 - dt * 4);
        p.vel.x *= f;
        p.vel.z *= f;
        const px = p.pos.x, pz = p.pos.z;
        p.pos.x += p.vel.x * dt;
        p.pos.z += p.vel.z * dt;
        if (world.solidAt(_v.set(p.pos.x, p.pos.y + 0.3, p.pos.z))) {
          p.pos.x = px;
          p.pos.z = pz;
        }
      }
      const root = p.ch.root;
      root.rotation.y = p.heading;
      if (p.mode === 'fly') {
        animate(p.ch, { mode: 'flail' }, dt);
        root.rotation.x = p.rx;
      } else if (p.mode === 'down') animate(p.ch, { mode: 'down' }, dt);
      else animate(p.ch, { speed, mode: p.mode === 'walk' || p.mode === 'cab' ? 'walk' : p.mode, kick: 1 - (p.kickT || 0) / 0.4 }, dt);
      if (p.mode === 'cab') {
        // packed in: shuffle, look at the floor counter
        p.ch.body.position.x = Math.sin(p.ch.t * 1.3 + p.pos.z) * 0.02;
        p.ch.head.rotation.x = -0.25;
      }
    }
  }
}
