import * as THREE from 'three';
import * as L from './layout.js';
import { signTex, flagTex } from './textures.js';
import { createCharacter, animate, OLIVE } from './character.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const SKINS = ['#d6a47c', '#c48a5e', '#e8c09a', '#8d5a3b', '#f1c8a4', '#a8714b'];
const HAIR = ['#1c140f', '#3a2416', '#6b4a2b', '#111', '#8a6a3a'];
const BERETS = ['#3a3f2a', '#5b2a6e', '#7a1f1f', '#2d2d2d', '#4f6b2d', '#6a5b2e'];
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (a) => a[(rnd() * a.length) | 0];

// Everything in the hall that hides Argaman from Amir's red eyes is listed here, so the
// colliders (line of sight) and the people standing there stay in sync.
export const PILLARS = [[-198, -170], [-222, -168], [-236, -192], [-236, -168], [-198, -198], [-212, -174]];
// standing groups of soldiers chatting: [x, z, people]
export const GROUPS = [[-217.5, -176.5, 4], [-205.5, -178, 3], [-226, -158, 3], [-194, -160, 4], [-230, -203, 3]];
export const BOOTH = { x0: -194.5, x1: -190, z0: -183.5, z1: -178.5 }; // security check by the door
const TABLES = [[-242, -196], [-242, -186], [-242, -176]];
// where the walkers go (straight lines between these stay clear of the furniture)
const ROUTE = [[-188, -195], [-188, -166], [-200, -164], [-214, -163], [-232, -163], [-233.5, -180], [-233, -199], [-212, -197], [-188, -195]];

function soldier(o = {}) {
  const female = rnd() < 0.45;
  return createCharacter({ shirt: OLIVE, pants: OLIVE, skin: pick(SKINS), hair: pick(HAIR), ponytail: female, beard: !female && rnd() < 0.3, cap: rnd() < 0.4 ? 'beret' : null, beret: pick(BERETS), ...o });
}

function stripes(a, b, n = 8) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.beginPath();
    const w = 128 / n;
    g.moveTo(i * w, 16);
    g.lineTo(i * w + 8, 0);
    g.lineTo(i * w + w + 8, 0);
    g.lineTo(i * w + w, 16);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// The hall's static contents. Box faces are ordered px, nx, py, ny, pz, nz.
