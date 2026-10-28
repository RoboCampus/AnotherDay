import * as THREE from 'three';
import { BOUNDS } from './layout.js';
import { KIPA_COOLDOWN } from './kipa.js';
import { ANDREY_COOLDOWN } from './andrey.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = {
      hud: $('hud'), objective: $('objective'), objText: $('objText'), detect: $('detect'), detectFill: $('detectFill'), detectLabel: $('detectLabel'),
      prompt: $('prompt'), sub: $('subtitle'), subWho: $('subWho'), subText: $('subText'), title: $('title'), titleBig: $('titleBig'), titleSmall: $('titleSmall'),
      toast: $('toast'), speed: $('speed'), phone: $('phone'), phoneStatus: $('phoneStatus'), phoneLine: $('phoneLine'), phoneReply: $('phoneReply'),
      phoneKeys: $('phoneKeys'), missed: $('missed'), fade: $('fade'), flash: $('flash'), storm: $('storm'), bubbles: $('bubbles'),
      boss: $('boss'), bossRound: $('bossRound'), bossHealth: $('bossHealth'), bossHealthFill: $('bossHealthFill'), bossHealthText: $('bossHealthText'), bossStatus: $('bossStatus'), bossLives: $('bossLives'), bossCrosshair: $('bossCrosshair'), bossDamage: $('bossDamage'), bossResult: $('bossResult'),
      elevator: $('elevator'), floor: $('floor'), end: $('end'), endStats: $('endStats'), stats: $('stats'), hint: $('hint'), sms: $('sms'),
    };
    this.bubbles = [];
    this.toastT = 0;
    this.titleT = 0;
    this.smsT = 0;
    this.mini = $('minimap').getContext('2d');
    this.mapImg = null;
    this.abs = {};
    this.bossHealth = null;
    this.bossDamageT = 0;
  }

  // One ability slot: k = 1 ready .. 0 just used; status replaces the cooldown seconds when set.
  ability(id, { show, key, name, color, k, secs, status }) {
    let a = this.abs[id];
    if (!a) {
      const el = document.createElement('div');
      el.className = 'ab';
      el.innerHTML = `<div class="badge" style="background:${color}"><i></i><span>${name}</span></div><span class="key">${key}</span><span class="cdt"></span>`;
      $('abilities').appendChild(el);
      a = this.abs[id] = { el, sweep: el.querySelector('i'), cdt: el.querySelector('.cdt'), last: '' };
    }
    a.el.classList.toggle('hidden', !show);
    if (!show) return;
    const txt = status || (k < 1 ? `${Math.ceil(secs)}s` : '');
    const st = `${k.toFixed(2)}|${txt}`;
    if (st === a.last) return;
    a.last = st;
    a.el.classList.toggle('ready', k >= 1);
    a.sweep.style.background = k >= 1 ? 'none' : `conic-gradient(transparent ${k * 360}deg, rgba(0,0,0,.66) 0)`;
    a.cdt.textContent = txt;
  }

  // NEW ABILITY flash on a slot
  abilityNew(id) {
    const a = this.abs[id];
    if (!a) return;
    a.el.classList.remove('new');
    void a.el.offsetWidth;
    a.el.classList.add('new');
  }

  show(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  buildMap(rects) {
    const W = BOUNDS.x1 - BOUNDS.x0, H = BOUNDS.z1 - BOUNDS.z0;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#b9b2a4';
    g.fillRect(0, 0, W, H);
    for (const r of rects) {
      g.fillStyle = r.c;
      g.fillRect(r.x0 - BOUNDS.x0, r.z0 - BOUNDS.z0, r.x1 - r.x0, r.z1 - r.z0);
    }
    g.strokeStyle = '#e8d24a';
    g.lineWidth = 1.5;
    g.setLineDash([3, 2]);
    g.strokeRect(-300 - BOUNDS.x0, -222 - BOUNDS.z0, 282, 208);
    this.mapImg = c;
  }

  objective(text) {
    this.el.objText.textContent = text;
    this.el.objective.classList.toggle('hidden', !text);
    this.el.objective.classList.remove('flash');
    void this.el.objective.offsetWidth;
    this.el.objective.classList.add('flash');
  }

  prompt(text) {
    if (this._prompt === text) return;
    this._prompt = text;
    this.el.prompt.innerHTML = text || '';
    this.el.prompt.classList.toggle('hidden', !text);
  }

  hint(text) {
    this.el.hint.innerHTML = text || '';
  }

  subtitle(who, text, color = '#ffd23f') {
    this.el.sub.classList.toggle('hidden', !text);
    this.el.subWho.textContent = who || '';
    this.el.subWho.style.color = color;
    this.el.subText.textContent = text || '';
  }

  title(big, small = '', dur = 3) {
    this.el.titleBig.textContent = big;
    this.el.titleSmall.textContent = small;
    this.el.title.style.opacity = 1;
    this.titleT = dur;
  }

  toast(text, dur = 2.5, color = '#fff') {
    this.el.toast.textContent = text;
    this.el.toast.style.color = color;
    this.el.toast.style.opacity = 1;
    this.toastT = dur;
  }

  sms(from, text, dur = 4) {
    this.el.sms.innerHTML = `<b>${from}</b>${text}`;
    this.el.sms.classList.add('show');
    this.smsT = dur;
  }

  fade(k) {
    this.el.fade.style.opacity = k;
  }

  flash() {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.opacity = 1;
    requestAnimationFrame(() => {
      f.style.transition = 'opacity 1.2s';
      f.style.opacity = 0;
    });
  }

  storm(k) {
    this.el.storm.style.opacity = k;
  }

  speed(kmh) {
    this.el.speed.classList.toggle('hidden', kmh == null);
    if (kmh != null) this.el.speed.innerHTML = `${Math.round(kmh)}<small>KM/H</small>`;
  }

  stats(throws, missed) {
    const parts = [];
    if (throws) parts.push(`Thrown by meteorologists: <b>${throws}</b>`);
    if (missed) parts.push(`Missed calls: <b>${missed}</b>`);
    this.el.stats.innerHTML = parts.join('<br>');
  }

  // ---- phone
  phoneRing(missed, caller = 'DO NOT ANSWER') {
    const e = this.el;
    e.phone.className = 'ringing';
    e.phoneStatus.textContent = caller === 'ADAM' ? 'Incoming call · answer blocks attacks' : 'Incoming call…';
    e.phone.querySelector('.caller').textContent = caller;
    e.phone.querySelector('.avatar').textContent = caller === 'ADAM' ? 'A' : '?';
    e.phoneLine.textContent = '';
    e.phoneReply.textContent = '';
    e.phoneKeys.classList.remove('hidden');
    e.phoneKeys.querySelector('.yes').innerHTML = caller === 'ADAM' ? '<b>Y</b> Answer (no attacks)' : '<b>Y</b> Answer';
    e.missed.textContent = missed ? `${missed} missed call${missed > 1 ? 's' : ''}` : '';
  }

  phoneTalk(line, reply = '') {
    const e = this.el;
    e.phone.className = 'talking';
    e.phoneStatus.textContent = 'On call · 00:0' + (1 + ((Math.random() * 8) | 0));
    e.phoneLine.textContent = `“${line}”`;
    e.phoneReply.textContent = reply ? `You: “${reply}”` : '';
    e.phoneKeys.classList.add('hidden');
  }

  phoneHide(missed) {
    this.el.phone.className = 'hidden';
    this.el.missed.textContent = missed ? `${missed} missed call${missed > 1 ? 's' : ''}` : '';
    this.stats(this.ctx.story?.throws || 0, missed);
  }

  elevator(floor) {
    this.el.elevator.classList.toggle('hidden', floor == null);
    if (floor != null) this.el.floor.textContent = floor;
  }

  end(stats) {
    this.el.end.classList.remove('hidden');
    this.el.endStats.innerHTML = stats;
  }

  // ---- speech bubbles over characters
  bubble(who, text, big = false) {
    const old = this.bubbles.find((b) => b.who === who);
    if (old) old.el.remove();
    this.bubbles = this.bubbles.filter((b) => b.who !== who);
    const el = document.createElement('div');
    el.className = 'bubble' + (big ? ' big' : '');
    el.textContent = text;
    this.el.bubbles.appendChild(el);
    this.bubbles.push({ who, el, t: big ? 2.5 : 3.2 });
  }

  update(dt) {
    const ctx = this.ctx, cam = ctx.camera;
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.el.toast.style.opacity = 0;
    if (this.titleT > 0 && (this.titleT -= dt) <= 0) this.el.title.style.opacity = 0;
    if (this.smsT > 0 && (this.smsT -= dt) <= 0) this.el.sms.classList.remove('show');
    const w = innerWidth, h = innerHeight;
    this.bubbles = this.bubbles.filter((b) => {
      b.t -= dt;
      const p = b.who.pos || b.who.ch?.root.position;
      _v.set(p.x, p.y + (b.who.bubbleY || 2.75), p.z);
      const dist = _v.distanceTo(cam.position);
      _v.project(cam);
      const on = _v.z < 1 && dist < 45;
      b.el.style.display = on ? 'block' : 'none';
      if (on) {
        b.el.style.left = `${((_v.x + 1) / 2) * w}px`;
        b.el.style.top = `${((1 - _v.y) / 2) * h}px`;
      }
      if (b.t <= 0) {
        b.el.remove();
        return false;
      }
      return true;
    });
    // Boss information remains separate from the stealth detection meter.
    const fight = ctx.amir?.fight;
    const phase = ctx.story?.phase;
    const recovery = phase === 'bossRecovery';
    const finisher = phase === 'bossFinisher';
    const fighting = ['bossFight', 'bossUltimate', 'bossRecovery', 'bossFinisher'].includes(phase);
    const ultimate = fighting && phase !== 'bossFight';
    const secondRound = fight?.round === 2;
    const onCall = ctx.phone?.blocksAttacks;
    this.el.hud.classList.toggle('boss-mode', fighting);
    this.el.hud.classList.toggle('ultimate-mode', ultimate);
    this.el.boss.classList.toggle('hidden', !fighting);
    this.el.bossCrosshair.classList.toggle('hidden', !fighting || fight?.lost || ultimate);
    this.el.bossResult.classList.toggle('hidden', !fighting || !fight?.lost);
    if (fighting && fight) {
      this.el.bossRound.textContent = recovery ? 'RECOVERING AT THE OFFICER’S DESK' : `ROUND ${fight.round || 1} · THE LAST PLACE IN THE LIFT`;
      this.el.boss.classList.toggle('healing', recovery);
      this.el.bossHealthFill.style.width = `${fight.health / fight.maxHealth * 100}%`;
      this.el.bossHealth.setAttribute('aria-valuemax', fight.maxHealth);
      this.el.bossHealth.setAttribute('aria-valuenow', fight.health);
      this.el.bossHealthText.textContent = `${fight.health} / ${fight.maxHealth}`;
      this.el.bossLives.textContent = '●'.repeat(fight.playerHealth) + '○'.repeat(fight.maxPlayerHealth - fight.playerHealth);
      this.el.bossStatus.textContent = fight.lost ? 'PRESS E TO RETRY' : recovery ? (ctx.amir.recoveryMode !== 'heal' ? 'AMIR IS AT THE DESK' : ctx.amir.recoveryBeat === 'seating' ? 'TAKING A SEAT' : ctx.amir.recoveryBeat === 'shaking' ? 'SHAKE IT OFF' : 'AMIR IS REGAINING HP') : finisher ? 'SHAIKALE POOPALE · GRAB AND FLY' : ultimate ? 'SATELLITE INCOMING' : onCall ? 'ON CALL WITH ADAM · ATTACKS BLOCKED' : fight.ultimateReady ? (secondRound ? 'R · SHAIKALE POOPALE READY' : 'R · SHONCHIK SATELLITE READY') : fight.stage === 'recover' ? (fight.recoveryHit ? 'HIT LANDED · GET READY TO RUN' : 'TIRED · F / CLICK TO STRIKE') : fight.stage === 'fire' ? 'INCOMING OFFICER · RUN!' : fight.locked ? 'LANDING LOCKED · RUN!' : 'AIMING · KEEP MOVING';
      this.el.boss.classList.toggle('vulnerable', fight.stage === 'recover');
      this.el.bossCrosshair.classList.toggle('vulnerable', fight.stage === 'recover');
      if (this.bossHealth != null && fight.playerHealth < this.bossHealth) this.bossDamageT = 0.65;
      this.bossHealth = fight.playerHealth;
    } else this.bossHealth = null;
    this.bossDamageT = Math.max(0, this.bossDamageT - dt);
    this.el.bossDamage.style.opacity = fighting ? this.bossDamageT / 0.65 : 0;
    // abilities
    const live = ctx.story && ctx.story.phase !== 'menu' && ctx.story.phase !== 'end';
    const kp = ctx.kipa, an = ctx.andrey;
    this.ability('kipa', { show: live && (phase === 'sneak' || (fighting && !ultimate)), key: 'F', name: 'KIPA', color: '#5b2a86', k: kp.state !== 'head' ? 0 : 1 - kp.cd / KIPA_COOLDOWN, secs: kp.cd, status: onCall ? 'on call' : kp.state !== 'head' ? 'flying' : '' });
    this.ability('satellite', { show: live && fighting && !recovery && !secondRound, key: 'R', name: 'SAT', color: '#243f74', k: fight ? Math.min(1, fight.hits / 3) : 0, secs: 0, status: ultimate ? 'incoming!' : onCall ? 'on call' : fight?.ultimateReady ? 'ready!' : `${fight?.hits || 0}/3 hits` });
    this.ability('shaikale', { show: live && fighting && !recovery && secondRound, key: 'R', name: 'POOPALE', color: '#385c9b', k: fight ? Math.min(1, fight.hits / 3) : 0, secs: 0, status: finisher ? 'grab + fly!' : onCall ? 'on call' : fight?.ultimateReady ? 'ready!' : `${fight?.hits || 0}/3 hits` });
    this.ability('andrey', { show: live && an.unlocked && !fighting, key: 'Q', name: 'ANDREY', color: '#4f5531', k: an.k, secs: an.cd, status: an.active ? 'khlobchik!' : '' });
    // detection meter
    const g = ctx.guards;
    const am = ctx.amir?.on ? ctx.amir.susp : 0;
    const s = Math.max(g?.active ? g.maxSusp : 0, am);
    this.el.detect.classList.toggle('hidden', !g?.active && !ctx.amir?.on);
    this.el.detectFill.style.width = `${s * 100}%`;
    this.el.detectFill.style.background = s > 0.75 ? '#ff3b30' : s > 0.3 ? '#ffb020' : '#7ad06a';
    this.el.detectLabel.textContent = ctx.player.hidden ? 'HIDDEN IN A BUSH' : s >= 1 ? 'SPOTTED!' : am > 0.3 && am >= s ? 'AMIR SEES SOMETHING…' : s > 0.3 ? 'SUSPICIOUS…' : ctx.player.crouch > 0.5 ? 'SNEAKING' : 'UNSEEN';
    this.drawMinimap();
  }

  drawMinimap() {
    if (!this.mapImg) return;
    const g = this.mini, S = 180, ctx = this.ctx, p = ctx.player.pos, yaw = ctx.player.yaw;
    const scale = p.y > 30 ? 4 : 1.5;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#9d978a';
    g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    const phi = Math.atan2(Math.cos(yaw), Math.sin(yaw));
    g.rotate(-Math.PI / 2 - phi);
    g.scale(scale, scale);
    g.translate(-p.x, -p.z);
    g.drawImage(this.mapImg, BOUNDS.x0, BOUNDS.z0);
    // guards and their view cones
    if (ctx.guards?.active) {
      for (const gd of ctx.guards.list) {
        if (gd.state === 'done' || !gd.on) continue;
        const a = gd.viewDir, calm = gd.state === 'patrol', ko = gd.state === 'stunned', stare = gd.state === 'distracted';
        g.fillStyle = stare ? 'rgba(126,240,160,0.35)' : calm ? 'rgba(255,224,102,0.35)' : 'rgba(255,60,48,0.45)';
        g.beginPath();
        g.moveTo(gd.pos.x, gd.pos.z);
        // canvas angle of the heading vector (sin a, cos a) is atan2(cos a, sin a)
        const ca = Math.atan2(Math.cos(a), Math.sin(a));
        if (!ko) {
          g.arc(gd.pos.x, gd.pos.z, 18, ca - 0.9, ca + 0.9);
          g.closePath();
          g.fill();
        }
        g.fillStyle = ko ? '#9a9a9a' : stare ? '#7ef0a0' : calm ? '#ffcf3a' : '#ff3b30';
        g.beginPath();
        g.arc(gd.pos.x, gd.pos.z, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Amir's view, as traced (shadows included)
    const ar = ctx.amir?.rays;
    if (ar?.length) {
      g.fillStyle = 'rgba(255,40,40,0.4)';
      g.beginPath();
      g.moveTo(ctx.amir.pos.x, ctx.amir.pos.z);
      for (const [x, z] of ar) g.lineTo(x, z);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff2a2a';
      g.beginPath();
      g.arc(ctx.amir.pos.x, ctx.amir.pos.z, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    const m = ctx.marker?.target;
    g.restore();
    // objective (clamped to the rim)
    if (m) {
      const dx = m.x - p.x, dz = m.z - p.z, rot = -Math.PI / 2 - phi;
      let mx = (dx * Math.cos(rot) - dz * Math.sin(rot)) * scale, my = (dx * Math.sin(rot) + dz * Math.cos(rot)) * scale;
      const d = Math.hypot(mx, my), R = S / 2 - 8;
      if (d > R) {
        mx *= R / d;
        my *= R / d;
      }
      g.fillStyle = '#ffd23f';
      g.strokeStyle = '#000';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(S / 2 + mx, S / 2 + my, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // Argaman, pointing the way he faces (relative to the camera)
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(-(ctx.player.heading - yaw));
    g.fillStyle = '#c86bff';
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 6);
    g.lineTo(0, 3);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}
