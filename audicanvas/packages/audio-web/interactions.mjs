// Small, locally packaged CC0 recordings are Gate 4 candidates, not approved
// flower/leaf foley. The pebble remains a temporary diagnostic synthesis.
export const CONTACT_SAMPLE_FILES = Object.freeze({
  dry_flower: Object.freeze(['flower-pop-cc0.wav']),
  dry_leaf: Object.freeze([
    'leaf-rustle-09-cc0.wav', 'leaf-rustle-10-cc0.wav', 'leaf-rustle-12-cc0.wav',
  ]),
});

function sampleUrl(filename) {
  const url = new URL(`../../assets/audio/processed/gate4-a05c/${filename}`, import.meta.url);
  const version = new URL(import.meta.url).searchParams.get('v');
  if (version) url.searchParams.set('v', version);
  return url;
}

export function renderDiagnosticContact(kind, sampleRate, index) {
  if (kind !== 'pebble' || !Number.isFinite(sampleRate) || sampleRate < 8000
      || !Number.isInteger(index) || index < 0) throw new RangeError('Contato diagnóstico inválido.');
  const samples = new Float32Array(Math.ceil(sampleRate * 0.05));
  let state = (Math.imul(index, 1664525) + 901) >>> 0;
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const noise = state / 0x80000000 - 1;
    const impact = time < 0.009 ? noise * (1 - time / 0.009) ** 2 * 0.65 : 0;
    const ring = Math.sin(2 * Math.PI * 1750 * time) * Math.exp(-115 * time) * 0.5
      + Math.sin(2 * Math.PI * 2650 * time) * Math.exp(-165 * time) * 0.25;
    samples[i] = impact + ring;
  }
  return samples;
}

export class MicroInteractionAudio {
  constructor() {
    this.voices = new Set();
    this.samples = null;
    this.loading = null;
  }

  async ensureSamples(context) {
    if (this.samples) return;
    this.loading ??= (async () => {
      const decoded = {};
      for (const [kind, filenames] of Object.entries(CONTACT_SAMPLE_FILES)) {
        decoded[kind] = [];
        for (const filename of filenames) {
          const response = await fetch(sampleUrl(filename));
          if (!response.ok) throw new Error(`Áudio de contato indisponível: ${filename} (${response.status}).`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          if (buffer.numberOfChannels !== 1 || buffer.duration <= 0 || buffer.duration > 1) {
            throw new Error(`Formato de contato inválido: ${filename}.`);
          }
          decoded[kind].push(buffer);
        }
      }
      this.samples = decoded;
    })();
    try { await this.loading; } finally { this.loading = null; }
  }

  play(event, context, clockOffset) {
    const when = event.time - clockOffset;
    if (when < context.currentTime - 0.03) return false;
    const start = Math.max(when, context.currentTime + 0.003);
    const source = context.createBufferSource();
    if (event.kind === 'pebble') {
      const samples = renderDiagnosticContact(event.kind, context.sampleRate, event.stepIndex);
      source.buffer = context.createBuffer(1, samples.length, context.sampleRate);
      source.buffer.getChannelData(0).set(samples);
    } else {
      const variants = this.samples?.[event.kind];
      if (!variants?.length) throw new Error(`Contato não carregado: ${event.kind}.`);
      source.buffer = variants[event.stepIndex % variants.length];
      source.playbackRate.value = event.kind === 'dry_flower'
        ? 0.88 + (event.stepIndex % 5) * 0.01
        : 0.96 + (event.stepIndex % 5) * 0.02;
    }
    const duration = source.buffer.duration / source.playbackRate.value;
    const end = start + duration;
    const gain = context.createGain();
    // Keep brief contacts audible beside the provisional synthesized footsteps.
    const amount = (event.kind === 'dry_flower' ? 0.17 : event.kind === 'pebble' ? 0.06 : 0.14) * event.intensity;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amount, start + (event.kind === 'dry_leaf' ? 0.006 : 0.001));
    gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.006);
    gain.gain.setValueAtTime(0, end);
    const pan = context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = event.foot === 'left' ? -0.22 : 0.22;
      gain.connect(pan).connect(context.destination);
    } else gain.connect(context.destination);

    source.connect(gain);
    const voice = { source, gain, pan, start };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect(); gain.disconnect(); pan?.disconnect();
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
