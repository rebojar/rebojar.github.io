import { TRAFFIC_PASS_V0 } from '../engine/world.mjs?v=28727a895113';

function trafficNoise(context, seed, duration) {
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = (seed ^ 0x7f4a7c15) >>> 0;
  let low = 0;
  let enginePhase = 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const noise = state / 0x80000000 - 1;
    low += 0.12 * (noise - low);
    const seconds = i / context.sampleRate;
    enginePhase += 2 * Math.PI * (72 + 4 * Math.sin(seconds * 1.7 + seed)) / context.sampleRate;
    const engine = Math.sin(enginePhase) + 0.35 * Math.sin(enginePhase * 2 + 0.4);
    samples[i] = low * 0.55 + noise * 0.12 + engine * 0.22;
  }
  return buffer;
}

// Provisional dry, distant open-air traffic. No sample loop or room reverb.
export class DistantTrafficAudio {
  constructor() { this.voices = new Set(); }

  play(event, context, clockOffset) {
    if (event?.schema !== TRAFFIC_PASS_V0) throw new TypeError('Passagem de trânsito inválida.');
    const scheduled = event.time - clockOffset;
    if (scheduled < context.currentTime - 0.03) return false;
    const start = Math.max(scheduled, context.currentTime + 0.003);
    const end = start + event.duration;
    const source = context.createBufferSource();
    source.buffer = trafficNoise(context, event.index, event.duration);
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, start);
    filter.frequency.linearRampToValueAtTime(680, start + event.duration * 0.5);
    filter.frequency.linearRampToValueAtTime(340, end);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.11 * event.intensity, start + event.duration * 0.45);
    gain.gain.linearRampToValueAtTime(0.08 * event.intensity, start + event.duration * 0.6);
    gain.gain.linearRampToValueAtTime(0, end);
    const pan = context.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 2;
    pan.maxDistance = 100;
    pan.rolloffFactor = 0.8;
    pan.positionX.setValueAtTime(event.x, start);
    pan.positionY.setValueAtTime(0, start);
    // World +Z is Web Audio -Z. The vehicle stays on the far side of the street.
    pan.positionZ.setValueAtTime(-event.zFrom, start);
    pan.positionZ.linearRampToValueAtTime(-event.zTo, end);
    source.connect(filter).connect(gain).connect(pan).connect(context.destination);
    const voice = { source, filter, gain, pan, start };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(end);
    return true;
  }

  cancelVoices(context) {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of this.voices) {
      voice.gain.gain.cancelScheduledValues(now);
      if (voice.start > now) voice.gain.gain.setValueAtTime(0, now);
      else {
        voice.gain.gain.cancelAndHoldAtTime(now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.12);
      }
      try { voice.source.stop(now + 0.13); } catch { /* Already ended. */ }
    }
  }
}
