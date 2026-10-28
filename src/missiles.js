import * as THREE from 'three';
import * as L from './layout.js';
import { audio } from './audio.js';

const FLIGHT = 2.4; // seconds from the edge of the sky to the ground
const SHRUGS = ['So anyway...', 'Anyway.', '...as I was saying.', 'Is the line moving?', 'Classic.', 'Did you see the game last night?', 'Hm.'];
const pick = (a) => a[(Math.random() * a.length) | 0];
const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(10,8,6,0.95)');
  grad.addColorStop(0.45, 'rgba(25,20,16,0.7)');
  grad.addColorStop(1, 'rgba(30,26,22,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function puffTexture(solid = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, `rgba(255,255,255,${solid ? 0.85 : 0.45})`);
  grad.addColorStop(solid ? 0.8 : 1, `rgba(255,255,255,${solid ? 0.4 : 0})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Ballistic missiles falling on the Kirya now and then while Argaman waits in line.
// A white streak, a smoke trail, a fireball, a boom, a smoke column. Nobody in line reacts.
export class Missiles {
  constructor(ctx) {
    this.ctx = ctx;
    const scene = ctx.scene;
    this.tex = puffTexture();
    // smoke puffs: one pool for trails and columns
    this.puffs = [];
    for (let i = 0; i < 220; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: '#9a9690', transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, life: 0, max: 1, v: new THREE.Vector3(), grow: 1, size: 1, op: 0.6 });
    }
    this.pi = 0;
    // solid (not additive) so the fireball reads against a bright sky
    this.fireTex = puffTexture(true);
    this.fireMat = new THREE.SpriteMaterial({ map: this.fireTex, color: '#ff7a1a', transparent: true, depthWrite: false, fog: false });
    this.coreMat = new THREE.SpriteMaterial({ map: this.fireTex, color: '#fff2a8', transparent: true, depthWrite: false, fog: false });
    this.light = new THREE.PointLight('#ffb060', 0, 160, 1.4);
    scene.add(this.light);
    this.flying = [];
    this.booms = [];
    this.count = 0;
    this.scorches = [];
    this.scorchTex = scorchTexture();
  }

  // a black burn mark left on the facade (the oldest ones go once there are too many)
  scorch(p, n) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.scale.setScalar(7 + Math.random() * 4);
    m.position.copy(p).addScaledVector(n, -1.55); // on the facade, just outside the wall
    m.lookAt(_v.copy(m.position).add(n));
    m.rotateZ(Math.random() * 6);
    this.ctx.scene.add(m);
    this.scorches.push(m);
    if (this.scorches.length > 14) this.ctx.scene.remove(this.scorches.shift());
  }

  puff(pos, { size = 2, grow = 3, life = 3, color = '#9a9690', rise = 2, op = 0.6, spread = 1 } = {}) {
    const p = this.puffs[this.pi];
    this.pi = (this.pi + 1) % this.puffs.length;
    p.s.position.copy(pos);
    p.s.position.x += (Math.random() - 0.5) * spread;
    p.s.position.z += (Math.random() - 0.5) * spread;
    p.s.material.color.set(color);
    p.s.visible = true;
    p.life = p.max = life * (0.7 + Math.random() * 0.6);
    p.v.set((Math.random() - 0.5) * 1.5, rise * (0.6 + Math.random() * 0.8), (Math.random() - 0.5) * 1.5);
    p.size = size;
    p.grow = grow;
    p.op = op;
  }

  mesh() {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2d2f33', roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 6, 12), white);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.6, 12), dark);
    nose.position.y = 3.8;
    g.add(body, nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.9), dark);
      fin.position.set(Math.cos((i * Math.PI) / 2) * 0.6, -2.5, Math.sin((i * Math.PI) / 2) * 0.6);
      fin.rotation.y = (-i * Math.PI) / 2;
      g.add(fin);
    }
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: '#ffd86a', transparent: true, depthWrite: false, fog: false }));
    flame.position.y = -3.6;
    flame.scale.setScalar(3.2);
    g.add(flame);
    g.flame = flame;
    return g;
  }

  // A point on the outside of Argaman's building, and which way that face looks.
  pickTarget() {
    const B = L.BUILDING, y = 9 + Math.random() * 36;
    if (Math.random() < 0.7) return { p: new THREE.Vector3(B.x0 + 3 + Math.random() * (B.x1 - B.x0 - 6), y, B.z0 - 1.7), n: new THREE.Vector3(0, 0, -1) };
    return { p: new THREE.Vector3(B.x1 + 1.7, y, B.z0 + 3 + Math.random() * (B.z1 - B.z0 - 6)), n: new THREE.Vector3(1, 0, 0) };
  }

  launch(target = null) {
    const pt = target ? { p: target, n: new THREE.Vector3(0, 1, 0) } : this.pickTarget();
    target = pt.p;
    // from high up, out in front of the face it hits, coming down steeply
    const from = target.clone().addScaledVector(pt.n, 160 + Math.random() * 60).add(new THREE.Vector3(60 + Math.random() * 60, 300, 0));
    const m = this.mesh();
    m.scale.setScalar(1.8);
    this.ctx.scene.add(m);
    _v.subVectors(target, from).normalize();
    m.quaternion.setFromUnitVectors(_up, _v);
    this.flying.push({ m, from, target, n: pt.n, back: from.clone().sub(target).normalize(), t: 0, trail: 0 });
  }

  explode(target, n) {
    const { ctx } = this;
    this.count++;
    const fire = new THREE.Sprite(this.fireMat.clone());
    fire.position.copy(target).addScaledVector(n, 3).y += 2;
    fire.renderOrder = 5; // over the smoke
    const core = new THREE.Sprite(this.coreMat.clone());
    core.position.copy(target).addScaledVector(n, 2);
    this.scorch(target, n);
    core.renderOrder = 6;
    ctx.scene.add(fire, core);
    this.booms.push({ fire, core, t: 0, pos: target.clone().addScaledVector(n, 1.5), smokeT: 0, shrugged: false });
    this.light.position.copy(target).addScaledVector(n, 6);
    this.light.intensity = 4000;
    for (let i = 0; i < 16; i++) this.puff(_v.copy(target).addScaledVector(n, 2 + Math.random() * 3), { size: 6, grow: 5, life: 2.5, color: '#4a4440', rise: 6, op: 0.75, spread: 6 });
    ctx.fx.emit(_v.copy(target).addScaledVector(n, 1), 70, { color: '#ffb84d', speed: 16, life: 1.2, up: 4 });
    // debris off the facade
    ctx.fx.emit(_v.copy(target).addScaledVector(n, 1), 40, { color: '#8d877c', speed: 9, life: 2, up: 2 });
    const d = ctx.player.pos.distanceTo(target);
    audio.boom(Math.max(0.25, 1 - d / 400));
    ctx.shake = Math.max(ctx.shake || 0, Math.max(0, 0.7 * (1 - d / 300)));
  }

  update(dt) {
    const { ctx } = this;
    for (const f of this.flying) {
      f.t += dt;
      const k = Math.min(1, f.t / FLIGHT);
      f.m.position.lerpVectors(f.from, f.target, k);
      f.m.flame.scale.setScalar(2.8 + Math.random() * 1.2);
      f.trail -= dt;
      if (f.trail <= 0) {
        f.trail = 0.03;
        this.puff(_v.copy(f.m.position).addScaledVector(f.back, 6.5), { size: 2.2, grow: 2.5, life: 2.2, color: '#d8d6d2', rise: 0.3, op: 0.5, spread: 0.3 });
      }
      if (k >= 1) {
        ctx.scene.remove(f.m);
        this.explode(f.target, f.n);
        f.done = true;
      }
    }
    this.flying = this.flying.filter((f) => !f.done);
    this.light.intensity *= Math.max(0, 1 - dt * 5);
    for (const b of this.booms) {
      b.t += dt;
      const k = Math.min(1, b.t / 0.9);
      b.fire.scale.setScalar(6 + Math.sqrt(k) * 30);
      b.fire.material.opacity = 1 - k * k;
      b.core.scale.setScalar(4 + Math.sqrt(k) * 16);
      b.core.material.opacity = Math.max(0, 1 - k * 1.6);
      if (k >= 1 && b.fire.parent) ctx.scene.remove(b.fire, b.core);
      // a column of smoke for a while
      b.smokeT -= dt;
      if (b.t < 9 && b.smokeT <= 0) {
        b.smokeT = 0.18;
        this.puff(b.pos, { size: 4, grow: 4, life: 5, color: '#5e5852', rise: 4, op: 0.55, spread: 2 });
      }
      // ...and in the line, nobody cares
      if (!b.shrugged && b.t > 1.4) {
        b.shrugged = true;
        const e = pick(ctx.line.entries.filter((x) => x.ch) || []);
        if (e && Math.random() < 0.7) ctx.hud.bubble(e, pick(SHRUGS));
      }
      if (b.t > 9) b.done = true;
    }
    this.booms = this.booms.filter((b) => !b.done);
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.size + p.grow * k * 3);
      p.s.material.opacity = p.op * (1 - k) * Math.min(1, k * 8);
    }
  }
}
