import * as THREE from 'three';
import { createCharacter, animate, addLabel, parts, mat, OLIVE } from './character.js';
import { audio } from './audio.js';

const ENTER = 0.7, LIFT = 1.5, RELEASE = 1.9, IMPACT = 3.1, DONE = 4.2;
const ease = (k) => k * k * (3 - 2 * k);

// A physical-looking satellite: gold foil bus, blue photovoltaic wings, dish,
// antenna and a nozzle. It stays below the hall ceiling during the throw.
function satellite() {
  const root = new THREE.Group();
  const { BOX, CYL, SPHERE, part } = parts;
  const gold = mat('#d7ae46', 0.35, 0.65), frame = mat('#c8d4df', 0.3, 0.75);
  const blue = mat('#164d94', 0.25, 0.5), cell = mat('#4d91cd', 0.3, 0.5);
  root.add(part(BOX, gold, 0, 0, 0, 0.9, 0.85, 0.9));
  for (const side of [-1, 1]) {
    const strut = part(CYL, frame, side * 0.76, 0, 0, 0.055, 0.8, 0.055);
    strut.rotation.z = Math.PI / 2;
    root.add(strut, part(BOX, frame, side * 1.7, 0, 0, 1.85, 0.09, 1.15));
    root.add(part(BOX, blue, side * 1.7, 0.052, 0, 1.75, 0.025, 1.05));
    for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) {
      root.add(part(BOX, cell, side * 1.7 - 0.68 + col * 0.34, 0.07, -0.34 + row * 0.34, 0.3, 0.012, 0.3));
    }
  }
  root.add(part(CYL, frame, 0, 0.62, 0, 0.045, 0.45, 0.045));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.43, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e2e8ed', metalness: 0.65, roughness: 0.3, side: THREE.DoubleSide }));
  dish.scale.y = 0.4;
  dish.rotation.z = Math.PI;
  dish.position.y = 0.86;
  dish.castShadow = true;
  root.add(dish, part(CYL, frame, 0, 1.02, 0, 0.018, 0.6, 0.018));
  root.add(part(SPHERE, mat('#ff7453', 0.4), 0, 1.34, 0, 0.055, 0.055, 0.055));
  root.add(part(CYL, mat('#3b4650', 0.4, 0.6), 0, -0.56, 0, 0.2, 0.3, 0.2));
  return root;
}

