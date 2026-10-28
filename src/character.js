import * as THREE from 'three';
import { labelSprite } from './textures.js';

// Procedural people: one mesh per body segment on a small joint hierarchy, so a handful of
// rotations animate them. Characters face +z in their own space; root.rotation.y = heading.

const geos = new Map();
const cap = (r, len) => {
  const k = `c${r}_${len}`;
  if (!geos.has(k)) geos.set(k, new THREE.CapsuleGeometry(r, len, 4, 10));
  return geos.get(k);
};
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14);

const mats = new Map();
export function mat(color, rough = 0.85, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return mats.get(k);
}

function part(geo, material, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}
export const parts = { SPHERE, BOX, CYL, part, cap };

export const OLIVE = '#5f6638'; // IDF uniform ("zayit")
export const LOOKS = {
  argaman: { skin: '#d6a47c', shirt: '#6a2a8c', pants: '#2f4a72', shoes: '#eeeeee', hair: '#1c140f', beard: true, sleeves: 'short', backpack: '#24262b' },
  soldier: { skin: '#d6a47c', shirt: OLIVE, pants: OLIVE, shoes: '#2b2219', hair: '#2b1d14', sleeves: 'long', belt: '#3b3a2a' },
  officer: { skin: '#e0b090', shirt: '#9cc0e4', pants: '#1d2a48', shoes: '#111111', hair: '#6b5a48', sleeves: 'short', cap: 'officer', epaulettes: true },
};

