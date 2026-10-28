import * as THREE from 'three';
import * as L from './layout.js';
import { bx, cy, merged, VC } from './geo.js';
import { audio } from './audio.js';

// Vehicles face +z in their own space.
export function carGeometry(color) {
  const parts = [
    bx(1.8, 0.65, 4.3, 0, 0.62, 0, color),
    bx(1.6, 0.58, 2.3, 0, 1.22, -0.2, '#1e2830'),
    bx(1.62, 0.07, 2.0, 0, 1.53, -0.2, color),
    bx(0.45, 0.12, 0.05, -0.6, 0.72, 2.16, '#fffbe0'),
    bx(0.45, 0.12, 0.05, 0.6, 0.72, 2.16, '#fffbe0'),
    bx(0.4, 0.12, 0.05, -0.65, 0.78, -2.16, '#b01010'),
    bx(0.4, 0.12, 0.05, 0.65, 0.78, -2.16, '#b01010'),
  ];
  for (const x of [-0.85, 0.85]) for (const z of [-1.35, 1.35]) parts.push(cy(0.33, 0.24, x, 0.33, z, '#151515', { axis: 'x' }));
  return merged(parts).geometry;
}

export function busGeometry() {
  const parts = [
    bx(2.5, 2.6, 12, 0, 1.75, 0, '#f0f0ee'),
    bx(2.52, 1.0, 11.6, 0, 2.2, 0, '#1e2830'),
    bx(2.54, 0.35, 12.02, 0, 1.05, 0, '#1f5fb0'),
    bx(2.3, 0.3, 4, 0, 3.2, -2, '#d0d0d0'),
    bx(2.3, 1.2, 0.05, 0, 2.3, 6.01, '#1e2830'),
  ];
  for (const x of [-1.15, 1.15]) for (const z of [-4, 3.8]) parts.push(cy(0.5, 0.3, x, 0.5, z, '#151515', { axis: 'x' }));
  return merged(parts).geometry;
}

const COLORS = ['#e8e8e8', '#c3c7cc', '#2a2d33', '#7d1f1f', '#2d4a7a', '#f2f2f2', '#5a5f66', '#d9d2b6', '#e8e8e8'];

// Street traffic with traffic lights: Begin (north-south) and Kaplan / HaShalom (east-west).
// Cars brake for the car ahead, red lights and Argaman; when he blocks them they honk, and a
// honk makes nearby meteorologists come and look.
export class Traffic {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0;
    this.nsGreen = true;
    this.ewGreen = false;
    const geos = COLORS.map((c) => carGeometry(c)), bus = busGeometry();
    const T = L.TRENCH.y;
    const lanes = [];
    const NS_STOPS_S = [L.KAPLAN.z0 - 1, L.HASHALOM.z0 - 1], NS_STOPS_N = [L.KAPLAN.z1 + 1, L.HASHALOM.z1 + 1];
    for (const x of [-7, -3.5, 0]) lanes.push({ axis: 'z', fixed: x, dir: 1, from: -700, to: 600, stops: NS_STOPS_S, light: 'ns', speed: 13, y: 0, n: 9 });
    for (const x of [10, 13.5, 17]) lanes.push({ axis: 'z', fixed: x, dir: -1, from: 600, to: -700, stops: NS_STOPS_N, light: 'ns', speed: 13, y: 0, n: 9 });
    for (const z of [-246.5, -243, -5, -1.5]) lanes.push({ axis: 'x', fixed: z, dir: -1, from: 500, to: -600, stops: [L.BEGIN.x1 + 1], light: 'ew', speed: 10, y: 0, n: 6 });
    for (const z of [-237, -233.5, 5.5, 9]) lanes.push({ axis: 'x', fixed: z, dir: 1, from: -600, to: 500, stops: [L.BEGIN.x0 - 1], light: 'ew', speed: 10, y: 0, n: 6 });
    for (const x of [119, 122.5, 126]) lanes.push({ axis: 'z', fixed: x, dir: 1, from: -800, to: 800, stops: [], speed: 24, y: T, n: 10 });
    for (const x of [164, 167.5, 171]) lanes.push({ axis: 'z', fixed: x, dir: -1, from: 800, to: -800, stops: [], speed: 24, y: T, n: 10 });
    this.lanes = lanes;
    this.cars = [];
    for (const lane of lanes) {
      lane.cars = [];
      const len = Math.abs(lane.to - lane.from);
      for (let i = 0; i < lane.n; i++) {
        const isBus = lane.y === 0 && Math.random() < 0.12;
        const mesh = new THREE.Mesh(isBus ? bus : geos[(Math.random() * geos.length) | 0], VC);
        mesh.castShadow = true;
        ctx.scene.add(mesh);
        const car = { lane, s: lane.from + lane.dir * (len * (i + Math.random() * 0.5)) / lane.n, v: lane.speed, mesh, len: isBus ? 13 : 5.5, honkT: 0 };
        mesh.rotation.y = lane.axis === 'z' ? (lane.dir > 0 ? 0 : Math.PI) : lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        lane.cars.push(car);
        this.cars.push(car);
      }
    }
  }

  green(light) {
    return light === 'ns' ? this.nsGreen : this.ewGreen;
  }

  update(dt) {
    this.t += dt;
    const c = this.t % 30;
    this.nsGreen = c < 14;
    this.ewGreen = c >= 16 && c < 28;
    const p = this.ctx.player?.pos;
    for (const lane of this.lanes) {
      const d = lane.dir;
      lane.cars.sort((a, b) => (b.s - a.s) * d); // front first
      for (let i = 0; i < lane.cars.length; i++) {
        const car = lane.cars[i];
        let vt = lane.speed;
        const ahead = lane.cars[i - 1];
        if (ahead) {
          const gap = (ahead.s - car.s) * d - (ahead.len + car.len) / 2;
          if (gap < 3) vt = 0;
          else if (gap < 18) vt = Math.min(vt, (gap - 3) * 1.1);
        }
        if (lane.light && !this.green(lane.light)) {
          for (const st of lane.stops) {
            const dist = (st - car.s) * d - car.len / 2;
            if (dist > -1 && dist < 35) vt = Math.min(vt, Math.max(0, (dist - 0.5) * 0.7));
          }
        }
        // Argaman on the road in front of the car
        if (p && Math.abs(p.y - lane.y) < 2) {
          const lat = lane.axis === 'z' ? p.x - lane.fixed : p.z - lane.fixed;
          const along = ((lane.axis === 'z' ? p.z : p.x) - car.s) * d - car.len / 2;
          if (Math.abs(lat) < 1.7 && along > -1 && along < 12) {
            vt = 0;
            car.honkT -= dt;
            if (car.honkT <= 0 && along < 8) {
              car.honkT = 3.5;
              audio.honk();
              this.ctx.guards?.hear(car.mesh.position, 26, 'honk');
            }
          }
        }
        const dv = vt - car.v;
        car.v += Math.max(-14 * dt, Math.min(4 * dt, dv));
        if (car.v < 0) car.v = 0;
        car.s += car.v * d * dt;
        if ((car.s - lane.to) * d > 0) car.s = lane.from;
        if (lane.axis === 'z') car.mesh.position.set(lane.fixed, lane.y, car.s);
        else car.mesh.position.set(car.s, lane.y, lane.fixed);
      }
    }
  }
}

