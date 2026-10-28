import * as THREE from 'three';
import * as L from './layout.js';
import { createCharacter, animate, addLabel, LOOKS, parts, mat } from './character.js';
import { labelSprite } from './textures.js';
import { audio } from './audio.js';
import { BossFight, BOSS_ATTACK, BOSS_ARENA, BOSS_POSITION } from './boss-fight.js';

const RANGE = 55, HALF = 0.42, COS_HALF = Math.cos(HALF), SWEEP = 1.15, TURN = 1.6, RAYS = 48;
const SUSPICIOUS = ['Hm?', 'Who is there?', 'I saw that.', 'Something purple...'];
const ZAP = ['ARGAMAN. NO.', 'NOBODY ENTERS THE PIT.', 'RED EYES SEE EVERYTHING.', 'NOT ON MY WATCH.'];
const KIPA = ['A kipa? Seriously?', 'Nice try.', 'I do not get dizzy.', 'Red eyes. No stars.'];
const pick = (a) => a[(Math.random() * a.length) | 0];
const ease = (k) => k * k * (3 - 2 * k);
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const SEAT = { x: -202.8, y: 0.61, z: -203.2, heading: 0 };
const WOMAN_HOME = { x: -200.5, y: 0, z: -203.3 };
const WOMAN_RECOVERY = { x: -203.3, y: 0, z: -201.5 };
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// Amir watches the Pit during stealth, ignoring the kipa and Andrey. At the
// elevator he throws meteorologists and officers at Argaman. Dodge the red
// landing circles, then hit his yellow eyes to charge Shonchik's ultimate.
export class Amir {
  constructor(ctx) {
    this.ctx = ctx;
    const ch = createCharacter({ ...LOOKS.officer, skin: '#d9a982', hair: '#1a1a1a' }); // the blue officer's uniform
    ch.root.scale.setScalar(1.08);
    // the red eyes, glowing
    const red = new THREE.MeshBasicMaterial({ color: '#ff1a1a' });
    const glowMat = new THREE.SpriteMaterial({ map: labelSprite('●', { color: '#ff2a2a', bg: 'rgba(0,0,0,0)', size: 1, font: 60 }).material.map, color: '#ff4040', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = parts.part(parts.SPHERE, red, s * 0.04, 0.12, 0.104, 0.02, 0.02, 0.012);
      ch.head.add(eye);
      const glow = new THREE.Sprite(glowMat);
      glow.position.set(s * 0.04, 0.12, 0.12);
      glow.scale.setScalar(0.09);
      ch.head.add(glow);
      this.eyes.push(eye);
    }
    this.glowMat = glowMat;
    this.eyeMat = red;
    addLabel(ch, 'AMIR', '#ff5a5a', 2.3);
    ch.root.position.set(L.AMIR.x, 0, L.AMIR.z);
    ctx.scene.add(ch.root);
    this.ch = ch;
    this.pos = ch.root.position;
    this.bubbleY = 2.9;
    this.icon = labelSprite('?', { color: '#ff5a5a', bg: 'rgba(0,0,0,0)', size: 0.9, font: 52 });
    this.icon.position.y = 2.75;
    this.icon.visible = false;
    ch.root.add(this.icon);
    // his view: a fan on the floor, traced with rays so the shadows behind cover show
    this.fanGeo = new THREE.BufferGeometry();
    this.fanPos = new Float32Array((RAYS + 1) * 3 * 3);
    this.fanGeo.setAttribute('position', new THREE.BufferAttribute(this.fanPos, 3));
    this.fan = new THREE.Mesh(this.fanGeo, new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    this.fan.frustumCulled = false;
    this.fan.renderOrder = 2;
    ctx.scene.add(this.fan);
    this.rays = []; // [x, z] end points, for the minimap
    // eye lasers
    const laserMat = new THREE.MeshBasicMaterial({ color: '#ff2020', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lasers = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), laserMat);
      m.visible = false;
      ctx.scene.add(m);
      return m;
    });
    // Thrown people and landing warnings are pooled for the boss fight.
    this.fight = new BossFight();
    this.bossBody = ctx.world.add(BOSS_POSITION.x - 0.6, BOSS_POSITION.x + 0.6, BOSS_POSITION.z - 0.6, BOSS_POSITION.z + 0.6, 0, 2.5, { occl: false, cam: false });
    this.bossBody.off = true;
    this.bossLane = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 1), new THREE.MeshBasicMaterial({ color: '#ff4b39', transparent: true, opacity: 0.3, depthWrite: false }));
    this.bossLane.renderOrder = 3;
    this.bossTarget = new THREE.Mesh(new THREE.RingGeometry(BOSS_ATTACK.radius - 0.1, BOSS_ATTACK.radius, 48), new THREE.MeshBasicMaterial({ color: '#ff6d43', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.bossTarget.rotation.x = -Math.PI / 2;
    this.bossTarget.renderOrder = 4;
    this.bossRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.12, 48), new THREE.MeshBasicMaterial({ color: '#ffd54f', transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    this.bossRing.rotation.x = -Math.PI / 2;
    this.bossRing.renderOrder = 4;
    this.bossBounds = new THREE.Group();
    const edgeMat = new THREE.MeshBasicMaterial({ color: '#ff9f43', transparent: true, opacity: 0.8 });
    const A = BOSS_ARENA;
    for (const z of [A.z0, A.z1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(A.x1 - A.x0, 0.04, 0.08), edgeMat);
      edge.position.set((A.x0 + A.x1) / 2, 0.08, z);
      this.bossBounds.add(edge);
    }
    for (const x of [A.x0, A.x1]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, A.z1 - A.z0), edgeMat);
      edge.position.set(x, 0.08, (A.z0 + A.z1) / 2);
      this.bossBounds.add(edge);
    }
    this.throwCountdown = labelSprite('INCOMING', { color: '#ffd3a4', size: 0.38, font: 28 });
    this.throwCountdown.material.depthTest = false;
    this.throwCountdown.renderOrder = 5;
    this.countdownText = '';
    const meteo = createCharacter({ ...LOOKS.soldier, cap: 'helmet', vest: '#4a5030', backpack: '#4a5030' });
    addLabel(meteo, 'METEOROLOGIST', '#ffe082', 2.3);
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshStandardMaterial({ color: '#eeeeea', roughness: 0.6 }));
    balloon.position.set(0, 2.8, -0.3);
    meteo.root.add(balloon);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.4, 4), new THREE.MeshBasicMaterial({ color: '#ddd' }));
    string.position.set(0, 1.8, -0.3);
    meteo.root.add(string);
    const thrownOfficer = createCharacter(LOOKS.officer);
    addLabel(thrownOfficer, 'OFFICER', '#9fd3ff', 2.3);
    this.thrownPeople = { meteorologist: meteo, officer: thrownOfficer };
    const woman = createCharacter({ ...LOOKS.officer, ponytail: true, hair: '#3a2416', skin: '#e8c09a' });
    addLabel(woman, 'WOMAN OFFICER', '#9fd3ff', 2.3);
    woman.root.position.set(-200.5, 0, -203.3);
    ctx.scene.add(woman.root);
    this.womanOfficer = woman;
    const chair = new THREE.Group();
    const padding = mat('#263c50', 0.95), frame = mat('#69747e', 0.5, 0.5);
    const chairBox = (w, h, d, x, y, z, material) => chair.add(parts.part(parts.BOX, material, x, y, z, w, h, d));
    chairBox(0.68, 0.09, 0.65, 0, 1, 0, padding);
    chairBox(0.68, 0.9, 0.11, 0, 1.45, -0.32, padding);
    for (const x of [-0.27, 0.27]) for (const z of [-0.25, 0.25]) chairBox(0.055, 0.95, 0.055, x, 0.475, z, frame);
    for (const x of [-0.39, 0.39]) {
      chairBox(0.075, 0.06, 0.58, x, 1.25, 0, padding);
      chairBox(0.045, 0.25, 0.045, x, 1.12, 0.19, frame);
    }
    chair.position.set(SEAT.x, 0, SEAT.z);
    chair.rotation.y = SEAT.heading;
    chair.visible = false;
    ctx.scene.add(chair);
    this.recoveryChair = chair;
    this.recoveryMode = null;
    this.recoveryBeat = null;
    this.recoveryProgress = 0;
    this.recoveryPath = [];
    for (const person of Object.values(this.thrownPeople)) {
      person.root.scale.setScalar(0.9);
      person.root.visible = false;
      ctx.scene.add(person.root);
    }
    ctx.scene.add(this.bossLane, this.bossTarget, this.bossRing, this.bossBounds, this.throwCountdown);
    this.on = false;
    this.reset();
  }

  reset() {
    this.fight?.stop();
    this.resetRecoveryPose();
    if (this.bossBody) this.bossBody.off = true;
    this.pos.set(L.AMIR.x, 0, L.AMIR.z);
    this.hideBossEffects();
    this.eyeMat.color.set('#ff1a1a');
    this.glowMat.color.set('#ff4040');
    this.state = 'watch';
    this.t = 0;
    this.sweepT = 0;
    this.hold = 2.2;
    this.side = 1; // 1 = looking left (west), -1 = right (east)
    this.offset = SWEEP;
    this.susp = 0;
    this.icon.visible = false;
    for (const l of this.lasers) l.visible = false;
  }

  get viewDir() {
    return Math.PI + this.offset;
  }

  setIcon(text) {
    const s = labelSprite(text, { color: '#ff3b30', bg: 'rgba(0,0,0,0)', size: 0.9, font: 56 });
    this.icon.material.map.dispose();
    this.icon.material.map = s.material.map;
    this.icon.material.needsUpdate = true;
    this.icon.visible = true;
  }

  get bonkable() {
    return this.state === 'boss' && this.fight.active && this.fight.stage !== 'ultimate';
  }

  get ultimateReady() {
    return this.fight.active && this.fight.ultimateReady;
  }

  useUltimate() {
    if (!this.fight.beginUltimate()) return false;
    this.hideBossEffects();
    this.ctx.hud.bubble(this, this.fight.round === 2 ? 'Not Shaikale Poopale!' : 'Wait. Who is Shonchik?!', true);
    return true;
  }

  ultimateHit() {
    if (!this.fight.finishUltimate()) return false;
    this.hideBossEffects();
    this.ctx.fx.emit(this.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 70, { color: this.fight.round === 2 ? '#82502b' : '#d08cff', speed: 10, life: 1.2 });
    this.ctx.shake = Math.max(this.ctx.shake || 0, 1.2);
    audio.splat();
    return true;
  }

  startBoss(round = 1) {
    this.resetRecoveryPose();
    this.bossBody.off = false;
    this.pos.set(BOSS_POSITION.x, BOSS_POSITION.y, BOSS_POSITION.z);
    this.state = 'boss';
    this.on = false;
    this.susp = 0;
    this.t = 0;
    this.icon.visible = false;
    this.fan.visible = false;
    this.rays.length = 0;
    this.hideBossEffects();
    this.fight.start(this.ctx.player.pos, { x: this.pos.x, y: this.pos.y + 1.85, z: this.pos.z }, round);
    this.bossBounds.visible = true;
    audio.alert();
  }

  retryBoss() {
    this.startBoss(this.fight.round);
  }

  beginRecovery() {
    this.state = 'recovering';
    this.recoveryMode = 'retreat';
    this.recoveryBeat = null;
    this.recoveryProgress = 0;
    this.recoveryPath = [this.pos.clone(), new THREE.Vector3(-209, 0, -196), new THREE.Vector3(-209, 0, SEAT.z), new THREE.Vector3(SEAT.x, 0, SEAT.z)];
    this.recoveryChair.visible = true;
    this.on = false;
    this.bossBody.off = true;
    this.hideBossEffects();
    this.icon.visible = false;
    this.fan.visible = false;
    this.rays.length = 0;
  }

  moveRecoveryPath(progress, reverse = false) {
    if (!this.recoveryPath.length) return;
    const points = reverse ? this.recoveryPath.slice().reverse() : this.recoveryPath;
    const k = Math.max(0, Math.min(1, progress));
    const lengths = points.slice(1).map((p, i) => p.distanceTo(points[i]));
    let distance = k * lengths.reduce((sum, length) => sum + length, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (distance > lengths[i] && i < lengths.length - 1) {
        distance -= lengths[i];
        continue;
      }
      this.pos.lerpVectors(points[i], points[i + 1], Math.min(1, distance / Math.max(lengths[i], 1e-8)));
      this.ch.root.rotation.set(0, Math.atan2(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z), 0);
      break;
    }
  }

  animateRetreat(k) {
    this.recoveryMode = 'retreat';
    this.recoveryBeat = null;
    this.recoveryProgress = k;
    this.moveRecoveryPath(k);
  }

  animateHeal(k) {
    this.recoveryMode = 'heal';
    this.recoveryProgress = clamp01(k);
    this.recoveryBeat = k < 0.28 ? 'seating' : k < 0.65 ? 'shaking' : 'healing';
    const settle = ease(clamp01(this.recoveryProgress / 0.28));
    this.pos.set(SEAT.x, SEAT.y * settle, SEAT.z);
    // The head-shaking beat finishes before any health begins to refill.
    this.fight.heal(k <= 0.65 ? 0 : (k - 0.65) / 0.35);
    this.ch.root.rotation.set(0, SEAT.heading, 0);
  }

  animateReturn(k) {
    this.recoveryMode = 'return';
    this.recoveryBeat = null;
    this.recoveryProgress = clamp01(k);
    if (k < 0.2) {
      // Stand from the chair before running back into the arena.
      const stand = ease(clamp01(k / 0.2));
      this.pos.set(SEAT.x, SEAT.y * (1 - stand), SEAT.z);
      this.ch.root.rotation.set(0, SEAT.heading, 0);
    } else this.moveRecoveryPath((k - 0.2) / 0.8, true);
  }

  startRoundTwo() {
    const origin = { x: BOSS_POSITION.x, y: BOSS_POSITION.y + 1.85, z: BOSS_POSITION.z };
    if (!this.fight.startRoundTwo(this.ctx.player.pos, origin)) return false;
    this.resetRecoveryPose();
    this.pos.set(BOSS_POSITION.x, BOSS_POSITION.y, BOSS_POSITION.z);
    this.state = 'boss';
    this.bossBody.off = false;
    this.bossBounds.visible = true;
    this.eyeMat.color.set('#ff2020');
    this.glowMat.color.set('#ff2020');
    audio.alert();
    return true;
  }

  resetRecoveryPose() {
    this.recoveryMode = null;
    this.recoveryBeat = null;
    this.recoveryProgress = 0;
    if (this.recoveryChair) this.recoveryChair.visible = false;
    this.ch.root.visible = true;
    this.ch.root.rotation.set(0, 0, 0);
    animate(this.ch, { mode: 'idle2' }, 0);
    if (this.ch.label) { this.ch.label.position.y = 2.3; this.ch.label.visible = true; }
    const woman = this.womanOfficer;
    woman.root.position.set(WOMAN_HOME.x, WOMAN_HOME.y, WOMAN_HOME.z);
    woman.root.rotation.set(0, 0, 0);
    animate(woman, { mode: 'idle2' }, 0);
    if (woman.label) woman.label.position.y = 2.3;
    if (woman.label) woman.label.visible = true;
  }

  updateWoman(dt) {
    const ch = this.womanOfficer;
    ch.root.visible = this.ctx.player.pos.y < 10;
    const healing = this.state === 'recovering' && this.recoveryMode === 'heal';
    const returning = this.state === 'recovering' && this.recoveryMode === 'return';
    const p = this.recoveryProgress;
    // Crouch before moving into the opening, with her back toward the camera.
    const kneel = healing ? ease(clamp01(p / 0.08)) : returning ? 1 - ease(clamp01((p - 0.12) / 0.08)) : 0;
    const move = healing ? ease(clamp01((p - 0.08) / 0.2)) : returning ? 1 - ease(clamp01(p / 0.12)) : 0;
    ch.root.position.set(WOMAN_HOME.x + (WOMAN_RECOVERY.x - WOMAN_HOME.x) * move, 0, WOMAN_HOME.z + (WOMAN_RECOVERY.z - WOMAN_HOME.z) * move);
    const facing = healing || returning ? Math.PI : 0;
    ch.root.rotation.set(0, facing, 0);
    animate(ch, { mode: 'walk', speed: 0 }, dt);
    if (kneel > 0) {
      // Fold into a low crouch so her head clears the tabletop.
      ch.body.position.set(0, -0.67 * kneel, -0.35 * kneel);
      ch.spine.rotation.x = 0.08 * kneel;
      for (const leg of ch.legs) {
        leg.hip.rotation.set(-Math.PI / 2 * kneel, 0, leg.s * 0.025);
        leg.kn.rotation.set(2.55 * kneel, 0, 0);
        leg.ft.rotation.set(-0.98 * kneel, 0, 0);
      }
      for (const arm of ch.arms) {
        arm.sh.rotation.set(-0.08 * kneel, 0, arm.s * 0.1);
        arm.el.rotation.set(-0.15 * kneel, 0, 0);
      }
      ch.head.rotation.x = -0.08 * kneel;
    }
    if (healing && p >= 0.28) ch.head.rotation.y = Math.sin(this.t * 16 + Math.PI / 3) * 0.45;
    if (ch.label) ch.label.visible = !healing && !returning;
  }

  updateRecovery(dt) {
    this.t += dt;
    this.on = false;
    this.fan.visible = false;
    this.rays.length = 0;
    const healing = this.recoveryMode === 'heal', returning = this.recoveryMode === 'return';
    const dismounting = returning && this.recoveryProgress < 0.2;
    const seat = healing ? ease(clamp01(this.recoveryProgress / 0.28)) : dismounting ? 1 - ease(clamp01(this.recoveryProgress / 0.2)) : 0;
    animate(this.ch, { speed: healing || dismounting ? 0 : 6.4, mode: seat > 0 ? 'sit' : 'walk' }, dt);
    if (this.ch.label) this.ch.label.visible = false;
    if (seat > 0) {
      this.ch.body.position.y = -0.47 * seat;
      for (const leg of this.ch.legs) {
        leg.hip.rotation.set(-1.5 * seat, 0, leg.s * 0.05);
        leg.kn.rotation.set(1.45 * seat, 0, 0);
        leg.ft.rotation.set(0, 0, 0);
      }
      this.ch.spine.rotation.x = -0.05 * seat;
    }
    this.recoveryChair.visible = true;
    if (healing && this.recoveryProgress >= 0.28) {
      this.ch.head.rotation.set(0, Math.sin(this.t * 16) * 0.45, 0);
    }
    const recovered = healing ? clamp01((this.recoveryProgress - 0.65) / 0.35) : returning ? 1 : 0;
    this.eyeMat.color.setRGB(0.5 + recovered * 0.5, 0.08, 0.06);
    this.glowMat.color.set('#ff2020');
    this.glowMat.opacity = 0.15 + recovered * 0.8;
  }

  finishBoss() {
    this.fight.stop();
    this.recoveryChair.visible = false;
    this.bossBody.off = true;
    this.state = 'defeated';
    this.on = false;
    this.icon.visible = false;
    this.hideBossEffects();
    this.fan.visible = false;
    this.rays.length = 0;
  }

  hideBossEffects() {
    for (const effect of [this.bossLane, this.bossTarget, this.bossRing, this.bossBounds, this.throwCountdown, ...this.lasers]) if (effect) effect.visible = false;
    for (const person of Object.values(this.thrownPeople || {})) person.root.visible = false;
  }

  // Outside combat he ignores the kipa. In the fight, yellow eyes mark the
  // recovery window; a returning or ricocheting kipa cannot hit twice in it.
  kipaHit() {
    if (this.state === 'boss') {
      if (this.fight.hit()) {
        this.ctx.hud.bubble(this, this.fight.ultimateReady ? 'Three kipot?! What happens now?' : 'My eyes! Give me a second!', true);
        this.ctx.fx.emit(this.pos.clone().add(new THREE.Vector3(0, 1.7, 0)), 24, { color: '#ffd54f', speed: 4, life: 0.7 });
        this.ctx.shake = Math.max(this.ctx.shake || 0, 0.35);
        audio.splat();
        return true;
      }
      if (this.fight.active) {
        this.ctx.hud.bubble(this, this.fight.ultimateReady ? 'Wait. Put that away.' : this.fight.stage === 'recover' ? 'One at a time!' : 'Wait for yellow eyes!');
        audio.click();
      }
      return false;
    }
    this.ctx.hud.bubble(this, pick(KIPA));
    audio.say(pick(['Nice try.', 'Seriously?']), 'gate');
    return false;
  }

  updateBoss(dt, advance = true) {
    const { player, hud } = this.ctx, f = this.fight;
    this.on = false;
    this.fan.visible = false;
    this.rays.length = 0;
    this.t += dt;
    const stage = f.stage, shots = f.shots, damage = f.damageTaken, impacts = f.impacts;
    if (advance) f.update(dt, player.pos);
    if (f.shots !== shots) audio.whoosh();
    if (f.impacts !== impacts) {
      audio.splat();
      this.ctx.fx.emit(new THREE.Vector3(f.target.x, f.target.y + 0.1, f.target.z), 26, { color: '#b9b0a0', speed: 5, life: 0.7 });
    }
    if (f.damageTaken !== damage) {
      this.ctx.shake = Math.max(this.ctx.shake || 0, 0.5);
      hud.toast(f.lost ? 'Amir wins this round. Press E to retry.' : 'Thrown soldier hit! Run outside the red circle.', 2.5, '#ff886b');
    }
    if (stage !== 'recover' && f.stage === 'recover') hud.bubble(this, 'Whew. These officers are heavy.');
    if (stage !== 'lost' && f.lost) hud.bubble(this, 'No room in this lift!', true);
    const heading = Math.atan2(f.target.x - this.pos.x, f.target.z - this.pos.z);
    this.ch.root.rotation.set(0, heading, 0);
    const exposed = f.stage === 'recover' || f.stage === 'staggered' || f.stage === 'ultimate';
    const color = f.won ? '#8a9c74' : exposed ? '#ffe06a' : '#ff2020';
    this.eyeMat.color.set(color);
    this.glowMat.color.set(color);
    this.glowMat.opacity = f.won ? 0.25 : exposed ? 0.65 + Math.sin(this.t * 9) * 0.25 : 0.7 + Math.sin(this.t * 18) * 0.25;
    animate(this.ch, { speed: 0, mode: f.won ? 'down' : f.lost ? 'cheer' : exposed ? 'strain' : 'cheer' }, dt);
    if (f.active && !exposed) {
      // Lift the next projectile overhead, then throw both arms forward.
      const throwing = f.stage === 'fire';
      for (const arm of this.ch.arms) arm.sh.rotation.x = throwing ? -1.1 : -2.5;
      this.ch.head.rotation.x = -0.12;
    } else if (exposed) {
      this.ch.spine.rotation.x = 0.25;
      this.ch.head.rotation.x = 0.2;
    }
    this.icon.visible = false;
    this.bossBounds.visible = f.stage !== 'ultimate' && !f.won;
    this.bossRing.visible = exposed && f.stage !== 'ultimate';
    this.bossRing.position.set(this.pos.x, this.pos.y + 0.1, this.pos.z);
    this.bossRing.scale.setScalar(1 + Math.sin(this.t * 6) * 0.08);
    const aiming = f.active && f.stage === 'windup', incoming = f.active && f.stage === 'fire';
    this.bossLane.visible = aiming;
    this.bossTarget.visible = aiming || incoming;
    this.throwCountdown.visible = aiming || incoming;
    const dx = f.target.x - f.origin.x, dz = f.target.z - f.origin.z, distance = Math.hypot(dx, dz);
    this.bossLane.position.set((f.origin.x + f.target.x) / 2, this.pos.y + 0.085, (f.origin.z + f.target.z) / 2);
    this.bossLane.rotation.y = Math.atan2(dx, dz);
    this.bossLane.scale.set(0.25, 1, distance);
    this.bossLane.material.color.set(f.locked ? '#ff9f43' : '#ff4030');
    this.bossLane.material.opacity = f.locked ? 0.45 : 0.2 + Math.sin(this.t * 20) * 0.08;
    this.bossTarget.material.color.set(incoming ? '#ff3322' : f.locked ? '#ff9f43' : '#ff6d43');
    this.bossTarget.position.set(f.target.x, f.target.y + 0.11, f.target.z);
    this.bossTarget.scale.setScalar(1);
    this.bossTarget.material.opacity = incoming ? 0.6 + Math.sin(this.t * 28) * 0.3 : 0.8;
    if (aiming || incoming) {
      const seconds = incoming ? BOSS_ATTACK.fire - f.time : BOSS_ATTACK.windup - f.time + BOSS_ATTACK.fire;
      const text = `${incoming ? 'DODGE!' : 'INCOMING'} ${(Math.ceil(seconds * 5) / 5).toFixed(1)}s`;
      if (text !== this.countdownText) {
        const next = labelSprite(text, { color: '#ffd3a4', size: 0.38, font: 28 });
        this.throwCountdown.material.map.dispose();
        this.throwCountdown.material.map = next.material.map;
        this.throwCountdown.material.needsUpdate = true;
        next.material.dispose();
        this.countdownText = text;
      }
      this.throwCountdown.position.set(f.target.x, f.target.y + 0.65, f.target.z);
    }
    // A fixed pair of character meshes supplies one projectile at a time.
    for (const person of Object.values(this.thrownPeople)) person.root.visible = false;
    const kind = aiming ? (f.shots % 2 ? 'officer' : 'meteorologist') : f.projectile.kind;
    const person = this.thrownPeople[kind];
    const landed = f.projectile.landed && (f.stage === 'recover' || f.stage === 'lost');
    if (aiming || incoming || landed) {
      person.root.visible = true;
      const p = aiming ? f.origin : f.projectile.position;
      person.root.position.set(p.x, p.y + (landed ? 0.12 : 0), p.z);
      animate(person, { mode: landed ? 'down' : 'flail' }, dt);
      person.root.rotation.set(landed ? -Math.PI / 2 : Math.PI / 2 + f.projectile.progress * Math.PI * 4, heading, landed ? 0 : Math.sin(this.t * 13) * 0.25);
    }
    // Eye glow is decorative during combat; only thrown-person impacts deal damage.
    for (const laser of this.lasers) laser.visible = false;
  }

  andreyHere() {
    this.ctx.hud.bubble(this, 'Andrey. Not now.');
  }

  // 0 = cannot see Argaman, up to 1 = in plain view close by
  see(player) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (Math.abs(player.pos.y - this.pos.y) > 4 || d > RANGE) return 0;
    if (d < 2.2) return 1;
    const vd = this.viewDir;
    if ((Math.sin(vd) * dx + Math.cos(vd) * dz) / d < COS_HALF) return 0;
    _o.set(this.pos.x, this.pos.y + 1.95, this.pos.z);
    _e.set(player.pos.x, player.pos.y + (player.crouch > 0.5 ? 0.75 : 1.3), player.pos.z);
    _d.subVectors(_e, _o);
    const len = _d.length();
    _d.divideScalar(len);
    if (this.ctx.world.raycast(_o, _d, len) < len - 0.4) return 0;
    return Math.max(0.3, 1 - d / RANGE);
  }

  zap() {
    const { player, hud } = this.ctx;
    this.state = 'zap';
    this.t = 0;
    this.setIcon('!');
    player.state = 'grabbed';
    player.vel.set(0, 0, 0);
    hud.bubble(this, pick(ZAP), true);
    audio.alert();
    audio.laser();
    audio.say(pick(['Argaman. No.', 'Nobody enters the Pit.']), 'gate');
  }

  update(dt) {
    const ctx = this.ctx, { player, story, world } = ctx;
    this.updateWoman(dt);
    if (this.state === 'recovering') {
      this.updateRecovery(dt);
      return;
    }
    if (this.state === 'boss' || story.phase === 'bossFight') {
      this.updateBoss(dt, story.phase === 'bossFight');
      return;
    }
    if (this.state === 'defeated') {
      this.t += dt;
      this.on = false;
      this.fan.visible = false;
      this.rays.length = 0;
      this.eyeMat.color.set('#61724d');
      this.glowMat.opacity = 0.15;
      animate(this.ch, { mode: 'down' }, dt);
      return;
    }
    this.on = story.phase === 'lobbyFree';
    this.t += dt;
    // look left ... turn ... look right ... turn
    if (this.state !== 'zap') {
      this.sweepT += dt;
      if (this.sweepT > this.hold + TURN) {
        this.sweepT = 0;
        this.side = -this.side;
        this.hold = 1.8 + Math.random() * 0.9;
      }
      const k = Math.max(0, this.sweepT - this.hold) / TURN;
      this.offset = this.side * SWEEP * (1 - 2 * ease(Math.min(1, k)));
    }

    if (this.state === 'watch' && this.on && player.state === 'free') {
      const seen = this.see(player);
      const P = L.PIT;
      const atPit = Math.hypot(player.pos.x - P.x, player.pos.z - (L.LOBBY.z1 - P.depth)) < 3.4;
      if (atPit) this.susp = 1;
      if (seen > 0) {
        if (this.susp < 0.3 && this.susp + dt * (1.3 + 2.2 * seen) >= 0.3) {
          this.setIcon('?');
          audio.suspicious();
          ctx.hud.bubble(this, pick(SUSPICIOUS));
        }
        this.susp += dt * (1.3 + 2.2 * seen);
      } else {
        this.susp = Math.max(0, this.susp - dt * 0.45);
        if (this.susp < 0.15) this.icon.visible = false;
      }
      if (this.susp >= 1) {
        this.susp = 1;
        this.zap();
      }
    } else if (this.state === 'zap') {
      // red lasers from his eyes; then Argaman leaves the building through the door, fast
      const target = _e.set(player.pos.x, player.pos.y + 1.2, player.pos.z);
      this.eyes.forEach((eye, i) => {
        eye.getWorldPosition(_o);
        const l = this.lasers[i], len = _o.distanceTo(target);
        l.visible = Math.sin(this.t * 50 + i) > -0.6;
        l.position.copy(_o).lerp(target, 0.5);
        l.scale.set(1, len, 1);
        l.quaternion.setFromUnitVectors(_d.set(0, 1, 0), _o.sub(target).normalize());
      });
      if (Math.random() < 0.5) ctx.fx.emit(target, 3, { color: '#ff3a2a', speed: 3, life: 0.4 });
      this.offset = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) - Math.PI;
      if (this.t > 1) {
        for (const l of this.lasers) l.visible = false;
        const D = L.DOOR;
        const out = new THREE.Vector3(L.LOBBY.x1 + 8 - player.pos.x, 0, (D.z0 + D.z1) / 2 - player.pos.z).normalize();
        player.heading = Math.atan2(out.x, out.z) + Math.PI;
        player.throwAway(out, 6);
        story.thrown(this);
        this.state = 'done';
      }
    } else if (!this.on) this.susp = Math.max(0, this.susp - dt);

    // pose: the body turns half way, the head does the rest
    let off = this.offset;
    off = Math.atan2(Math.sin(off), Math.cos(off));
    this.ch.root.rotation.y = Math.PI + off * 0.45;
    animate(this.ch, { speed: 0, mode: this.state === 'zap' ? 'point' : 'idle2', look: off * 0.55 }, dt);
    this.ch.head.rotation.y = off * 0.55;
    this.glowMat.opacity = this.state === 'zap' ? 1 : 0.6 + Math.sin(this.t * 4) * 0.25;

    // the view fan, cut off by walls, pillars and people
    const show = this.on && this.state !== 'done';
    this.fan.visible = show;
    if (!show) {
      this.rays.length = 0;
      return;
    }
    const vd = this.viewDir, y = 0.08;
    _o.set(this.pos.x, 1.0, this.pos.z);
    this.rays.length = 0;
    for (let i = 0; i <= RAYS; i++) {
      const a = vd - HALF + (2 * HALF * i) / RAYS;
      _d.set(Math.sin(a), 0, Math.cos(a));
      const r = world.raycast(_o, _d, RANGE);
      this.rays.push([this.pos.x + _d.x * r, this.pos.z + _d.z * r]);
    }
    const p = this.fanPos;
    for (let i = 0; i < RAYS; i++) {
      const [ax, az] = this.rays[i], [bx, bz] = this.rays[i + 1], j = i * 9;
      p[j] = this.pos.x;
      p[j + 1] = y;
      p[j + 2] = this.pos.z;
      p[j + 3] = ax;
      p[j + 4] = y;
      p[j + 5] = az;
      p[j + 6] = bx;
      p[j + 7] = y;
      p[j + 8] = bz;
    }
    this.fanGeo.setDrawRange(0, RAYS * 3);
    this.fanGeo.attributes.position.needsUpdate = true;
    this.fan.material.color.setRGB(1, 0.16 - this.susp * 0.1, 0.16);
    this.fan.material.opacity = 0.14 + this.susp * 0.2;
  }
}