export function createCharacter(o = {}) {
  const c = { ...LOOKS.soldier, ...o };
  const M = { skin: mat(c.skin, 0.7), shirt: mat(c.shirt), pants: mat(c.pants), shoes: mat(c.shoes, 0.6), hair: mat(c.hair, 0.95), dark: mat('#151515', 0.4) };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  body.add(hips);
  hips.add(part(SPHERE, M.pants, 0, 0.02, 0, 0.17, 0.11, 0.12));
  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  spine.add(part(cap(0.15, 0.26), M.shirt, 0, 0.24, 0, 1.22, 1, 0.75));
  spine.add(part(BOX, mat(c.belt || '#2b2b2b'), 0, 0.03, 0, 0.34, 0.05, 0.22));
  if (c.epaulettes) for (const s of [-1, 1]) spine.add(part(BOX, mat('#1d2a48'), s * 0.13, 0.47, 0, 0.1, 0.02, 0.07));
  if (c.vest) spine.add(part(BOX, mat(c.vest), 0, 0.28, 0, 0.36, 0.3, 0.25));
  if (c.backpack) {
    spine.add(part(BOX, mat(c.backpack), 0, 0.27, -0.16, 0.3, 0.38, 0.14));
    for (const s of [-1, 1]) spine.add(part(BOX, mat(c.backpack), s * 0.1, 0.33, 0.06, 0.04, 0.3, 0.2));
  }
  const neck = new THREE.Group();
  neck.position.y = 0.5;
  spine.add(neck);
  neck.add(part(cap(0.05, 0.06), M.skin, 0, 0.02, 0));
  const head = new THREE.Group();
  head.position.y = 0.08;
  neck.add(head);
  head.add(part(SPHERE, M.skin, 0, 0.1, 0, 0.105, 0.125, 0.115));
  head.add(part(SPHERE, M.skin, 0, 0.09, 0.11, 0.022, 0.03, 0.025));
  for (const s of [-1, 1]) {
    head.add(part(SPHERE, M.dark, s * 0.04, 0.12, 0.098, 0.016, 0.018, 0.01));
    head.add(part(SPHERE, M.skin, s * 0.105, 0.1, 0, 0.018, 0.03, 0.022)); // ears
  }
  const mouth = part(BOX, mat('#7a3a32'), 0, 0.045, 0.104, 0.04, 0.008, 0.01);
  head.add(mouth);
  if (c.hairStyle !== 'bald') {
    head.add(part(SPHERE, M.hair, 0, 0.17, -0.012, 0.112, 0.09, 0.12));
    head.add(part(SPHERE, M.hair, 0, 0.11, -0.035, 0.108, 0.1, 0.1));
  }
  if (c.ponytail) head.add(part(cap(0.035, 0.14), M.hair, 0, 0.06, -0.14));
  if (c.beard) head.add(part(SPHERE, M.hair, 0, 0.035, 0.05, 0.095, 0.06, 0.075));
  if (c.cap === 'officer') {
    head.add(part(CYL, mat('#1d2a48', 0.6), 0, 0.22, 0, 0.12, 0.06, 0.125));
    head.add(part(CYL, mat('#1d2a48', 0.6), 0, 0.25, 0.01, 0.135, 0.04, 0.14));
    head.add(part(BOX, mat('#111', 0.3), 0, 0.2, 0.12, 0.2, 0.012, 0.09));
    head.add(part(SPHERE, mat('#d8b24a', 0.3, 0.8), 0, 0.235, 0.13, 0.025, 0.025, 0.01));
  } else if (c.cap === 'helmet') {
    head.add(part(SPHERE, mat(c.helmet || '#4f5531', 0.7), 0, 0.17, -0.005, 0.135, 0.11, 0.145));
  } else if (c.cap === 'beret') {
    head.add(part(SPHERE, mat(c.beret || '#3a3f2a', 0.9), 0.03, 0.2, 0, 0.13, 0.05, 0.13));
  }

  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.215, 0.42, 0);
    spine.add(sh);
    sh.add(part(SPHERE, M.shirt, 0, 0, 0, 0.075, 0.07, 0.075));
    sh.add(part(cap(0.052, 0.2), M.shirt, 0, -0.14, 0));
    const el = new THREE.Group();
    el.position.y = -0.29;
    sh.add(el);
    el.add(part(cap(0.045, 0.18), c.sleeves === 'long' ? M.shirt : M.skin, 0, -0.12, 0));
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    el.add(hand);
    hand.add(part(SPHERE, M.skin, 0, -0.03, 0, 0.045, 0.06, 0.03));
    arms.push({ sh, el, hand, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, -0.03, 0);
    hips.add(hip);
    hip.add(part(cap(0.072, 0.3), M.pants, 0, -0.21, 0));
    const kn = new THREE.Group();
    kn.position.y = -0.43;
    hip.add(kn);
    kn.add(part(cap(0.06, 0.3), M.pants, 0, -0.2, 0));
    const ft = new THREE.Group();
    ft.position.y = -0.42;
    kn.add(ft);
    ft.add(part(BOX, M.shoes, 0, -0.035, 0.05, 0.1, 0.08, 0.25));
    legs.push({ hip, kn, ft, s });
  }
  return { root, body, hips, spine, neck, head, mouth, arms, legs, phase: Math.random() * 10, t: Math.random() * 10, look: c };
}

// A rifle slung across the chest (gate guards).
export function addRifle(ch) {
  const g = new THREE.Group();
  g.add(part(BOX, mat('#1b1c1e', 0.5, 0.4), 0, 0, 0, 0.05, 0.08, 0.75));
  g.add(part(BOX, mat('#1b1c1e', 0.5, 0.4), 0, -0.08, -0.05, 0.04, 0.14, 0.05));
  g.position.set(0, 0.25, 0.17);
  g.rotation.set(0.2, 0, 0.9);
  g.rotation.order = 'ZXY';
  ch.spine.add(g);
}

export function addPhone(ch) {
  const p = part(BOX, mat('#111', 0.3, 0.3), 0, -0.07, 0.03, 0.035, 0.075, 0.012);
  p.visible = false;
  ch.arms[1].hand.add(p);
  ch.phone = p;
  return p;
}

export function addLabel(ch, text, color, y = 2.15) {
  const s = labelSprite(text, { color, size: 0.26 });
  s.position.y = y;
  ch.root.add(s);
  ch.label = s;
  return s;
}

const lerp = (a, b, t) => a + (b - a) * t;

