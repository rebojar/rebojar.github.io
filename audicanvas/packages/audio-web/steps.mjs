import { GaitClock } from '../engine/gait.mjs?v=09ca7f68094d';
import { MicroInteractionAudio } from './interactions.mjs?v=09ca7f68094d';
import { MICRO_KINDS } from '../engine/interaction.mjs?v=09ca7f68094d';
import { earringEventForStep } from '../engine/body.mjs?v=09ca7f68094d';
import { BodyEarringAudio } from './body.mjs?v=09ca7f68094d';
import { TrafficPlanner } from '../engine/world.mjs?v=09ca7f68094d';
import { DistantTrafficAudio } from './traffic.mjs?v=09ca7f68094d';
import { AMBIENT_KINDS, AmbientBeds, EnvironmentAcoustics } from './ambience.mjs?v=09ca7f68094d';

const LOOKAHEAD_SECONDS = 0.08;
const POLL_MS = 25;
const MIX_CHANNELS = Object.freeze(['steps', 'dry_flower', 'dry_leaf', 'pebble', 'traffic', ...AMBIENT_KINDS]);
const ENV_CHANNELS = new Set(['traffic', ...AMBIENT_KINDS]);
const SPEAKER_BOOST = Object.freeze({ steps: 2.2, dry_flower: 3.4, dry_leaf: 3.4, pebble: 3.4, traffic: 2.4, breeze: 1.8, rain: 1.8, storm: 1.5, fireplace: 1.8 });

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
    this.moving = false;
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
    this.ambience = new AmbientBeds();
    this.environmentMode = 'outdoor';
    this.environmentAcoustics = null;
    this.walkStartedAt = 0;
    this.channelVolumes = Object.fromEntries(MIX_CHANNELS.map((channel) => [channel, 1]));
    this.channelOutputs = new Map();
    this.outputMode = 'headphones';
    this.masterVolume = 1;
    this.masterOutput = null;
  }

  setMasterVolume(volume) {
    if (!Number.isFinite(volume) || volume < 0 || volume > (this.outputMode === 'speakers' ? 3 : 1)) {
      throw new RangeError('Volume geral inválido para a saída selecionada.');
    }
    this.masterVolume = volume;
    if (this.masterOutput) {
      if (typeof this.masterOutput.gain.setTargetAtTime === 'function') {
        this.masterOutput.gain.setTargetAtTime(volume, this.context.currentTime, 0.025);
      } else this.masterOutput.gain.value = volume;
    }
  }

  masterFor() {
    if (!this.masterOutput) {
      const output = this.context.createGain();
      output.gain.value = this.masterVolume;
      const compressor = this.context.createDynamicsCompressor?.();
      if (compressor) {
        compressor.threshold.value = -9;
        compressor.knee.value = 6;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.15;
        output.connect(compressor).connect(this.context.destination);
      } else output.connect(this.context.destination);
      this.masterOutput = output;
    }
    return this.masterOutput;
  }

  channelGain(channel) {
    return this.channelVolumes[channel] * (this.outputMode === 'speakers' ? SPEAKER_BOOST[channel] : 1);
  }

  setOutputMode(mode) {
    if (!['speakers', 'headphones'].includes(mode)) throw new RangeError('Saída de áudio desconhecida.');
    this.outputMode = mode;
    this.traffic.setOutputMode(mode);
    if (mode === 'headphones' && this.masterVolume > 1) this.setMasterVolume(1);
    for (const [channel, output] of this.channelOutputs) {
      const gain = this.channelGain(channel);
      if (typeof output.gain.setTargetAtTime === 'function') output.gain.setTargetAtTime(gain, this.context.currentTime, 0.025);
      else output.gain.value = gain;
    }
  }

  setChannelVolume(channel, volume) {
    if (!MIX_CHANNELS.includes(channel)) throw new RangeError('Camada de áudio desconhecida.');
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new RangeError('Volume da camada inválido.');
    this.channelVolumes[channel] = volume;
    const output = this.channelOutputs.get(channel);
    if (output) {
      const gain = this.channelGain(channel);
      if (typeof output.gain.setTargetAtTime === 'function') output.gain.setTargetAtTime(gain, this.context.currentTime, 0.015);
      else output.gain.value = gain;
    }
  }

  outputFor(channel) {
    let output = this.channelOutputs.get(channel);
    if (!output) {
      output = this.context.createGain();
      output.gain.value = this.channelGain(channel);
      if (ENV_CHANNELS.has(channel) && this.context.createBiquadFilter && this.context.createDelay) {
        this.environmentAcoustics ??= new EnvironmentAcoustics(this.context, this.masterFor(), this.environmentMode);
        output.connect(this.environmentAcoustics.input);
      } else output.connect(this.masterFor());
      this.channelOutputs.set(channel, output);
    }
    return output;
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

  setEnvironmentMode(mode) {
    if (!['outdoor', 'indoor'].includes(mode)) throw new RangeError('Tipo de ambiente desconhecido.');
    this.environmentMode = mode;
    this.environmentAcoustics?.setMode(mode);
  }

  async setAmbientEnabled(kind, enabled) {
    this.ambience.setEnabled(kind, enabled);
    if (enabled && this.active) {
      await this.ambience.load(this.context, [kind]);
      if (this.active && this.ambience.enabled[kind]) this.ambience.tick();
    }
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

  async previewOutput(throughStepsChannel = false) {
    if (this.active) throw new Error('Pare a cena antes de testar o motor.');
    await this.ensureContext();
    const context = this.context;
    const first = context.currentTime + 0.04;
    for (const [index, frequency] of [440, 660].entries()) {
      const onset = first + index * 0.4;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, onset);
      gain.gain.linearRampToValueAtTime(0.18, onset + 0.025);
      gain.gain.setValueAtTime(0.18, onset + 0.28);
      gain.gain.linearRampToValueAtTime(0, onset + 0.34);
      oscillator.connect(gain).connect(throughStepsChannel ? this.outputFor('steps') : context.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(onset);
      oscillator.stop(onset + 0.36);
    }
    return context.state;
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
      }, this.context, offset, this.outputFor(kind));
    }
    return true;
  }

  async start(speed, moving = true) {
    if (typeof moving !== 'boolean') throw new TypeError('Estado de movimento deve ser booleano.');
    if (this.active) return performance.now() / 1000;
    this.previewVersion++;
    await this.ensureContext();
    await this.ambience.load(this.context);
    this.interactions.cancelVoices(true, this.context);
    this.body.cancelVoices(true, this.context);
    this.traffic.cancelVoices(this.context);
    const time = performance.now() / 1000;
    this.clockOffset = time - this.context.currentTime;
    this.gait.update(time, { moving, speed: moving ? speed : 0 });
    this.moving = moving;
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
    this.ambience.start(this.context, (kind) => this.outputFor(kind));
    this.tick();
    this.timer = setInterval(() => this.tick(), POLL_MS);
    return time;
  }

  setSpeed(speed, time) {
    if (!this.active) return;
    this.speed = speed;
    if (!this.moving) return;
    this.gait.update(time, { moving: true, speed });
    this.cancelVoices(false);
    this.interactions.cancelVoices(false, this.context);
    this.body.cancelVoices(false, this.context);
    this.scheduledThrough = time;
    this.tick();
  }

  setMoving(moving, time) {
    if (typeof moving !== 'boolean') throw new TypeError('Estado de movimento deve ser booleano.');
    if (!this.active || this.moving === moving) return;
    this.moving = moving;
    this.gait.update(time, { moving, speed: moving ? this.speed : 0 });
    if (!moving) {
      this.cancelVoices(true);
      this.interactions.cancelVoices(true, this.context);
      this.body.cancelVoices(false, this.context);
    }
    this.scheduledThrough = time;
    this.tick();
  }

  tick() {
    if (!this.active) return;
    this.ambience.tick();
    const now = performance.now() / 1000;
    const horizon = now + LOOKAHEAD_SECONDS;
    for (const event of this.gait.eventsBetween(this.scheduledThrough, horizon)) this.play(event);
    if (this.trafficPlanner) {
      for (const event of this.trafficPlanner.eventsThrough(Math.max(0, horizon - this.walkStartedAt))) {
        if (event.index <= this.trafficScheduledIndex) continue;
        this.trafficScheduledIndex = event.index;
        if (this.trafficEnabled && this.traffic.play({ ...event, time: this.walkStartedAt + event.time },
          this.context, this.clockOffset, this.outputFor('traffic'))) this.trafficCount++;
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
      filter.frequency.value = (this.outputMode === 'speakers' ? 2600 : 850) * event.pitch;
      const thump = ctx.createOscillator();
      thump.type = 'sine';
      thump.frequency.setValueAtTime(115 * event.pitch, start);
      thump.frequency.exponentialRampToValueAtTime(65 * event.pitch, end);
      const thumpGain = ctx.createGain();
      thumpGain.gain.value = this.outputMode === 'speakers' ? 0.22 : 0.3;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      // The footfall attacks first, then recedes to reveal the material it struck.
      gain.gain.linearRampToValueAtTime((this.outputMode === 'speakers' ? 0.14 : 0.07) * event.intensity, start + 0.008);
      if (plannedInteractions.length) {
        gain.gain.linearRampToValueAtTime((this.outputMode === 'speakers' ? 0.09 : 0.045) * event.intensity, start + 0.032);
      }
      gain.gain.exponentialRampToValueAtTime(0.001, end - 0.008);
      gain.gain.setValueAtTime(0, end);
      const pan = ctx.createStereoPanner?.();
      source.connect(filter).connect(gain);
      thump.connect(thumpGain).connect(gain);
      if (pan) {
        pan.pan.value = event.foot === 'left' ? -0.22 : 0.22;
        gain.connect(pan).connect(this.outputFor('steps'));
      } else gain.connect(this.outputFor('steps'));
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
      if (this.interactions.play(interaction, ctx, this.clockOffset, this.outputFor(interaction.kind))) this.interactionCounts[interaction.kind]++;
    }
    if (this.bodyEnabled && !this.footstepsMuted) {
      const earring = earringEventForStep(event, { speed: this.speed });
      if (earring && this.body.play(earring, ctx, this.clockOffset, this.masterFor())) this.bodyCount++;
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
    this.ambience.stop();
    if (!this.active) return;
    this.active = false;
    this.moving = false;
    clearInterval(this.timer);
    this.timer = null;
    this.gait.update(time, { moving: false, speed: 0 });
    this.cancelVoices(true);
  }
}
