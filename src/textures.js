import * as THREE from 'three';

// Procedural canvas textures. Facade textures carry userData.tile = [metres wide, metres tall]
// for one repeat, so boxes built with uvBox() get windows of the right size.

let seed = 7;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export const pick = (a) => a[(rnd() * a.length) | 0];

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTex(c, tile = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.tile = tile;
  t.repeat.set(1 / tile[0], 1 / tile[1]); // geometry UVs are in metres
  return t;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
};

function speckle(g, w, h, n, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = pick(colors);
    g.globalAlpha = 0.05 + rnd() * 0.12;
    g.fillRect(rnd() * w, rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
  }
  g.globalAlpha = 1;
}

// Ground surfaces: asphalt, paving, grass, ballast. `tile` is metres per repeat.
export function groundTex(kind) {
  const c = canvas(256, 256), g = c.getContext('2d');
  const base = { asphalt: '#45464a', pave: '#c9c1b2', side: '#b9b2a6', grass: '#6c8a3a', ballast: '#6e665c', stone: '#d8d0c2', carpet: '#5d6470', concrete: '#9d988f' }[kind];
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  if (kind === 'asphalt') speckle(g, 256, 256, 2600, ['#000', '#777', '#222', '#5a5a5a']);
  if (kind === 'grass') speckle(g, 256, 256, 3000, ['#4d6b26', '#86a24c', '#5e7d30', '#9bb35a'], 3);
  if (kind === 'ballast') speckle(g, 256, 256, 4000, ['#3a3530', '#958c7f', '#57504a'], 4);
  if (kind === 'carpet') speckle(g, 256, 256, 3000, ['#4a515c', '#6c7480'], 2);
  if (kind === 'concrete') speckle(g, 256, 256, 1500, ['#7a756d', '#b5b0a6'], 3);
  if (kind === 'pave' || kind === 'side' || kind === 'stone') {
    speckle(g, 256, 256, 800, ['#8a8478', '#e6dfd2']);
    g.strokeStyle = shade(base, kind === 'stone' ? 0.86 : 0.8);
    g.lineWidth = 2;
    const n = kind === 'side' ? 8 : 4;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(0, (i * 256) / n);
      g.lineTo(256, (i * 256) / n);
      g.stroke();
      for (let j = 0; j < n; j++) {
        const x = ((j + (i % 2) * 0.5) * 256) / n;
        g.beginPath();
        g.moveTo(x, (i * 256) / n);
        g.lineTo(x, ((i + 1) * 256) / n);
        g.stroke();
      }
    }
  }
  const tile = { asphalt: 12, pave: 6, side: 4, grass: 10, ballast: 4, stone: 4, carpet: 4, concrete: 6 }[kind];
  return toTex(c, [tile, tile]);
}

