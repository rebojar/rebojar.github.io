import { GaitClock } from '../engine/gait.mjs?v=c01ff44198d8';
import { MicroInteractionAudio } from './interactions.mjs?v=c01ff44198d8';
import { MICRO_KINDS } from '../engine/interaction.mjs?v=c01ff44198d8';
import { earringEventForStep } from '../engine/body.mjs?v=c01ff44198d8';
import { BodyEarringAudio } from './body.mjs?v=c01ff44198d8';
import { TrafficPlanner } from '../engine/world.mjs?v=c01ff44198d8';
import { DistantTrafficAudio } from './traffic.mjs?v=c01ff44198d8';

const LOOKAHEAD_SECONDS = 0.08;
const POLL_MS = 25;

function noiseBuffer(context, index) {
  const length = Math.ceil(context.sampleRate * 0.13);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = (Math.imul(index, 1664525) + 1013904223) >>> 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    samples[i] = (state / 0x80000000 - 1) * (1 - i / length);
  }
  return buffer;
}

// Temporary synthesized footsteps. Approved recordings replace this adapter later.
export class FootstepAudio {
  constructor() {
    this.context = null;
    this.gait = new GaitClock({ seed: 20260929 });
    this.voices = new Set();
    this.timer = null;
    this.active = false;
    this.scheduledThrough = 0;
    this.clockOffset = 0;
    this.scheduledCount = 0;
    this.interactionPlan = null;
    this.interactions = new MicroInteractionAudio();
    this.interactionCounts = { dry_flower: 0, dry_leaf: 0, pebble: 0 };
    this.previewVersion = 0;
    this.footstepsMuted = false;
    this.bodyEnabled = false;
    this.body = new BodyEarringAudio();
    this.speed = 0;
    this.bodyCount = 0;
    this.trafficPlanner = null;
    this.traffic = new DistantTrafficAudio();
    this.trafficEnabled = false;
    this.trafficCount = 0;
    this.trafficScheduledIndex = 0;
    this.walkStartedAt = 0;
  }

  setInteractionPlan(plan) {
    if (plan !== null && typeof plan !== 'function') throw new TypeError('O planejador de interações deve ser uma função.');
    this.interactionPlan = plan;
  }

  setFootstepsMuted(muted) {
    if (typeof muted !== 'boolean') throw new TypeError('Silêncio de passos deve ser booleano.');
    this.footstepsMuted = muted;
    if (muted) { this.cancelVoices(true); this.body.cancelVoices(true, this.context); }
  }

  setBodyEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Estado dos brincos deve ser booleano.');
    this.bodyEnabled = enabled;
    if (!enabled) this.body.cancelVoices(true, this.context);
  }

  setBodyVolume(volume) { this.body.setVolume(volume); }

  setTrafficConfig(config) {
    if (this.active) throw new Error('Pare a caminhada antes de trocar a cena de trânsito.');
    this.trafficPlanner = config ? new TrafficPlanner(config) : null;
  }

  setTrafficEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new TypeError('Estado do trânsito deve ser booleano.');
    this.trafficEnabled = enabled;
    if (!enabled) this.traffic.cancelVoices(this.context);
  }

  async ensureContext() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio não está disponível.');
    this.context ??= new AudioContextClass();
    let timeout;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('O navegador não liberou o áudio.')), 2500); }),
      ]);
    } finally { clearTimeout(timeout); }
    if (this.context.state !== 'running') throw new Error(`Contexto de áudio: ${this.context.state}`);
    await this.interactions.ensureSamples(this.context);
  }

  async previewInteraction(kind) {
    if (!MICRO_KINDS.includes(kind)) throw new RangeError('Contato desconhecido.');
    if (this.active) throw new Error('Pare a caminhada antes de ouvir o contato isolado.');
    const request = ++this.previewVersion;
    await this.ensureContext();
    if (request !== this.previewVersion || this.active) return false;
    this.interactions.cancelVoices(true, this.context);
    this.body.cancelVoices(true, this.context);
    this.traffic.cancelVoices(this.context);
    const time = performance.now() / 1000;
    const offset = time - this.context.currentTime;
    const interval = kind === 'dry_leaf' ? 0.65 : 0.3;
    for (let index = 0; index < 3; index++) {
      this.interactions.play({
        kind, stepIndex: index + 101, foot: index % 2 ? 'left' : 'right',
        time: time + 0.04 + index * interval, intensity: 0.8,
      }, this.context, offset);
    }
    return true;
  }

  async start(speed) {
    if (this.active) return performance.now() / 1000;
    this.previewVersion++;
    await this.ensureContext();
    this.interactions.cancelVoices(true, this.context);
    this.body.cancelVoices(true, this.context);
    this.traffic.cancelVoices(this.context);
    const time = performance.now() / 1000;
    this.clockOffset = time - this.context.currentTime;
    this.gait.update(time, { moving: true, speed });
    this.speed = speed;
    this.scheduledThrough = time;
    this.scheduledCount = 0;
    this.interactionCounts = { dry_flower: 0, dry_leaf: 0, pebble: 0 };
    this.bodyCount = 0;
    this.trafficPlanner?.reset();
    this.trafficScheduledIndex = 0;
    this.trafficCount = 0;
    this.walkStartedAt = time;
    this.active = true;
    this.tick();
    this.timer = setInterval(() => this.tick(), POLL_MS);
    return time;
  }

  setSpeed(speed, time) {
    if (!this.active) return;
    this.gait.update(time, { moving: true, speed });
    this.speed = speed;
    this.cancelVoices(false);
    this.interactions.cancelVoices(false, this.context);
    this.body.cancelVoices(false, this.context);
    this.scheduledThrough = time;
    this.tick();
  }

  tick() {
    if (!this.active) return;
    const now = performance.now() / 1000;
    const horizon = now + LOOKAHEAD_SECONDS;
    for (const event of this.gait.eventsBetween(this.scheduledThrough, horizon)) this.play(event);
    if (this.trafficPlanner) {
      for (const event of this.trafficPlanner.eventsThrough(Math.max(0, horizon - this.walkStartedAt))) {
        if (event.index <= this.trafficScheduledIndex) continue;
        this.trafficScheduledIndex = event.index;
        if (this.trafficEnabled && this.traffic.play({ ...event, time: this.walkStartedAt + event.time },
          this.context, this.clockOffset)) this.trafficCount++;
      }
    }
    this.scheduledThrough = horizon;
  }

  play(event) {
    const ctx = this.context;
    const when = event.time - this.clockOffset;
    if (when < ctx.currentTime - 0.03) return; // Drop delayed steps; do not burst after a throttled tab.
    this.scheduledCount++;
    const plannedInteractions = this.interactionPlan?.(event) ?? [];
    if (!this.footstepsMuted) {
      const start = Math.max(when, ctx.currentTime + 0.003);
      const end = start + 0.13;
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer(ctx, event.index);
      source.playbackRate.value = event.pitch;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 850 * event.pitch;
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(115 * event.pitch, start);
      thump.frequency.exponentialRampToValueAtTime(65 * event.pitch, end);
      const thumpGain = ctx.createGain();
      thumpGain.gain.value = 0.3;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      // The footfall attacks first, then recedes to reveal the material it struck.
      gain.gain.linearRampToValueAtTime(0.07 * event.intensity, start + 0.008);
      if (plannedInteractions.length) {
        gain.gain.linearRampToValueAtTime(0.045 * event.intensity, start + 0.032);
      }
      gain.gain.exponentialRampToValueAtTime(0.001, end - 0.008);
      gain.gain.setValueAtTime(0, end);
      const pan = ctx.createStereoPanner?.();
      source.connect(filter).connect(gain);
      thump.connect(thumpGain).connect(gain);
      if (pan) {
        pan.pan.value = event.foot === 'left' ? -0.22 : 0.22;
        gain.connect(pan).connect(ctx.destination);
      } else gain.connect(ctx.destination);
      const voice = { source, thump, filter, thumpGain, gain, pan, start };
      this.voices.add(voice);
      source.onended = () => {
        source.disconnect(); thump.disconnect(); filter.disconnect(); thumpGain.disconnect(); gain.disconnect(); pan?.disconnect();
        this.voices.delete(voice);
      };
      source.start(start);
      thump.start(start);
      source.stop(end);
      thump.stop(end);
    }
    for (const interaction of plannedInteractions) {
      if (this.interactions.play(interaction, ctx, this.clockOffset)) this.interactionCounts[interaction.kind]++;
    }
    if (this.bodyEnabled && !this.footstepsMuted) {
      const earring = earringEventForStep(event, { speed: this.speed });
      if (earring && this.body.play(earring, ctx, this.clockOffset)) this.bodyCount++;
    }
  }

  cancelVoices(includeCurrent) {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      if (!includeCurrent && voice.start <= now) continue;
      if (voice.start > now) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
      } else {
        voice.gain.gain.cancelAndHoldAtTime(now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.04);
      }
      try { voice.source.stop(now + 0.05); voice.thump.stop(now + 0.05); } catch { /* Already ended. */ }
    }
  }

  stop(time = performance.now() / 1000) {
    this.previewVersion++;
    this.interactions.cancelVoices(true, this.context);
    // A current earring resonance fades naturally; future collisions are cancelled.
    this.body.cancelVoices(false, this.context);
    this.traffic.cancelVoices(this.context);
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    this.timer = null;
    this.gait.update(time, { moving: false, speed: 0 });
    this.cancelVoices(true);
  }
}
