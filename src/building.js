import * as THREE from 'three';
import * as L from './layout.js';
import { facade, signTex, groundTex } from './textures.js';
import { buildConstruction } from './construction.js';
import { buildHall } from './hall.js';
import { buildFloor14 } from './floor14.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });

// Argaman's building inside the Kirya. Built so it can be walked through without loading screens:
// the ground floor is a real lobby (thick walls with a door gap), floors 1-13 are one solid block
// whose top face is the level-14 carpet, and level 14 is ringed with glass so the real city is
// the view. Box faces are ordered px, nx, py, ny, pz, nz.
export function buildBuilding(ctx, { box, plane, sign, F, steel, roof, rect }) {
  const { scene } = ctx;
  const B = L.BUILDING, W = L.WALL, H = L.LOBBY_H, OY = L.OFFICE_Y, OH = L.OFFICE_H, D = L.DOOR, C = L.CORE;
  const ext = std({ map: facade('lobby', { win: '#3e5566', tile: [6, 4.5] }), roughness: 0.3, metalness: 0.3 });
  const inner = std({ color: '#c9c0b0', envMapIntensity: 0.35 });
  const ceiling = std({ color: '#d8d4cc', envMapIntensity: 0.35 });
  const carpet = std({ map: groundTex('carpet'), roughness: 1 });
  const marble = std({ map: groundTex('stone'), color: '#b8ad9c', roughness: 0.35, envMapIntensity: 0.4 });
  const glass = std({ color: '#a9cbe0', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, depthWrite: false });
  const wallMat = (out, outside = ext) => {
    const a = [inner, inner, inner, inner, inner, inner];
    a[out] = outside;
    return a;
  };
  const LB = L.LOBBY, P = L.PIT;
  rect(LB.x0, LB.x1, LB.z0, LB.z1, '#9a9286');
  rect(B.x0, B.x1, B.z0, B.z1, '#8a8378');

  // ---- ground floor: the hall (bigger than the tower: it runs on west and south under a flat roof)
  box(LB.x0, LB.x0 + W, LB.z0, LB.z1, 0, H, wallMat(1), { collide: true });
  box(LB.x1 - W, LB.x1, LB.z0, D.z0, 0, H, wallMat(0), { collide: true });
  box(LB.x1 - W, LB.x1, D.z1, LB.z1, 0, H, wallMat(0), { collide: true });
  box(LB.x1 - W, LB.x1, D.z0, D.z1, 3.2, H, wallMat(0), { collide: true });
  box(LB.x0 + W, LB.x1 - W, LB.z0, LB.z0 + W, 0, H, wallMat(5), { collide: true });
  box(LB.x0 + W, LB.x1 - W, LB.z1 - W, LB.z1, 0, H, wallMat(4), { collide: true });
  // marble floor, leaving a gap where the Pit's stairs go down
  plane(LB.x0 + W, P.x - P.w / 2, LB.z0 + W, LB.z1 - W, 0.045, marble);
  plane(P.x + P.w / 2, LB.x1 - W, LB.z0 + W, LB.z1 - W, 0.045, marble);
  plane(P.x - P.w / 2, P.x + P.w / 2, LB.z0 + W, LB.z1 - P.depth, 0.045, marble);
  // the hall's roof where it sticks out from under the tower
  const podium = [F.kirya, F.kirya, roof, ceiling, F.kirya, F.kirya];
  box(LB.x0, B.x0, LB.z0, LB.z1, H, H + 0.6, podium, { collide: true });
  box(B.x0, LB.x1, B.z1, LB.z1, H, H + 0.6, podium, { collide: true });

  // ---- floors 1-13 (solid), then level 14 with a glass ring, then the roof floors
  box(B.x0, B.x1, B.z0, B.z1, H, OY, [F.kirya, F.kirya, carpet, ceiling, F.kirya, F.kirya], { collide: true });
  const ring = (x0, x1, z0, z1, out) => {
    box(x0, x1, z0, z1, OY, OY + 0.9, wallMat(out, F.kirya));
    box(x0, x1, z0, z1, OY + 3.2, OY + OH, wallMat(out, F.kirya));
    const g = box(x0, x1, z0, z1, OY + 0.9, OY + 3.2, glass, { cast: false });
    ctx.world.add(x0, x1, z0, z1, OY, OY + OH, { occl: false, cam: true });
    return g;
  };
  ring(B.x0, B.x0 + W, B.z0, B.z1, 1);
  ring(B.x1 - W, B.x1, B.z0, B.z1, 0);
  ring(B.x0 + W, B.x1 - W, B.z0, B.z0 + W, 5);
  // the south side in three pieces: the middle one is Argaman's office window (the blue officer comes through it)
  const O = L.OFFICE;
  ring(B.x0 + W, O.x0, B.z1 - W, B.z1, 4);
  const officeWindow = ring(O.x0, O.x1, B.z1 - W, B.z1, 4);
  ring(O.x1, B.x1 - W, B.z1 - W, B.z1, 4);
  // above level 14 the building is still a bare concrete frame (see construction.js)
  const site = buildConstruction(ctx, { box, sign, ceiling });

  // ---- entrance: canopy, sign, sliding glass doors
  box(B.x1, B.x1 + 3, D.z0 - 1.2, D.z1 + 1.2, 3.3, 3.5, std({ color: '#d9dde1', metalness: 0.4, roughness: 0.3 }));
  sign(signTex([{ text: 'בניין המטה', size: 48, rtl: true }, { text: 'HQ BUILDING · 14 FLOORS', size: 28 }], { bg: '#24402c', border: '#d8c27a' }), 5, 1.2, B.x1 + 0.03, 4.0, (D.z0 + D.z1) / 2, Math.PI / 2);
  const doorL = box(B.x1 - 0.25, B.x1 - 0.15, D.z0, D.z0 + 2, 0, 3.2, glass, { cast: false });
  const doorR = box(B.x1 - 0.25, B.x1 - 0.15, D.z1 - 2, D.z1, 0, 3.2, glass, { cast: false });
  let doorK = 0;

  // ---- elevator core, on both floors. Elevator A is a real cab (people ride in it); B is just doors.
  const coreMat = std({ color: '#cfc6b6', roughness: 0.5 });
  const cabInt = std({ color: '#b08a5a', roughness: 0.45, metalness: 0.2 });
  const cabFloor = std({ color: '#3a3532', roughness: 0.9 });
  const doorMat = std({ color: '#b8bec5', metalness: 0.8, roughness: 0.25 });
  const K = L.CAB, zc = L.ELEVATOR.z, DW = K.door;
  const c = coreMat;
  const elevators = {};
  for (const [level, y, h] of [['lobby', 0, H], ['office', OY, OH]]) {
    box(C.x0, C.x1, C.z0, K.z0, y, y + h, [c, c, c, c, cabInt, c], { collide: true });
    box(C.x0, C.x1, K.z1, C.z1, y, y + h, [c, c, c, c, c, cabInt], { collide: true });
    box(C.x0, K.x0, K.z0, K.z1, y, y + h, [cabInt, c, c, c, c, c], { collide: true });
    box(K.x0, C.x1, K.z0, K.z1, y + K.h, y + h, [c, c, c, cabInt, c, c], { collide: true });
    box(C.x1 - 0.25, C.x1, K.z0, zc - DW, y, y + K.h, [c, cabInt, c, c, c, c], { collide: true });
    box(C.x1 - 0.25, C.x1, zc + DW, K.z1, y, y + K.h, [c, cabInt, c, c, c, c], { collide: true });
    plane(K.x0, C.x1 - 0.25, K.z0, K.z1, y + 0.05, cabFloor);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ color: '#fff4dc' }));
    light.rotation.x = Math.PI / 2;
    light.position.set((K.x0 + C.x1) / 2 - 0.2, y + K.h - 0.02, zc);
    scene.add(light);
    box(K.x0 + 0.02, K.x0 + 0.08, K.z0 + 0.3, K.z1 - 0.3, y + 0.9, y + 0.96, steel, { cast: false }); // handrail
    box(C.x1, C.x1 + 0.08, zc - DW - 0.2, zc + DW + 0.2, y + K.h, y + K.h + 0.2, steel, { cast: false });
    const l = box(C.x1 + 0.04, C.x1 + 0.1, zc - DW, zc, y, y + K.h, doorMat, { cast: false });
    const r = box(C.x1 + 0.04, C.x1 + 0.1, zc, zc + DW, y, y + K.h, doorMat, { cast: false });
    const shut = ctx.world.add(C.x1 - 0.3, C.x1 + 0.15, zc - DW, zc + DW, y, y + K.h, { occl: false, cam: false });
    elevators[level] = { l, r, zc, shut };
    // elevator B: doors on the core only
    const zb = zc + 4.6;
    box(C.x1, C.x1 + 0.08, zb - 1.05, zb + 1.05, y + 2.4, y + 2.6, steel, { cast: false });
    box(C.x1 + 0.04, C.x1 + 0.1, zb - 0.82, zb + 0.82, y, y + 2.4, doorMat, { cast: false });
    box(C.x1, C.x1 + 0.06, zc + DW + 0.35, zc + DW + 0.5, y + 1.1, y + 1.3, std({ color: '#222', emissive: '#ffcc55', emissiveIntensity: 1 }), { cast: false });
  }
  const floorSign = (txt, sub, y) => sign(signTex([{ text: txt, size: 56 }, { text: sub, size: 26, rtl: true }], { bg: '#2b2f36', w: 256, h: 160 }), 1.0, 0.62, C.x1 + 0.03, y + 3.2, zc, Math.PI / 2);
  floorSign('0', 'קומת כניסה', 0);
  floorSign('14', 'קומה 14', OY - 0.1);

  // ---- the hall: pillars, security booth, the Pit, soldiers (hall.js)
  const hall = buildHall(ctx, { box, plane, sign });

  // ceiling lights (hall & office)
  const lamp = new THREE.MeshBasicMaterial({ color: '#fffbe8' });
  const hallLamps = [];
  for (let x = LB.x0 + 6; x < LB.x1 - 3; x += 9) for (let z = LB.z0 + 5; z < LB.z1 - 3; z += 8) hallLamps.push([x, z]);
  for (const [y, list] of [[H - 0.02, hallLamps], [OY + OH - 0.02, [[-221, -188], [-213, -188], [-205, -188], [-198.2, -183], [-200.5, -174.5], [-196.5, -174.5]]]]) {
    for (const [x, z] of list) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.2), lamp);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, y, z);
      scene.add(p);
    }
  }
  for (const [x, y, z, r] of [[-205, H - 0.8, -187, 34], [-232, H - 0.8, -175, 34], [-205, H - 0.8, -160, 30], [-212, OY + OH - 0.6, -188, 26], [-198.5, OY + OH - 0.6, -174, 22]]) {
    const l = new THREE.PointLight('#fff2dc', r > 26 ? 26 : 18, r, 1.6);
    l.position.set(x, y, z);
    scene.add(l);
  }

  // ---- level 14: corridor and Argaman's office (floor14.js)
  const floor14 = buildFloor14(ctx, { box, plane, sign, officeWindow });

  return {
    elevators,
    // k: 0 closed .. 1 open
    floor14,
    setElevator(level, k) {
      const e = elevators[level];
      e.l.position.z = e.zc - DW / 2 - k * (DW - 0.05);
      e.r.position.z = e.zc + DW / 2 + k * (DW - 0.05);
      e.shut.off = k > 0.5;
    },
    update(dt, t) {
      site.update(dt);
      hall.update(dt, t);
      const p = ctx.player?.pos;
      if (p) {
        const near = ctx.story?.phase === 'bossFinisher' || (Math.abs(p.x - B.x1) < 4 && p.z > D.z0 - 3 && p.z < D.z1 + 3 && p.y < 10);
        doorK += ((near ? 1 : 0) - doorK) * Math.min(1, dt * 5);
        doorL.position.z = D.z0 + 1 - doorK * 1.9;
        doorR.position.z = D.z1 - 1 + doorK * 1.9;
      }
      floor14.update(dt, t);
    },
  };
}
