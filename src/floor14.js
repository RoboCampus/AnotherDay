import * as THREE from 'three';
import * as L from './layout.js';
import { signTex } from './textures.js';
import { bx, merged } from './geo.js';
import { createCharacter, animate, OLIVE, parts, mat } from './character.js';
import { kipaMesh } from './kipa.js';

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o });
const DESKS = [-201.4, -198.5, -195.6]; // x of the three desks, all facing the window
const DESK_Z = -173.2;

// a plain office door with a room number, for the corridor walls
function doorTex(num) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8a6440';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#6e4f31';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 100, 100);
  g.strokeRect(14, 130, 100, 110);
  g.fillStyle = '#d8c690';
  g.beginPath();
  g.arc(104, 140, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f2efe6';
  g.fillRect(30, 40, 68, 30);
  g.fillStyle = '#222';
  g.font = 'bold 22px sans-serif';
  g.textAlign = 'center';
  g.fillText(num, 64, 63);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function withKipa(ch) {
  const k = kipaMesh();
  k.scale.setScalar(0.115);
  k.position.set(0, 0.266, -0.035);
  k.rotation.x = -0.3;
  ch.head.add(k);
  return ch;
}

// A monkey, built on the same skeleton: small, furry, long arms, a muzzle, big ears and a tail.
function monkey() {
  const fur = '#5a3b22', face = '#d8b48a';
  const ch = createCharacter({ skin: face, shirt: fur, pants: fur, shoes: '#3a2614', hair: fur, sleeves: 'long', belt: fur });
  const { part, SPHERE, cap } = parts;
  const furM = mat(fur, 0.95), faceM = mat(face, 0.8);
  ch.head.add(part(SPHERE, furM, 0, 0.12, -0.01, 0.12, 0.13, 0.12));
  ch.head.add(part(SPHERE, faceM, 0, 0.07, 0.1, 0.075, 0.055, 0.05)); // muzzle
  ch.head.add(part(SPHERE, faceM, 0, 0.13, 0.085, 0.08, 0.05, 0.04)); // face
  for (const s of [-1, 1]) {
    ch.head.add(part(SPHERE, faceM, s * 0.125, 0.12, 0, 0.05, 0.055, 0.02)); // ears
    ch.head.add(part(SPHERE, mat('#111', 0.3), s * 0.035, 0.135, 0.12, 0.016, 0.018, 0.01));
  }
  for (const A of ch.arms) A.sh.scale.y = 1.25; // long arms
  const tail = new THREE.Group();
  tail.position.set(0, 0.02, -0.12);
  ch.hips.add(tail);
  let seg = tail;
  ch.tail = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.position.y = i ? -0.11 : 0;
    seg.add(g);
    g.add(part(cap(0.025, 0.08), furM, 0, -0.055, 0));
    ch.tail.push(g);
    seg = g;
  }
  ch.root.scale.setScalar(0.62);
  return ch;
}

