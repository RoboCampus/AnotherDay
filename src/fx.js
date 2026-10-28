import * as THREE from 'three';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();

// Simple pooled point particles (sparks, dust, rain).
export class Particles {
  constructor(scene, n = 1500) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.35, map: GLOW, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    for (let k = 0; k < n; k++) this.pos[k * 3 + 1] = -9999;
  }

  emit(p, count, { speed = 6, color = '#ffd27a', life = 0.8, up = 2, gravity = 9.8, spread = 1 } = {}) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.n;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), v = speed * (0.4 + Math.random() * 0.6);
      this.vel[i * 3] = Math.cos(a) * s * v;
      this.vel[i * 3 + 1] = Math.abs(u) * v + up;
      this.vel[i * 3 + 2] = Math.sin(a) * s * v;
      this.col[i * 3] = c.r;
      this.col[i * 3 + 1] = c.g;
      this.col[i * 3 + 2] = c.b;
      this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.min(1, this.life[i] * 2);
      this.col[i * 3] *= 0.995 + f * 0.005;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

// A jagged lightning bolt from the sky to `to`, with branches. Flickers, then fades.
export class Lightning {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.t = 0;
    this.mat = new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#7fb4ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.light = new THREE.PointLight('#bcd8ff', 0, 400, 1.2);
    scene.add(this.light);
    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: '#cfe4ff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    this.flare.visible = false;
    scene.add(this.flare);
  }

  bolt(from, to, width, depth = 0) {
    const pts = [from.clone()];
    const n = 14 - depth * 4;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const p = from.clone().lerp(to, k);
      const j = from.distanceTo(to) * 0.06;
      p.x += (Math.random() - 0.5) * j;
      p.z += (Math.random() - 0.5) * j;
      p.y += (Math.random() - 0.5) * j * 0.3;
      pts.push(p);
      if (depth < 2 && Math.random() < 0.25) {
        const end = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, -15 - Math.random() * 20, (Math.random() - 0.5) * 30));
        this.bolt(p, end, width * 0.45, depth + 1);
      }
    }
    pts.push(to.clone());
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
      for (const [m, w] of [[this.mat, width], [this.glowMat, width * 5]]) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(w, w, len, 5, 1, true), m);
        seg.position.copy(a).lerp(b, 0.5);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v.subVectors(b, a).normalize());
        this.group.add(seg);
      }
    }
  }

  strike(to) {
    this.clear();
    const from = to.clone().add(new THREE.Vector3(20, 220, -40));
    this.bolt(from, to, 0.7);
    this.t = 0.9;
    this.light.position.copy(to).add(new THREE.Vector3(0, 10, 0));
    this.flare.position.copy(to).add(new THREE.Vector3(0, 2, 0));
    this.flare.visible = true;
  }

  clear() {
    for (const c of [...this.group.children]) {
      c.geometry.dispose();
      this.group.remove(c);
    }
  }

  update(dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    const on = this.t > 0 && (this.t > 0.6 || Math.random() < 0.5);
    this.group.visible = on;
    this.mat.opacity = Math.min(1, this.t * 2);
    this.light.intensity = on ? 1500 * this.t : 0;
    this.flare.scale.setScalar(on ? 40 * this.t : 0);
    this.flare.visible = on;
    if (this.t <= 0) {
      this.clear();
      this.light.intensity = 0;
      this.flare.visible = false;
    }
  }
}

// Poop: soft-serve swirls flung out in an arc; they bounce, land upright and pile up on the floor.
function poopGeometry() {
  // lathe profile (radius, height): three stacked coils and a curled tip
  const pts = [[0, 0], [0.1, 0.004], [0.115, 0.03], [0.1, 0.055], [0.075, 0.06], [0.088, 0.078], [0.078, 0.104], [0.052, 0.11], [0.06, 0.124], [0.05, 0.146], [0.026, 0.16], [0.012, 0.18], [0, 0.185]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  // a little wobble so the coils look hand-made
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 3 + y * 60) * 0.06;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.translate(0, -0.06, 0);
  g.computeVertexNormals();
  return g;
}

