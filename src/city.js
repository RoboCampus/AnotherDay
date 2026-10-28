import * as THREE from 'three';
import * as L from './layout.js';
import { facade, groundTex, signTex, flagTex, fenceTex, rnd, pick } from './textures.js';
import { uvBox, uvCylinder, uvPlane, bx, cy, sp, merged, paint, VC } from './geo.js';
import { carGeometry } from './traffic.js';
import { buildBuilding } from './building.js';
import { buildHoledBuilding } from './construction.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();

export function buildCity(ctx) {
  const { scene, world } = ctx;
  const map = []; // minimap rectangles
  const updaters = [];
  const T = L.TRENCH.y;

  // ------------------------------------------------------------------ materials
  const G = {
    asphalt: std({ map: groundTex('asphalt'), roughness: 0.95 }),
    pave: std({ map: groundTex('pave') }),
    side: std({ map: groundTex('side') }),
    grass: std({ map: groundTex('grass'), roughness: 1 }),
    ballast: std({ map: groundTex('ballast'), roughness: 1 }),
    concrete: std({ map: groundTex('concrete') }),
    stone: std({ map: groundTex('stone'), roughness: 0.6 }),
  };
  const roof = std({ color: '#8f8a82' });
  const F = {
    glassBlue: std({ map: facade('glass', { win: '#5d88ad', cols: 6, rows: 4, tile: [12, 14] }), roughness: 0.25, metalness: 0.45 }),
    glassSilver: std({ map: facade('glass', { win: '#8fa6ba', cols: 6, rows: 4, tile: [12, 14], frame: '#e4e8ec' }), roughness: 0.25, metalness: 0.45 }),
    glassDark: std({ map: facade('glass', { win: '#3a5470', cols: 4, rows: 4 }), roughness: 0.25, metalness: 0.45 }),
    glassGreen: std({ map: facade('glass', { win: '#4f8a8a', cols: 4, rows: 4 }), roughness: 0.25, metalness: 0.45 }),
    band: std({ map: facade('band', { wall: '#d2cbbd', win: '#35495c' }) }),
    bandGray: std({ map: facade('band', { wall: '#a19f99', win: '#2c3b48' }) }),
    white: std({ map: facade('white', { wall: '#efebe2', win: '#4a5560' }) }),
    cream: std({ map: facade('white', { wall: '#e4d8bf', win: '#4a5560' }) }),
    grid: std({ map: facade('grid', { wall: '#bdb4a5', win: '#3c4a56' }) }),
    kirya: std({ map: facade('band', { wall: '#b9ae99', win: '#2a3843', rows: 4 }) }),
    matcal: std({ map: facade('band', { wall: '#a0998c', win: '#26323c', cols: 6 }) }),
    stone: std({ map: facade('stone', { wall: '#dccaa5', cols: 2, rows: 2, tile: [6, 3.75] }) }),
    mall: std({ map: facade('mall', { wall: '#ddd6c9', win: '#3c5266', tile: [24, 22] }) }),
  };
  const CITY_STYLES = [F.white, F.white, F.cream, F.band, F.bandGray, F.grid, F.glassBlue, F.glassDark, F.glassGreen];
  const steel = std({ color: '#8a8f96', metalness: 0.7, roughness: 0.4 });
  const dark = std({ color: '#2c2f33', roughness: 0.6 });
  const leaf = std({ color: '#3f6a2a', roughness: 1 });
  const hedgeMat = std({ map: groundTex('grass'), color: '#5b7d33', roughness: 1 });

  // ------------------------------------------------------------------ helpers
  function box(x0, x1, z0, z1, y0, y1, material, o = {}) {
    const m = new THREE.Mesh(uvBox(x1 - x0, y1 - y0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = o.cast ?? true;
    m.receiveShadow = true;
    scene.add(m);
    if (o.collide) world.add(x0, x1, z0, z1, y0, y1, o.collide === true ? {} : o.collide);
    return m;
  }
  function plane(x0, x1, z0, z1, y, material) {
    const m = new THREE.Mesh(uvPlane(x1 - x0, z1 - z0), material);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  const rect = (x0, x1, z0, z1, c) => map.push({ x0, x1, z0, z1, c });
  function building(x0, x1, z0, z1, h, side, o = {}) {
    const mats = [side, side, o.roof || roof, roof, side, side];
    box(x0, x1, z0, z1, 0, h, mats, { collide: true });
    rect(x0, x1, z0, z1, o.map || '#77736d');
    if (o.rooftop !== false && h < 70) rooftop(x0, x1, z0, z1, h);
  }
  // Tel Aviv roofs: solar water heaters (a panel + a white tank) and AC units
  const solar = [], tanks = [], acs = [];
  function rooftop(x0, x1, z0, z1, h) {
    const n = 2 + ((rnd() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const x = x0 + 2 + rnd() * (x1 - x0 - 4), z = z0 + 2 + rnd() * (z1 - z0 - 4);
      if (rnd() < 0.65) {
        solar.push([x, h, z]);
        tanks.push([x, h, z - 1.1]);
      } else acs.push([x, h, z]);
    }
  }
  function sign(texture, w, h, x, y, z, ry = 0, double = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, side: double ? THREE.DoubleSide : THREE.FrontSide, emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: texture }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  }
  function instanced(geo, material, list, setup) {
    const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    im.count = list.length;
    list.forEach((it, i) => {
      setup(it, _p, _e, _s);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
    return im;
  }

  // ------------------------------------------------------------------ ground & streets
  plane(-1500, L.TRENCH.x0, -1500, 1500, 0, G.pave);
  plane(L.TRENCH.x1, 1500, -1500, 1500, 0, G.pave);
  plane(L.TRENCH.x0, L.TRENCH.x1, -1500, 1500, T, G.asphalt);
  rect(L.TRENCH.x0, L.TRENCH.x1, -1500, 1500, '#2b2d31');

  const K = L.KIRYA;
  plane(K.x0, K.x1, K.z0, K.z1, 0.012, G.stone);
  rect(K.x0, K.x1, K.z0, K.z1, '#5d6b45');

  const road = (x0, x1, z0, z1, y = 0.02) => {
    plane(x0, x1, z0, z1, y, G.asphalt);
    rect(x0, x1, z0, z1, '#4b4e54');
  };
  road(L.BEGIN.x0, L.BEGIN.x1, -900, 700);
  for (const [a, b] of [[-900, L.TRENCH.x0], [L.TRENCH.x1, 900]]) {
    road(a, b, L.KAPLAN.z0, L.KAPLAN.z1, 0.025);
    road(a, b, L.HASHALOM.z0, L.HASHALOM.z1, 0.025);
  }
  // Begin's planted median
  for (const [a, b] of [[-900, -252], [-228, -16], [20, 700]]) {
    box(2, 8, a, b, 0, 0.14, [G.concrete, G.concrete, G.grass, G.concrete, G.concrete, G.concrete], { cast: false });
  }
  const walk = (x0, x1, z0, z1) => {
    plane(x0, x1, z0, z1, 0.035, G.side);
    rect(x0, x1, z0, z1, '#9b958a');
  };
  walk(-18, -10, -230, -14); // Begin west, along the Kirya fence (and the Kaplan corner)
  walk(-18, -10, -900, -250);
  walk(-18, -10, 12, 700);
  for (const [a, b] of [[-900, -250], [-230, -8], [12, 700]]) walk(20, 28, a, b); // Begin east
  walk(-900, -18, -230, -222); // Kaplan south, along the fence
  walk(-900, -10, -258, -250);
  walk(20, 900, -258, -250);
  walk(28, 900, -230, -222);
  walk(-900, -18, -14, -8); // HaShalom north
  walk(28, 900, -14, -8);
  walk(-900, -10, 12, 18);
  walk(28, 900, 12, 18);

  // Lane markings & zebra crossings (one instanced mesh)
  const marks = [];
  const skipIn = (s, skips) => skips.some(([a, b]) => s > a - 3 && s < b + 3);
  const dashes = (axis, fixed, from, to, skips, y = 0.045) => {
    for (let s = from; s < to; s += 6) {
      if (skipIn(s, skips)) continue;
      marks.push(axis === 'z' ? [fixed, s + 1.5, 0.15, 3, y] : [s + 1.5, fixed, 3, 0.15, y]);
    }
  };
  const BEGIN_SKIP = [[L.KAPLAN.z0, L.KAPLAN.z1], [L.HASHALOM.z0, L.HASHALOM.z1]];
  const CROSS_SKIP = [[L.BEGIN.x0, L.BEGIN.x1], [L.TRENCH.x0, L.TRENCH.x1]];
  for (const x of [-5.25, -1.75, 11.75, 15.25]) dashes('z', x, -900, 700, BEGIN_SKIP);
  for (const z of [-244.75, -235.25]) dashes('x', z, -900, 900, CROSS_SKIP);
  for (const z of [-3.25, 7.25]) dashes('x', z, -900, 900, [[L.BEGIN.x0, L.BEGIN.x1]]);
  for (const x of [120.75, 124.25, 165.75, 169.25]) dashes('z', x, -900, 900, [], T + 0.03);
  for (const zc of [-17, -227]) for (let x = -9; x <= 19; x += 1.1) marks.push([x, zc, 0.55, 4, 0.05]);
  for (const xc of [-14, 24]) {
    for (let z = L.KAPLAN.z0 + 1; z <= L.KAPLAN.z1 - 1; z += 1.1) marks.push([xc, z, 4, 0.55, 0.05]);
    for (let z = L.HASHALOM.z0 + 1; z <= L.HASHALOM.z1 - 1; z += 1.1) marks.push([xc, z, 4, 0.55, 0.05]);
  }
  instanced(new THREE.BoxGeometry(1, 0.01, 1), std({ color: '#e9e6dc', roughness: 0.7 }), marks, (m, p, e, s) => {
    p.set(m[0], m[4], m[1]);
    e.set(0, 0, 0);
    s.set(m[2], 1, m[3]);
  }).castShadow = false;

  // Traffic lights at the two Begin intersections. Their colours follow ctx.traffic.
  const lightMats = { ns: std({ color: '#111', emissive: '#00ff55', emissiveIntensity: 2 }), ew: std({ color: '#111', emissive: '#ff2020', emissiveIntensity: 2 }) };
  for (const [zc, zh] of [[-240, 10], [2, 10]]) {
    for (const [x, z, axis] of [[-11, zc - zh - 1, 'ns'], [21, zc + zh + 1, 'ns'], [-11, zc + zh + 1, 'ew'], [21, zc - zh - 1, 'ew']]) {
      box(x - 0.1, x + 0.1, z - 0.1, z + 0.1, 0, 4.2, steel, { cast: true });
      box(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 3.4, 4.4, dark);
      box(x - 0.27, x + 0.27, z - 0.27, z + 0.27, 3.8, 4.1, lightMats[axis], { cast: false });
    }
  }
  updaters.push(() => {
    const ns = ctx.traffic?.nsGreen ?? true;
    lightMats.ns.emissive.set(ns ? '#00ff55' : '#ff2020');
    lightMats.ew.emissive.set(ns ? '#ff2020' : '#00ff55');
  });

  // ------------------------------------------------------------------ the Ayalon trench & HaShalom station
  const tw = (x0, x1) => box(x0, x1, -1500, 1500, T, 0, G.concrete, { cast: false });
  tw(L.TRENCH.x0 - 0.4, L.TRENCH.x0);
  tw(L.TRENCH.x1, L.TRENCH.x1 + 0.4);
  // low walls along the top edge, except where the bridges cross
  for (const x of [L.TRENCH.x0 - 0.4, L.TRENCH.x1]) {
    for (const [a, b] of [[-1500, -258], [-222, L.BRIDGE.z0], [L.BRIDGE.z1, 1500]]) box(x, x + 0.4, a, b, 0, 1.1, G.concrete);
  }
  for (const [z0, z1] of [[L.BRIDGE.z0, L.BRIDGE.z1], [-258, -222]]) {
    box(L.TRENCH.x0, L.TRENCH.x1, z0, z1, -1.3, 0, [G.concrete, G.concrete, G.asphalt, G.concrete, G.concrete, G.concrete]);
    // railings along both edges (with the stair opening on the bridge)
    const rail = (a, b, z) => {
      box(a, b, z - 0.06, z + 0.06, 1.0, 1.12, steel);
      box(a, b, z - 0.04, z + 0.04, 0, 0.35, G.concrete);
      for (let x = a; x <= b; x += 2) box(x - 0.04, x + 0.04, z - 0.04, z + 0.04, 0, 1.05, steel, { cast: false });
    };
    rail(L.TRENCH.x0, L.TRENCH.x1, z0 + 0.1);
    if (z1 === L.BRIDGE.z1) {
      rail(L.TRENCH.x0, L.STAIRS.x0, z1 - 0.1);
      rail(L.STAIRS.x1, L.TRENCH.x1, z1 - 0.1);
    } else rail(L.TRENCH.x0, L.TRENCH.x1, z1 - 0.1);
  }
  road(L.TRENCH.x0, L.TRENCH.x1, L.HASHALOM.z0, L.HASHALOM.z1, 0.025);
  road(L.TRENCH.x0, L.TRENCH.x1, L.KAPLAN.z0, L.KAPLAN.z1, 0.025);
  walk(L.TRENCH.x0, L.TRENCH.x1, -14, -8);
  walk(L.TRENCH.x0, L.TRENCH.x1, 12, 18);
  rect(L.TRENCH.x0, L.TRENCH.x1, L.BRIDGE.z0, L.BRIDGE.z1, '#4b4e54');

  // highway / railway separation, ballast, rails & sleepers, catenary
  box(130.6, 131.4, -1500, 1500, T, T + 0.9, G.concrete);
  box(157.6, 158.4, -1500, 1500, T, T + 0.9, G.concrete);
  plane(131.4, 157.6, -1500, 1500, T + 0.02, G.ballast);
  const sleepers = [];
  for (const x of [L.TRACK_X, L.TRACK2_X]) {
    for (const dx of [-0.72, 0.72]) box(x + dx - 0.04, x + dx + 0.04, -1500, 1500, T + 0.15, T + 0.32, steel, { cast: false });
    for (let z = -700; z < 700; z += 0.7) sleepers.push([x, z]);
  }
  instanced(new THREE.BoxGeometry(2.6, 0.15, 0.24), std({ color: '#6b6560' }), sleepers, (it, p, e, s) => {
    p.set(it[0], T + 0.1, it[1]);
    e.set(0, 0, 0);
    s.set(1, 1, 1);
  }).castShadow = false;
  for (let z = -660; z < 660; z += 60) {
    if (z > L.BRIDGE.z0 - 6 && z < L.BRIDGE.z1 + 6) continue;
    for (const x of [133.5, 155.5]) box(x - 0.15, x + 0.15, z - 0.15, z + 0.15, T, T + 6.4, steel);
    box(133.5, 155.5, z - 0.1, z + 0.1, T + 6.2, T + 6.4, steel);
  }
  for (const x of [L.TRACK_X, L.TRACK2_X]) box(x - 0.02, x + 0.02, -1500, 1500, T + 5.6, T + 5.64, dark, { cast: false });

  // island platform, canopy, stairs, signs
  const P = L.PLATFORM;
  box(P.x0, P.x1, P.z0, P.z1, T, P.y, [G.concrete, G.concrete, G.side, G.concrete, G.concrete, G.concrete]);
  const yellow = std({ color: '#f2c200' });
  plane(P.x0 + 0.1, P.x0 + 0.45, P.z0, P.z1, P.y + 0.01, yellow);
  plane(P.x1 - 0.45, P.x1 - 0.1, P.z0, P.z1, P.y + 0.01, yellow);
  for (let z = P.z0 + 4; z < P.z1; z += 14) box(144.85, 145.15, z - 0.15, z + 0.15, P.y, P.y + 4.1, steel);
  box(P.x0 - 0.4, P.x1 + 0.4, P.z0 + 2, P.z1 - 1, P.y + 4.1, P.y + 4.35, std({ color: '#d9dde1', roughness: 0.5, metalness: 0.3 }));
  for (let z = P.z0 + 10; z < P.z1; z += 20) {
    box(144.2, 145.8, z - 0.3, z + 0.3, P.y, P.y + 0.45, steel, { collide: { occl: false, cam: false } }); // benches
  }
  const stationSign = signTex([{ text: 'תל אביב - השלום', size: 44, rtl: true }, { text: 'Tel Aviv - HaShalom', size: 36 }], { bg: '#0b4f9c' });
  for (const z of [56, 96, 136]) {
    sign(stationSign, 4, 1, 145, P.y + 3.3, z, Math.PI / 2, true);
  }
  const S = L.STAIRS, steps = 20;
  for (let i = 0; i < steps; i++) {
    const top = P.y - (P.y * (i + 1)) / steps;
    box(S.x0, S.x1, S.z1 - (i + 1), S.z1 - i, T, top, [G.concrete, G.concrete, G.side, G.concrete, G.concrete, G.concrete], { cast: false });
  }
  for (const x of [S.x0 - 0.2, S.x1]) box(x, x + 0.2, S.z0, S.z1, T, 1.0, std({ color: '#b8c4cc', roughness: 0.3, metalness: 0.5 }));
  // the entrance canopy on the bridge
  for (const [x, z] of [[140.5, 13], [149.5, 13], [140.5, 21], [149.5, 21]]) box(x - 0.12, x + 0.12, z - 0.12, z + 0.12, z > 18 ? -2 : 0, 3.6, steel);
  box(139.8, 150.2, 12, 22, 3.6, 3.85, std({ color: '#d9dde1', metalness: 0.3, roughness: 0.4 }));
  sign(signTex([{ text: 'רכבת ישראל · השלום', size: 40, rtl: true }, { text: 'Israel Railways · HaShalom', size: 32 }], { bg: '#0b4f9c' }), 7, 1.3, 145, 3.2, 21.9, 0);

  // ------------------------------------------------------------------ Azrieli Center
  const A = L.AZRIELI;
  box(A.x0, A.x1, A.z0, A.z1, 0, A.h, [F.mall, F.mall, roof, roof, F.mall, F.mall], { collide: true });
  rect(A.x0, A.x1, A.z0, A.z1, '#7d7a75');
  const az = signTex([{ text: 'AZRIELI', size: 70, weight: 900, color: '#1c3b6f' }, { text: 'עזריאלי', size: 46, rtl: true, color: '#1c3b6f' }], { bg: '#f4f2ee', w: 512, h: 200 });
  sign(az, 14, 5.5, A.x0 - 0.1, 16, -70, -Math.PI / 2);
  sign(az, 14, 5.5, 70, 16, A.z1 + 0.1, 0);
  const tower = (geo, material, x, z, h, coll) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, A.h + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    world.add(...coll, A.h, A.h + h);
    return m;
  };
  tower(uvCylinder(16, 16, 187, 48), F.glassSilver, 52, -60, 187, [36, 68, -76, -44]); // round
  const tri = tower(uvCylinder(21, 21, 169, 3), F.glassBlue, 88, -56, 169, [72, 104, -70, -40]); // triangular
  tri.rotation.y = Math.PI / 6;
  tower(uvBox(28, 154, 28), F.glassSilver, 68, -108, 154, [54, 82, -122, -94]); // square
  for (const [x, z, h, r] of [[52, -60, 187, 15], [88, -56, 169, 0]]) {
    if (!r) continue;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 5, 48, 1, true), dark);
    crown.position.set(x, A.h + h + 2.5, z);
    scene.add(crown);
  }
  // Azrieli Sarona: the tall one across Kaplan
  building(40, 76, -298, -268, 238, F.glassDark, { rooftop: false });

  // ------------------------------------------------------------------ the Kirya
  // fence: concrete base, chain link, barbed wire. Blocks walking, not seeing.
  const fenceMat = std({ map: fenceTex(), transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 });
  const posts = [];
  function fence(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), along = x1 !== x0;
    const g = new THREE.PlaneGeometry(len, 2.8);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len, uv.getY(i) * 2.8);
    const m = new THREE.Mesh(g, fenceMat);
    m.position.set((x0 + x1) / 2, 1.9, (z0 + z1) / 2);
    if (!along) m.rotation.y = Math.PI / 2;
    scene.add(m);
    const t = 0.15;
    if (along) {
      box(Math.min(x0, x1), Math.max(x0, x1), z0 - t, z0 + t, 0, 0.5, G.concrete);
      world.add(x0, x1, z0 - 0.25, z0 + 0.25, 0, 3.3, { occl: false, cam: false });
    } else {
      box(x0 - t, x0 + t, Math.min(z0, z1), Math.max(z0, z1), 0, 0.5, G.concrete);
      world.add(x0 - 0.25, x0 + 0.25, z0, z1, 0, 3.3, { occl: false, cam: false });
    }
    for (let k = 0; k <= len; k += 3) posts.push([x0 + ((x1 - x0) * k) / len, z0 + ((z1 - z0) * k) / len]);
    // barbed wire coil
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 8, 1, true), std({ color: '#777', wireframe: true }));
    coil.position.set((x0 + x1) / 2, 3.45, (z0 + z1) / 2);
    coil.rotation.z = Math.PI / 2;
    if (!along) coil.rotation.set(Math.PI / 2, 0, 0);
    scene.add(coil);
  }
  fence(K.x0, K.z0, L.GATE.x0, K.z0);
  fence(L.TURNSTILE.x1, K.z0, K.x1, K.z0);
  fence(K.x1, K.z0, K.x1, K.z1);
  fence(K.x0, K.z1, K.x1, K.z1);
  fence(K.x0, K.z0, K.x0, K.z1);
  instanced(new THREE.CylinderGeometry(0.06, 0.06, 3.5, 6), steel, posts, (it, p, e, s) => {
    p.set(it[0], 1.75, it[1]);
    e.set(0, 0, 0);
    s.set(1, 1, 1);
  });
  // warning signs on the fence
  const warn = signTex([{ text: 'שטח צבאי - הכניסה למורשים בלבד', size: 30, rtl: true, color: '#b00' }, { text: 'MILITARY AREA · AUTHORISED ENTRY ONLY', size: 22, color: '#222' }], { bg: '#f3f0e6', w: 512, h: 128, border: '#b00' });
  for (const z of [-40, -100, -160]) sign(warn, 2.4, 0.6, K.x1 + 0.2, 1.8, z, Math.PI / 2);
  for (const x of [-40, -90]) sign(warn, 2.4, 0.6, x, 1.8, K.z0 - 0.2, Math.PI);

  // Kaplan gate: two swinging steel leaves, a barrier arm, the guard booth and a turnstile
  const gateMat = std({ color: '#3c4636', metalness: 0.5, roughness: 0.5 });
  const leaves = [];
  for (const [px, dir] of [[L.GATE.x0, 1], [L.GATE.x1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(px, 0, K.z0);
    const parts = [bx(8, 0.15, 0.12, dir * 4, 0.3, 0, '#3c4636'), bx(8, 0.15, 0.12, dir * 4, 2.6, 0, '#3c4636'), bx(8, 0.15, 0.12, dir * 4, 1.45, 0, '#3c4636')];
    for (let k = 0; k <= 16; k++) parts.push(bx(0.06, 2.4, 0.06, dir * (k * 0.5), 1.45, 0, '#4a5442'));
    parts.push(bx(1.6, 0.35, 0.14, dir * 4, 1.45, -0.02, '#d8b400'));
    const leafMesh = merged(parts);
    pivot.add(leafMesh);
    scene.add(pivot);
    leaves.push({ pivot, dir });
  }
  box(L.GATE.x0 - 0.5, L.GATE.x0, K.z0 - 0.5, K.z0 + 0.5, 0, 3.4, gateMat);
  box(L.GATE.x1, L.GATE.x1 + 0.5, K.z0 - 0.5, K.z0 + 0.5, 0, 3.4, gateMat);
  const gateBox = world.add(L.GATE.x0, L.GATE.x1, K.z0 - 0.3, K.z0 + 0.3, 0, 3, { occl: false, cam: false });
  const B = L.BOOTH;
  box(B.x0, B.x1, B.z0, B.z1, 0, 1.1, std({ color: '#d7d2c6' }), { collide: true });
  box(B.x0, B.x1, B.z0, B.z1, 1.1, 2.5, std({ color: '#9fc3d6', transparent: true, opacity: 0.45, roughness: 0.1 }), { collide: { block: true, occl: false, cam: false } });
  box(B.x0 - 0.4, B.x1 + 0.4, B.z0 - 0.4, B.z1 + 0.4, 2.5, 2.8, std({ color: '#ece7da' }));
  const TS = L.TURNSTILE;
  box(TS.x0, TS.x1, K.z0 - 0.6, K.z0 + 0.6, 0, 2.3, std({ color: '#9aa1a8', metalness: 0.6, roughness: 0.35, transparent: true, opacity: 0.8 }), { collide: { occl: false, cam: false } });
  box(TS.x0 - 0.2, TS.x1 + 0.2, K.z0 - 0.8, K.z0 + 0.8, 2.3, 2.5, dark);
  // the sign over the gate
  for (const x of [L.GATE.x0 - 1.2, L.GATE.x1 + 1.2]) box(x - 0.15, x + 0.15, K.z0 - 1.2, K.z0 - 0.9, 0, 6.2, steel);
  sign(signTex([{ text: 'הקריה', size: 64, rtl: true }, { text: 'HAKIRYA · KAPLAN GATE', size: 30 }], { bg: '#24402c', border: '#d8c27a' }), 16, 3.4, (L.GATE.x0 + L.GATE.x1) / 2, 6.6, K.z0 - 1.06, Math.PI, true);
  sign(signTex([{ text: 'עמדת בידוק', size: 40, rtl: true }, { text: 'CHECKPOINT', size: 30 }], { bg: '#7a1c1c' }), 3.2, 0.8, (B.x0 + B.x1) / 2, 3.2, B.z0 - 0.45, Math.PI, true);

  // flags (waving)
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex(), side: THREE.DoubleSide, roughness: 0.8 });
  const flags = [];
  function flag(x, z, h = 9) {
    box(x - 0.07, x + 0.07, z - 0.07, z + 0.07, 0, h, steel);
    const g = new THREE.PlaneGeometry(2.4, 1.7, 12, 4);
    g.translate(1.2, 0, 0);
    const f = new THREE.Mesh(g, flagMat);
    f.position.set(x + 0.07, h - 1, z);
    f.castShadow = true;
    scene.add(f);
    flags.push({ f, base: Float32Array.from(g.attributes.position.array), ph: rnd() * 6 });
  }
  flag(-161, -224.5);
  flag(-127, -223.4);
  flag(-150, -205, 12);
  flag(-30, -224.5, 9);
  updaters.push((dt, t) => {
    for (const fl of flags) {
      const pos = fl.f.geometry.attributes.position, b = fl.base;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3];
        pos.setZ(i, Math.sin(x * 2.2 - t * 5 + fl.ph) * 0.12 * x);
        pos.setY(i, b[i * 3 + 1] - x * 0.04);
      }
      pos.needsUpdate = true;
      fl.f.geometry.computeVertexNormals();
    }
  });

  // The Matcal tower ("Marganit"): the HQ building with its antenna tower and red-white mast
  const MC = L.MATCAL;
  building(MC.x0, MC.x1, MC.z0, MC.z1, MC.h, F.matcal, { rooftop: false, map: '#5a5650' });
  const ringMat = std({ map: facade('band', { wall: '#8f8a80', win: '#1e2830', rows: 1, cols: 8, tile: [12, 3] }) });
  const shaft = new THREE.Mesh(uvCylinder(6.5, 7, 36, 32), F.matcal);
  shaft.position.set(MC.tx, MC.h + 18, MC.tz);
  shaft.castShadow = true;
  scene.add(shaft);
  for (const [y, r, h] of [[MC.h + 13, 11, 3.2], [MC.h + 25, 12.5, 2.6], [MC.h + 35, 10.5, 1.8]]) {
    const ring = new THREE.Mesh(uvCylinder(r, r * 0.92, h, 40), [ringMat, roof, roof]);
    ring.position.set(MC.tx, y, MC.tz);
    ring.castShadow = true;
    scene.add(ring);
  }
  world.add(MC.tx - 12.5, MC.tx + 12.5, MC.tz - 12.5, MC.tz + 12.5, MC.h, MC.h + 36);
  const red = std({ color: '#d42a1f', roughness: 0.6 }), white = std({ color: '#f4f4f0', roughness: 0.6 });
  for (let i = 0; i < 10; i++) {
    const r0 = 1.1 - i * 0.07, seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.07, r0, 4, 10), i % 2 ? white : red);
    seg.position.set(MC.tx, MC.h + 38 + i * 4, MC.tz);
    seg.castShadow = true;
    scene.add(seg);
  }
  world.add(MC.tx - 1, MC.tx + 1, MC.tz - 1, MC.tz + 1, MC.h + 36, MC.h + 78);
  const dish = new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const a of [0, 2.1, 4.2]) {
    const d = new THREE.Mesh(dish, white);
    d.position.set(MC.tx + Math.cos(a) * 7.2, MC.h + 19, MC.tz + Math.sin(a) * 7.2);
    d.rotation.set(0, -a, -Math.PI / 2);
    scene.add(d);
  }
  const helipad = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ map: signTex([{ text: 'H', size: 110, color: '#fff' }], { w: 128, h: 128, bg: '#3b3f44' }) }));
  helipad.rotation.x = -Math.PI / 2;
  helipad.position.set(MC.tx, MC.h + 35.95, MC.tz);
  scene.add(helipad);
  const beacons = [];
  for (const y of [MC.h + 78, MC.h + 36.5, MC.h + 26.5]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }));
    b.position.set(MC.tx + (y < MC.h + 70 ? 10 : 0), y, MC.tz);
    scene.add(b);
    beacons.push(b);
  }
  updaters.push((dt, t) => {
    for (const b of beacons) b.visible = Math.sin(t * 3) > 0;
  });

  // Kirya streets, lawns and buildings
  plane(L.GATE.x0, L.GATE.x1, K.z0, K.z1, 0.02, G.asphalt);
  plane(K.x0, K.x1, -166, -157, 0.022, G.asphalt);
  plane(K.x0, K.x1, -96, -88, 0.022, G.asphalt);
  rect(L.GATE.x0, L.GATE.x1, K.z0, K.z1, '#4b4e54');
  rect(K.x0, K.x1, -166, -157, '#4b4e54');
  rect(K.x0, K.x1, -96, -88, '#4b4e54');
  for (const r of [[-140, -96, -155, -100], [-240, -165, -85, -55], [-125, -60, -85, -50], [-135, -100, -215, -175], [-180, -160, -150, -100]]) {
    plane(r[0], r[1], r[2], r[3], 0.03, G.grass);
    rect(r[0], r[1], r[2], r[3], '#5f7d3a');
  }
  buildHoledBuilding(ctx, { box, rect, side: F.kirya, roof });
  building(-290, -245, -145, -105, 18, F.grid);
  building(-235, -190, -145, -112, 12, F.kirya);
  building(-285, -230, -70, -25, 22, F.band);
  building(-75, -35, -150, -110, 26, F.glassDark);
  building(-80, -30, -75, -30, 16, F.kirya);
  building(-125, -98, -214, -196, 9, F.kirya);
  // Templer houses: the old German colony stone houses with red tile roofs, still inside the Kirya
  const tileRoof = std({ color: '#b5502e', roughness: 0.8 });
  for (const [x, z, ry] of [[-118, -138, 0], [-118, -112, 0], [-172, -128, Math.PI / 2], [-110, -66, 0], [-185, -68, 0], [-215, -95, 0], [-104, -38, 0]]) {
    const w = ry ? 9 : 13, d = ry ? 13 : 9;
    building(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 7.5, F.stone, { rooftop: false, map: '#a8573a' });
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); // a square pyramid, 1 x 1 at the base
    g.rotateY(Math.PI / 4);
    g.scale(w + 1, 3.4, d + 1);
    const r = new THREE.Mesh(g, tileRoof);
    r.position.set(x, 7.5 + 1.7, z);
    r.castShadow = true;
    scene.add(r);
  }
  // military vehicles in the lot
  const jeep = merged([bx(1.9, 1.1, 4.4, 0, 1.0, 0, '#556038'), bx(1.8, 0.8, 2.2, 0, 1.9, -0.6, '#4a5430'), bx(1.7, 0.5, 0.05, 0, 1.95, 0.52, '#1b232a'),
    cy(0.42, 0.3, -0.95, 0.42, 1.4, '#151515', { axis: 'x' }), cy(0.42, 0.3, 0.95, 0.42, 1.4, '#151515', { axis: 'x' }), cy(0.42, 0.3, -0.95, 0.42, -1.4, '#151515', { axis: 'x' }), cy(0.42, 0.3, 0.95, 0.42, -1.4, '#151515', { axis: 'x' })]);
  for (const x of [-228, -222, -216, -210, -204, -198]) {
    const j = jeep.clone();
    j.position.set(x, 0, -36);
    scene.add(j);
    world.add(x - 1, x + 1, -38.3, -33.7, 0, 2.3);
  }

  // Argaman's building (lobby + office, see building.js)
  const bld = buildBuilding(ctx, { box, plane, sign, F, G, steel, dark, roof, rect });

  // ------------------------------------------------------------------ the rest of the city
  function fill(x0, x1, z0, z1) {
    for (let x = x0; x < x1 - 10; ) {
      const w = Math.min(x1 - x, 18 + rnd() * 20);
      for (let z = z0; z < z1 - 10; ) {
        const d = Math.min(z1 - z, 16 + rnd() * 20);
        const tall = rnd() < 0.18;
        const h = tall ? 60 + rnd() * 90 : 12 + rnd() * 30;
        const st = tall ? pick([F.glassBlue, F.glassDark, F.glassGreen, F.glassSilver]) : pick(CITY_STYLES);
        building(x, x + w - 6, z, z + d - 6, h, st);
        z += d;
      }
      x += w;
    }
  }
  fill(-338, -24, -298, -262);
  fill(80, 112, -298, -262);
  fill(32, 112, -218, -136);
  fill(-338, -24, 24, 216);
  fill(32, 112, 24, 216);
  fill(182, 278, -298, -262);
  fill(182, 278, -218, -20);
  fill(182, 278, 24, 216);
  fill(-338, -306, -218, -20);
  // far skyline (no collision)
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = 480 + rnd() * 600;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, w = 18 + rnd() * 24, h = 15 + rnd() * (rnd() < 0.25 ? 150 : 45);
    const m = new THREE.Mesh(uvBox(w, h, w), [pick(CITY_STYLES), pick(CITY_STYLES), roof, roof, pick(CITY_STYLES), pick(CITY_STYLES)]);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }

  // rooftop clutter
  instanced(new THREE.BoxGeometry(1.8, 0.08, 1.1), std({ color: '#1f3a5a', metalness: 0.6, roughness: 0.3 }), solar, (it, p, e, s) => {
    p.set(it[0], it[1] + 0.6, it[2]);
    e.set(-0.6, 0, 0);
    s.set(1, 1, 1);
  });
  instanced(new THREE.CylinderGeometry(0.35, 0.35, 1.6, 10), std({ color: '#e6e6e0' }), tanks, (it, p, e, s) => {
    p.set(it[0], it[1] + 0.9, it[2]);
    e.set(0, 0, Math.PI / 2);
    s.set(1, 1, 1);
  });
  instanced(new THREE.BoxGeometry(1, 0.8, 0.6), std({ color: '#cfcfca' }), acs, (it, p, e, s) => {
    p.set(it[0], it[1] + 0.4, it[2]);
    e.set(0, rnd() * 3, 0);
    s.set(1, 1, 1);
  });

  // ------------------------------------------------------------------ street furniture & cover
  // Ficus trees and date palms as instanced merged meshes
  const ficusGeo = merged([cy(0.22, 3, 0, 1.5, 0, '#6b5a45', { r2: 0.3 }), sp(2.1, 0, 4.3, 0, '#3f6a2a', 1, 0.75, 1), sp(1.6, 1.1, 3.9, 0.6, '#4a7a30', 1, 0.8, 1), sp(1.5, -1, 4.1, -0.7, '#37602a', 1, 0.8, 1)]).geometry;
  const palmParts = [cy(0.22, 7, 0, 3.5, 0, '#8a7458', { r2: 0.3, seg: 8 })];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, g = new THREE.BoxGeometry(0.5, 0.05, 3);
    g.translate(0, 0, 1.5);
    g.rotateX(0.45);
    g.rotateY(a);
    g.translate(0, 7, 0);
    palmParts.push(paint(g, k % 2 ? '#4e7d34' : '#3f6a2a'));
  }
  const palmGeo = merged(palmParts).geometry;
  const bushGeo = merged([sp(0.9, 0, 0.6, 0, '#4d7a2c', 1.2, 0.8, 1.1), sp(0.7, 0.6, 0.55, 0.3, '#5c8a36', 1, 0.9, 1), sp(0.7, -0.6, 0.5, -0.2, '#426b26', 1, 0.9, 1)]).geometry;
  const ficus = [], palms = [], bushes = [];
  const tree = (x, z) => {
    ficus.push([x, z, 0.8 + rnd() * 0.5]);
    world.add(x - 0.25, x + 0.25, z - 0.25, z + 0.25, 0, 3);
  };
  const palm = (x, z) => palms.push([x, z, 0.8 + rnd() * 0.4]);
  const bush = (x, z, r = 1.5) => {
    bushes.push([x, z, r / 1.5]);
    world.addHide(x, z, r);
    map.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r, c: '#3f7a2a' });
  };
  const hedge = (x0, x1, z0, z1) => {
    box(x0, x1, z0, z1, 0, 1.15, hedgeMat, { collide: true });
    rect(x0, x1, z0, z1, '#4a7a2c');
  };
  // Begin, west side along the Kirya fence: bushes with hedges between them
  for (let z = -25; z >= -200; z -= 25) {
    bush(-15.6, z);
    hedge(-17.6, -16.6, z - 18, z - 5);
  }
  bush(-15.6, -217);
  for (let z = -20; z > -220; z -= 14) if (Math.abs(z + 70) > 5 && Math.abs(z + 160) > 5) tree(-11.2, z);
  // Begin, east side (Azrieli side)
  for (let z = -30; z >= -205; z -= 25) bush(26.3, z);
  for (let z = -22; z > -225; z -= 14) tree(21.4, z);
  for (let z = 24; z < 700; z += 14) {
    tree(21.4, z);
    tree(-11.2, z);
  }
  for (let z = -264; z > -900; z -= 14) {
    tree(21.4, z);
    tree(-11.2, z);
  }
  // Begin median
  for (let z = -30; z > -225; z -= 12) palm(5, z);
  for (let z = 30; z < 700; z += 12) palm(5, z);
  for (let z = -265; z > -900; z -= 12) palm(5, z);
  for (const z of [-45, -95, -145, -195]) bush(5, z, 1.4);
  // Kaplan, south side along the fence (where the line of soldiers is)
  for (const x of [-26, -46, -66, -86, -104]) bush(x, -223.6, 1.45);
  for (const x of [-36, -56, -76, -95]) hedge(x - 4, x + 4, -223.2, -222.4);
  for (let x = -24; x > -330; x -= 14) if (x > -108 || x < -165) tree(x, -229.2);
  for (let x = -24; x > -330; x -= 14) tree(x, -251.2);
  for (const x of [-30, -60, -90, -120]) bush(x, -255.5, 1.4);
  for (let x = 32; x < 112; x += 14) {
    tree(x, -229.2);
    tree(x, -251.2);
  }
  // HaShalom
  for (const x of [108, 92, 76, 60, 44, 32]) bush(x, 15.2, 1.4);
  for (const x of [38, 58, 78, 98]) hedge(x - 5, x + 5, -13.8, -13);
  for (let x = 30; x < 112; x += 14) tree(x, 16.6);
  for (let x = -24; x > -330; x -= 14) {
    tree(x, -12.6);
    tree(x, 16.6);
  }
  // inside the Kirya
  for (const [x, z] of [[-140, -150], [-100, -150], [-140, -100], [-100, -98], [-170, -110], [-130, -60], [-95, -55], [-200, -80], [-225, -70], [-160, -40], [-130, -190], [-105, -180], [-60, -165], [-45, -95], [-170, -180], [-178, -205]]) palm(x, z);
  for (const [x, z] of [[-120, -160], [-150, -130], [-90, -130], [-200, -50], [-250, -160], [-270, -90], [-60, -90], [-240, -150]]) tree(x, z);
  instanced(ficusGeo, VC, ficus, (it, p, e, s) => {
    p.set(it[0], 0, it[1]);
    e.set(0, it[0] * 7.3, 0);
    s.setScalar(it[2]);
  });
  instanced(palmGeo, VC, palms, (it, p, e, s) => {
    p.set(it[0], 0, it[1]);
    e.set((rnd() - 0.5) * 0.08, rnd() * 6, (rnd() - 0.5) * 0.08);
    s.setScalar(it[2]);
  });
  instanced(bushGeo, VC, bushes, (it, p, e, s) => {
    p.set(it[0], 0, it[1]);
    e.set(0, it[0] * 3.1 + it[1], 0);
    s.setScalar(it[2]);
  });

  // bus stops (the side ad panels are good cover)
  const adTex = signTex([{ text: 'מבצע!', size: 60, rtl: true, color: '#ffeb3b' }, { text: 'SUMMER SALE', size: 34 }], { bg: '#c2185b', w: 256, h: 256 });
  const adMat = std({ map: adTex, emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: adTex });
  function busStop(x0, x1, zc) {
    // shelter on a north-south sidewalk, x0..x1 across the sidewalk, ads at both ends
    box(x0, x1, zc - 3, zc + 3, 2.5, 2.65, std({ color: '#cfd6dc', metalness: 0.4, roughness: 0.3 }));
    for (const z of [zc - 3, zc + 3]) box(x0, x1 - 1, z - 0.08, z + 0.08, 0.1, 2.4, adMat, { collide: true });
    box(x0, x0 + 0.08, zc - 3, zc + 3, 0.1, 2.4, std({ color: '#9fc3d6', transparent: true, opacity: 0.35 }), { collide: { occl: false, cam: false } });
    box(x0 + 0.2, x0 + 0.7, zc - 2, zc + 2, 0, 0.45, steel, { collide: { occl: false, cam: false } });
    rect(x0, x1, zc - 3, zc + 3, '#c7c9cc');
  }
  busStop(-17.5, -13.5, -70);
  busStop(-17.5, -13.5, -160);
  busStop(24, 27.8, -100);
  // kiosks and electrical cabinets
  const kioskTex = signTex([{ text: 'קיוסק', size: 50, rtl: true }, { text: 'KIOSK · קפה', size: 26 }], { bg: '#e65100', w: 256, h: 128 });
  function kiosk(x0, x1, z0, z1) {
    box(x0, x1, z0, z1, 0, 2.7, std({ color: '#e7e0d0' }), { collide: true });
    box(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, 2.7, 2.9, std({ color: '#e65100' }));
    sign(kioskTex, 2.4, 1.1, x1 + 0.02, 2.0, (z0 + z1) / 2, Math.PI / 2);
    rect(x0, x1, z0, z1, '#c9b48a');
  }
  kiosk(-17.6, -14.6, -36, -32);
  kiosk(-52, -48, -229.6, -226.6);
  const cab = std({ color: '#9aa39b', roughness: 0.6 });
  for (const [x, z] of [[-11.4, -122], [-11.4, -188], [-74, -229.2], [24.8, -60], [24.8, -170]]) box(x - 0.4, x + 0.4, z - 0.6, z + 0.6, 0, 1.55, cab, { collide: true });
  // parked cars along Kaplan and HaShalom
  const parked = [];
  for (let x = -26; x > -320; x -= 7.5) if (x > -100 || x < -170) parked.push([x, -231.3, -Math.PI / 2]);
  for (let x = -30; x > -320; x -= 7.5) parked.push([x, -248.7, Math.PI / 2]);
  for (let x = -30; x > -320; x -= 7.5) parked.push([x, 10.7, -Math.PI / 2]);
  for (let x = 34; x < 110; x += 7.5) parked.push([x, 10.7, -Math.PI / 2]);
  const carColors = ['#e8e8e8', '#b9bec4', '#2a2d33', '#7d1f1f', '#2d4a7a', '#d8d8d8', '#5a5f66'];
  const carGeos = carColors.map((c) => carGeometry(c));
  parked.forEach(([x, z, ry], i) => {
    const m = new THREE.Mesh(carGeos[i % carGeos.length], VC);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.castShadow = true;
    scene.add(m);
    world.add(x - 2.2, x + 2.2, z - 0.95, z + 0.95, 0, 1.5);
  });

  return {
    map,
    gate: {
      leaves, box: gateBox, k: 0,
      set(k) {
        this.k = k;
        for (const l of leaves) l.pivot.rotation.y = -l.dir * k * 1.75;
        gateBox.off = k > 0.3;
      },
    },
    building: bld,
    update(dt, t) {
      for (const u of updaters) u(dt, t);
      bld.update(dt, t);
    },
  };
}