// Building facades. style: glass | band | grid | white | stone | mall | lobby
export function facade(style, o = {}) {
  const S = 256, c = canvas(S, S), g = c.getContext('2d');
  const cols = o.cols || 4, rows = o.rows || 4, cw = S / cols, rh = S / rows;
  const wall = o.wall || '#cfc7b8', win = o.win || '#3d5468';
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  if (style === 'glass') {
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const v = 0.85 + rnd() * 0.3;
        const grad = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        grad.addColorStop(0, shade(win, v * 1.25));
        grad.addColorStop(1, shade(win, v * 0.8));
        g.fillStyle = grad;
        g.fillRect(k * cw, r * rh, cw, rh);
        if (rnd() < 0.18) {
          g.fillStyle = 'rgba(255,240,200,0.25)';
          g.fillRect(k * cw + 3, r * rh + 4, cw - 6, rh - 8);
        }
      }
    }
    g.strokeStyle = o.frame || '#c9d3dc';
    g.lineWidth = 2;
    for (let k = 0; k <= cols; k++) g.strokeRect(k * cw, -2, 0.5, S + 4);
    g.lineWidth = 4;
    for (let r = 0; r <= rows; r++) {
      g.beginPath();
      g.moveTo(0, r * rh);
      g.lineTo(S, r * rh);
      g.stroke();
    }
    // a soft sky reflection streak
    const sky = g.createLinearGradient(0, 0, S, S);
    sky.addColorStop(0, 'rgba(255,255,255,0.18)');
    sky.addColorStop(0.5, 'rgba(255,255,255,0)');
    sky.addColorStop(1, 'rgba(255,255,255,0.1)');
    g.fillStyle = sky;
    g.fillRect(0, 0, S, S);
  } else if (style === 'band') {
    speckle(g, S, S, 900, ['#000', '#fff']);
    for (let r = 0; r < rows; r++) {
      g.fillStyle = win;
      g.fillRect(0, r * rh + rh * 0.3, S, rh * 0.45);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, r * rh + rh * 0.3, S, rh * 0.08);
      g.fillStyle = shade(wall, 0.8);
      for (let k = 0; k <= cols * 2; k++) g.fillRect((k * S) / (cols * 2) - 1, r * rh + rh * 0.3, 3, rh * 0.45);
    }
  } else if (style === 'grid' || style === 'white' || style === 'stone') {
    speckle(g, S, S, 1200, style === 'stone' ? ['#a08a68', '#e8d8b8'] : ['#000', '#fff']);
    if (style === 'stone') {
      g.strokeStyle = 'rgba(120,100,70,0.35)';
      g.lineWidth = 1;
      for (let y = 0; y < S; y += 10) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(S, y);
        g.stroke();
        for (let x = (y / 10) % 2 ? 0 : 12; x < S; x += 24) {
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + 10);
          g.stroke();
        }
      }
    }
    for (let r = 0; r < rows; r++) {
      if (style === 'white') {
        // Tel Aviv balconies: a deep shadow band and a parapet
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(0, r * rh + rh * 0.12, S, rh * 0.62);
        g.fillStyle = shade(wall, 1.04);
        g.fillRect(0, r * rh + rh * 0.55, S, rh * 0.2);
      }
      for (let k = 0; k < cols; k++) {
        const x = k * cw + cw * 0.22, y = r * rh + rh * (style === 'stone' ? 0.2 : 0.18), w = cw * 0.56, h = rh * (style === 'stone' ? 0.6 : 0.42);
        if (style === 'stone') {
          g.fillStyle = '#2d4a3a'; // green shutters
          g.fillRect(x - 5, y, 5, h);
          g.fillRect(x + w, y, 5, h);
          g.fillStyle = '#2a2e33';
          g.beginPath();
          g.moveTo(x, y + h);
          g.lineTo(x, y + w / 2);
          g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
          g.lineTo(x + w, y + h);
          g.fill();
        } else {
          g.fillStyle = rnd() < 0.15 ? '#c9b98a' : win;
          g.fillRect(x, y, w, h);
          g.fillStyle = 'rgba(255,255,255,0.15)';
          g.fillRect(x, y, w, 3);
          if (style === 'white' && rnd() < 0.5) {
            g.fillStyle = '#ddd8cc'; // rolled-down shutter
            g.fillRect(x, y, w, h * (0.3 + rnd() * 0.6));
          }
        }
      }
    }
  } else if (style === 'mall') {
    speckle(g, S, S, 900, ['#000', '#fff']);
    g.fillStyle = win;
    g.fillRect(0, S * 0.08, S, S * 0.34);
    g.fillStyle = shade(wall, 0.85);
    for (let k = 0; k <= 8; k++) g.fillRect((k * S) / 8 - 2, S * 0.08, 4, S * 0.34);
    g.fillStyle = shade(wall, 0.9);
    g.fillRect(0, S * 0.62, S, 6);
  } else if (style === 'lobby') {
    g.fillStyle = win;
    g.fillRect(0, 0, S, S * 0.85);
    g.fillStyle = o.frame || '#3a3f45';
    for (let k = 0; k <= 4; k++) g.fillRect((k * S) / 4 - 3, 0, 6, S);
    g.fillRect(0, S * 0.85, S, S * 0.15);
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 0, S, S * 0.2);
  }
  const tile = o.tile || [cols * 3, rows * 3.5];
  return toTex(c, tile);
}

// Text sign. lines: [{ text, size, color, font }]; rtl lines are Hebrew.
export function signTex(lines, { w = 512, h = 128, bg = '#1d3b6e', border = null } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((s, l) => s + l.size * 1.15, 0);
  let y = h / 2 - total / 2;
  for (const l of lines) {
    g.font = `${l.weight || 800} ${l.size}px ${l.font || 'Segoe UI, Arial, sans-serif'}`;
    g.fillStyle = l.color || '#fff';
    g.direction = l.rtl ? 'rtl' : 'ltr';
    y += l.size * 0.575;
    g.fillText(l.text, w / 2, y);
    y += l.size * 0.575;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function flagTex() {
  const c = canvas(220, 160), g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 220, 160);
  g.fillStyle = '#0038b8';
  g.fillRect(0, 15, 220, 25);
  g.fillRect(0, 120, 220, 25);
  g.strokeStyle = '#0038b8';
  g.lineWidth = 6;
  for (const flip of [1, -1]) {
    g.beginPath();
    g.moveTo(110, 80 - 30 * flip);
    g.lineTo(110 + 26, 80 + 15 * flip);
    g.lineTo(110 - 26, 80 + 15 * flip);
    g.closePath();
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function fenceTex() {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.strokeStyle = 'rgba(200,205,210,0.9)';
  g.lineWidth = 2;
  for (let i = -128; i < 256; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 128, 128);
    g.moveTo(i + 128, 0);
    g.lineTo(i, 128);
    g.stroke();
  }
  const t = toTex(c, [2, 2]);
  return t;
}

// A text label sprite (names over characters, floor numbers...).
export function labelSprite(text, { color = '#fff', bg = 'rgba(0,0,0,0.55)', size = 0.32, font = 28 } = {}) {
  const c = canvas(512, 64), g = c.getContext('2d');
  g.font = `800 ${font}px Segoe UI, Arial, sans-serif`;
  const w = Math.min(500, g.measureText(text).width + 24);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect((512 - w) / 2, 8, w, 48, 14);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: true, transparent: true }));
  s.scale.set(size * 8, size, 1);
  return s;
}