// Level 14, built inside the glass ring: solid blocks of "other rooms" leave a small elevator
// lobby, a corridor east, a corridor turning right (south), and Argaman's small office on the
// south facade with its window. Box faces are ordered px, nx, py, ny, pz, nz.
export function buildFloor14(ctx, { box, sign, officeWindow }) {
  const { scene, world } = ctx;
  const OY = L.OFFICE_Y, OH = L.OFFICE_H, O = L.OFFICE;
  const wall = std({ color: '#d8d0c0', envMapIntensity: 0.35 });
  const blocks = [
    [-224, -218, -204.6, -191], [-218, -185.4, -204.6, -189.2], [-229.6, -224, -204.6, -196], [-229.6, -224, -180, -170.4],
    [-224, -218, -185, -170.4], [-218, -199.4, -186.8, -177], [-218, -203, -177, -170.4], [-197, -185.4, -189.2, -177], [-194, -185.4, -177, -170.4],
  ];
  for (const [x0, x1, z0, z1] of blocks) box(x0, x1, z0, z1, OY, OY + OH, wall, { collide: true });
  // skirting along the corridor floor
  const skirt = std({ color: '#5a5048' });
  for (const [x0, x1, z0, z1] of [[-218, -197, -189.25, -189.15], [-218, -199.4, -186.85, -186.75], [-199.45, -199.35, -186.8, -177], [-197.05, -196.95, -189.2, -177]]) box(x0, x1, z0, z1, OY, OY + 0.1, skirt, { cast: false });
  // doors to other rooms along the corridors
  const doorAt = (num, x, z, ry) => sign(doorTex(num), 1.0, 2.1, x, OY + 1.05, z, ry);
  doorAt('1402', -214, -189.18, 0);
  doorAt('1404', -207, -189.18, 0);
  doorAt('1406', -201, -189.18, 0);
  doorAt('1403', -211, -186.82, Math.PI);
  doorAt('1405', -204, -186.82, Math.PI);
  doorAt('1408', -196.98, -183, -Math.PI / 2);
  doorAt('1409', -199.42, -181, Math.PI / 2);
  sign(signTex([{ text: '→ 1414', size: 40 }, { text: 'ARGAMAN & CO.', size: 22 }], { bg: '#1d3b2a', w: 256, h: 110 }), 1.1, 0.48, -197.02, OY + 1.8, -188, -Math.PI / 2);
  sign(signTex([{ text: 'קומה 14', size: 48, rtl: true }, { text: 'LEVEL 14', size: 28 }], { bg: '#2b2f36', w: 256, h: 128 }), 1.6, 0.8, -217.98, OY + 1.9, -190.1, -Math.PI / 2);
  // fire extinguisher and a plant by the elevators
  box(-218.4, -218.1, -185.6, -185.3, OY, OY + 0.6, std({ color: '#c62828' }), { cast: false });
  box(-223.4, -222.6, -185.8, -185.0, OY, OY + 0.7, std({ color: '#5a4636' }));
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), std({ color: '#3e7a32' }));
  plant.position.set(-223, OY + 1.2, -185.4);
  scene.add(plant);

  // ---- the office: door frame with a sign, three desks with monitors, a whiteboard
  const frame = std({ color: '#6e4f31' });
  box(-199.5, -199.35, -177.15, -176.85, OY, OY + 2.4, frame, { cast: false });
  box(-197.05, -196.9, -177.15, -176.85, OY, OY + 2.4, frame, { cast: false });
  box(-199.5, -196.9, -177.15, -176.85, OY + 2.4, OY + 2.55, frame, { cast: false });
  sign(signTex([{ text: '1414', size: 40 }, { text: 'ARGAMAN', size: 30 }], { bg: '#2b2216', w: 256, h: 110, border: '#c9a227' }), 0.9, 0.38, -198.2, OY + 2.85, -177.18, Math.PI);
  const parts14 = [];
  for (const x of DESKS) {
    parts14.push(
      bx(1.6, 0.05, 0.8, x, OY + 0.75, DESK_Z, '#d8d2c4'),
      bx(0.05, 0.72, 0.75, x - 0.75, OY + 0.37, DESK_Z, '#9a9a9a'),
      bx(0.05, 0.72, 0.75, x + 0.75, OY + 0.37, DESK_Z, '#9a9a9a'),
      bx(0.62, 0.4, 0.04, x, OY + 1.05, DESK_Z + 0.25, '#1a1d22'),
      bx(0.56, 0.33, 0.01, x, OY + 1.06, DESK_Z + 0.225, '#4a90d9'),
      bx(0.12, 0.2, 0.08, x, OY + 0.85, DESK_Z + 0.28, '#1a1d22'),
      bx(0.45, 0.02, 0.15, x, OY + 0.785, DESK_Z - 0.15, '#2a2a30'),
    );
    world.add(x - 0.8, x + 0.8, DESK_Z - 0.4, DESK_Z + 0.4, OY, OY + 1.2, { occl: false, cam: false });
  }
  // chairs: two squeezed at the first desk, one each at the others
  for (const x of [DESKS[0] - 0.5, DESKS[0] + 0.55, DESKS[1], DESKS[2]]) {
    parts14.push(bx(0.5, 0.06, 0.5, x, OY + 0.46, DESK_Z - 0.8, '#2a2a30'), bx(0.5, 0.55, 0.06, x, OY + 0.75, DESK_Z - 1.06, '#2a2a30'), bx(0.06, 0.42, 0.06, x, OY + 0.21, DESK_Z - 0.8, '#555'));
  }
  parts14.push(bx(0.12, 0.12, 0.12, DESKS[2] + 0.55, OY + 0.84, DESK_Z - 0.1, '#f0f0f0')); // Argaman's mug
  scene.add(merged(parts14));
  sign(signTex([{ text: 'ARGAMAN', size: 44 }, { text: 'ארגמן', size: 30, rtl: true }], { bg: '#2b2216', w: 256, h: 110, border: '#c9a227' }), 0.5, 0.2, DESKS[2] - 0.45, OY + 0.86, DESK_Z - 0.405, Math.PI);
  sign(signTex([{ text: 'TODO:', size: 34, color: '#1a3a8a' }, { text: '1. get inside ✔', size: 26, color: '#1a3a8a' }, { text: '2. ???', size: 26, color: '#1a3a8a' }], { bg: '#f7f7f2', w: 256, h: 180, border: '#9aa0a6' }), 2, 1.4, O.x0 + 0.03, OY + 1.7, -174.2, Math.PI / 2);
  sign(signTex([{ text: '14', size: 120, color: '#c9a227' }], { bg: '#1b1e23', w: 256, h: 256 }), 1, 1, O.x1 - 0.03, OY + 1.9, -174.5, -Math.PI / 2);

  // ---- the five people in the office
  const crew = {};
  const place = (key, ch, x, y, z, heading, mode) => {
    ch.root.position.set(x, y, z);
    ch.root.rotation.y = heading;
    scene.add(ch.root);
    crew[key] = { ch, pos: ch.root.position, heading, mode, talk: false, look: 0, react: false, bubbleY: 2.4 };
  };
  const wide = createCharacter({ shirt: '#26272b', pants: '#3a3f4a', skin: '#c48a5e', hair: '#111', sleeves: 'short' });
  wide.root.scale.set(1.5, 1.05, 1.3);
  place('wide', wide, DESKS[0] - 0.5, OY, DESK_Z - 0.8, 0, 'sit');
  const beard = withKipa(createCharacter({ shirt: OLIVE, pants: OLIVE, skin: '#e8c09a', hair: '#3a2416', beard: true, sleeves: 'long', belt: '#3b3a2a' }));
  place('beard', beard, DESKS[0] + 0.55, OY, DESK_Z - 0.8, 0, 'sit');
  const kipa = withKipa(createCharacter({ shirt: '#4a78b0', pants: '#2f3542', skin: '#d6a47c', hair: '#1c140f', sleeves: 'long', shoes: '#2b2219' }));
  place('kipa', kipa, DESKS[1], OY, DESK_Z - 0.8, 0, 'sit');
  const mk = monkey();
  place('monkey', mk, DESKS[1] - 0.1, OY + 0.48, DESK_Z - 0.15, 0, 'sit');
  crew.monkey.bubbleY = 1.8;
  const tall = createCharacter({ shirt: '#c8b27a', pants: '#4a4a4a', skin: '#e8c09a', hair: '#6b4a2b', sleeves: 'long' });
  tall.root.scale.set(0.7, 1.4, 0.7);
  const mug = parts.part(parts.CYL, mat('#f0f0f0'), 0, -0.08, 0.05, 0.05, 0.1, 0.05);
  tall.arms[0].hand.add(mug);
  place('tall', tall, O.x0 + 0.8, OY, -176.1, 2.3, 'idle2');
  crew.tall.bubbleY = 3.1;

  // shards left in the frame after the window breaks
  const shardMat = std({ color: '#a9cbe0', transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const shards = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const g = new THREE.BufferGeometry();
    const x = O.x0 + Math.random() * (O.x1 - O.x0), top = i % 2 === 0, y = top ? OY + 3.2 : OY + 0.9;
    const w = 0.3 + Math.random() * 0.6, h = (0.2 + Math.random() * 0.5) * (top ? -1 : 1);
    g.setAttribute('position', new THREE.Float32BufferAttribute([x - w / 2, y, 0, x + w / 2, y, 0, x + (Math.random() - 0.5) * w, y + h, 0], 3));
    g.computeVertexNormals();
    shards.add(new THREE.Mesh(g, shardMat));
  }
  shards.position.z = L.BUILDING.z1 - 0.2;
  shards.visible = false;
  scene.add(shards);

  return {
    crew,
    breakWindow() {
      officeWindow.visible = false;
      shards.visible = true;
    },
    // everybody turns to look at a point (or back to work with null)
    lookAt(p) {
      for (const c of Object.values(crew)) c.react = p;
    },
    update(dt) {
      const p = ctx.player?.pos;
      if (!p || p.y < 30) return;
      for (const [key, c] of Object.entries(crew)) {
        const ch = c.ch;
        let look = 0;
        if (c.react) look = Math.atan2(c.react.x - c.pos.x, c.react.z - c.pos.z) - c.heading;
        look = Math.atan2(Math.sin(look), Math.cos(look));
        animate(ch, { mode: c.mode, talk: c.talk, look: Math.max(-1.2, Math.min(1.2, look)) }, dt);
        ch.head.rotation.y = Math.max(-1.2, Math.min(1.2, look));
        const t = ch.t;
        if (c.mode === 'sit' && !c.react) {
          // typing; the monkey types twice as fast
          const sp = key === 'monkey' ? 26 : 14;
          for (const A of ch.arms) {
            A.sh.rotation.set(-0.9, 0, A.s * 0.15);
            A.el.rotation.x = -0.7 + Math.sin(t * sp + A.s) * (key === 'monkey' ? 0.3 : 0.08);
          }
          if (key === 'beard') ch.spine.rotation.x = 0.1 + Math.sin(t * 3.2) * 0.12; // sways while reading
          if (key === 'monkey') ch.head.rotation.x = Math.sin(t * 9) * 0.15;
        }
        if (key === 'monkey') {
          if (c.react) for (const A of ch.arms) A.sh.rotation.set(0, 0, A.s * (2.6 + Math.sin(t * 20) * 0.4));
          ch.tail.forEach((g, i) => (g.rotation.x = 0.35 + Math.sin(t * 2.5 - i * 0.6) * 0.25));
        }
        if (key === 'tall' && !c.react) {
          // sip the coffee now and then
          const sip = Math.max(0, Math.sin(t * 0.6)) ** 6;
          ch.arms[0].sh.rotation.set(-0.4 - sip * 1.2, 0, -0.1);
          ch.arms[0].el.rotation.set(-1.4 - sip * 0.6, 0, 0);
        }
      }
    },
  };
}