// Israel Railways double-decker push-pull set, stopped at HaShalom.
export class Train {
  constructor(ctx) {
    this.ctx = ctx;
    const T = L.TRENCH.y, x = L.TRACK_X;
    this.group = new THREE.Group();
    const y0 = T + 0.8;
    const coach = (z0, cab) => {
      const len = 25, zc = z0 + len / 2, p = [];
      p.push(bx(3.0, 4.3, len, 0, y0 + 2.25, zc, '#f3f3f1'));
      p.push(bx(3.02, 0.9, len - 2, 0, y0 + 1.45, zc, '#25323d'));
      p.push(bx(3.02, 0.9, len - 2, 0, y0 + 3.35, zc, '#25323d'));
      p.push(bx(3.04, 0.22, len, 0, y0 + 0.6, zc, '#1f4fa0'));
      p.push(bx(3.04, 0.12, len, 0, y0 + 2.45, zc, '#d32f2f'));
      p.push(bx(2.6, 0.3, len - 1, 0, y0 + 4.5, zc, '#b9bcc0'));
      for (const bz of [z0 + 3, z0 + len - 3]) p.push(bx(2.4, 0.7, 3, 0, T + 0.6, bz, '#222'));
      for (const dz of [5.5, len - 5.5]) {
        for (const side of [-1, 1]) p.push(bx(0.06, 2.3, 1.3, side * 1.51, y0 + 1.3, z0 + dz, '#c62828'));
      }
      if (cab) {
        p.push(bx(2.9, 1.6, 2.5, 0, y0 + 3.0, z0 - 0.9, '#f3f3f1'));
        p.push(bx(2.6, 0.9, 0.1, 0, y0 + 3.3, z0 - 2.1, '#1b252e'));
        p.push(bx(2.9, 2.2, 2.5, 0, y0 + 1.1, z0 - 0.9, '#d32f2f'));
      }
      const m = merged(p);
      this.group.add(m);
    };
    const Z0 = 45;
    for (let i = 0; i < 4; i++) coach(Z0 + i * 26, i === 0);
    // Argaman's door (on the platform side, at START.z): two sliding leaves over a dark doorway
    const dz = L.START.z;
    const door = new THREE.MeshStandardMaterial({ color: '#c62828', roughness: 0.5 });
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.3, 1.3), new THREE.MeshBasicMaterial({ color: '#1a1410' }));
    hole.position.set(1.52, y0 + 1.3, dz);
    this.group.add(hole);
    this.leaves = [-1, 1].map((s) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.66), door);
      m.position.set(1.56, y0 + 1.3, dz + s * 0.33);
      this.group.add(m);
      return { m, s };
    });
    this.group.position.set(x, 0, 0);
    ctx.scene.add(this.group);
    this.state = 'stopped';
    this.v = 0;
    this.door = 0;
    this.box = ctx.world.add(x - 1.5, x + 1.5, Z0 - 3, Z0 + 104, T, T + 5.4, { occl: true, cam: false });
  }

  openDoor(k) {
    this.door = k;
    for (const l of this.leaves) l.m.position.z = L.START.z + l.s * (0.33 + k * 0.62);
  }

  depart() {
    this.state = 'departing';
    audio.train(true);
  }

  update(dt) {
    if (this.state !== 'departing') return;
    this.v = Math.min(30, this.v + dt * 1.6);
    this.group.position.z -= this.v * dt;
    this.box.z0 -= this.v * dt;
    this.box.z1 -= this.v * dt;
    if (this.group.position.z < -900) {
      this.state = 'gone';
      this.group.visible = false;
      this.box.off = true;
    }
  }
}
