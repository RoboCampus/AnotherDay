import * as THREE from 'three';
import { audio } from './audio.js';

const DOME = 0.62; // polar angle of the sphere cap (radians)
const SPEED = 30, RANGE = 26, BOUNCES = 3, BOUNCE_RANGE = 15, BACK_SPEED = 34;
export const KIPA_COOLDOWN = 4; // seconds after it lands back on his head

// Crocheted kipa: concentric rings from the centre out, a zig-zag band and a dark rim.
function kipaTex() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const rings = [[0, 14, '#1d2f6b'], [14, 26, '#f2f2ee'], [26, 36, '#1d2f6b'], [36, 44, '#f2f2ee'], [44, 96, '#f2f2ee'], [96, 104, '#1d2f6b'], [104, 116, '#f2f2ee'], [116, 128, '#1d2f6b']];
  for (const [y0, y1, col] of rings) {
    g.fillStyle = col;
    g.fillRect(0, y0, 128, y1 - y0);
  }
  // zig-zag band (u wraps around the kipa)
  g.strokeStyle = '#6a2a8c';
  g.lineWidth = 7;
  g.beginPath();
  for (let i = 0; i <= 16; i++) g.lineTo(i * 8, i % 2 ? 54 : 86);
  g.stroke();
  // crochet stitches
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let y = 0; y < 128; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 128; x += 4) g.fillRect(x, y, 2, 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; // the cap's v runs 1 (centre) to 0 (rim): canvas top = centre
  return t;
}

