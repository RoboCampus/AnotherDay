import * as THREE from 'three';
import { createCharacter, animate, addLabel, OLIVE } from './character.js';
import { audio } from './audio.js';

export const ANDREY_COOLDOWN = 15;
const LIFE = 9, RUN = 6.5, REACH = 18, CIRCLE = 3.2, DISTRACT_R = 24;
const SHOUTS = ['KHLOBCHIK! KHLOBCHIK!', 'KHLOBCHIK!!', 'KHLOBCHIK! KHLOBCHIK! KHLOBCHIK!'];

const _v = new THREE.Vector3();

// Andrey: a soldier Argaman summons once inside the Kirya. He sprints ahead, runs in circles
// waving his arms and yelling "Khlobchik! Khlobchik!", and every meteorologist in earshot
// turns to stare at him instead of looking for Argaman. Then he vanishes.
export class Andrey {
  constructor(ctx) {
    this.ctx = ctx;
    this.ch = createCharacter({ shirt: OLIVE, pants: OLIVE, skin: '#f0c4a4', hair: '#d9c38c', cap: 'beret', beret: '#5a6b2a', belt: '#3b3a2a', sleeves: 'long' });
    addLabel(this.ch, 'ANDREY', '#7ef0a0');
    this.ch.root.visible = false;
    ctx.scene.add(this.ch.root);
    this.pos = this.ch.root.position;
    this.heading = 0;
    this.unlocked = false;
    this.active = false;
    this.cd = 0;
    this.t = 0;
    this.bubbleY = 2.6;
    this.summons = 0;
  }

  get ready() {
    return this.unlocked && !this.active && this.cd <= 0 && this.ctx.story?.phase !== 'bossFight';
  }

  // 1 = ready .. 0 = just used (for the HUD)
  get k() {
    return this.active ? 0 : 1 - this.cd / ANDREY_COOLDOWN;
  }

  summon() {
    const { player, world, fx, hud } = this.ctx;
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    // appear at Argaman's right shoulder, then sprint where he is looking (up to the first wall)
    this.pos.set(player.pos.x - cy * 1.1, player.pos.y, player.pos.z + sy * 1.1);
    const dir = _v.set(sy, 0, cy);
    const o = new THREE.Vector3(this.pos.x, this.pos.y + 1, this.pos.z);
    const d = Math.max(3, Math.min(REACH, world.raycast(o, dir, REACH) - 1.5));
    this.anchor = new THREE.Vector3(this.pos.x + sy * d, this.pos.y, this.pos.z + cy * d);
    this.heading = player.yaw;
    this.state = 'run';
    this.active = true;
    this.t = 0;
    this.a = 0;
    this.shoutT = 0.4;
    this.summons++;
    this.amirSaid = false;
    this.ch.root.visible = true;
    fx.emit(_v.set(this.pos.x, this.pos.y + 1, this.pos.z), 40, { color: '#7ef0a0', speed: 4, life: 0.7, gravity: 2 });
    audio.whoosh();
    audio.say('Khlobchik! Khlobchik!', 'andrey');
    hud.bubble(this, 'KHLOBCHIK! KHLOBCHIK!', true);
  }

  vanish() {
    if (!this.active) return;
    this.active = false;
    this.cd = ANDREY_COOLDOWN;
    this.ch.root.visible = false;
    this.ctx.fx.emit(_v.set(this.pos.x, this.pos.y + 1, this.pos.z), 40, { color: '#7ef0a0', speed: 4, life: 0.7, gravity: 2 });
    audio.plop();
  }

  update(dt) {
    if (!this.active) {
      this.cd = Math.max(0, this.cd - dt);
      return;
    }
    const { world, guards, hud } = this.ctx;
    this.t += dt;
    if (this.state === 'run') {
      const dx = this.anchor.x - this.pos.x, dz = this.anchor.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < CIRCLE) {
        this.state = 'circle';
        this.a = Math.atan2(this.pos.z - this.anchor.z, this.pos.x - this.anchor.x);
      } else {
        this.pos.x += (dx / d) * RUN * dt;
        this.pos.z += (dz / d) * RUN * dt;
        this.heading = Math.atan2(dx, dz);
      }
    } else {
      // round and round, arms in the air
      this.a += (RUN / CIRCLE) * dt;
      const x = this.anchor.x + Math.cos(this.a) * CIRCLE, z = this.anchor.z + Math.sin(this.a) * CIRCLE;
      this.heading = Math.atan2(x - this.pos.x, z - this.pos.z);
      this.pos.x = x;
      this.pos.z = z;
    }
    world.collide(this.pos, 0.3, 1.75);
    this.pos.y = world.groundY(this.pos.x, this.pos.z, this.pos.y);
    this.shoutT -= dt;
    if (this.shoutT <= 0) {
      this.shoutT = 1.7;
      hud.bubble(this, SHOUTS[(Math.random() * SHOUTS.length) | 0], true);
      if (this.t > 4 && this.t < 4 + 1.7) audio.say('Khlobchik! Khlobchik! Khlobchik!', 'andrey');
    }
    // every meteorologist in earshot stops to stare
    for (const g of guards.list) if (g.on && g.pos.distanceTo(this.pos) < DISTRACT_R) g.distract(this);
    // ...except Amir, who could not care less
    const amir = this.ctx.amir;
    if (amir?.on && !this.amirSaid && amir.pos.distanceTo(this.pos) < DISTRACT_R) {
      this.amirSaid = true;
      amir.andreyHere();
    }

    this.ch.root.rotation.y = this.heading;
    animate(this.ch, { speed: RUN, talk: true }, dt);
    const t = this.ch.t;
    for (const A of this.ch.arms) {
      A.sh.rotation.set(Math.sin(t * 13 + A.s) * 0.5, 0, A.s * (2.4 + Math.sin(t * 15 + A.s * 2) * 0.55));
      A.el.rotation.set(-0.3 - Math.abs(Math.sin(t * 17)) * 0.9, 0, 0);
    }
    this.ch.head.rotation.z = Math.sin(t * 9) * 0.25;
    if (this.t > LIFE) this.vanish();
  }
}