export class Shonchik {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = createCharacter({ shirt: OLIVE, pants: '#444e2e', skin: '#c89468', hair: '#24201a', beard: true, sleeves: 'short', vest: '#424b2c' });
    this.ch.root.scale.set(1.65, 1.24, 1.4);
    for (const arm of this.ch.arms) {
      arm.sh.scale.set(1.35, 1.15, 1.35);
      arm.sh.add(parts.part(parts.cap(0.078, 0.13), mat('#c89468', 0.75), 0, -0.14, 0));
    }
    addLabel(this.ch, 'SHONCHIK', '#8ee5ff', 2.55);
    this.satellite = satellite();
    this.debris = new THREE.Group();
    this.chunks = [];
    const debrisColors = ['#e4bb4c', '#367ab5', '#cad7e1'];
    for (let i = 0; i < 18; i++) {
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(0.16 + (i % 3) * 0.08, 0.08, 0.22), mat(debrisColors[i % debrisColors.length], 0.4, 0.5));
      chunk.castShadow = true;
      this.debris.add(chunk);
      this.chunks.push({ mesh: chunk, velocity: new THREE.Vector3(), spin: new THREE.Vector3() });
    }
    this.flash = new THREE.PointLight('#cdefff', 0, 22, 1.5);
    this.shockwave = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 48), new THREE.MeshBasicMaterial({ color: '#aee9ff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.shockwave.rotation.x = -Math.PI / 2;
    ctx.scene.add(this.ch.root, this.satellite, this.debris, this.flash, this.shockwave);
    this.from = new THREE.Vector3(-200.5, 0, -192.3);
    this.spot = new THREE.Vector3(-204.2, 0, -193);
    this.launch = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.pos = this.ch.root.position;
    this.bubbleY = 3.2;
    this.reset();
  }

  reset() {
    this.active = false;
    this.done = false;
    this.impacted = false;
    this.t = 0;
    this.ch.root.visible = this.satellite.visible = this.debris.visible = this.shockwave.visible = false;
    this.flash.intensity = 0;
  }

  start() {
    this.reset();
    this.active = true;
    this.pos.copy(this.from);
    this.target.copy(this.ctx.amir.pos).add(new THREE.Vector3(0, 1.35, 0));
    this.heading = Math.atan2(this.target.x - this.spot.x, this.target.z - this.spot.z);
    this.launch.copy(this.spot).add(new THREE.Vector3(Math.sin(this.heading) * 0.35, 3.25, Math.cos(this.heading) * 0.35));
    this.ch.root.rotation.set(0, this.heading, 0);
    this.satellite.rotation.set(0, this.heading, 0);
    this.ch.root.visible = this.satellite.visible = true;
    this.ctx.hud.bubble(this, 'I BROUGHT A SATELLITE.', true);
    audio.say('Shonchik is here. I brought a satellite.', 'andrey');
    audio.whoosh();
  }

  impact() {
    if (this.impacted) return;
    this.impacted = true;
    this.satellite.visible = false;
    this.debris.visible = this.shockwave.visible = true;
    this.flash.position.copy(this.target);
    this.shockwave.position.set(this.target.x, 0.12, this.target.z);
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i], angle = i * Math.PI * 2 / this.chunks.length;
      chunk.mesh.position.copy(this.target);
      chunk.velocity.set(Math.cos(angle) * (3 + i % 3), 3 + (i % 4), Math.sin(angle) * (3 + i % 3));
      chunk.spin.set(i % 2 ? 6 : -6, 3 + i % 4, 4);
    }
    this.ctx.fx.emit(this.target, 140, { color: '#d7efff', speed: 11, up: 3, life: 1.3, gravity: 12 });
    this.ctx.fx.emit(this.target, 70, { color: '#ffd56a', speed: 8, up: 2, life: 1.5, gravity: 10 });
    this.ctx.shake = Math.max(this.ctx.shake || 0, 1.4);
    this.ctx.hud.flash();
    audio.boom(1.1);
    audio.clang(1.2);
    this.ctx.amir.ultimateHit();
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    const entering = t < ENTER;
    this.pos.lerpVectors(this.from, this.spot, ease(Math.min(1, t / ENTER)));
    animate(this.ch, { speed: entering ? 5.5 : 0, mode: t >= IMPACT ? 'cheer' : 'walk' }, dt);
    this.ch.root.rotation.y = this.heading;
    if (t < RELEASE) {
      const lift = ease(Math.max(0, Math.min(1, (t - ENTER) / (LIFT - ENTER))));
      for (const arm of this.ch.arms) {
        arm.sh.rotation.set(-1.0 - lift * 1.9, 0, arm.s * 0.16);
        arm.el.rotation.set(-0.6 * (1 - lift), 0, 0);
      }
      this.ch.spine.rotation.x = t > LIFT ? -0.23 : 0.08;
      this.satellite.position.set(this.pos.x + Math.sin(this.heading) * 0.35, 1.85 + lift * 1.4, this.pos.z + Math.cos(this.heading) * 0.35);
    } else if (t < IMPACT) {
      const k = (t - RELEASE) / (IMPACT - RELEASE);
      this.satellite.position.lerpVectors(this.launch, this.target, k);
      this.satellite.position.y += Math.sin(k * Math.PI) * 2;
      this.satellite.rotation.set(0, this.heading + k * Math.PI * 2, Math.sin(k * Math.PI) * 0.06);
      for (const arm of this.ch.arms) arm.sh.rotation.set(-1.1, 0, arm.s * 0.25);
      this.ch.spine.rotation.x = 0.28;
      if (Math.random() < 0.7) this.ctx.fx.emit(this.satellite.position, 2, { color: '#9dd9ff', speed: 0.5, up: 0, life: 0.45, gravity: 0, spread: 0.3 });
    } else {
      this.impact();
      const age = t - IMPACT;
      this.flash.intensity = Math.max(0, 42 * (1 - age / 0.6));
      this.shockwave.scale.setScalar(1 + age * 9);
      this.shockwave.material.opacity = Math.max(0, 0.8 - age * 0.8);
      for (const chunk of this.chunks) {
        chunk.velocity.y -= 12 * dt;
        chunk.mesh.position.addScaledVector(chunk.velocity, dt);
        chunk.mesh.rotation.x += chunk.spin.x * dt;
        chunk.mesh.rotation.y += chunk.spin.y * dt;
        chunk.mesh.rotation.z += chunk.spin.z * dt;
        if (chunk.mesh.position.y < 0.12) {
          chunk.mesh.position.y = 0.12;
          chunk.velocity.y = Math.abs(chunk.velocity.y) * 0.25;
          chunk.velocity.x *= 0.85;
          chunk.velocity.z *= 0.85;
        }
      }
      if (t >= DONE) this.done = true;
      if (t >= 6.5) {
        this.active = false;
        this.ch.root.visible = this.debris.visible = this.shockwave.visible = false;
        this.flash.intensity = 0;
      }
    }
  }
}
