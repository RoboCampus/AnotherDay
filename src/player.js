import * as THREE from 'three';
import { createCharacter, animate, addPhone, LOOKS } from './character.js';
import { audio } from './audio.js';
import { kipaMesh } from './kipa.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const WALK = 3.6, RUN = 6.8, SNEAK = 1.9;
export const THROW_SPEED = 200 / 3.6; // m/s

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _f = new THREE.Vector3();

// Argaman. States:
//   free    – player control
//   auto    – walks itself to `autoTarget` (cutscenes, the line)
//   frozen  – stands still (dialogue)
//   grabbed – a meteorologist has him (position set by the guard)
//   thrown  – flying away from the Kirya at 200 km/h
//   seated  – at his desk, the end
export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = createCharacter(LOOKS.argaman);
    addPhone(this.ch);
    // knitted kipa on the back of the crown
    this.kipa = kipaMesh();
    this.kipa.scale.setScalar(0.115);
    this.kipa.position.set(0, 0.266, -0.035);
    this.kipa.rotation.x = -0.3;
    this.ch.head.add(this.kipa);
    this.throwT = 0;
    ctx.scene.add(this.ch.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.yaw = 0;
    this.pitch = -0.18;
    this.dist = 4.2;
    this.state = 'frozen';
    this.crouch = 0;
    this.speed = 0;
    this.vy = 0;
    this.onGround = true;
    this.noise = 0;
    this.mode = null; // animation override ('phone', 'wave', 'sit'...)
    this.talk = false;
    this.autoTarget = null;
    this.autoSpeed = WALK;
    this.hidden = false;
    this.camOverride = null; // { pos, look, k }
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.flight = null;
    this.moveLocked = false;
  }

  place(x, z, heading = this.heading, y = null) {
    this.pos.set(x, y ?? this.ctx.world.groundY(x, z, 0), z);
    this.heading = heading;
    this.yaw = heading;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.ch.root.rotation.set(0, heading, 0);
    this.snapCamera();
  }

  get forward() {
    return _f.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  walkTo(x, z, speed = WALK) {
    this.state = 'auto';
    this.autoTarget = new THREE.Vector3(x, 0, z);
    this.autoSpeed = speed;
  }

  get arrived() {
    return !this.autoTarget;
  }

  face(x, z) {
    this.heading = Math.atan2(x - this.pos.x, z - this.pos.z);
  }

  // el: launch angle in degrees (indoors it is low, so he flies out through the door)
  throwAway(dir, el = 35) {
    el = THREE.MathUtils.degToRad(el);
    this.state = 'thrown';
    this.vel.set(dir.x * Math.cos(el), Math.sin(el), dir.z * Math.cos(el)).multiplyScalar(THROW_SPEED);
    this.flight = { t: 0, landed: false, landT: 0, splat: false, spin: new THREE.Vector3(7 + Math.random() * 4, 3, 5 + Math.random() * 3) };
    audio.whoosh();
  }

  update(dt) {
    const { input, world } = this.ctx;
    if ((input.locked || input.fallback) && !this.camOverride) {
      this.yaw -= input.dx * 0.0024;
      this.pitch = clamp(this.pitch - input.dy * 0.002, -1.1, 0.45);
    }
    if (this.state === 'thrown') return this.updateThrown(dt);
    if (this.state === 'grabbed') {
      animate(this.ch, { mode: 'flail' }, dt);
      this.ch.root.position.copy(this.pos);
      this.ch.root.rotation.y = this.heading;
      return;
    }

    const want = _v.set(0, 0, 0);
    let speed = WALK;
    let crouchWanted = false;
    if (this.state === 'free' && !this.moveLocked) {
      const fwd = (input.key('KeyW') || input.key('ArrowUp') ? 1 : 0) - (input.key('KeyS') || input.key('ArrowDown') ? 1 : 0);
      const str = (input.key('KeyD') || input.key('ArrowRight') ? 1 : 0) - (input.key('KeyA') || input.key('ArrowLeft') ? 1 : 0);
      const sy = Math.sin(this.yaw), cyw = Math.cos(this.yaw);
      want.set(sy * fwd - cyw * str, 0, cyw * fwd + sy * str);
      if (want.lengthSq() > 0) want.normalize();
      crouchWanted = input.key('KeyC') || input.key('ControlLeft');
      speed = crouchWanted ? SNEAK : input.key('ShiftLeft') || input.key('ShiftRight') ? RUN : WALK;
      if ((input.hit('KeyF') || input.hit('Mouse0')) && this.ctx.kipa.ready) {
        // throw where the camera looks (a little upwards bias so it clears the ground)
        const dir = this.forward.clone();
        dir.y = clamp(dir.y + 0.08, -0.35, 0.5);
        this.heading = this.yaw;
        this.throwT = 0.35;
        this.ctx.kipa.throw(dir);
      }
      if (input.hit('KeyQ') && this.ctx.andrey.ready) this.ctx.andrey.summon();
      if (input.hit('Space') && this.onGround && !crouchWanted) {
        this.vy = 4.6;
        this.onGround = false;
      }
    } else if (this.state === 'auto' && this.autoTarget) {
      want.set(this.autoTarget.x - this.pos.x, 0, this.autoTarget.z - this.pos.z);
      const d = want.length();
      speed = this.autoSpeed;
      if (d < 0.15) {
        this.autoTarget = null;
        want.set(0, 0, 0);
        this.vel.set(0, 0, 0);
      } else {
        want.divideScalar(d);
        if (d < 1) speed *= Math.max(0.25, d);
      }
    }
    this.crouch += ((crouchWanted ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);

    const k = Math.min(1, dt * (want.lengthSq() > 0 ? 10 : 14));
    this.vel.x += (want.x * speed - this.vel.x) * k;
    this.vel.z += (want.z * speed - this.vel.z) * k;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.05) {
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
      const scripted = this.state === 'auto';
      if (scripted || world.walkable(nx, nz, this.pos.y)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else if (world.walkable(nx, this.pos.z, this.pos.y)) this.pos.x = nx;
      else if (world.walkable(this.pos.x, nz, this.pos.y)) this.pos.z = nz;
      if (!scripted) world.collide(this.pos, 0.33, 1.75);
      this.heading = lerpAngle(this.heading, Math.atan2(this.vel.x, this.vel.z), Math.min(1, dt * 12));
    }
    this.speed = hs;
    // vertical: stairs, jumps
    const g = world.groundY(this.pos.x, this.pos.z, this.pos.y);
    if (this.onGround && this.pos.y - g < 0.7 && this.vy <= 0) {
      this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18);
      if (Math.abs(this.pos.y - g) < 0.02) this.pos.y = g;
    } else {
      this.vy -= 18 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) {
        this.pos.y = g;
        this.vy = 0;
        this.onGround = true;
      } else this.onGround = false;
    }
    this.hidden = this.crouch > 0.5 && world.inBush(this.pos);
    this.noise = this.state !== 'free' ? 0 : hs > 5 ? 1 : hs > 2.5 ? 0.35 : 0;

    this.ch.root.position.copy(this.pos);
    this.ch.root.rotation.set(0, this.heading, 0);
    animate(this.ch, { speed: hs, crouch: this.crouch, mode: this.mode || (this.onGround ? 'walk' : 'flail'), talk: this.talk }, dt);
    if (!this.onGround && this.state === 'free' && !this.mode) animate(this.ch, { speed: 0, mode: 'cheer' }, 0);
    if (this.throwT > 0) {
      // backhand frisbee throw: the right arm (arms[0], -x) whips out from across the body
      this.throwT -= dt;
      const k = 1 - Math.max(0, this.throwT) / 0.35, R = this.ch.arms[0];
      R.sh.rotation.set(-1.5, 0, 0.9 - k * 1.9);
      R.el.rotation.set(-1.6 * (1 - k), 0, 0);
      this.ch.spine.rotation.y = 0.6 - k * 1.1;
    }
  }

  updateThrown(dt) {
    const f = this.flight, w = this.ctx.world;
    f.t += dt;
    if (!f.landed) {
      this.vel.y -= 9.8 * dt;
      this.pos.addScaledVector(this.vel, dt);
      f.rx = (f.rx || 0) + f.spin.x * dt * (f.splat ? 0.2 : 1);
      f.rz = (f.rz || 0) + f.spin.z * dt * (f.splat ? 0.2 : 1);
      const hit = w.solidAt(_t.copy(this.pos).setY(this.pos.y + 0.9));
      const g = w.groundY(this.pos.x, this.pos.z, this.pos.y);
      if (hit && !f.splat) {
        // flew into a building: splat and slide down the wall
        f.splat = true;
        this.pos.addScaledVector(this.vel, -dt * 1.5);
        this.vel.set(0, -2, 0);
        audio.splat();
        this.ctx.fx.emit(this.pos.clone().setY(this.pos.y + 1), 30, { color: '#d8d0c0', speed: 5, life: 0.8 });
      }
      if (this.pos.y <= g || f.t > 7) {
        this.pos.y = Math.max(this.pos.y, g);
        f.landed = true;
        this.vel.y = 0;
        this.vel.multiplyScalar(f.splat ? 0 : 0.35);
        audio.splat();
        this.ctx.fx.emit(this.pos.clone().setY(this.pos.y + 0.3), 40, { color: '#cbb894', speed: 6, life: 1, gravity: 6 });
      }
      animate(this.ch, { mode: 'flail' }, dt);
      this.ch.root.rotation.set(f.rx, this.heading, f.rz);
    } else {
      f.landT += dt;
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5));
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y = Math.max(w.groundY(this.pos.x, this.pos.z, this.pos.y), this.pos.y - dt * 4);
      this.ch.root.rotation.set(-Math.PI / 2, this.heading, 0);
      this.ch.root.rotation.x += Math.sin(f.landT * 8) * 0.1 * Math.max(0, 1 - f.landT);
      animate(this.ch, { mode: 'down' }, dt);
      this.ch.root.rotation.x = -Math.PI / 2;
    }
    this.ch.root.position.copy(this.pos);
    this.speed = this.vel.length();
  }

  snapCamera() {
    this.updateCamera(1, true);
  }

  updateCamera(dt, snap = false) {
    const cam = this.ctx.camera;
    if (this.camOverride) {
      const o = this.camOverride, k = snap ? 1 : Math.min(1, dt * (o.speed ?? 3));
      this.camPos.lerp(o.pos, k);
      this.camLook.lerp(o.look, k);
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      return;
    }
    if (this.state === 'thrown') {
      // chase cam behind the flight
      const back = _t.copy(this.vel).setY(0);
      if (back.lengthSq() < 0.01) back.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      back.normalize();
      const want = this.pos.clone().addScaledVector(back, -9).add(new THREE.Vector3(0, 4, 0));
      this.camPos.lerp(want, Math.min(1, dt * 4));
      this.camLook.lerp(this.pos, Math.min(1, dt * 8));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      return;
    }
    const head = _t.set(this.pos.x, this.pos.y + 1.55 - this.crouch * 0.45, this.pos.z);
    const sy = Math.sin(this.yaw), cyw = Math.cos(this.yaw);
    head.x += -cyw * 0.45;
    head.z += sy * 0.45;
    const f = this.forward;
    const back = _v.copy(f).negate();
    const hit = this.ctx.world.raycast(head, back, this.dist, 'cam');
    const d = Math.max(0.6, Math.min(this.dist, hit - 0.25));
    const want = head.clone().addScaledVector(back, d);
    const gy = this.ctx.world.groundY(want.x, want.z, this.pos.y) + 0.3;
    if (want.y < gy) want.y = gy;
    if (snap) this.camPos.copy(want);
    else this.camPos.lerp(want, Math.min(1, dt * 18));
    this.camLook.copy(head).addScaledVector(f, 6);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
  }
}