export function buildHall(ctx, { box, plane, sign }) {
  const { scene, world } = ctx;
  const LB = L.LOBBY, H = L.LOBBY_H, P = L.PIT;
  const stone = std({ color: '#d2c8b6', roughness: 0.5, envMapIntensity: 0.4 });
  const dark = std({ color: '#3a3a3c', roughness: 0.6 });
  const steel = std({ color: '#7d858d', metalness: 0.7, roughness: 0.35 });
  const wood = std({ color: '#7a5634', roughness: 0.6 });
  const concrete = std({ color: '#8f8b84', roughness: 0.95 });

  for (const [x, z] of PILLARS) box(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 0, H, stone, { collide: true });

  // ---- the Pit: a concrete portal on the south wall, blast doors open, stairs into the dark
  const px0 = P.x - P.w / 2, px1 = P.x + P.w / 2, pz0 = LB.z1 - P.depth, pz1 = LB.z1;
  const inside = std({ color: '#1d1d1f', roughness: 1 });
  box(px0 - 2, px0, pz0, pz1, 0, 4.2, [inside, concrete, concrete, concrete, concrete, concrete], { collide: true });
  box(px1, px1 + 2, pz0, pz1, 0, 4.2, [concrete, inside, concrete, concrete, concrete, concrete], { collide: true });
  box(px0 - 2, px1 + 2, pz0, pz1, 4.2, 4.9, [concrete, concrete, concrete, inside, concrete, concrete]);
  const hazard = std({ map: stripes('#f2c200', '#151515') });
  hazard.map.repeat.set(3, 1);
  box(px0, px1, pz0, pz0 + 0.5, 3.4, 4.2, [concrete, concrete, concrete, inside, concrete, hazard]);
  // stairs going down: strips that get darker step by step
  for (let i = 0; i < 11; i++) {
    const k = i / 10, z = pz0 + 0.5 + i * 0.6;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(P.w, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(0.32 * (1 - k) ** 2) }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(P.x, 0.03, z + 0.3);
    scene.add(m);
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(P.w, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(0.5 * (1 - k) ** 2) }));
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(P.x, 0.035, z);
    scene.add(lip);
  }
  const black = new THREE.Mesh(new THREE.PlaneGeometry(P.w, 4.2), new THREE.MeshBasicMaterial({ color: '#000' }));
  black.position.set(P.x, 2.1, pz1 - 0.42);
  black.rotation.y = Math.PI;
  scene.add(black);
  // the blast doors, swung open inwards
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(P.x + s * (P.w / 2 - 0.1), 0, pz0 + 0.7);
    g.rotation.y = s * 1.2;
    const d = new THREE.Mesh(new THREE.BoxGeometry(P.w / 2 - 0.2, 3.3, 0.35), steel);
    d.position.set(-s * (P.w / 4 - 0.1), 1.65, 0);
    d.castShadow = true;
    g.add(d);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.05, 6, 16), std({ color: '#b02a20' }));
    wheel.position.set(-s * (P.w / 4 - 0.1), 1.5, -0.2);
    g.add(wheel);
    scene.add(g);
  }
  world.add(px0, px1, pz0, pz1, 0, 4, { occl: false, cam: false }); // nobody walks into the Pit
  sign(signTex([{ text: 'הבור', size: 74, rtl: true, color: '#fff' }, { text: 'THE PIT · AUTHORIZED PERSONNEL ONLY', size: 22, color: '#ffd6d6' }], { bg: '#8c1414', border: '#f2c200', w: 512, h: 190 }), 5.4, 2, P.x, 5.35, pz0 - 0.05, Math.PI);
  const floorStripe = new THREE.Mesh(new THREE.PlaneGeometry(P.w + 4, 1.2), std({ map: stripes('#f2c200', '#151515', 10) }));
  floorStripe.rotation.x = -Math.PI / 2;
  floorStripe.position.set(P.x, 0.05, pz0 - 0.6);
  scene.add(floorStripe);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.3, 12), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }));
  beacon.position.set(P.x + 3.6, 4.4, pz0 - 0.15);
  scene.add(beacon);

  // ---- security check by the door: booth, X-ray belt, metal detector arch
  const B2 = BOOTH;
  box(B2.x0, B2.x1, B2.z0, B2.z1, 0, 2.6, std({ color: '#c9cfd4', roughness: 0.4, metalness: 0.2 }), { collide: { cam: false } });
  box(B2.x0 - 0.05, B2.x1 + 0.05, B2.z0 - 0.05, B2.z1 + 0.05, 2.6, 2.75, dark);
  sign(signTex([{ text: 'בידוק ביטחוני', size: 40, rtl: true }, { text: 'SECURITY CHECK', size: 26 }], { bg: '#1d2a48', w: 256, h: 110 }), 2.2, 0.9, (B2.x0 + B2.x1) / 2, 2.0, B2.z0 - 0.02, Math.PI);
  box(-192.5, -189, -185.5, -184.7, 0, 0.9, dark, { collide: { occl: false, cam: false } }); // X-ray belt
  for (const z of [-189.9, -186.1]) box(-189.6, -189.2, z - 0.2, z + 0.2, 0, 2.3, std({ color: '#d8d8d8' }));
  box(-189.6, -189.2, -190.1, -185.9, 2.3, 2.55, std({ color: '#d8d8d8' }));

  // ---- reception counter (north wall), tables and the coffee kiosk (west)
  // Leave a visible knee opening under the counter for the recovery scene.
  box(-206, -205, -201.8, -200.6, 0, 1.15, wood);
  box(-202.6, -195, -201.8, -200.6, 0, 1.15, wood);
  world.add(-206, -195, -201.8, -200.6, 0, 1.15, { cam: false });
  box(-206.1, -194.9, -201.9, -200.5, 1.15, 1.22, dark);
  const tops = std({ color: '#e4ddd0', roughness: 0.4 });
  for (const [x, z] of TABLES) {
    box(x - 0.9, x + 0.9, z - 0.9, z + 0.9, 0.74, 0.8, tops);
    box(x - 0.08, x + 0.08, z - 0.08, z + 0.08, 0, 0.74, dark, { collide: { occl: false, cam: false } });
    world.add(x - 0.9, x + 0.9, z - 0.9, z + 0.9, 0, 0.8, { occl: false, cam: false });
    for (const s of [-1, 1]) {
      box(x + s * 1.25 - 0.25, x + s * 1.25 + 0.25, z - 0.25, z + 0.25, 0.42, 0.48, dark);
      box(x + s * 1.5 - 0.04, x + s * 1.5 + 0.04, z - 0.25, z + 0.25, 0.48, 1.0, dark);
    }
  }
  box(-245, -239, -167, -165.8, 0, 1.1, std({ color: '#3b2516' }), { collide: { cam: false } });
  box(-245, -244.6, -167, -158, 0, 2.8, std({ color: '#2a1a10' }));
  sign(signTex([{ text: 'ARCAFFE', size: 54, color: '#f4e4c4' }, { text: 'קפה · מאפים', size: 28, rtl: true, color: '#f4e4c4' }], { bg: '#3b2516', w: 256, h: 128 }), 3.2, 1.6, -244.55, 3.4, -162, Math.PI / 2);
  // flags and the welcome sign on the north wall
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), std({ map: flagTex(), side: THREE.DoubleSide }));
  flag.position.set(-214, 3.6, LB.z0 + 0.45);
  scene.add(flag);
  sign(signTex([{ text: 'ברוכים הבאים', size: 56, rtl: true }, { text: 'WELCOME TO THE HQ BUILDING', size: 26 }], { bg: '#1d3b2a', border: '#d8c27a' }), 6, 1.5, -200, 3.4, LB.z0 + 0.45, 0);
  // plants
  const pot = std({ color: '#5a4636' }), plant = std({ color: '#3e7a32' });
  for (const [x, z] of [[-188, -203.4], [-188, -150], [-244, -203.4], [-244, -150], [-216, -150], [-204, -150]]) {
    box(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 0, 0.7, pot, { collide: { occl: false, cam: false } });
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), plant);
    p.position.set(x, 1.3, z);
    p.castShadow = true;
    scene.add(p);
  }
  // the standing groups block sight (people are opaque) and movement
  for (const [x, z] of GROUPS) world.add(x - 1.1, x + 1.1, z - 1.1, z + 1.1, 0, 1.85, { cam: false });

  return {
    update(dt, t) {
      beacon.visible = Math.sin(t * 6) > 0;
    },
  };
}

