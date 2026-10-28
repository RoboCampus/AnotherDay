import * as THREE from 'three';
import * as L from './layout.js';
import { signTex } from './textures.js';
import { uvBox } from './geo.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Collects line segments (tubes) and boxes, then draws each kind as one InstancedMesh.
class Kit {
  constructor() {
    this.tubes = [];
    this.boxes = [];
  }

  tube(x0, y0, z0, x1, y1, z1, r = 0.045) {
    this.tubes.push([x0, y0, z0, x1, y1, z1, r]);
  }

  box(x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
    this.boxes.push([x, y, z, w, h, d, rx, ry, rz]);
  }

  build(scene, tubeMat, boxMat) {
    const out = [];
    if (this.tubes.length) {
      const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), tubeMat, this.tubes.length);
      this.tubes.forEach(([x0, y0, z0, x1, y1, z1, r], i) => {
        _a.set(x0, y0, z0);
        _b.set(x1, y1, z1);
        const len = _a.distanceTo(_b);
        _q.setFromUnitVectors(UP, _p.subVectors(_b, _a).normalize());
        _m.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(r, len, r));
        im.setMatrixAt(i, _m);
      });
      im.castShadow = true;
      scene.add(im);
      out.push(im);
    }
    if (this.boxes.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boxMat, this.boxes.length);
      const e = new THREE.Euler();
      this.boxes.forEach(([x, y, z, w, h, d, rx, ry, rz], i) => {
        _q.setFromEuler(e.set(rx, ry, rz));
        _m.compose(_p.set(x, y, z), _q, _s.set(w, h, d));
        im.setMatrixAt(i, _m);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
      out.push(im);
    }
    return out;
  }
}

// Yellow steel lattice for the tower crane (alpha-tested, metre UVs).
function latticeTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 58, 58);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(64, 64);
  g.moveTo(64, 0);
  g.lineTo(0, 64);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 2, 1 / 2);
  return t;
}

