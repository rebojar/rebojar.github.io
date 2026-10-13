// Temporary diagnostic sound for each micro-object; licensed one-shots replace it later.
function noiseBuffer(context, index, salt) {
  const length = Math.ceil(context.sampleRate * 0.12);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = (Math.imul(index, 1664525) + Math.imul(salt, 1013904223)) >>> 0;
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    samples[i] = state / 0x80000000 - 1;
  }
  return buffer;
}

function pulse(time, from, to) {
  if (time <= from || time >= to) return 0;
  return Math.sin(Math.PI * (time - from) / (to - from)) ** 2;
}

// Diagnostic synthesis only: a soft succession of petal-like friction and a
// short, hard stone impact. These are not recordings or approved foley.
export function renderDiagnosticContact(kind, sampleRate, index) {
  if (!['dry_flower', 'pebble'].includes(kind) || !Number.isFinite(sampleRate) || sampleRate < 8000
      || !Number.isInteger(index) || index < 0) throw new RangeError('Contato diagnóstico inválido.');
  const duration = kind === 'dry_flower' ? 0.1 : 0.05;
  const samples = new Float32Array(Math.ceil(sampleRate * duration));
  let state = (Math.imul(index, 1664525) + (kind === 'pebble' ? 901 : 317)) >>> 0;
  let softened = 0;
  const alpha = 1 - Math.exp(-2 * Math.PI * 1800 / sampleRate);
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const noise = state / 0x80000000 - 1;
    if (kind === 'dry_flower') {
      softened += alpha * (noise - softened);
      const flutter = 0.55 * pulse(time, 0, 0.035)
        + 0.4 * pulse(time, 0.037, 0.071)
        + 0.3 * pulse(time, 0.073, 0.1);
      samples[i] = softened * flutter;
    } else {
      const impact = time < 0.009 ? noise * (1 - time / 0.009) ** 2 * 0.65 : 0;
      const ring = Math.sin(2 * Math.PI * 1750 * time) * Math.exp(-115 * time) * 0.5
        + Math.sin(2 * Math.PI * 2650 * time) * Math.exp(-165 * time) * 0.25;
      samples[i] = impact + ring;
    }
  }
  return samples;
}

export class MicroInteractionAudio {
  constructor() { this.voices = new Set(); }

  play(event, context, clockOffset) {
    const when = event.time - clockOffset;
    if (when < context.currentTime - 0.03) return false;
    const start = Math.max(when, context.currentTime + 0.003);
    const duration = event.kind === 'dry_flower' ? 0.1 : event.kind === 'dry_leaf' ? 0.12 : 0.05;
    const end = start + duration;
    const gain = context.createGain();
    const amount = (event.kind === 'dry_flower' ? 0.045 : event.kind === 'pebble' ? 0.033 : 0.022) * event.intensity;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amount, start + (event.kind === 'pebble' ? 0.001 : 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.006);
    gain.gain.setValueAtTime(0, end);
    const pan = context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = event.foot === 'left' ? -0.12 : 0.12;
      gain.connect(pan).connect(context.destination);
    } else gain.connect(context.destination);

    const source = context.createBufferSource();
    let filter = null;
    if (event.kind === 'dry_leaf') {
      source.buffer = noiseBuffer(context, event.stepIndex, 2);
      filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      source.connect(filter).connect(gain);
    } else {
      const samples = renderDiagnosticContact(event.kind, context.sampleRate, event.stepIndex);
      source.buffer = context.createBuffer(1, samples.length, context.sampleRate);
      source.buffer.getChannelData(0).set(samples);
      source.connect(gain);
    }
    const voice = { source, filter, gain, pan, start };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect(); filter?.disconnect(); gain.disconnect(); pan?.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(end);
    return true;
  }

  cancelVoices(includeCurrent, context) {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of this.voices) {
      if (!includeCurrent && voice.start <= now) continue;
      if (voice.start > now) {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(0, now);
      } else {
        voice.gain.gain.cancelAndHoldAtTime(now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.04);
      }
      try { voice.source.stop(now + 0.05); } catch { /* Already ended. */ }
    }
  }
}
