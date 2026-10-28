import * as THREE from 'three';
import { createCharacter, animate, addLabel, LOOKS } from './character.js';
import { audio } from './audio.js';

const APPROACH = 1.5, GRAB = 1.8, DOOR_APPROACH = 3.25, EXIT = 4.25, DONE = 4.5;
const ease = (k) => k * k * (3 - 2 * k);
const clamp = (k) => Math.max(0, Math.min(1, k));
const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// A separate actor and particle pool: the office officer's poop emitter remains
// available for its own scene. Amir only loses after this officer carries him out.
export class Shaikale {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = createCharacter({ ...LOOKS.officer, shirt: '#86b8e9', skin: '#d8a47e', hair: '#34241c', beard: true });
    this.ch.root.rotation.order = 'YXZ';
    addLabel(this.ch, 'SHAIKALE POOPALE', '#a9d9ff', 2.5);
    this.pos = this.ch.root.position;
    this.bubbleY = 2.2;
    this.nozzle = new THREE.Group();
    this.nozzle.position.set(0, -0.02, -0.17);
    this.ch.hips.add(this.nozzle);

    this.jet = new THREE.Group();
    this.jet.rotation.order = 'YXZ';
    const brown = new THREE.MeshStandardMaterial({ color: '#6b3c22', roughness: 0.95, transparent: true, opacity: 0.9 });
    const tan = new THREE.MeshStandardMaterial({ color: '#b17b43', roughness: 0.95, transparent: true, opacity: 0.8 });
    this.jet.add(new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.2, 12), brown));
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.24, 2.24, 10), tan);
    this.jet.add(core);
    this.trail = new THREE.Group();
    this.particles = [];
    const chunkGeometry = new THREE.SphereGeometry(0.09, 6, 4);
    for (let i = 0; i < 36; i++) {
      const mesh = new THREE.Mesh(chunkGeometry, i % 3 ? brown : tan);
      mesh.visible = false;
      this.trail.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
    ctx.scene.add(this.ch.root, this.jet, this.trail);
    this.from = new THREE.Vector3(-202, 3, -188);
    this.grabPoint = new THREE.Vector3();
    this.waypoint = new THREE.Vector3(-193, 2.2, -188);
    this.exitPoint = new THREE.Vector3(-179, 3, -188);
    this.originalAmirPos = new THREE.Vector3();
    this.originalAmirRotation = new THREE.Vector3();
    this.direction = new THREE.Vector3(1, 0, 0);
    this.previousPos = new THREE.Vector3();
    this.thrustPos = new THREE.Vector3();
    this.particleIndex = 0;
    this.grabbed = false;
    this.reset();
  }

  reset() {
    const amir = this.ctx.amir;
    if (this.grabbed && !amir.fight?.won) {
      amir.ch.root.visible = true;
      // If a cutscene itself was interrupted, put Amir back. A new fight's own
      // reset already supplies its correct pose and must not be overwritten.
      if (amir.fight?.stage === 'ultimate') {
        amir.pos.copy(this.originalAmirPos);
        amir.ch.root.rotation.set(this.originalAmirRotation.x, this.originalAmirRotation.y, this.originalAmirRotation.z);
      }
    }
    this.active = false;
    this.done = false;
    this.grabbed = false;
    this.finishedHit = false;
    this.t = 0;
    this.emission = 0;
    this.ch.root.visible = this.jet.visible = this.trail.visible = false;
    for (const particle of this.particles) {
      particle.life = 0;
      particle.mesh.visible = false;
    }
  }

  start() {
    this.reset();
    const amir = this.ctx.amir;
    this.active = true;
    this.originalAmirPos.copy(amir.pos);
    this.originalAmirRotation.set(amir.ch.root.rotation.x, amir.ch.root.rotation.y, amir.ch.root.rotation.z);
    this.grabPoint.copy(amir.pos).add(new THREE.Vector3(1.2, 0.75, 0.6));
    this.approachHeading = Math.atan2(this.grabPoint.x - this.from.x, this.grabPoint.z - this.from.z);
    this.exitHeading = Math.atan2(this.waypoint.x - this.grabPoint.x, this.waypoint.z - this.grabPoint.z);
    this.heading = this.approachHeading;
    this.pos.copy(this.from);
    this.previousPos.copy(this.pos);
    this.direction.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.ch.root.rotation.set(Math.PI / 2, this.heading, 0);
    this.ch.root.visible = this.jet.visible = this.trail.visible = true;
    amir.ch.root.visible = true;
    this.ctx.hud.bubble(this, 'SHAIKALE POOPALE! EXPRESS PICKUP!', true);
    audio.say('Shaikale Poopale! Express pickup!', 'officer');
    audio.whoosh();
  }

  carryAmir(dt) {
    const amir = this.ctx.amir, sx = Math.sin(this.heading), cz = Math.cos(this.heading);
    // His uniform is clutched beside Shaikale's outstretched hand. Both bodies
    // lie along the flight direction, fitting through the real lobby doorway.
    amir.pos.set(this.pos.x + sx * 0.35 + cz * 0.3, this.pos.y - 0.3, this.pos.z + cz * 0.35 - sx * 0.3);
    animate(amir.ch, { mode: 'flail' }, dt);
    amir.ch.root.rotation.set(Math.PI / 2, this.heading, 0, 'YXZ');
    amir.ch.root.visible = !this.finishedHit;
  }

  updateThrust(dt, emitting) {
    if (emitting) {
      this.ch.root.updateWorldMatrix(true, true);
      this.nozzle.getWorldPosition(this.thrustPos);
      const pulse = 0.9 + Math.sin(this.t * 33) * 0.08;
      this.jet.position.copy(this.thrustPos).addScaledVector(this.direction, -1.1 * pulse);
      this.jet.rotation.set(Math.acos(Math.max(-1, Math.min(1, this.direction.y))), Math.atan2(this.direction.x, this.direction.z), 0);
      this.jet.scale.set(pulse, pulse, pulse);
      this.emission += dt * 48;
      while (this.emission >= 1) {
        this.emission--;
        const particle = this.particles[this.particleIndex++ % this.particles.length];
        particle.life = 0.35 + Math.random() * 0.25;
        particle.mesh.visible = true;
        particle.mesh.position.copy(this.thrustPos);
        particle.velocity.copy(this.direction).multiplyScalar(-5 - Math.random() * 4);
        particle.velocity.y += (Math.random() - 0.5) * 1.5;
      }
    }
    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      particle.mesh.visible = particle.life > 0;
      particle.velocity.y -= dt * 3;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.scale.setScalar(Math.max(0.15, particle.life * 2));
    }
  }

  update(dt) {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    this.t += dt;
    const t = this.t;
    this.previousPos.copy(this.pos);
    if (t < APPROACH) {
      this.pos.lerpVectors(this.from, this.grabPoint, ease(t / APPROACH));
      this.heading = this.approachHeading;
    } else if (t < GRAB) {
      this.pos.copy(this.grabPoint);
      this.heading = angleLerp(this.approachHeading, this.exitHeading, ease((t - APPROACH) / (GRAB - APPROACH)));
    } else if (t < DOOR_APPROACH) {
      this.grabbed = true;
      this.pos.lerpVectors(this.grabPoint, this.waypoint, ease((t - GRAB) / (DOOR_APPROACH - GRAB)));
      this.heading = this.exitHeading;
    } else {
      this.grabbed = true;
      const k = clamp((t - DOOR_APPROACH) / (EXIT - DOOR_APPROACH));
      this.pos.lerpVectors(this.waypoint, this.exitPoint, ease(k));
      // Stay below the 3.2m door lintel until both horizontal bodies clear it.
      this.pos.y = 2.2 + Math.max(0, this.pos.x + 183) * (0.8 / 4);
      this.heading = Math.PI / 2;
    }
    const dx = this.pos.x - this.previousPos.x, dy = this.pos.y - this.previousPos.y, dz = this.pos.z - this.previousPos.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > 0.0001) this.direction.set(dx / distance, dy / distance, dz / distance);
    else this.direction.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    animate(this.ch, { speed: 0, mode: 'flail' }, dt);
    this.ch.root.rotation.set(Math.PI / 2, this.heading, 0);
    this.ch.spine.rotation.set(0, 0, 0);
    for (const arm of this.ch.arms) {
      arm.sh.rotation.set(this.grabbed || t >= APPROACH ? -1.05 : -2.1, 0, arm.s * 0.1);
      arm.el.rotation.set(this.grabbed ? -0.6 : -0.2, 0, 0);
    }
    if (this.grabbed) this.carryAmir(dt);
    if (t >= EXIT && !this.finishedHit) {
      this.finishedHit = true;
      this.ctx.amir.ch.root.visible = false;
      this.ctx.amir.ultimateHit();
      this.ctx.hud.bubble(this, 'NEXT STOP: OUTSIDE!', true);
      audio.whoosh();
    }
    const emitting = t < DONE;
    this.jet.visible = emitting;
    this.updateThrust(dt, emitting);
    if (t >= DONE) {
      this.done = true;
      this.ch.root.visible = false;
    }
    if (t >= DONE + 0.8) {
      this.active = false;
      this.trail.visible = false;
    }
  }
}
