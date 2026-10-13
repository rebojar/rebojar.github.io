import { DIAGNOSTIC_DURATION, DIAGNOSTIC_SCENES, diagnosticPose } from '../engine/diagnostic-scenes.mjs?v=b687164b3843';
import { AUDIO_FORWARD, AUDIO_UP, toAudioPosition } from './coordinates.mjs?v=b687164b3843';

const STOP_FADE_SECONDS = 0.12;
const STOP_TAIL_SECONDS = 0.05;

async function ensureRunning(context) {
  let timeout;
  try {
    await Promise.race([
      context.resume(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('O navegador não liberou o áudio. Tente novamente.')), 2500); }),
    ]);
  } finally { clearTimeout(timeout); }
  if (context.state !== 'running') throw new Error(`Contexto de áudio: ${context.state}`);
}

// Fixed diagnostic paths belong to the audio clock, not requestAnimationFrame.
// A throttled or irregular UI frame must not interrupt the spatial trajectory.
export function schedulePosition(node, fromWorld, toWorld, startTime, endTime) {
  const from = toAudioPosition(fromWorld);
  const to = toAudioPosition(toWorld);
  if (!node.positionX) {
    node.setPosition(from.x, from.y, from.z);
    return false;
  }
  for (const axis of ['x', 'y', 'z']) {
    const parameter = node[`position${axis.toUpperCase()}`];
    if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(startTime);
    else parameter.cancelScheduledValues(startTime);
    parameter.setValueAtTime(from[axis], startTime);
    if (from[axis] !== to[axis]) parameter.linearRampToValueAtTime(to[axis], endTime);
  }
  return true;
}

// Diagnostic source only. Foley and event scheduling belong to later gates.
export class SpatialSpike {
  constructor() { this.context = null; this.active = null; this.silenceUntil = 0; this.requestId = 0; }

  async start(scene = DIAGNOSTIC_SCENES.PASS) {
    const initialPose = diagnosticPose(scene, 0);
    const finalPose = diagnosticPose(scene, DIAGNOSTIC_DURATION);
    this.stop();
    const request = ++this.requestId;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio não está disponível neste navegador.');
    this.context ??= new AudioContextClass();
    const ctx = this.context;
    await ensureRunning(ctx);
    if (request !== this.requestId) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createPanner();
    const meter = ctx.createAnalyser();
    meter.fftSize = 256;
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.rolloffFactor = 0.7;
    ctx.listener.setOrientation(AUDIO_FORWARD.x, AUDIO_FORWARD.y, AUDIO_FORWARD.z, AUDIO_UP.x, AUDIO_UP.y, AUDIO_UP.z);
    const richerSignal = scene === DIAGNOSTIC_SCENES.PASS_RIGHT_RICH;
    const peakGain = richerSignal ? 0.07 : 0.12;
    oscillator.type = richerSignal ? 'sawtooth' : 'sine';
    oscillator.frequency.value = 440;
    const startTime = Math.max(ctx.currentTime + 0.005, this.silenceUntil);
    const endTime = startTime + DIAGNOSTIC_DURATION;
    const listenerScheduled = schedulePosition(ctx.listener, initialPose.listener, finalPose.listener, startTime, endTime);
    const sourceScheduled = schedulePosition(panner, initialPose.source, finalPose.source, startTime, endTime);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.05);
    oscillator.connect(panner).connect(gain).connect(meter).connect(ctx.destination);
    const active = { oscillator, gain, panner, meter, scene, start: startTime, listenerScheduled, sourceScheduled, paused: false, data: new Float32Array(256) };
    oscillator.onended = () => {
      oscillator.disconnect(); panner.disconnect(); gain.disconnect(); meter.disconnect();
      if (this.active === active) this.active = null;
    };
    this.active = active;
    oscillator.start(startTime);
    // Automatic fade/stop even when the document is throttled.
    gain.gain.setValueAtTime(peakGain, endTime - 0.05);
    gain.gain.linearRampToValueAtTime(0, endTime);
    oscillator.stop(endTime + STOP_TAIL_SECONDS);
  }

  async pause() {
    if (!this.active || this.active.paused) return false;
    if (this.context.state === 'running') await this.context.suspend();
    if (this.context.state !== 'suspended') throw new Error(`Contexto de áudio: ${this.context.state}`);
    this.active.paused = true;
    return true;
  }

  async resume() {
    if (!this.active || !this.active.paused) return false;
    await ensureRunning(this.context);
    this.active.paused = false;
    return true;
  }

  sample() {
    const ctx = this.context;
    const active = this.active;
    if (!active) return { state: ctx?.state ?? 'não iniciado', playing: false, rms: 0 };
    const elapsed = Math.max(0, ctx.currentTime - active.start);
    if (active.paused) return { state: ctx.state, playing: true, paused: true, elapsed, pose: diagnosticPose(active.scene, elapsed), scene: active.scene, rms: 0 };
    if (elapsed >= DIAGNOSTIC_DURATION) { this.stop(); return { state: ctx.state, playing: false, rms: 0 }; }
    const pose = diagnosticPose(active.scene, elapsed);
    // Older implementations without AudioParam positions still need UI-frame updates.
    if (!active.listenerScheduled) {
      const position = toAudioPosition(pose.listener);
      ctx.listener.setPosition(position.x, position.y, position.z);
    }
    if (!active.sourceScheduled) {
      const position = toAudioPosition(pose.source);
      active.panner.setPosition(position.x, position.y, position.z);
    }
    active.meter.getFloatTimeDomainData(active.data);
    const rms = Math.sqrt(active.data.reduce((sum, x) => sum + x * x, 0) / active.data.length);
    return { state: ctx.state, playing: true, elapsed, pose, scene: active.scene, rms };
  }

  stop() {
    this.requestId++;
    if (!this.active) return;
    const { gain, oscillator } = this.active;
    const now = this.context.currentTime;
    gain.gain.cancelAndHoldAtTime(now);
    gain.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
    const stopTime = now + STOP_FADE_SECONDS + STOP_TAIL_SECONDS;
    oscillator.stop(stopTime);
    this.silenceUntil = stopTime;
    this.active = null;
  }
}