export class Poop {
  constructor(scene, max = 420) {
    const mat = new THREE.MeshStandardMaterial({ color: '#553118', roughness: 0.35, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(poopGeometry(), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.max = max;
    this.items = [];
    this.i = 0;
    this.floor = 0;
    for (let k = 0; k < max; k++) {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(k, _m);
      this.items.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), live: false, rest: false, size: 0.8 + Math.random() * 0.5, floor: 0 });
    }
    this.emitter = null; // { pos, dir, rate, jet }: a jet shoots them out hard along dir
    this.floorAt = null; // (x, z, y) => the floor height under a new poop
    this.acc = 0;
  }

  emit(pos, dir, jet = false) {
    const it = this.items[this.i];
    this.i = (this.i + 1) % this.max;
    it.live = true;
    it.rest = false;
    it.p.copy(pos);
    it.floor = this.floorAt ? this.floorAt(pos.x, pos.z, pos.y) : this.floor;
    if (jet) {
      it.v.copy(dir).multiplyScalar(4 + Math.random() * 3);
      it.v.x += (Math.random() - 0.5) * 1.2;
      it.v.z += (Math.random() - 0.5) * 1.2;
      it.v.y += (Math.random() - 0.5) * 2;
    } else {
      it.v.copy(dir).multiplyScalar(2.5 + Math.random() * 2.5);
      it.v.x += (Math.random() - 0.5) * 1.6;
      it.v.z += (Math.random() - 0.5) * 1.6;
      it.v.y = 1.5 + Math.random() * 2.5;
    }
    it.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    it.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
  }

  update(dt) {
    const em = this.emitter;
    let fresh = 0;
    if (em) {
      this.acc += dt * em.rate;
      while (this.acc > 1) {
        this.acc--;
        this.emit(em.pos, em.dir, em.jet);
        fresh++;
      }
    }
    for (let k = 0; k < this.max; k++) {
      const it = this.items[k];
      if (!it.live) continue;
      if (!it.rest) {
        it.v.y -= 9.8 * dt;
        it.p.addScaledVector(it.v, dt);
        it.r.addScaledVector(it.w, dt);
        if (it.p.y < it.floor + 0.06 * it.size) {
          it.p.y = it.floor + 0.06 * it.size;
          it.v.y *= -0.3;
          it.v.x *= 0.5;
          it.v.z *= 0.5;
          it.w.multiplyScalar(0.4);
          if (Math.abs(it.v.y) < 0.6) {
            it.rest = true;
            it.r.x = it.r.z = 0;
          }
        }
      }
      _e.set(it.r.x, it.r.y, it.r.z);
      _q.setFromEuler(_e);
      _s.setScalar(it.size);
      _m.compose(it.p, _q, _s);
      this.mesh.setMatrixAt(k, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return fresh;
  }
}

// Objective marker: a soft beam and a bobbing arrow.
export class Marker {
  constructor(scene) {
    this.group = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 20;
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), new THREE.MeshBasicMaterial({ color: '#ffd23f' }));
    this.arrow.rotation.x = Math.PI;
    this.group.add(beam, this.arrow);
    this.group.visible = false;
    scene.add(this.group);
    this.t = 0;
    this.target = null;
  }

  set(x, y, z, beam = true) {
    this.target = new THREE.Vector3(x, y, z);
    this.group.position.copy(this.target);
    this.group.children[0].visible = beam;
    this.group.visible = true;
  }

  hide() {
    this.target = null;
    this.group.visible = false;
  }

  update(dt) {
    this.t += dt;
    this.arrow.position.y = 3 + Math.sin(this.t * 3) * 0.3;
    this.arrow.rotation.y += dt * 2;
  }
}