// Soot around the hole: dark where the facade burned, fading out, clear in the middle.
function scorchTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grad.addColorStop(0, 'rgba(20,16,12,0.0)');
  grad.addColorStop(0.3, 'rgba(20,16,12,0.85)');
  grad.addColorStop(0.6, 'rgba(30,26,22,0.45)');
  grad.addColorStop(1, 'rgba(30,26,22,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // streaks running up from the hole
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(18,15,12,${0.15 + rnd() * 0.25})`;
    const x = 60 + rnd() * 136;
    g.fillRect(x, 10 + rnd() * 50, 3 + rnd() * 8, 60 + rnd() * 50);
  }
  return new THREE.CanvasTexture(c);
}

// Argaman's building is still under construction: scaffolding wrapped round it, safety netting,
// an unfinished concrete frame on the roof with rebar sticking out, a tower crane and a site fence.
export function buildConstruction(ctx, { box, sign, ceiling }) {
  const { scene, world } = ctx;
  const B = L.BUILDING, D = L.DOOR, top = L.OFFICE_Y + L.OFFICE_H + 0.5;
  const steel = std({ color: '#9aa1a8', metalness: 0.7, roughness: 0.4 });
  const planks = std({ color: '#a8763e', roughness: 0.9 });
  const concrete = std({ color: '#aaa59b', roughness: 0.95 });
  const rebarMat = std({ color: '#5a3a26', metalness: 0.5, roughness: 0.6 });

  // ---- scaffolding: two rows of standards 0.4 m and 1.6 m off each face, ledgers every 2 m
  const sc = new Kit(), deck = new Kit();
  const H = top + 4.5, LIFT = 2;
  const faces = [
    // [along-axis start, end, fixed coordinate, outward sign, axis]
    [B.x0, B.x1, B.z0, -1, 'x'],
    [B.x0, B.x1, B.z1, 1, 'x'],
    [B.z0, B.z1, B.x0, -1, 'z'],
    [B.z0, B.z1, B.x1, 1, 'z'],
  ];
  for (const [a0, a1, c, s, axis] of faces) {
    const east = axis === 'z' && s > 0;
    // the west and south faces rise from the hall's roof, not from the street
    const base = (axis === 'z' && s < 0) || (axis === 'x' && s > 0) ? L.LOBBY_H + 0.6 : 0;
    const P = (along, off, y) => (axis === 'x' ? [along, y, c + s * off] : [c + s * off, y, along]);
    const bays = Math.round((a1 - a0 + 2) / 2.5);
    const step = (a1 - a0 + 2) / bays;
    for (const off of [0.4, 1.6]) {
      for (let i = 0; i <= bays; i++) {
        const al = a0 - 1 + i * step;
        // over the entrance the scaffold stands on the canopy: a covered walkway below
        const y0 = east && al > D.z0 - 2.5 && al < D.z1 + 2.5 ? 3.5 : base;
        sc.tube(...P(al, off, y0), ...P(al, off, H));
      }
      for (let y = LIFT; y <= H; y += LIFT) {
        if ((east && y < 4) || y < base + 0.5) continue;
        sc.tube(...P(a0 - 1, off, y), ...P(a1 + 1, off, y), 0.035);
      }
    }
    // decks every other lift, with toe boards
    for (let y = base + 4.5; y < H; y += LIFT * 2) {
      const [x, , z] = P((a0 + a1) / 2, 1.0, y);
      if (axis === 'x') deck.box(x, y, z, a1 - a0 + 2, 0.06, 1.25);
      else deck.box(x, y, z, 1.25, 0.06, a1 - a0 + 2);
    }
    // zig-zag bracing on the outer row
    for (let i = 0; i + 2 <= bays; i += 5) {
      let up = true;
      for (let y = east ? 4 : base; y + LIFT <= H; y += LIFT) {
        const al0 = a0 - 1 + i * step, al1 = al0 + 2 * step;
        sc.tube(...P(up ? al0 : al1, 1.6, y), ...P(up ? al1 : al0, 1.6, y + LIFT), 0.03);
        up = !up;
      }
    }
  }
  sc.build(scene, steel);
  deck.build(scene, null, planks);

  // safety netting over parts of the scaffold (not over the level-14 windows)
  const net = std({ color: '#2f6b3d', transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
  const netPanel = (x, y, z, w, h, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), net);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  for (const [a, b, y0, y1] of [[B.x0 - 1, -214, 6, 30], [-203, -190, 14, 44], [-212, -198, 30, 46]]) netPanel((a + b) / 2, (y0 + y1) / 2, B.z0 - 1.7, b - a, y1 - y0, 0);
  for (const [a, b, y0, y1] of [[-226, -205, 8, 26], [-200, B.x1 + 1, 20, 46]]) netPanel((a + b) / 2, (y0 + y1) / 2, B.z1 + 1.7, b - a, y1 - y0, 0);
  for (const [a, b, y0, y1] of [[B.z0 - 1, -186, 8, 40]]) netPanel(B.x0 - 1.7, (y0 + y1) / 2, (a + b) / 2, b - a, y1 - y0, Math.PI / 2);
  for (const [a, b, y0, y1] of [[B.z0 - 1, -194, 8, 36], [-182, B.z1 + 1, 12, 44]]) netPanel(B.x1 + 1.7, (y0 + y1) / 2, (a + b) / 2, b - a, y1 - y0, Math.PI / 2);
  sign(signTex([{ text: 'בבנייה', size: 60, rtl: true, color: '#111' }, { text: 'UNDER CONSTRUCTION', size: 34, color: '#111' }], { bg: '#ffd23f', border: '#111', w: 512, h: 200 }), 9, 3.5, B.x1 + 1.75, 9.5, -198, Math.PI / 2, true);

  // ---- the roof: an unfinished concrete frame, floors 15-16
  const frame = new Kit(), rebar = new Kit();
  const COLS_X = [-229, -221.5, -214, -206.5, -199, -191.5, -186], COLS_Z = [-204, -197, -190, -183, -176, -171];
  const SH = 3.5;
  for (const x of COLS_X) {
    for (const z of COLS_Z) {
      const second = x < -205; // the second storey only exists over the west half
      const h = second ? SH * 2 : SH;
      frame.box(x, top + h / 2, z, 0.5, h, 0.5);
      for (const [dx, dz] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
        rebar.tube(x + dx, top + h, z + dz, x + dx + (rnd() - 0.5) * 0.3, top + h + 1 + rnd() * 0.8, z + dz + (rnd() - 0.5) * 0.3, 0.02);
      }
    }
  }
  // the 15th-floor slab (west part) and beams
  frame.box(-215.5, top + SH, -187.5, 28, 0.35, 34);
  for (const z of COLS_Z) frame.box((-229 + -186) / 2, top + SH - 0.4, z, 43, 0.5, 0.4);
  for (const x of COLS_X) frame.box(x, top + SH - 0.4, -187.5, 0.4, 0.5, 33);
  // rebar mats waiting for concrete on the eastern half
  for (let x = -201; x < -186.5; x += 0.6) rebar.tube(x, top + SH - 0.1, -204, x, top + SH - 0.1, -171, 0.015);
  frame.build(scene, null, concrete);
  rebar.build(scene, rebarMat);
  // the roof itself (the 14th-floor ceiling), with puddles of formwork
  box(B.x0, B.x1, B.z0, B.z1, top - 0.5, top, [concrete, concrete, concrete, ceiling, concrete, concrete], { collide: true });
  box(-204, -196, -194, -188, top, top + 0.9, std({ color: '#c67a32' })); // stacked formwork panels
  box(-192, -189, -201, -195, top, top + 1.2, std({ color: '#7d8590', metalness: 0.4 })); // a bundle of steel

  // ---- tower crane between this building and its damaged neighbour, jib over the site
  const CX = -240, CZ = -214, MAST = 78; // north of the hall, inside the Kirya fence
  const yellow = std({ map: latticeTex(), color: '#f2c200', alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  const solidYellow = std({ color: '#f2c200', roughness: 0.6 });
  const mast = new THREE.Mesh(uvBox(2.2, MAST, 2.2), yellow);
  mast.position.set(CX, MAST / 2 + 1, CZ);
  mast.castShadow = true;
  scene.add(mast);
  box(CX - 3.5, CX + 3.5, CZ - 3.5, CZ + 3.5, 0, 1, concrete, { collide: true });
  world.add(CX - 1.1, CX + 1.1, CZ - 1.1, CZ + 1.1, 1, MAST + 1);
  const slew = new THREE.Group();
  slew.position.set(CX, MAST + 1, CZ);
  scene.add(slew);
  const piece = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    slew.add(m);
    return m;
  };
  piece(new THREE.BoxGeometry(3, 1.2, 3), solidYellow, 0, 0.6, 0); // turntable
  piece(uvBox(1.6, 1.8, 58), yellow, 0, 2.1, 30); // jib, pointing along +z in its own space
  piece(uvBox(1.6, 1.4, 18), yellow, 0, 1.9, -9); // counter-jib
  piece(new THREE.BoxGeometry(2.4, 3, 4), concrete, 0, 0.3, -16.5); // counterweights
  piece(uvBox(1.4, 9, 1.4), yellow, 0, 5.7, 0); // apex
  piece(new THREE.BoxGeometry(1.8, 2, 2.2), std({ color: '#e8e4da' }), 1.8, 1.2, 1.5);
  piece(new THREE.BoxGeometry(1.7, 1.2, 0.05), std({ color: '#2a3a48', roughness: 0.1, metalness: 0.4 }), 1.8, 1.4, 2.62);
  const cable = std({ color: '#222', metalness: 0.6 });
  for (const [z1, y1] of [[58, 2.9], [-17.5, 2.5]]) {
    const len = Math.hypot(z1, 10.2 - y1);
    const c = piece(new THREE.CylinderGeometry(0.04, 0.04, len, 4), cable, 0, (10.2 + y1) / 2, z1 / 2);
    c.rotation.x = Math.atan2(-z1, 10.2 - y1);
  }
  // trolley, hook and a pallet of concrete blocks hanging over the site
  piece(new THREE.BoxGeometry(1.4, 0.6, 1.6), solidYellow, 0, 0.9, 34);
  const hookLen = 14;
  piece(new THREE.CylinderGeometry(0.03, 0.03, hookLen, 4), cable, 0, 0.9 - hookLen / 2, 34);
  const load = new THREE.Group();
  load.position.set(0, 0.6 - hookLen, 34);
  slew.add(load);
  const pallet = new Kit();
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) pallet.box(-0.6 + i * 0.6, -2.6 + k * 0.4, -0.25 + j * 0.5, 0.56, 0.38, 0.46);
  for (const im of pallet.build(load, null, std({ color: '#9c968b' }))) im.castShadow = true;
  const hookMat = std({ color: '#d42a1f' });
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3), hookMat);
  load.add(hook);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), cable);
    strap.position.set(sx * 0.5, -1.2, 0);
    strap.rotation.z = sx * 0.4;
    load.add(strap);
  }
  // red aviation light on the jib tip
  const beacon = piece(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), 0, 3.2, 59);

  // ---- site fence (blue hoarding, blocks sight) and red/white barriers at the entrance
  const hoard = std({ map: signTex([{ text: 'אתר בנייה · הכניסה אסורה', size: 30, rtl: true, color: '#fff' }, { text: 'CONSTRUCTION SITE · NO ENTRY', size: 22, color: '#fff' }], { bg: '#1f4f8f', w: 512, h: 128 }) });
  hoard.map.wrapS = THREE.RepeatWrapping;
  const fence = (x0, x1, z0, z1) => {
    const m = new THREE.Mesh(uvBox(x1 - x0, 2.4, z1 - z0), hoard);
    m.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = i % 2 ? v / 2.4 : v / 9));
    m.position.set((x0 + x1) / 2, 1.2, (z0 + z1) / 2);
    m.castShadow = true;
    scene.add(m);
    world.add(x0, x1, z0, z1, 0, 2.4);
  };
  fence(B.x0 - 3, B.x1 + 3, B.z0 - 4.2, B.z0 - 4);
  const stripes = document.createElement('canvas');
  stripes.width = 64;
  stripes.height = 16;
  const sg = stripes.getContext('2d');
  for (let i = 0; i < 4; i++) {
    sg.fillStyle = i % 2 ? '#f4f4f0' : '#d42a1f';
    sg.fillRect(i * 16, 0, 16, 16);
  }
  const barrier = std({ map: new THREE.CanvasTexture(stripes) });
  barrier.map.colorSpace = THREE.SRGBColorSpace;
  barrier.map.wrapS = barrier.map.wrapT = THREE.RepeatWrapping;
  barrier.map.repeat.set(1 / 2, 1);
  for (const [z0, z1] of [[B.z0 - 3, D.z0 - 4], [D.z1 + 4, B.z1 + 3]]) {
    box(B.x1 + 4.6, B.x1 + 5.2, z0, z1, 0, 1.0, barrier, { collide: true });
  }
  // cones by the door, a pile of sand, a stack of rebar, a chemical toilet
  const cone = std({ color: '#ff6a00' });
  for (const [x, z] of [[-183, -192.5], [-183, -183.5], [-180.5, -195], [-180.5, -181]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 10), cone);
    c.position.set(x, 0.35, z);
    c.castShadow = true;
    scene.add(c);
  }
  const sand = new THREE.Mesh(new THREE.ConeGeometry(3, 1.8, 14), std({ color: '#d8c08a', roughness: 1 }));
  sand.position.set(-226, 0.9, -213.5);
  scene.add(sand);
  world.add(-228.5, -223.5, -216, -211, 0, 1.4, { occl: false });
  const pile = new Kit();
  for (let i = 0; i < 26; i++) pile.tube(-219 + (i % 7) * 0.09, 0.1 + Math.floor(i / 7) * 0.09, -217, -219 + (i % 7) * 0.09, 0.1 + Math.floor(i / 7) * 0.09, -211, 0.035);
  pile.build(scene, rebarMat);
  box(-208, -206.6, -214, -212.6, 0, 2.3, std({ color: '#2e7bc4' }), { collide: true }); // chemical toilet
  box(-208.05, -206.55, -214.05, -212.55, 2.3, 2.45, std({ color: '#e8e4da' }));

  let t = 0;
  return {
    update(dt) {
      t += dt;
      slew.rotation.y = Math.PI * 0.6 + Math.sin(t * 0.05) * 0.6; // slowly swinging over the site
      load.rotation.y = Math.sin(t * 0.3) * 0.4;
      beacon.visible = Math.sin(t * 3) > 0;
    },
  };
}

// The building next door, with a huge hole torn through its north face over three floors:
// burnt edges, broken floor slabs hanging into the gap, rebar, and the rubble below.
export function buildHoledBuilding(ctx, { box, rect, side, roof }) {
  const { scene, world } = ctx;
  const x0 = -295, x1 = -250, z0 = -212, z1 = -176, h = 30;
  // hole edges sit on the facade grid (3 m columns, 3.5 m floors) so the windows line up
  const hx0 = -283, hx1 = -265, hy0 = 10.5, hy1 = 21, depth = 13;
  const raw = std({ color: '#5d5952', roughness: 1 });
  const C = raw, F = side;
  box(x0, x1, z0, z1, 0, hy0, [F, F, C, roof, F, F], { collide: true });
  box(x0, x1, z0, z1, hy1, h, [F, F, roof, C, F, F], { collide: true });
  box(x0, hx0, z0, z1, hy0, hy1, [C, F, roof, roof, F, F], { collide: true });
  box(hx1, x1, z0, z1, hy0, hy1, [F, C, roof, roof, F, F], { collide: true });
  box(hx0, hx1, z0 + depth, z1, hy0, hy1, [roof, roof, roof, roof, F, C], { collide: true });
  rect(x0, x1, z0, z1, '#6c6760');
  // inside the gap: darkness at the back
  const back = new THREE.Mesh(new THREE.PlaneGeometry(hx1 - hx0, hy1 - hy0), new THREE.MeshBasicMaterial({ color: '#141210' }));
  back.position.set((hx0 + hx1) / 2, (hy0 + hy1) / 2, z0 + depth - 0.02);
  back.rotation.y = Math.PI;
  scene.add(back);

  const chunks = new Kit(), bars = new Kit();
  // ragged outline: concrete chunks biting into the rectangle all round
  const edge = (x, y) => chunks.box(x, y, z0 + 0.3 + rnd() * 0.6, 0.8 + rnd() * 1.8, 0.6 + rnd() * 1.4, 0.6 + rnd() * 1.2, rnd() * 0.6, rnd() * 0.6, rnd() * 0.8);
  for (let x = hx0; x <= hx1; x += 0.9) {
    edge(x, hy0 + rnd() * 1.4 - 0.2);
    edge(x, hy1 - rnd() * 1.6 + 0.2);
  }
  for (let y = hy0; y <= hy1; y += 0.9) {
    edge(hx0 + rnd() * 1.6 - 0.2, y);
    edge(hx1 - rnd() * 1.6 + 0.2, y);
  }
  // the two floors that used to cross the gap: one collapsed, hanging down; one snapped off
  const slabMat = std({ color: '#8a857c', roughness: 1 });
  const slab = (x, y, z, w, d, rx, rz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), slabMat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  slab(hx0 + 4.5, hy0 + 2.2, z0 + 6.5, 9, 10, -0.35, 0.12);
  slab(hx1 - 4, hy0 + 7, z0 + 9, 8, 7, 0.04, -0.05);
  for (let i = 0; i < 14; i++) {
    // rebar out of the broken slab edges, bent down
    const x = hx1 - 7.6 + i * 0.55, y = hy0 + 7, z = z0 + 5.5;
    const mx = x + (rnd() - 0.5) * 0.3, my = y - 0.3 - rnd() * 0.5, mz = z - 0.6 - rnd() * 0.5;
    bars.tube(x, y, z, mx, my, mz, 0.02);
    bars.tube(mx, my, mz, mx + (rnd() - 0.5) * 0.4, my - 0.6 - rnd() * 0.8, mz - rnd() * 0.3, 0.02);
  }
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? hx0 : hx1, s = i % 2 ? 1 : -1, y = hy0 + 1 + rnd() * (hy1 - hy0 - 2);
    bars.tube(side, y, z0 + 0.4 + rnd() * 3, side + s * (0.8 + rnd() * 1.4), y - rnd() * 0.8, z0 + rnd() * 2, 0.022);
  }
  // an office desk on the edge of the broken floor
  chunks.box(hx1 - 3, hy0 + 7.55, z0 + 6.2, 1.6, 0.06, 0.8, 0, 0.3, 0);
  chunks.box(hx1 - 3.6, hy0 + 7.5, z0 + 6, 0.06, 0.7, 0.7, 0, 0.3, 0);
  // rubble at the foot of the wall
  for (let i = 0; i < 140; i++) {
    const a = rnd() * Math.PI, r = Math.sqrt(rnd()) * 9;
    chunks.box((hx0 + hx1) / 2 + Math.cos(a) * r * 1.3, rnd() * 0.6 * (1 - r / 10) + 0.15, z0 - Math.sin(a) * r * 0.7 - 0.3, 0.3 + rnd() * 1.1, 0.25 + rnd() * 0.6, 0.3 + rnd() * 0.9, rnd() * 3, rnd() * 3, rnd() * 3);
  }
  chunks.build(scene, null, std({ color: '#6f6a62', roughness: 1 }));
  bars.build(scene, std({ color: '#4a2e1e', metalness: 0.5, roughness: 0.6 }));
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: '#7d786f', roughness: 1 }));
  mound.scale.set(10, 1.6, 5.5);
  mound.position.set((hx0 + hx1) / 2, 0, z0 - 0.5);
  mound.receiveShadow = true;
  scene.add(mound);
  world.add(hx0 - 4, hx1 + 4, z0 - 5, z0, 0, 1.2, { occl: false });
  // scorch marks round the hole
  const soot = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false }));
  soot.position.set((hx0 + hx1) / 2, (hy0 + hy1) / 2 + 2, z0 - 0.05);
  soot.rotation.y = Math.PI;
  scene.add(soot);
  // police tape round the rubble
  const tapeC = document.createElement('canvas');
  tapeC.width = 128;
  tapeC.height = 16;
  const tg = tapeC.getContext('2d');
  for (let i = 0; i < 8; i++) {
    tg.fillStyle = i % 2 ? '#f4f4f0' : '#d42a1f';
    tg.fillRect(i * 16, 0, 16, 16);
  }
  const tapeTex = new THREE.CanvasTexture(tapeC);
  tapeTex.wrapS = THREE.RepeatWrapping;
  const posts = [[hx0 - 5, z0 - 0.3], [hx0 - 5, z0 - 8], [hx1 + 5, z0 - 8], [hx1 + 5, z0 - 0.3]];
  const pole = std({ color: '#d42a1f' });
  for (let i = 0; i < posts.length; i++) {
    const [x, z] = posts[i];
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), pole);
    p.position.set(x, 0.55, z);
    scene.add(p);
    if (i === posts.length - 1) break;
    const [nx, nz] = posts[i + 1], len = Math.hypot(nx - x, nz - z);
    const tx = tapeTex.clone();
    tx.needsUpdate = true;
    tx.repeat.set(len / 2, 1);
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }));
    tape.position.set((x + nx) / 2, 0.95, (z + nz) / 2);
    tape.rotation.y = -Math.atan2(nz - z, nx - x);
    scene.add(tape);
  }
}
