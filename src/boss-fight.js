// Deterministic combat rules, independent of rendering and browser APIs.
export const BOSS_ARENA = Object.freeze({ x0: -222, x1: -200, z0: -199.5, z1: -182.5 });
export const BOSS_POSITION = Object.freeze({ x: -216, y: 0, z: -196 });
export const BOSS_ATTACK = Object.freeze({ lock: 0.8, windup: 1.5, fire: 1, recover: 5, radius: 1.6, arc: 2.4 });

const copy = (p) => ({ x: p.x, y: p.y ?? 0, z: p.z });

export function impactHitsPlayer(target, player, radius = BOSS_ATTACK.radius) {
  if (Math.hypot(player.x - target.x, player.z - target.z) > radius) return false;
  const feet = player.y ?? 0;
  return feet <= target.y + 1.4 && feet + 1.8 >= target.y;
}

export class BossFight {
  constructor() {
    this.round = 1;
    this.totalHits = 0;
    this.maxHealth = 4;
    this.maxPlayerHealth = 3;
    this.active = false;
    this.won = this.lost = false;
    this.stage = 'idle';
    this.time = 0;
    this.health = this.maxHealth;
    this.playerHealth = this.maxPlayerHealth;
    this.target = { x: BOSS_POSITION.x, y: 0, z: BOSS_POSITION.z + 8 };
    this.origin = { x: BOSS_POSITION.x, y: 1.85, z: BOSS_POSITION.z };
    this.shots = this.hits = this.impacts = this.damageTaken = 0;
    this.locked = this.ultimateReady = false;
    this.projectile = { active: false, landed: false, progress: 0, kind: 'meteorologist', position: copy(this.origin) };
  }

  start(player, origin = { x: BOSS_POSITION.x, y: 1.85, z: BOSS_POSITION.z }, round = 1) {
    this.round = round === 2 ? 2 : 1;
    this.totalHits = this.round === 2 ? 3 : 0;
    this.active = true;
    this.won = this.lost = this.ultimateReady = false;
    this.health = this.maxHealth;
    this.playerHealth = this.maxPlayerHealth;
    this.stage = 'windup';
    this.time = 0;
    this.shots = this.hits = this.impacts = this.damageTaken = 0;
    this.locked = this.recoveryHit = false;
    this.origin = copy(origin);
    this.track(player);
    this.projectile = { active: false, landed: false, progress: 0, kind: 'meteorologist', position: copy(this.origin) };
  }

  stop() {
    this.active = false;
    this.projectile.active = false;
  }

  track(player) {
    this.target.x = player.x;
    this.target.y = this.origin.y - 1.85;
    this.target.z = player.z;
  }

  moveProjectile(progress) {
    const p = this.projectile, k = Math.max(0, Math.min(1, progress));
    p.progress = k;
    p.position.x = this.origin.x + (this.target.x - this.origin.x) * k;
    p.position.y = this.origin.y + (this.target.y - this.origin.y) * k + Math.sin(k * Math.PI) * BOSS_ATTACK.arc;
    p.position.z = this.origin.z + (this.target.z - this.origin.z) * k;
  }

  hit() {
    if (!this.active || this.stage !== 'recover' || this.recoveryHit) return false;
    this.recoveryHit = true;
    this.health--;
    this.hits++;
    this.totalHits++;
    if (this.hits === 3) {
      // Three kipot charge this round's special; it removes the final health point.
      this.ultimateReady = true;
      this.stage = 'staggered';
      this.time = 0;
      this.projectile.active = false;
    }
    return true;
  }

  beginUltimate() {
    if (!this.active || !this.ultimateReady || this.stage !== 'staggered') return false;
    this.stage = 'ultimate';
    this.time = 0;
    this.projectile.active = false;
    return true;
  }

  finishUltimate() {
    if (!this.active || this.stage !== 'ultimate') return false;
    this.health = 0;
    this.ultimateReady = false;
    this.projectile.active = false;
    this.time = 0;
    if (this.round === 1) {
      // The satellite sends Amir to the woman officer's desk to recover.
      this.stage = 'retreat';
      return true;
    }
    this.won = true;
    this.active = false;
    this.stage = 'won';
    return true;
  }

  heal(progress) {
    if (this.active && this.round === 1 && this.stage === 'retreat') {
      const k = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      this.health = Math.round(this.maxHealth * k);
    }
    return this.health;
  }

  startRoundTwo(player, origin = this.origin) {
    if (!this.active || this.round !== 1 || this.stage !== 'retreat') return false;
    const playerHealth = this.playerHealth, damage = this.damageTaken, totalHits = this.totalHits;
    this.start(player, origin, 2);
    this.playerHealth = playerHealth;
    this.damageTaken = damage;
    this.totalHits = totalHits;
    return true;
  }

  update(dt, player) {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    if (this.stage === 'staggered' || this.stage === 'ultimate' || this.stage === 'retreat') {
      this.time += dt;
      return;
    }
    let remaining = dt;
    while (remaining > 1e-9 && this.active) {
      const duration = BOSS_ATTACK[this.stage];
      const step = Math.min(remaining, duration - this.time);
      if (this.stage === 'windup' && !this.locked) {
        this.track(player);
        if (this.time + step >= BOSS_ATTACK.lock - 1e-9) this.locked = true;
      }
      this.time += step;
      remaining -= step;
      if (this.stage === 'fire') this.moveProjectile(this.time / BOSS_ATTACK.fire);
      if (this.time < duration - 1e-9) continue;
      this.time = 0;
      if (this.stage === 'windup') {
        this.stage = 'fire';
        this.shots++;
        this.projectile.active = true;
        this.projectile.landed = false;
        this.projectile.kind = this.shots % 2 ? 'meteorologist' : 'officer';
        this.moveProjectile(0);
      } else if (this.stage === 'fire') {
        this.moveProjectile(1);
        this.projectile.active = false;
        this.projectile.landed = true;
        this.impacts++;
        if (impactHitsPlayer(this.target, player)) {
          this.playerHealth--;
          this.damageTaken++;
          if (this.playerHealth === 0) {
            this.active = false;
            this.lost = true;
            this.stage = 'lost';
            break;
          }
        }
        this.stage = 'recover';
        this.recoveryHit = false;
      } else {
        this.stage = 'windup';
        this.locked = false;
        this.track(player);
      }
    }
  }
}