// Pose a character. s: { speed (m/s), crouch 0..1, mode, look (head yaw), talk }
// modes: walk (default) | phone | flail | wave | strain | charge | sit | down | point | cheer
export function animate(ch, s, dt) {
  ch.t += dt;
  const t = ch.t, speed = s.speed || 0, crouch = s.crouch || 0, mode = s.mode || 'walk';
  ch.phase += dt * ((Math.PI * 2 * speed) / (1.15 + speed * 0.16));
  const amp = Math.min(1, speed / 3), run = Math.min(1, Math.max(0, (speed - 3.6) / 3));
  const ph = ch.phase;
  ch.root.rotation.x = ch.root.rotation.z = 0;
  ch.body.position.set(0, 0, 0);
  ch.body.rotation.set(0, 0, 0);
  ch.hips.rotation.set(0, Math.sin(ph) * 0.12 * amp, 0);
  ch.spine.rotation.set(crouch * 0.45 + run * 0.18, -Math.sin(ph) * 0.18 * amp, 0);
  ch.head.rotation.set(-crouch * 0.3, s.look || 0, 0);
  ch.neck.rotation.set(0, 0, 0);
  // breathing when standing
  ch.spine.scale.y = 1 + Math.sin(t * 2.2) * 0.008;
  for (const L of ch.legs) {
    const p = ph + (L.s > 0 ? Math.PI : 0);
    const swing = Math.sin(p) * (0.55 + run * 0.25) * amp;
    L.hip.rotation.set(-swing - crouch * 1.05, 0, L.s * 0.03);
    L.kn.rotation.set(amp * (0.2 + run * 0.6) * Math.max(0, Math.cos(p) + 0.3) + crouch * 1.75, 0, 0);
    L.ft.rotation.set(-L.hip.rotation.x - L.kn.rotation.x, 0, 0);
  }
  ch.body.position.y = -Math.abs(Math.sin(ph)) * 0.05 * amp - crouch * 0.36;
  for (const A of ch.arms) {
    const p = ph + (A.s > 0 ? Math.PI : 0); // each arm swings against the leg on its side
    A.sh.rotation.set(Math.sin(p) * (0.5 + run * 0.4) * amp - crouch * 0.4, 0, A.s * 0.08);
    A.el.rotation.set(-(0.15 + run * 0.9 + crouch * 0.6), 0, 0);
    A.hand.rotation.set(0, 0, 0);
  }
  const R = ch.arms[1], Lf = ch.arms[0];
  if (s.talk) {
    ch.mouth.scale.y = 0.008 * (1 + Math.abs(Math.sin(t * 16)) * 3);
    R.sh.rotation.x += -0.3 + Math.sin(t * 3) * 0.15;
    R.el.rotation.x -= 0.6 + Math.sin(t * 4) * 0.25;
  } else ch.mouth.scale.y = 0.008;
  if (ch.phone) ch.phone.visible = mode === 'phone';
  if (mode === 'phone') {
    R.sh.rotation.set(-0.35, 0, 0.55);
    R.el.rotation.set(-2.35, 0, 0);
    R.hand.rotation.set(0, -0.6, 0.3);
    ch.head.rotation.z = 0.15;
  } else if (mode === 'wave') {
    R.sh.rotation.set(0, 0, 2.5);
    R.el.rotation.set(0, 0, 0.4 + Math.sin(t * 9) * 0.45);
  } else if (mode === 'point') {
    R.sh.rotation.set(-1.45, 0, 0.1);
    R.el.rotation.set(-0.05, 0, 0);
  } else if (mode === 'flail') {
    for (const A of ch.arms) {
      A.sh.rotation.set(Math.sin(t * 17 + A.s) * 0.8, 0, A.s * (2.1 + Math.sin(t * 21 + A.s * 2) * 0.6));
      A.el.rotation.set(-0.4 - Math.abs(Math.sin(t * 13)) * 0.8, 0, 0);
    }
    for (const L of ch.legs) {
      L.hip.rotation.set(Math.sin(t * 15 + L.s * 1.5) * 0.8, 0, L.s * 0.25);
      L.kn.rotation.set(0.5 + Math.abs(Math.sin(t * 12 + L.s)) * 0.8, 0, 0);
    }
    ch.mouth.scale.y = 0.03;
  } else if (mode === 'kick') {
    const k = s.kick == null ? 0 : Math.max(0, Math.min(1, s.kick));
    const power = s.kick == null ? 1 : Math.sin(Math.PI * (0.3 + k * 0.7));
    ch.body.position.y = -0.04;
    ch.spine.rotation.set(-0.24 * power, -0.12, 0.05);
    ch.head.rotation.x = -0.12;
    const strike = ch.legs[0], brace = ch.legs[1];
    strike.hip.rotation.set(-1.55 * power, 0, -0.08);
    strike.kn.rotation.set(0.14 + (1 - power) * 0.55, 0, 0);
    strike.ft.rotation.set(0.1 + power * 0.2, 0, 0);
    brace.hip.rotation.set(0.12, 0, 0.06);
    brace.kn.rotation.set(0.25, 0, 0);
    brace.ft.rotation.set(-0.3, 0, 0);
    for (const A of ch.arms) {
      A.sh.rotation.set(-0.7, 0, A.s * 0.35);
      A.el.rotation.set(-0.9, 0, 0);
    }
  } else if (mode === 'charge') {
    for (const A of ch.arms) {
      A.sh.rotation.set(-1.4, 0, A.s * 0.25);
      A.el.rotation.set(-0.15, 0, 0);
    }
    ch.spine.rotation.x = 0.45;
  } else if (mode === 'strain') {
    // legs wide, knees bent, hands on the knees, shaking
    const shake = Math.sin(t * 40) * 0.015;
    ch.body.position.set(shake, -0.18, 0);
    ch.spine.rotation.set(0.62, 0, Math.sin(t * 6) * 0.04);
    ch.head.rotation.set(-0.7, Math.sin(t * 2) * 0.2, 0);
    for (const L of ch.legs) {
      L.hip.rotation.set(-0.55, 0, L.s * 0.32);
      L.kn.rotation.set(0.95, 0, 0);
      L.ft.rotation.set(-0.4, 0, -L.s * 0.32);
    }
    for (const A of ch.arms) {
      A.sh.rotation.set(-0.75, 0, A.s * 0.15);
      A.el.rotation.set(-0.35, 0, 0);
    }
    ch.mouth.scale.y = 0.008 * (1 + Math.abs(Math.sin(t * 9)) * 2);
  } else if (mode === 'sit') {
    ch.body.position.y = -0.47;
    ch.spine.rotation.x = -0.05;
    for (const L of ch.legs) {
      L.hip.rotation.set(-1.5, 0, L.s * 0.05);
      L.kn.rotation.set(1.45, 0, 0);
      L.ft.rotation.set(0, 0, 0);
    }
    for (const A of ch.arms) {
      A.sh.rotation.set(-0.5, 0, A.s * 0.1);
      A.el.rotation.set(-0.9, 0, 0);
    }
  } else if (mode === 'down') {
    ch.root.rotation.x = -Math.PI / 2;
    ch.body.position.y = 0.15;
    for (const A of ch.arms) A.sh.rotation.set(-2.6, 0, A.s * 0.5);
  } else if (mode === 'cheer') {
    for (const A of ch.arms) {
      A.sh.rotation.set(0, 0, A.s * (2.7 + Math.sin(t * 8) * 0.2));
      A.el.rotation.set(0, 0, 0);
    }
  } else if (mode === 'idle2') {
    // weight shift, hands in pockets-ish, looking around
    ch.hips.rotation.z = Math.sin(t * 0.7) * 0.04;
    ch.head.rotation.y = (s.look || 0) + Math.sin(t * 0.43) * 0.5;
    for (const A of ch.arms) A.sh.rotation.set(0.1, 0, A.s * 0.04);
  }
  if (s.lean) ch.spine.rotation.x = lerp(ch.spine.rotation.x, s.lean, 1);
}
