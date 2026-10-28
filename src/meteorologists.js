import * as THREE from 'three';
import * as L from './layout.js';
import { createCharacter, animate, addLabel, mat, parts, OLIVE } from './character.js';
import { lerpAngle } from './player.js';
import { labelSprite } from './textures.js';
import { audio } from './audio.js';

const RANGE = 18, HALF_FOV = THREE.MathUtils.degToRad(52), COS_FOV = Math.cos(HALF_FOV), FEEL = 2.2;
const PATROL_SPEED = 1.7, CHARGE_SPEED = 13;

// Patrol routes around the Kirya. `pts` are waypoints; a single point with `sweep` stands and
// turns (base heading, amplitude, speed).
const POSTS = [
  { pts: [[95, -11], [35, -11]], wait: 2 }, // HaShalom, Azrieli side
  { pts: [[-13, -17]], sweep: [Math.PI / 4, 0.9, 0.45] }, // Begin / HaShalom corner
  { pts: [[-13.5, -40], [-13.5, -118]], wait: 2.5 }, // Begin, along the fence
  { pts: [[24, -35], [24, -150]], wait: 2 }, // Begin, Azrieli side
  { pts: [[5, -112], [5, -205]], wait: 2 }, // Begin median
  { pts: [[-13, -226]], sweep: [0.35, 0.6, 0.5] }, // Kaplan / Begin corner
  { pts: [[-30, -225.2], [-98, -225.2]], wait: 2.5 }, // Kaplan, along the fence
  { pts: [[-25, -254], [-118, -254]], wait: 2 }, // Kaplan, north side
  // inside the Kirya, guarding Argaman's building (zone 'in': only active once he is through the gate)
  { pts: [[-178, -212], [-178, -150]], wait: 2, zone: 'in' }, // along the entrance facade
  { pts: [[-181.6, -183.4]], sweep: [Math.PI / 2, 0.85, 0.5], zone: 'in' }, // right by the door
  { pts: [[-168, -205], [-168, -150]], wait: 1.5, zone: 'in' }, // the approach
  // in the hall, among the soldiers
  { pts: [[-212, -203], [-212, -181]], wait: 2, zone: 'in' }, // crossing between the officer and the elevators
  { pts: [[-219.5, -200]], sweep: [0.25, 0.7, 0.45], zone: 'in' }, // by the elevators
  { pts: [[-239, -200], [-239, -171]], wait: 2.5, zone: 'in' }, // past the tables, west side
];

const BARKS = [
  'Humidity: 64 percent.', 'Light westerly wind.', 'Chance of rain: zero.', 'Barometric pressure: stable.',
  'It is hot. Very hot.', 'Cumulus forming over Azrieli.', 'UV index: extreme.', 'Sea breeze arriving at 14:00.',
  'Visibility: excellent.', 'Hamsin coming next week.',
];
const SUSPICIOUS = ['Hm? A low-pressure system?', 'Did the wind just move?', 'Something is forming...', 'Was that a front?'];
const BONKED = ['Ow! A kipa?!', 'Forecast: ...stars.', 'Sudden kipa front!', 'Partly cloudy... with kipot.', 'Who throws a kipa?!'];
const STARE = ['Andrey?!', 'What is he doing?', 'Khlobchik??', 'Is that a weather event?', 'Andrey, are you OK?', 'Tornado warning...'];
const ALERTS = ['ARGAMAN DETECTED!', 'STORM FRONT ARGAMAN!', 'INTRUDER! WIND GUSTS 200 KM/H!', 'FORECAST: YOU, FLYING!'];

const pick = (a) => a[(Math.random() * a.length) | 0];

