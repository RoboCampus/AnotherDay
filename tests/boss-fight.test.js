import test from 'node:test';
import assert from 'node:assert/strict';
import { BossFight, BOSS_ATTACK, impactHitsPlayer } from '../src/boss-fight.js';

const origin = { x: 0, y: 1.85, z: 0 };
const standing = { x: 0, y: 0, z: 8 };
const dodged = { x: 4, y: 0, z: 8 };
const start = () => { const fight = new BossFight(); fight.start(standing, origin); return fight; };
function advance(fight, seconds, player = standing) {
  for (let time = 0; time < seconds - 1e-9; time += 0.05) fight.update(Math.min(0.05, seconds - time), player);
}
function recovery(fight) {
  advance(fight, BOSS_ATTACK.lock, standing);
  advance(fight, BOSS_ATTACK.windup - BOSS_ATTACK.lock + BOSS_ATTACK.fire, dodged);
  assert.equal(fight.stage, 'recover');
}
function chargeUltimate(fight) {
  for (let i = 0; i < 3; i++) {
    recovery(fight);
    assert.equal(fight.hit(), true);
    if (i < 2) advance(fight, BOSS_ATTACK.recover, dodged);
  }
}

test('windup tracks the player then locks the thrown-person landing point', () => {
  const fight = start();
  fight.update(0.4, { x: 1, y: 0, z: 8 });
  assert.equal(fight.target.x, 1);
  fight.update(0.4, standing);
  assert.equal(fight.locked, true);
  advance(fight, 0.7, dodged);
  assert.equal(fight.stage, 'fire');
  assert.equal(fight.target.x, 0);
  advance(fight, BOSS_ATTACK.fire, dodged);
  assert.equal(fight.playerHealth, 3);
  assert.equal(fight.stage, 'recover');
});

test('thrown character follows an arc and damage happens only at impact', () => {
  const fight = start();
  advance(fight, BOSS_ATTACK.windup);
  assert.equal(fight.projectile.active, true);
  assert.equal(fight.projectile.kind, 'meteorologist');
  advance(fight, BOSS_ATTACK.fire / 2);
  assert.equal(fight.playerHealth, 3);
  assert.ok(fight.projectile.position.y > origin.y);
  assert.ok(Math.abs(fight.projectile.position.z - 4) < 1e-8);
  advance(fight, BOSS_ATTACK.fire / 2);
  assert.equal(fight.playerHealth, 2);
  assert.equal(fight.damageTaken, 1);
  assert.equal(fight.impacts, 1);
  assert.equal(fight.projectile.active, false);
  assert.equal(fight.projectile.landed, true);
  advance(fight, 2);
  assert.equal(fight.damageTaken, 1);
});

test('a player inside the landing circle can still run out during the flight', () => {
  const fight = start();
  advance(fight, BOSS_ATTACK.windup + BOSS_ATTACK.fire / 2, standing);
  advance(fight, BOSS_ATTACK.fire / 2, dodged);
  assert.equal(fight.playerHealth, 3);
  assert.equal(fight.impacts, 1);
});

test('projectiles alternate meteorologists and officers', () => {
  const fight = start();
  recovery(fight);
  assert.equal(fight.projectile.kind, 'meteorologist');
  advance(fight, BOSS_ATTACK.recover + BOSS_ATTACK.windup, dodged);
  assert.equal(fight.projectile.kind, 'officer');
  assert.equal(fight.projectile.active, true);
});

test('landing damage uses a finite radius and player height', () => {
  assert.equal(impactHitsPlayer(standing, standing), true);
  assert.equal(impactHitsPlayer(standing, { x: 1.5, y: 0, z: 8 }), true);
  assert.equal(impactHitsPlayer(standing, { x: 2, y: 0, z: 8 }), false);
  assert.equal(impactHitsPlayer(standing, { x: 0, y: 3, z: 8 }), false);
});

test('kipa only damages once per recovery and cannot trigger the ultimate early', () => {
  const fight = start();
  assert.equal(fight.hit(), false);
  assert.equal(fight.beginUltimate(), false);
  assert.equal(fight.finishUltimate(), false);
  recovery(fight);
  assert.equal(fight.hit(), true);
  assert.equal(fight.hit(), false);
  assert.equal(fight.health, 3);
  assert.equal(fight.hits, 1);
  assert.equal(fight.ultimateReady, false);
  advance(fight, BOSS_ATTACK.recover, dodged);
  assert.equal(fight.hit(), false);
});

test('three kipa hits charge the ultimate and stagger Amir without winning', () => {
  const fight = start();
  chargeUltimate(fight);
  assert.equal(fight.health, 1);
  assert.equal(fight.maxHealth, 4);
  assert.equal(fight.hits, 3);
  assert.equal(fight.won, false);
  assert.equal(fight.active, true);
  assert.equal(fight.ultimateReady, true);
  assert.equal(fight.stage, 'staggered');
  const shots = fight.shots, health = fight.playerHealth;
  advance(fight, 20);
  assert.equal(fight.shots, shots);
  assert.equal(fight.playerHealth, health);
  assert.equal(fight.hit(), false);
});

