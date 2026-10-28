import * as THREE from 'three';
import { Input } from './input.js';
import { World } from './world.js';
import { buildCity } from './city.js';
import { Traffic, Train } from './traffic.js';
import { Player } from './player.js';
import { Guards } from './meteorologists.js';
import { Line, KiryaPeople } from './npcs.js';
import { Phone } from './phone.js';
import { Story } from './story.js';
import { HUD } from './hud.js';
import { Particles, Lightning, Poop, Marker } from './fx.js';
import { Kipa } from './kipa.js';
import { Andrey } from './andrey.js';
import { Amir } from './amir.js';
import { Shonchik } from './shonchik.js';
import { Shaikale } from './shaikale.js';
import { HallCrowd } from './hall.js';
import { Elevator } from './elevator.js';
import { Missiles } from './missiles.js';
import { audio } from './audio.js';

// ---------------------------------------------------------------- renderer & scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color('#cfdbe4'), FOG_STORM = new THREE.Color('#3a3f4a');
scene.fog = new THREE.Fog(FOG.clone(), 320, 1700);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 5000);
const sunDir = new THREE.Vector3(0.55, 0.62, 0.35).normalize(); // a morning sun from the east, over Azrieli

const SKY = { top: new THREE.Color('#2a6bd1'), mid: new THREE.Color('#79aee6'), horizon: new THREE.Color('#e4eef3') };
const STORM = { top: new THREE.Color('#1a1d24'), mid: new THREE.Color('#2e333d'), horizon: new THREE.Color('#4a505b') };
function makeSky(radius) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: SKY.top.clone() },
        mid: { value: SKY.mid.clone() },
        horizon: { value: SKY.horizon.clone() },
        sunDir: { value: sunDir },
        sunK: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top, mid, horizon, sunDir;
        uniform float sunK;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0
            ? mix(mix(horizon, mid, smoothstep(0.0, 0.2, h)), top, smoothstep(0.15, 0.75, h))
            : mix(horizon, horizon * 0.8, smoothstep(0.0, -0.2, h));
          float s = max(dot(d, sunDir), 0.0);
          col += sunK * (vec3(1.0, 0.95, 0.85) * pow(s, 600.0) * 6.0 + vec3(1.0, 0.85, 0.6) * pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
}
const sky = makeSky(3500);
scene.add(sky);
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky(400));
  scene.environment = pmrem.fromScene(envScene, 0.02, 1, 1000).texture;
}
const hemi = new THREE.HemisphereLight('#cfe2ff', '#8a7d6a', 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff1dc', 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 1, far: 700 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- game objects
const input = new Input(renderer.domElement);
const world = new World();
const ctx = { scene, camera, input, world, renderer, shake: 0, storm: 0 };
ctx.hud = new HUD(ctx);
ctx.city = buildCity(ctx);
ctx.traffic = new Traffic(ctx);
ctx.train = new Train(ctx);
ctx.player = new Player(ctx);
ctx.guards = new Guards(ctx);
ctx.line = new Line(ctx);
ctx.people = new KiryaPeople(ctx);
ctx.phone = new Phone(ctx);
const particles = new Particles(scene);
const lightning = new Lightning(scene);
ctx.fx = { emit: (p, n, o) => particles.emit(p, n, o), lightning };
ctx.poop = new Poop(scene);
ctx.poop.floorAt = (x, z, y) => ctx.world.groundY(x, z, y);
ctx.marker = new Marker(scene);
ctx.kipa = new Kipa(ctx);
ctx.andrey = new Andrey(ctx);
ctx.amir = new Amir(ctx);
ctx.shonchik = new Shonchik(ctx);
ctx.shaikale = new Shaikale(ctx);
ctx.hall = new HallCrowd(ctx);
ctx.elevator = new Elevator(ctx);
ctx.missiles = new Missiles(ctx);
ctx.story = new Story(ctx);
ctx.hud.buildMap(ctx.city.map);
const { player, story, hud } = ctx;

// Storm (0 = sunny Tel Aviv morning, 1 = the sky the lightning comes out of)
const _c = new THREE.Color();
ctx.setStorm = (k) => {
  ctx.storm = k;
  const u = sky.material.uniforms;
  for (const key of ['top', 'mid', 'horizon']) u[key].value.copy(SKY[key]).lerp(STORM[key], k);
  u.sunK.value = 1 - k;
  sun.intensity = 2.7 * (1 - k) + 0.25 * k;
  hemi.intensity = 1.1 * (1 - k) + 0.45 * k;
  scene.fog.color.copy(_c.copy(FOG).lerp(FOG_STORM, k));
  hud.storm(k * 0.3);
};

// Menu: idle shot of the Kirya from the bridge
player.place(145, 42, Math.PI);
player.camOverride = { pos: new THREE.Vector3(128, 14, 30), look: new THREE.Vector3(-55, 40, -197), speed: 1 };
player.snapCamera();

const params = new URLSearchParams(location.search);
if (params.has('debug')) window.game = ctx; // console access for testing

let started = false, paused = false, finished = false, captureAttempt = 0;
const pauseEl = document.getElementById('pause');
const endEl = document.getElementById('end');

function setPaused(on) {
  paused = on;
  input.active = started && !paused && !finished;
  input.reset();
  pauseEl.classList.toggle('hidden', !on);
}

function resume() {
  if (!started || finished) return;
  const attempt = ++captureAttempt;
  // Keep the pause overlay visible until pointer lock is granted. A rejected
  // request (for example, just after Esc) must leave a usable retry control.
  input.setFallback(false);
  setPaused(true);
  input.capture().then((locked) => {
    if (finished || attempt !== captureAttempt) return;
    setPaused(!locked);
    if (!locked) hud.toast('Mouse capture failed. Click to try again.', 3);
  });
}

function pauseOnBlur() {
  if (!started || finished) return;
  captureAttempt++;
  setPaused(true);
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
}

document.getElementById('voices').addEventListener('change', (e) => {
  audio.voices = e.target.checked;
});
document.getElementById('play').addEventListener('click', () => {
  audio.init();
  audio.voices = document.getElementById('voices').checked;
  document.getElementById('menu').classList.add('hidden');
  hud.show(true);
  started = true;
  resume();
  player.camOverride = null;
  story.start();
  if (params.get('skip')) story.skipTo(params.get('skip'));
});
document.getElementById('again').addEventListener('click', () => location.reload());
document.getElementById('resumeCapture')?.addEventListener('click', resume);
document.getElementById('resumeFree')?.addEventListener('click', () => {
  if (!started || finished) return;
  captureAttempt++;
  input.setFallback(true);
  setPaused(false);
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  hud.toast('Right-drag to look · Esc to pause', 3);
});
pauseEl.addEventListener('click', (e) => {
  if (!e.target.closest('button')) resume();
});
document.addEventListener('mousedown', (e) => {
  if (started && !finished && !input.locked && !input.fallback && !pauseEl.contains(e.target) && !endEl.contains(e.target)) resume();
});
document.addEventListener('pointerlockchange', () => {
  if (!started || finished) return;
  if (input.locked) setPaused(false);
  else if (!input.fallback) setPaused(true);
});
addEventListener('blur', pauseOnBlur);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseOnBlur();
});
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && started && !finished && input.fallback && !paused) {
    e.preventDefault();
    setPaused(true);
  }
  if (e.code === 'KeyM' && started && !finished && !e.repeat) {
    audio.muted = !audio.muted;
    if (audio.muted) window.speechSynthesis?.cancel();
    hud.toast(audio.muted ? 'Sound off' : 'Sound on', 1);
  }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let elapsed = 0;