// A soldier with a weather balloon tied to his backpack and a cup anemometer on his helmet.
function meteorologist() {
  const ch = createCharacter({ shirt: OLIVE, pants: OLIVE, cap: 'helmet', vest: '#4a5030', backpack: '#4a5030', skin: pick(['#d6a47c', '#c48a5e', '#e8c09a', '#8d5a3b']) });
  const { part, CYL, SPHERE, BOX } = parts;
  const stick = part(CYL, mat('#888', 0.4, 0.6), 0, 0.33, 0, 0.012, 0.18, 0.012);
  const cups = new THREE.Group();
  cups.position.y = 0.42;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cups.add(part(BOX, mat('#aaa', 0.4, 0.6), Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07, 0.14, 0.008, 0.008));
    cups.children[cups.children.length - 1].rotation.y = -a;
    cups.add(part(SPHERE, mat('#e0e0e0', 0.4), Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14, 0.03, 0.03, 0.03));
  }
  ch.head.add(stick, cups);
  ch.cups = cups;
  const balloon = new THREE.Group();
  const b = part(SPHERE, new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.3 }), 0, 0, 0, 0.42, 0.48, 0.42);
  balloon.add(b);
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.6, 4), mat('#ddd'));
  string.position.y = -1.2;
  balloon.add(string);
  balloon.position.set(0, 3.2, -0.3);
  ch.root.add(balloon);
  ch.balloon = balloon;
  addLabel(ch, 'METEOROLOGIST', '#ffe082', 2.3);
  ch.label.scale.multiplyScalar(0.8);
  return ch;
}

