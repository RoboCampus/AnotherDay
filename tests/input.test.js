import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../src/input.js';

function fixture(request) {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.pointerLockElement = null;
  const previousDocument = globalThis.document;
  const previousAddEventListener = globalThis.addEventListener;
  globalThis.document = doc;
  globalThis.addEventListener = win.addEventListener.bind(win);
  const el = { requestPointerLock: request && (() => request(doc, el)) };
  const input = new Input(el);
  input.active = true;
  return {
    input, doc, el,
    send(target, type, props = {}) {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, props);
      (target === 'window' ? win : doc).dispatchEvent(event);
      return event;
    },
    restore() {
      globalThis.document = previousDocument;
      globalThis.addEventListener = previousAddEventListener;
    },
  };
}

test('blur and lock changes clear held keys, edge presses, and mouse deltas', () => {
  const f = fixture();
  try {
    f.send('window', 'keydown', { code: 'KeyW' });
    f.doc.pointerLockElement = f.el;
    f.send('document', 'pointerlockchange');
    assert.equal(f.input.key('KeyW'), false);
    f.send('window', 'keydown', { code: 'KeyW' });
    f.send('document', 'mousemove', { movementX: 12, movementY: -7 });
    f.send('document', 'mousedown', { button: 0 });
    assert.equal(f.input.hit('Mouse0'), true);
    f.send('window', 'blur');
    assert.equal(f.input.keys.size, 0);
    assert.equal(f.input.pressed.size, 0);
    assert.equal(f.input.dx, 0);
    assert.equal(f.input.dy, 0);
  } finally { f.restore(); }
});

test('inactive input cannot queue movement or actions while paused', () => {
  const f = fixture();
  try {
    f.input.active = false;
    f.input.locked = true;
    f.send('window', 'keydown', { code: 'Space' });
    f.send('document', 'mousedown', { button: 0 });
    f.send('document', 'mousemove', { movementX: 10, movementY: 10 });
    assert.equal(f.input.keys.size, 0);
    assert.equal(f.input.pressed.size, 0);
    assert.equal(f.input.dx, 0);
  } finally { f.restore(); }
});

test('fallback look requires right-drag while left click remains a throw', () => {
  const f = fixture();
  try {
    f.input.setFallback(true);
    f.send('document', 'mousemove', { clientX: 110, clientY: 90 });
    assert.equal(f.input.dx, 0);
    f.send('document', 'mousedown', { button: 0 });
    assert.equal(f.input.hit('Mouse0'), true);
    f.input.endFrame();
    const dragStart = f.send('document', 'mousedown', { button: 2, clientX: 100, clientY: 80 });
    assert.equal(dragStart.defaultPrevented, true);
    assert.equal(f.input.hit('Mouse0'), false);
    f.send('document', 'mousemove', { clientX: 115, clientY: 75 });
    assert.equal(f.input.dx, 15);
    assert.equal(f.input.dy, -5);
    f.input.endFrame();
    f.send('document', 'mouseup', { button: 2 });
    f.send('document', 'mousemove', { clientX: 160, clientY: 50 });
    assert.equal(f.input.dx, 0);
    assert.equal(f.input.dy, 0);
    assert.equal(f.send('document', 'contextmenu').defaultPrevented, true);
    f.input.active = false;
    assert.equal(f.send('document', 'contextmenu').defaultPrevented, false);
  } finally { f.restore(); }
});

test('fallback dragging stops on blur and successful capture restores normal look', async () => {
  const f = fixture((doc, el) => {
    doc.pointerLockElement = el;
    doc.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  });
  try {
    f.input.setFallback(true);
    f.send('document', 'mousedown', { button: 2, clientX: 10, clientY: 10 });
    f.send('window', 'blur');
    assert.equal(f.input.dragging, false);
    assert.equal(f.input.mouseX, null);
    assert.equal(await f.input.capture(), true);
    assert.equal(f.input.fallback, false);
    assert.equal(f.input.locked, true);
  } finally { f.restore(); }
});

test('capture waits for actual lock with legacy event-only APIs', async () => {
  let requests = 0;
  const f = fixture(() => { requests++; });
  try {
    let resolved = false;
    const pending = f.input.capture();
    pending.then(() => { resolved = true; });
    assert.equal(f.input.capture(), pending);
    await Promise.resolve();
    assert.equal(resolved, false);
    assert.equal(requests, 1);
    f.doc.pointerLockElement = f.el;
    f.send('document', 'pointerlockchange');
    assert.equal(await pending, true);
    assert.equal(f.input.locked, true);
  } finally { f.restore(); }
});

test('capture reports rejection and allows a later user-gesture retry', async () => {
  let requests = 0;
  const f = fixture((doc, el) => {
    if (++requests === 1) return Promise.reject(new Error('User gesture required'));
    doc.pointerLockElement = el;
    doc.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  });
  try {
    assert.equal(await f.input.capture(), false);
    assert.equal(f.input.capturing, null);
    assert.equal(await f.input.capture(), true);
  } finally { f.restore(); }
});

test('capture safely handles unsupported, throwing, and event-error APIs', async () => {
  for (const request of [
    undefined,
    () => { throw new Error('Denied'); },
    (doc) => { doc.dispatchEvent(new Event('pointerlockerror')); },
  ]) {
    const f = fixture(request);
    try {
      assert.equal(await f.input.capture(), false);
      assert.equal(f.input.locked, false);
    } finally { f.restore(); }
  }
});
