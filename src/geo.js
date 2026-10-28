import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry helpers. Box / plane UVs are in metres (textures set repeat = 1 / tile size).

export function uvBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px nx py ny pz nz
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

export function uvCylinder(rt, rb, h, seg) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  const uv = g.attributes.uv, circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ, uv.getY(i) * h);
  return g;
}

export function uvPlane(w, d) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  g.rotateX(-Math.PI / 2);
  return g;
}

// ---- vertex-coloured parts merged into one mesh (cars, the train, furniture) ----
export function paint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export function bx(w, h, d, x, y, z, color, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, color);
}

export function cy(r, h, x, y, z, color, { seg = 12, axis = 'y', r2 = r } = {}) {
  const g = new THREE.CylinderGeometry(r, r2, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, color);
}

export function sp(r, x, y, z, color, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 10, 8);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, color);
}

export const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });

export function merged(list, material = VC) {
  const m = new THREE.Mesh(mergeGeometries(list), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