const _rain = new THREE.Vector3();

function tick(dt) {
  elapsed += dt;
  story.update(dt);
  player.update(dt);
  ctx.guards.update(dt);
  ctx.kipa.update(dt);
  ctx.andrey.update(dt);
  ctx.amir.update(dt);
  ctx.shonchik.update(dt);
  ctx.shaikale.update(dt);
  ctx.hall.update(dt);
  ctx.elevator.update(dt);
  ctx.missiles.update(dt);
  ctx.line.update(dt);
  ctx.people.update(dt);
  ctx.traffic.update(dt);
  ctx.train.update(dt);
  ctx.phone.update(dt);
  ctx.city.update(dt, elapsed);
  particles.update(dt);
  lightning.update(dt);
  ctx.marker.update(dt);
  if (ctx.storm > 0.3) {
    for (let i = 0; i < 6; i++) {
      _rain.set(camera.position.x + (Math.random() - 0.5) * 40, camera.position.y + 12, camera.position.z + (Math.random() - 0.5) * 40);
      particles.emit(_rain, 1, { color: '#8fa3b8', speed: 0.1, up: -25, gravity: 10, life: 1.2, spread: 0 });
    }
  }
  player.updateCamera(dt);
  if (ctx.shake > 0) {
    ctx.shake = Math.max(0, ctx.shake - dt * 1.5);
    camera.position.x += (Math.random() - 0.5) * ctx.shake * 0.5;
    camera.position.y += (Math.random() - 0.5) * ctx.shake * 0.5;
  }
  sun.position.copy(player.pos).addScaledVector(sunDir, 300);
  sun.target.position.copy(player.pos);
  hud.update(dt);
}

function render() {
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!started) {
    elapsed += dt;
    player.camOverride.pos.set(128 + Math.sin(elapsed * 0.15) * 10, 14, 30 + Math.cos(elapsed * 0.15) * 6);
    ctx.traffic.update(dt);
    ctx.guards.update(dt);
    ctx.line.update(dt);
    ctx.city.update(dt, elapsed);
    player.updateCamera(dt);
    sun.position.copy(camera.position).addScaledVector(sunDir, 300);
    sun.target.position.copy(camera.position);
  } else if (!paused && !ctx.hold) tick(dt); // game.hold = true freezes time for debugging (game.step still works)
  if (!finished && !endEl.classList.contains('hidden')) {
    finished = true;
    setPaused(false);
    // Release the cursor when the replay button appears, after the final scene.
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  }
  render();
  input.endFrame();
}
frame();

// Debug: advance n fixed frames without rendering (works in throttled tabs), draw one frame now.
ctx.step = (n = 1, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) {
    tick(dt);
    input.endFrame();
  }
};
ctx.render = render;
ctx.start = () => document.getElementById('play').click();
