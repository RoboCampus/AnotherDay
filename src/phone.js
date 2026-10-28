import { audio } from './audio.js';

const LINES = [
  'Are you already in?', 'Are you inside?', 'Nu? Are you in?', 'Are you inside yet?', 'Are you already in??',
  'Hello? Are you inside?', 'Are you in? Answer me.', 'ARE. YOU. INSIDE?', 'So... are you in?', 'Are you inside already?',
  'Are you in or not?', 'Just checking. Are you in?',
];

// "DO NOT ANSWER" keeps calling while Argaman waits. Y answers, N declines; unanswered calls are
// missed calls. Declining only makes them call back sooner.
export class Phone {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.call = null;
    this.timer = 2;
    this.missed = 0;
    this.answered = 0;
    this.lineIdx = 0;
    this.bossMode = false;
    this.adamAnswered = 0;
    this.adamMissed = 0;
  }

  start(first = 1.5) {
    this.bossMode = false;
    this.active = true;
    this.timer = first;
  }

  startBoss(first = 2.5) {
    this.stop();
    this.bossMode = true;
    this.active = true;
    this.timer = first;
  }

  stopBoss() {
    this.stop();
  }

  get blocksAttacks() {
    return this.call?.caller === 'ADAM' && this.call.state === 'talking';
  }

  stop() {
    this.active = false;
    if (this.call) this.hangup();
    this.bossMode = false;
  }

  ring() {
    const caller = this.bossMode ? 'ADAM' : 'DO NOT ANSWER';
    this.call = { t: 0, state: 'ringing', caller };
    this.ctx.hud.phoneRing(this.bossMode ? this.adamMissed : this.missed, caller);
    audio.ring();
  }

  hangup(missed = false) {
    audio.stopRing();
    if (missed) {
      if (this.call?.caller === 'ADAM') this.adamMissed++;
      else this.missed++;
    }
    this.call = null;
    this.ctx.hud.phoneHide(this.missed);
    if (this.ctx.player.mode === 'phone') this.ctx.player.mode = null;
  }

  // a single call the story waits on (e.g. the last one after the gate opens)
  forceCall(line, reply) {
    this.ring();
    this.call.forced = { line, reply };
  }

  update(dt) {
    const input = this.ctx.input, hud = this.ctx.hud;
    if (this.call) {
      const c = this.call;
      c.t += dt;
      if (c.state === 'ringing') {
        if (input.hit('KeyY')) {
          c.state = 'talking';
          c.t = 0;
          audio.stopRing();
          audio.click();
          if (c.caller === 'ADAM') this.adamAnswered++;
          else this.answered++;
          const line = c.caller === 'ADAM' ? 'Argaman, what is happening with the new satellite? I need an update.' : c.forced?.line || LINES[this.lineIdx++ % LINES.length];
          hud.phoneTalk(line);
          audio.say(line, 'caller');
          this.ctx.player.mode = 'phone';
        } else if (input.hit('KeyN')) {
          audio.click();
          this.hangup(true);
          this.timer = this.bossMode ? 12 : 1.5 + Math.random() * 2;
        } else if (c.t > 7) {
          this.hangup(true);
          this.timer = this.bossMode ? 12 : 2 + Math.random() * 3;
        }
      } else if (c.state === 'talking') {
        if (c.caller === 'ADAM' && c.t > 3 && !c.replied) {
          c.replied = true;
          hud.phoneTalk('What is happening with the new satellite?', 'ADAM, can this wait? I am in a boss fight.');
          audio.say('Adam, can this wait? I am in a boss fight.', 'argaman');
        }
        if (c.forced?.reply && c.t > 2.2 && !c.replied) {
          c.replied = true;
          hud.phoneTalk(c.forced.line, c.forced.reply);
          audio.say(c.forced.reply, 'argaman');
        }
        if (c.t > (c.caller === 'ADAM' ? 8 : c.forced?.reply ? 4.5 : 2.8)) {
          this.hangup();
          this.timer = this.bossMode ? 12 : 2.5 + Math.random() * 3.5;
        }
      }
      return;
    }
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) this.ring();
  }
}