test('the satellite depletes round one but leaves Amir active for his retreat', () => {
  const fight = start();
  chargeUltimate(fight);
  assert.equal(fight.finishUltimate(), false);
  assert.equal(fight.beginUltimate(), true);
  assert.equal(fight.stage, 'ultimate');
  assert.equal(fight.beginUltimate(), false);
  const shots = fight.shots, health = fight.playerHealth;
  advance(fight, 20);
  assert.equal(fight.shots, shots);
  assert.equal(fight.playerHealth, health);
  assert.equal(fight.finishUltimate(), true);
  assert.equal(fight.health, 0);
  assert.equal(fight.stage, 'retreat');
  assert.equal(fight.won, false);
  assert.equal(fight.active, true);
  assert.equal(fight.ultimateReady, false);
  assert.equal(fight.finishUltimate(), false);
  advance(fight, 20);
  assert.equal(fight.shots, shots);
});

test('healing restores Amir then round two resumes without resetting player damage', () => {
  const fight = start();
  assert.equal(fight.startRoundTwo(standing, origin), false);
  advance(fight, BOSS_ATTACK.windup + BOSS_ATTACK.fire);
  assert.equal(fight.playerHealth, 2);
  assert.equal(fight.hit(), true);
  advance(fight, BOSS_ATTACK.recover, dodged);
  recovery(fight);
  assert.equal(fight.hit(), true);
  advance(fight, BOSS_ATTACK.recover, dodged);
  recovery(fight);
  assert.equal(fight.hit(), true);
  fight.beginUltimate();
  fight.finishUltimate();
  assert.equal(fight.heal(0.5), 2);
  assert.equal(fight.heal(1), 4);
  assert.equal(fight.startRoundTwo(standing, origin), true);
  assert.equal(fight.round, 2);
  assert.equal(fight.health, 4);
  assert.equal(fight.playerHealth, 2);
  assert.equal(fight.damageTaken, 1);
  assert.equal(fight.totalHits, 3);
  assert.equal(fight.hits, 0);
  assert.equal(fight.ultimateReady, false);
  assert.equal(fight.stage, 'windup');
  assert.equal(fight.startRoundTwo(standing, origin), false);
});

test('three more kipa hits charge Shaikale Poopale and only his special ends round two', () => {
  const fight = start();
  chargeUltimate(fight);
  fight.beginUltimate();
  fight.finishUltimate();
  fight.heal(1);
  fight.startRoundTwo(standing, origin);
  chargeUltimate(fight);
  assert.equal(fight.health, 1);
  assert.equal(fight.hits, 3);
  assert.equal(fight.totalHits, 6);
  assert.equal(fight.won, false);
  assert.equal(fight.ultimateReady, true);
  assert.equal(fight.beginUltimate(), true);
  assert.equal(fight.finishUltimate(), true);
  assert.equal(fight.health, 0);
  assert.equal(fight.stage, 'won');
  assert.equal(fight.won, true);
  assert.equal(fight.active, false);
  assert.equal(fight.ultimateReady, false);
  assert.equal(fight.finishUltimate(), false);
  const shots = fight.shots;
  advance(fight, 20);
  assert.equal(fight.shots, shots);
});

test('three landing hits lose and retry resets health, charge, and projectiles', () => {
  const fight = start();
  advance(fight, 18);
  assert.equal(fight.playerHealth, 0);
  assert.equal(fight.lost, true);
  assert.equal(fight.stage, 'lost');
  assert.equal(fight.active, false);
  const shots = fight.shots;
  advance(fight, 20);
  assert.equal(fight.shots, shots);
  fight.start(dodged, origin);
  assert.equal(fight.active, true);
  assert.equal(fight.stage, 'windup');
  assert.equal(fight.playerHealth, 3);
  assert.equal(fight.health, 4);
  assert.equal(fight.won, false);
  assert.equal(fight.lost, false);
  assert.equal(fight.ultimateReady, false);
  assert.equal(fight.shots, 0);
  assert.equal(fight.hits, 0);
  assert.equal(fight.impacts, 0);
  assert.equal(fight.damageTaken, 0);
  assert.equal(fight.projectile.active, false);
  assert.equal(fight.time, 0);
});


test('a round two loss can restart round two with fresh health and charge', () => {
  const fight = start();
  fight.start(standing, origin, 2);
  advance(fight, 18);
  assert.equal(fight.lost, true);
  assert.equal(fight.round, 2);
  fight.start(dodged, origin, fight.round);
  assert.equal(fight.round, 2);
  assert.equal(fight.health, 4);
  assert.equal(fight.playerHealth, 3);
  assert.equal(fight.hits, 0);
  assert.equal(fight.totalHits, 3);
  assert.equal(fight.ultimateReady, false);
  assert.equal(fight.stage, 'windup');
});