let MAT = null;
// A kipa of radius 1 (scale it down). The dome is flattened so it reads as fabric, not a bowl.
export function kipaMesh() {
  MAT ??= new THREE.MeshStandardMaterial({ map: kipaTex(), roughness: 0.95, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 6, 0, Math.PI * 2, 0, DOME), MAT);
  m.scale.y = 0.45;
  m.position.y = -Math.cos(DOME) * 0.45; // rim at y = 0
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

// The thrown kipa: flies out like Captain America's shield, ricochets between meteorologists
// (knocking each one out), bounces off walls, then homes back to Argaman's head.
export class Kipa {
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = kipaMesh();
    this.mesh.scale.setScalar(0.32); // bigger than on the head so it reads in flight
    this.mesh.visible = false;
    ctx.scene.add(this.mesh);
    this.state = 'head'; // head | out | back
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.hit = new Set();
    this.bonks = 0;
    this.cd = 0;
  }

  reset() {
    this.state = 'head';
    this.cd = 0;
    this.t = 0;
    this.target = null;
    this.hit.clear();
    this.amirHit = false;
    this.mesh.visible = false;
    this.ctx.player.kipa.visible = true;
  }

  get ready() {
    const phase = this.ctx.story?.phase, fight = this.ctx.amir?.fight;
    const canAttack = phase === 'sneak' || (phase === 'bossFight' && fight?.active && !fight.ultimateReady);
    return this.state === 'head' && this.cd <= 0 && canAttack && !this.ctx.phone?.blocksAttacks;
  }

  throw(dir) {
    if (!this.ready) return false;
    const p = this.ctx.player;
    this.pos.copy(p.pos).add(_v.set(0, 1.35, 0)).addScaledVector(_d.set(dir.x, 0, dir.z).normalize(), 0.5);
    this.vel.copy(dir).normalize().multiplyScalar(SPEED);
    this.state = 'out';
    this.dist = 0;
    this.t = 0;
    this.bounces = 0;
    this.hit.clear();
    this.amirHit = false;
    this.target = this.aimAssist(this.vel);
    this.mesh.visible = true;
    p.kipa.visible = false;
    audio.kipa();
    return true;
  }

  // The meteorologist closest to the aim line (within ~14°), if any is in sight.
  aimAssist(dir) {
    const boss = this.ctx.story.phase === 'bossFight';
    let best = null, bc = boss ? 0.94 : 0.97;
    const n = _d.copy(dir).normalize().clone();
    const candidates = boss ? [this.ctx.amir] : this.ctx.guards.list;
    for (const g of candidates) {
      if (!g.bonkable) continue;
      _v.set(g.pos.x, g.pos.y + 1.2, g.pos.z).sub(this.pos);
      const d = _v.length();
      if (d < 0.001) continue;
      const c = _v.dot(n) / d;
      if (d > RANGE || c < bc) continue;
      if (this.ctx.world.raycast(this.pos, _v.divideScalar(d), d) < d - 0.5) continue;
      best = g;
      bc = c;
    }
    return best;
  }

  // Head for the nearest conscious meteorologist we have not hit yet, if one is in sight.
  ricochet() {
    if (this.ctx.story.phase === 'bossFight' || this.bounces >= BOUNCES) return false;
    let best = null, bd = BOUNCE_RANGE;
    for (const g of this.ctx.guards.list) {
      if (this.hit.has(g) || !g.bonkable) continue;
      const d = _v.set(g.pos.x, g.pos.y + 1.2, g.pos.z).distanceTo(this.pos);
      if (d >= bd) continue;
      _d.copy(_v).sub(this.pos).divideScalar(d);
      if (this.ctx.world.raycast(this.pos, _d, d) < d - 0.5) continue;
      best = g;
      bd = d;
    }
    if (!best) return false;
    this.bounces++;
    this.target = best;
    this.dist = 0;
    return true;
  }

  update(dt) {
    if (this.state === 'head') {
      this.cd = Math.max(0, this.cd - dt);
      return;
    }
    const { player, world, guards, fx } = this.ctx;
    this.t += dt;
    if (this.state === 'out') {
      if (this.target) {
        // steer onto the ricochet target
        _v.set(this.target.pos.x, this.target.pos.y + 1.2, this.target.pos.z).sub(this.pos).normalize().multiplyScalar(SPEED);
        this.vel.lerp(_v, Math.min(1, dt * 12));
      }
      this.pos.addScaledVector(this.vel, dt);
      this.dist += SPEED * dt;
      const gy = world.groundY(this.pos.x, this.pos.z, this.pos.y) + 0.25;
      if (this.pos.y < gy) {
        this.pos.y = gy;
        this.vel.y = Math.abs(this.vel.y) * 0.5;
      }
      if (world.solidAt(this.pos)) {
        this.pos.addScaledVector(this.vel, -dt);
        audio.clang(0.6);
        fx.emit(this.pos, 14, { color: '#ffe9a8', speed: 6, life: 0.4 });
        if (!this.ricochet()) this.state = 'back';
      } else if (this.dist > RANGE) this.state = 'back';
    } else {
      // home onto Argaman's head, speeding up; fly through anything in the way
      _v.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
      const d = _v.distanceTo(this.pos);
      if (d < 0.8 || d > 80 || this.t > 8) {
        this.state = 'head';
        this.mesh.visible = false;
        player.kipa.visible = true;
        this.cd = KIPA_COOLDOWN;
        audio.catchKipa();
        return;
      }
      _v.sub(this.pos).divideScalar(d).multiplyScalar(BACK_SPEED + this.t * 6);
      this.vel.lerp(_v, Math.min(1, dt * 7));
      this.pos.addScaledVector(this.vel, dt);
    }
    // knock out any meteorologist in the way (out and on the way back)
    const targets = this.ctx.story.phase === 'bossFight' ? [] : guards.list;
    for (const g of targets) {
      if (this.hit.has(g) || !g.bonkable) continue;
      const dx = g.pos.x - this.pos.x, dz = g.pos.z - this.pos.z, dy = this.pos.y - g.pos.y;
      if (dx * dx + dz * dz < 1.1 && dy > 0.2 && dy < 2.1) {
        this.hit.add(g);
        this.bonks++;
        g.bonk(_d.copy(this.vel).setY(0).normalize());
        audio.clang(1);
        fx.emit(this.pos, 24, { color: '#ffd23f', speed: 7, life: 0.6 });
        this.ctx.shake = Math.max(this.ctx.shake || 0, 0.25);
        if (this.state === 'out') {
          this.target = null;
          if (!this.ricochet()) this.state = 'back';
        }
      }
    }
    // Amir's eye shield drops only during the boss fight's recovery window.
    const a = this.ctx.amir;
    if (a && !this.amirHit) {
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, dy = this.pos.y - a.pos.y;
      if (dx * dx + dz * dz < 1.2 && dy > 0.2 && dy < 2.3) {
        this.amirHit = true;
        this.state = 'back';
        this.target = null;
        audio.clang(1);
        fx.emit(this.pos, 20, { color: '#ff4a3a', speed: 6, life: 0.5 });
        a.kipaHit();
      }
    }
    if (this.target && (this.hit.has(this.target) || !this.target.bonkable)) this.target = null;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(0.25, this.t * 30, 0);
    if (Math.random() < 0.6) fx.emit(this.pos, 1, { color: '#9d7bff', speed: 0.3, up: 0, gravity: 0, life: 0.35, spread: 0.15 });
  }
}