// The soldiers in the hall: chatting groups, people at tables, a coffee queue, people walking through.
export class HallCrowd {
  constructor(ctx) {
    this.ctx = ctx;
    this.people = [];
    const add = (ch, x, z, heading, mode, extra = {}) => {
      ch.root.position.set(x, 0, z);
      ch.root.rotation.y = heading;
      ctx.scene.add(ch.root);
      this.people.push({ ch, mode, heading, pos: ch.root.position, talkT: rnd() * 4, ...extra });
    };
    for (const [x, z, n] of GROUPS) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.4;
        const px = x + Math.cos(a) * 0.75, pz = z + Math.sin(a) * 0.75;
        add(soldier(), px, pz, Math.atan2(x - px, z - pz), 'idle2');
      }
    }
    for (const [x, z] of TABLES) {
      add(soldier({ cap: null }), x - 1.25, z, Math.PI / 2, 'sit');
      add(soldier({ cap: null }), x + 1.25, z, -Math.PI / 2, 'sit');
    }
    // Amir supplies the woman officer behind the reception desk.
    for (let i = 0; i < 4; i++) add(soldier(), -240.5, -164.5 + i * 1.1, -Math.PI / 2, 'idle2'); // coffee queue
    for (let i = 0; i < 6; i++) {
      const k = (i * 1.37) % (ROUTE.length - 1), j = Math.floor(k), f = k - j;
      const [ax, az] = ROUTE[j], [bx, bz] = ROUTE[j + 1];
      add(soldier({ backpack: rnd() < 0.5 ? '#3b3f2c' : null }), ax + (bx - ax) * f, az + (bz - az) * f, 0, 'walk', { leg: j, dir: i % 2 ? 1 : -1, speed: 1.2 + rnd() * 0.5 });
    }
  }

  update(dt) {
    const p = this.ctx.player.pos, LB = L.LOBBY;
    const near = p.y < 10 && p.x > LB.x0 - 40 && p.x < LB.x1 + 40 && p.z > LB.z0 - 40 && p.z < LB.z1 + 40;
    for (const e of this.people) {
      e.ch.root.visible = near;
      if (!near) continue;
      let speed = 0;
      if (e.mode === 'walk') {
        // follow the route, some one way, some the other
        const n = ROUTE.length - 1, tgt = ROUTE[e.dir > 0 ? e.leg + 1 : e.leg];
        const dx = tgt[0] - e.pos.x, dz = tgt[1] - e.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.2) e.leg = (e.leg + e.dir + n) % n;
        else {
          speed = e.speed;
          e.pos.x += (dx / d) * speed * dt;
          e.pos.z += (dz / d) * speed * dt;
          e.heading = Math.atan2(dx, dz);
        }
      }
      e.talkT -= dt;
      if (e.talkT < -2.5) e.talkT = 1 + rnd() * 4;
      e.ch.root.rotation.y = e.heading;
      animate(e.ch, { mode: e.mode === 'walk' ? 'walk' : e.mode, speed, talk: e.mode !== 'walk' && e.talkT < 0 }, dt);
    }
  }
}
