export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.active = false; // set once the game has started
    this.capturing = null;
    this.fallback = false;
    this.dragging = false;
    this.mouseX = this.mouseY = null;

    addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.active && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow'))) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.reset());
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      if (this.locked) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      } else if (this.fallback && this.dragging) {
        this.dx += e.clientX - this.mouseX;
        this.dy += e.clientY - this.mouseY;
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
      }
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if ((this.locked || this.fallback) && e.button === 0) this.pressed.add('Mouse0');
      if (this.fallback && !this.locked && e.button === 2) {
        this.dragging = true;
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        e.preventDefault();
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.dragging = false;
    });
    document.addEventListener('contextmenu', (e) => {
      if (this.active && this.fallback) e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (this.locked) this.fallback = false;
      this.reset();
    });
  }

  capture() {
    if (document.pointerLockElement === this.el) return Promise.resolve(true);
    if (this.capturing) return this.capturing;
    this.reset();
    if (typeof this.el.requestPointerLock !== 'function') return Promise.resolve(false);

    // Some browsers return a promise; others only dispatch pointer-lock events.
    // Resume the game only after the browser actually grants the lock.
    const pending = new Promise((resolve) => {
      const finish = (locked) => {
        clearTimeout(timeout);
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve(locked);
      };
      const onChange = () => finish(document.pointerLockElement === this.el);
      const onError = () => finish(false);
      const timeout = setTimeout(onError, 2000);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      try {
        const request = this.el.requestPointerLock();
        if (request?.then) request.then(() => {
          if (document.pointerLockElement === this.el) finish(true);
        }, onError);
      } catch {
        onError();
      }
    });
    this.capturing = pending.finally(() => { this.capturing = null; });
    return this.capturing;
  }

  setFallback(on) {
    this.fallback = on;
    this.reset();
  }

  reset() {
    this.keys.clear();
    this.dragging = false;
    this.mouseX = this.mouseY = null;
    this.endFrame();
  }

  key(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.dx = this.dy = 0;
  }
}