class Guard {
  constructor(ctx, post) {
    this.ctx = ctx;
    this.post = post;
    this.ch = meteorologist();
    this.ch.root.rotation.order = 'YXZ'; // knocked down: falls backwards relative to his heading
    ctx.scene.add(this.ch.root);
    this.pos = new THREE.Vector3();
    // vision cone on the ground
    const geo = new THREE.CircleGeometry(RANGE, 28, Math.PI / 2 - HALF_FOV, HALF_FOV * 2);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI); // the fan opens along +z
    this.coneMat = new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.14, depthWrite: false });
    this.cone = new THREE.Mesh(geo, this.coneMat);
    this.cone.renderOrder = 2;
    ctx.scene.add(this.cone);
    this.icon = labelSprite('?', { color: '#ffd23f', bg: 'rgba(0,0,0,0)', size: 0.9, font: 52 });
    this.icon.position.y = 2.8;
    this.icon.visible = false;
    this.ch.root.add(this.icon);
    // dizzy stars when knocked out by the kipa
    this.stars = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const st = labelSprite('★', { color: '#ffd23f', bg: 'rgba(0,0,0,0)', size: 0.32, font: 60 });
      st.userData.a = (i / 4) * Math.PI * 2;
      this.stars.add(st);
    }
    this.stars.visible = false;
    ctx.scene.add(this.stars);
    this.reset();
  }

  reset() {
    const [x, z] = this.post.pts[0];
    this.pos.set(x, 0, z);
    this.wp = this.post.pts.length > 1 ? 1 : 0;
    this.heading = this.post.sweep ? this.post.sweep[0] : Math.atan2(this.post.pts[this.wp][0] - x, this.post.pts[this.wp][1] - z);
    this.look = 0;
    this.state = 'patrol';
    this.t = 0;
    this.waitT = 0;
    this.susp = 0;
    this.barkT = 3 + Math.random() * 8;
    this.speed = 0;
    this.icon.visible = false;
    this.ch.root.visible = true;
    this.stars.visible = false;
    this.knock = null;
  }

  // Andrey is yelling nearby: stop and stare (only if he hasn't already spotted Argaman)
  distract(andrey) {
    if (this.state !== 'patrol' && this.state !== 'suspicious') return;
    this.state = 'distracted';
    this.t = 0;
    this.susp = 0;
    this.andrey = andrey;
    this.setIcon('?!', '#7ef0a0');
    if (Math.random() < 0.7) this.ctx.hud.bubble(this, pick(STARE));
  }

  get bonkable() {
    return this.state !== 'stunned' && this.state !== 'done';
  }

  // Hit by Argaman's kipa: knocked flat for a few seconds. Grabbing him? He's dropped.
  bonk(dir) {
    const ctx = this.ctx, player = ctx.player;
    if (this.state === 'grab' && player.state === 'grabbed') {
      player.state = 'free';
      player.onGround = false;
      player.vy = 2;
    }
    this.state = 'stunned';
    this.t = 0;
    this.susp = 0;
    this.icon.visible = false;
    this.heading = Math.atan2(-dir.x, -dir.z); // facing the kipa, falls on his back
    this.knock = dir.clone();
    this.stars.visible = true;
    ctx.hud.bubble(this, pick(BONKED));
    audio.say(pick(['Ow!', 'Kipa!', 'My forecast!']), 'meteo');
    // the clang draws the others over
    for (const g of ctx.guards.list) if (g !== this && g.pos.distanceTo(this.pos) < 9) g.hear(this.pos, 9);
  }

  setIcon(text, color) {
    const s = labelSprite(text, { color, bg: 'rgba(0,0,0,0)', size: 0.9, font: 56 });
    this.icon.material.map.dispose();
    this.icon.material.map = s.material.map;
    this.icon.material.needsUpdate = true;
    this.icon.visible = true;
  }

  get viewDir() {
    return this.heading + this.look;
  }

  hear(p, r) {
    if (this.state !== 'patrol' && this.state !== 'suspicious') return;
    if (this.pos.distanceTo(p) > r) return;
    this.state = 'suspicious';
    this.t = 0;
    this.focus = p.clone();
    this.setIcon('?', '#ffd23f');
    audio.suspicious();
    this.ctx.hud.bubble(this, pick(SUSPICIOUS));
  }

  update(dt, active) {
    const ctx = this.ctx, player = ctx.player;
    this.on = active;
    this.t += dt;
    let moving = 0;
    if (this.state === 'patrol') {
      const [hx, hz] = this.post.pts[0];
      if (this.post.sweep && Math.hypot(hx - this.pos.x, hz - this.pos.z) > 0.3) {
        const dx = hx - this.pos.x, dz = hz - this.pos.z, d = Math.hypot(dx, dz);
        this.pos.x += (dx / d) * PATROL_SPEED * dt;
        this.pos.z += (dz / d) * PATROL_SPEED * dt;
        this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 5));
        moving = PATROL_SPEED;
      } else if (this.post.sweep) {
        const [base, amp, sp] = this.post.sweep;
        this.heading = base + Math.sin(this.t * sp) * amp;
        this.look = 0;
      } else if (this.waitT > 0) {
        this.waitT -= dt;
        this.look = Math.sin(this.t * 1.3) * 0.9;
      } else {
        const [tx, tz] = this.post.pts[this.wp];
        const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.3) {
          this.wp = (this.wp + 1) % this.post.pts.length;
          this.waitT = this.post.wait || 2;
        } else {
          this.pos.x += (dx / d) * PATROL_SPEED * dt;
          this.pos.z += (dz / d) * PATROL_SPEED * dt;
          this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 5));
          moving = PATROL_SPEED;
        }
        this.look = Math.sin(this.t * 0.8) * 0.35;
      }
      this.barkT -= dt;
      if (this.barkT <= 0) {
        this.barkT = 7 + Math.random() * 9;
        if (this.pos.distanceTo(player.pos) < 30) ctx.hud.bubble(this, pick(BARKS));
      }
    } else if (this.state === 'suspicious') {
      const want = Math.atan2(this.focus.x - this.pos.x, this.focus.z - this.pos.z);
      this.heading = lerpAngle(this.heading, want, Math.min(1, dt * 4));
      this.look = Math.sin(this.t * 2) * 0.25;
      if (this.t > 3.5 && this.susp < 0.3) {
        this.state = 'patrol';
        this.icon.visible = false;
      }
    } else if (this.state === 'alert') {
      this.heading = lerpAngle(this.heading, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), Math.min(1, dt * 10));
      if (this.t > 0.55) {
        this.state = 'charge';
        this.t = 0;
      }
    } else if (this.state === 'charge') {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      this.heading = Math.atan2(dx, dz);
      if (d > 0) {
        this.pos.x += (dx / d) * CHARGE_SPEED * dt;
        this.pos.z += (dz / d) * CHARGE_SPEED * dt;
      }
      ctx.world.collide(this.pos, 0.3, 1.7);
      moving = CHARGE_SPEED;
      if (d < 1.2 && player.state === 'free') {
        this.state = 'grab';
        this.t = 0;
        this.spinA = Math.atan2(-dx, -dz);
        player.state = 'grabbed';
        audio.whoosh();
        ctx.hud.bubble(this, 'GOT YOU!');
      } else if (this.t > 6 || player.state !== 'free') {
        this.reset();
      }
    } else if (this.state === 'grab') {
      // spin once like a hammer thrower, then let go
      this.spinA += dt * (6 + this.t * 14);
      this.heading = this.spinA;
      const r = 1.0;
      player.pos.set(this.pos.x + Math.sin(this.spinA) * r, this.pos.y + 0.4 + this.t * 0.5, this.pos.z + Math.cos(this.spinA) * r);
      player.heading = this.spinA + Math.PI;
      if (this.t > 1.0) {
        const away = this.post.zone === 'in'
          ? new THREE.Vector3((L.GATE.x0 + L.GATE.x1) / 2 - player.pos.x, 0, L.GATE.z - 20 - player.pos.z).normalize()
          : new THREE.Vector3(player.pos.x - L.KIRYA_CENTER.x, 0, player.pos.z - L.KIRYA_CENTER.z).normalize();
        player.heading = Math.atan2(away.x, away.z) + Math.PI;
        // inside the hall: low and flat, straight out of the front door
        const LB = L.LOBBY, indoors = player.pos.y < 5 && L.inRect(player.pos.x, player.pos.z, LB);
        if (indoors) away.set(LB.x1 + 8 - player.pos.x, 0, (L.DOOR.z0 + L.DOOR.z1) / 2 - player.pos.z).normalize();
        player.throwAway(away, indoors ? 6 : 35);
        ctx.story.thrown(this);
        this.state = 'done';
        this.t = 0;
      }
    } else if (this.state === 'distracted') {
      const a = this.andrey.pos, dx = a.x - this.pos.x, dz = a.z - this.pos.z, d = Math.hypot(dx, dz);
      this.heading = lerpAngle(this.heading, Math.atan2(dx, dz), Math.min(1, dt * 6));
      this.look = 0;
      if (d > 4.5) {
        // wander over for a better look
        this.pos.x += (dx / d) * PATROL_SPEED * 1.2 * dt;
        this.pos.z += (dz / d) * PATROL_SPEED * 1.2 * dt;
        ctx.world.collide(this.pos, 0.3, 1.7);
        moving = PATROL_SPEED * 1.2;
      }
      if (!this.andrey.active) {
        this.state = 'patrol';
        this.t = 0;
        this.waitT = 1.5;
        this.icon.visible = false;
        if (Math.random() < 0.5) ctx.hud.bubble(this, 'Where did he go?');
      }
    } else if (this.state === 'stunned') {
      // slide back from the hit, lie there seeing stars, get up
      const slide = Math.max(0, 1 - this.t * 3);
      this.pos.addScaledVector(this.knock, slide * 9 * dt);
      ctx.world.collide(this.pos, 0.3, 1.7);
      if (this.t > 6) {
        this.state = 'patrol';
        this.t = 0;
        this.waitT = 1.5;
        this.stars.visible = false;
        ctx.hud.bubble(this, 'Where... what is the weather?');
      }
    } else if (this.state === 'done') {
      this.look = 0;
      moving = 0;
    }

    // ---- sight
    let seen = 0;
    if (active && (this.state === 'patrol' || this.state === 'suspicious') && player.state === 'free') {
      seen = this.see(player);
      if (seen > 0) {
        this.susp += dt * (0.9 + 2.6 * seen);
        if (this.state === 'patrol' && this.susp > 0.25) {
          this.state = 'suspicious';
          this.t = 0;
          this.focus = player.pos.clone();
          this.setIcon('?', '#ffd23f');
          audio.suspicious();
          ctx.hud.bubble(this, pick(SUSPICIOUS));
        }
        if (this.state === 'suspicious') this.focus.copy(player.pos);
        if (this.susp >= 1) {
          this.susp = 1;
          this.state = 'alert';
          this.t = 0;
          this.setIcon('!', '#ff3b30');
          audio.alert();
          ctx.hud.bubble(this, pick(ALERTS), true);
          audio.say(pick(['Argaman detected!', 'Storm front!', 'Wind gusts two hundred kilometers per hour!']), 'meteo');
        }
      } else this.susp = Math.max(0, this.susp - dt * 0.3);
      if (player.noise >= 1 && this.state === 'patrol' && this.pos.distanceTo(player.pos) < 10) this.hear(player.pos, 10);
    } else if (this.state === 'patrol') this.susp = Math.max(0, this.susp - dt * 0.5);

    // ---- pose
    const root = this.ch.root;
    root.position.copy(this.pos);
    root.rotation.y = this.heading;
    let mode = 'walk';
    if (this.state === 'charge') mode = 'charge';
    else if (this.state === 'grab') mode = 'cheer';
    else if (this.state === 'alert') mode = 'point';
    else if (this.state === 'stunned' && this.t < 5.4) mode = 'down';
    animate(this.ch, { speed: moving, mode, look: this.look }, dt);
    if (this.stars.visible) {
      // over his head: lying on his back, the head is ~1.5 m behind his feet
      const up = this.state === 'stunned' && this.t < 5.4;
      const back = up ? 1.5 : 0;
      this.stars.position.set(this.pos.x - Math.sin(this.heading) * back, this.pos.y + (up ? 0.4 : 2.0), this.pos.z - Math.cos(this.heading) * back);
      for (const st of this.stars.children) {
        const a = st.userData.a + this.t * 5;
        st.position.set(Math.cos(a) * 0.45, Math.sin(this.t * 7 + st.userData.a) * 0.08, Math.sin(a) * 0.45);
      }
    }
    this.ch.cups.rotation.y += dt * (this.state === 'charge' ? 40 : 9);
    this.ch.balloon.position.x = Math.sin(this.ch.t * 0.9) * 0.25;
    this.ch.balloon.position.y = 3.2 + Math.sin(this.ch.t * 1.3) * 0.12;
    this.cone.position.set(this.pos.x, this.ctx.world.groundY(this.pos.x, this.pos.z) + 0.07, this.pos.z);
    this.cone.rotation.y = this.viewDir;
    this.cone.visible = active && this.state !== 'done' && this.state !== 'stunned';
    const s = this.state === 'alert' || this.state === 'charge' ? 1 : this.susp;
    this.coneMat.color.setRGB(1, 0.88 - s * 0.7, 0.4 - s * 0.3);
    this.coneMat.opacity = 0.12 + s * 0.22;
  }

  // 0 = not visible, up to 1 = in plain view close by
  see(player) {
    if (player.hidden && this.pos.distanceTo(player.pos) >= 1.1) return 0;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (Math.abs(player.pos.y - this.pos.y) > 4) return 0;
    const range = RANGE * (player.crouch > 0.5 ? 0.55 : 1);
    if (d >= FEEL) {
      if (d > range) return 0;
      const vd = this.viewDir;
      if ((Math.sin(vd) * dx + Math.cos(vd) * dz) / d < COS_FOV) return 0;
    }
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.65, this.pos.z);
    const target = new THREE.Vector3(player.pos.x, player.pos.y + (player.crouch > 0.5 ? 0.75 : 1.3), player.pos.z);
    const dir = target.clone().sub(eye);
    const len = dir.length();
    if (len === 0) return 1;
    dir.divideScalar(len);
    if (this.ctx.world.raycast(eye, dir, len) < len - 0.4) return 0;
    return d < FEEL ? 1 : Math.max(0.15, 1 - d / range);
  }
}

export class Guards {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = POSTS.map((p) => new Guard(ctx, p));
    this.active = false;
    this.zone = 'out'; // which posts are live: 'out' (the streets) or 'in' (inside the Kirya)
  }

  get maxSusp() {
    let m = 0;
    for (const g of this.list) if (g.on) m = Math.max(m, g.state === 'alert' || g.state === 'charge' || g.state === 'grab' ? 1 : g.susp);
    return m;
  }

  hear(p, r) {
    if (!this.active) return;
    for (const g of this.list) if (g.on) g.hear(p, r);
  }

  reset() {
    for (const g of this.list) g.reset();
  }

  update(dt) {
    for (const g of this.list) g.update(dt, this.active && (g.post.zone || 'out') === this.zone);
  }
}
