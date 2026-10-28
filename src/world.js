import { BOUNDS, TRENCH, PLATFORM, STAIRS, BRIDGE, BUILDING, OFFICE_Y, inRect } from './layout.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Collision world: axis-aligned boxes plus the hand-made ground (the Ayalon trench, the station
// stairs, the bridge and the office floor). Every box can be switched per use:
//   block – stops movement, occl – blocks the meteorologists' line of sight, cam – pushes the camera in.
export class World {
  constructor() {
    this.boxes = [];
    this.hides = []; // bushes: crouch inside one and nobody can see you
  }

  add(x0, x1, z0, z1, y0, y1, o = {}) {
    const occl = o.occl ?? true;
    const b = {
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1,
      block: o.block ?? true, occl, cam: o.cam ?? occl, off: false,
    };
    this.boxes.push(b);
    return b;
  }

  addHide(x, z, r) {
    this.hides.push({ x, z, r });
  }

  inBush(p) {
    return this.hides.some((h) => (p.x - h.x) ** 2 + (p.z - h.z) ** 2 < h.r * h.r);
  }

  groundY(x, z, y = 0) {
    if (y > 30 && inRect(x, z, BUILDING)) return OFFICE_Y;
    if (x > TRENCH.x0 && x < TRENCH.x1) {
      if (z >= BRIDGE.z0 && z <= BRIDGE.z1) return 0;
      if (inRect(x, z, STAIRS)) return (PLATFORM.y * (z - STAIRS.z0)) / (STAIRS.z1 - STAIRS.z0);
      if (inRect(x, z, PLATFORM)) return PLATFORM.y;
      return TRENCH.y;
    }
    return 0;
  }

  // Can a walker stand here? (The trench only has the bridge, the stairs and the platform.)
  walkable(x, z, y = 0) {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return false;
    if (y > 30) return inRect(x, z, BUILDING);
    if (x > TRENCH.x0 - 0.4 && x < TRENCH.x1 + 0.4) {
      if (z > BRIDGE.z0 + 0.5 && z < BRIDGE.z1 - 0.5) return true;
      const m = 0.45;
      if (x > STAIRS.x0 + m && x < STAIRS.x1 - m && z > BRIDGE.z0 + 0.5 && z <= STAIRS.z1) return true;
      if (x > PLATFORM.x0 + m && x < PLATFORM.x1 - m && z >= STAIRS.z1 - 1 && z < PLATFORM.z1 - m) return true;
      return false;
    }
    return true;
  }

  // Push a standing cylinder (feet at p.y, radius r, height h) out of every blocking box.
  collide(p, r = 0.35, h = 1.8) {
    for (const b of this.boxes) {
      if (!b.block || b.off || p.y + h < b.y0 || p.y + 0.3 > b.y1) continue;
      const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * r;
        p.z = cz + (dz / d) * r;
      } else {
        const l = p.x - b.x0, rr = b.x1 - p.x, n = p.z - b.z0, s = b.z1 - p.z, m = Math.min(l, rr, n, s);
        if (m === l) p.x = b.x0 - r;
        else if (m === rr) p.x = b.x1 + r;
        else if (m === n) p.z = b.z0 - r;
        else p.z = b.z1 + r;
      }
    }
  }

  // Is the point inside a solid (occluding) box? Used for the hero's flight after a throw.
  solidAt(p) {
    for (const b of this.boxes) {
      if (!b.occl || b.off) continue;
      if (p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1 && p.y > b.y0 && p.y < b.y1) return b;
    }
    return null;
  }

  // Distance along the ray (d normalised) to the first box with the given flag, or maxT.
  raycast(o, d, maxT, flag = 'occl') {
    let best = maxT;
    for (const b of this.boxes) {
      if (!b[flag] || b.off) continue;
      let t0 = 0, t1 = best, miss = false;
      for (const [a, lo, hi] of [['x', b.x0, b.x1], ['y', b.y0, b.y1], ['z', b.z0, b.z1]]) {
        const oa = o[a], da = d[a];
        if (Math.abs(da) < 1e-9) {
          if (oa < lo || oa > hi) {
            miss = true;
            break;
          }
          continue;
        }
        let ta = (lo - oa) / da, tb = (hi - oa) / da;
        if (ta > tb) [ta, tb] = [tb, ta];
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) {
          miss = true;
          break;
        }
      }
      if (!miss && t0 < best) best = t0;
    }
    return best;
  }
}
