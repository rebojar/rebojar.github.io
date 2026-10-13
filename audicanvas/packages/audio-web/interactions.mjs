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

export class MicroInteractionAudio {
  constructor() { this.voices = new Set(); }

  play(event, context, clockOffset) {
    const when = event.time - clockOffset;
    if (when < context.currentTime - 0.03) return false;
    const start = Math.max(when, context.currentTime + 0.003);
    const duration = event.kind === 'dry_flower' ? 0.07 : event.kind === 'dry_leaf' ? 0.12 : 0.1;
    const end = start + duration;
    const gain = context.createGain();
    const amount = (event.kind === 'pebble' ? 0.018 : 0.022) * event.intensity;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amount, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.006);
    gain.gain.setValueAtTime(0, end);
    const pan = context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = event.foot === 'left' ? -0.12 : 0.12;
      gain.connect(pan).connect(context.destination);
    } else gain.connect(context.destination);

    let source;
    let filter = null;
    if (event.kind === 'pebble') {
      source = context.createOscillator();
      source.type = 'sine';
      source.frequency.setValueAtTime(660, start);
      source.frequency.exponentialRampToValueAtTime(340, end);
      source.connect(gain);
    } else {
      source = context.createBufferSource();
      source.buffer = noiseBuffer(context, event.stepIndex, event.kind === 'dry_flower' ? 1 : 2);
      filter = context.createBiquadFilter();
      filter.type = event.kind === 'dry_flower' ? 'highpass' : 'bandpass';
      filter.frequency.value = event.kind === 'dry_flower' ? 1900 : 900;
      source.connect(filter).connect(gain);
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
