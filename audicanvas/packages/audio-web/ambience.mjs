export const AMBIENT_KINDS = Object.freeze(['breeze', 'rain', 'storm', 'fireplace']);

const FILES = Object.freeze({
  breeze: 'breeze.mp3',
  rain: 'rain.mp3',
  storm: 'storm.mp3',
  fireplace: 'fireplace.mp3',
});
const PAN = Object.freeze({ breeze: -0.15, rain: 0.08, storm: -0.22, fireplace: 0.24 });

// Only world sources enter this bus. Body sounds and footfalls stay near the listener.
export class EnvironmentAcoustics {
  constructor(context, destination, mode = 'outdoor') {
    this.context = context;
    this.mode = mode;
    this.input = context.createGain();
    this.outdoor = context.createGain();
    this.indoor = context.createGain();
    this.input.connect(this.outdoor).connect(destination);
    const wall = context.createBiquadFilter();
    wall.type = 'lowpass';
    wall.frequency.value = 2700;
    this.input.connect(wall);
    const dry = context.createGain();
    dry.gain.value = 0.72;
    wall.connect(dry).connect(this.indoor);
    for (const [delaySeconds, level, pan] of [[0.035, 0.17, -0.35], [0.067, 0.11, 0.35]]) {
      const delay = context.createDelay(0.1);
      delay.delayTime.value = delaySeconds;
      const tap = context.createGain();
      tap.gain.value = level;
      wall.connect(delay).connect(tap);
      const position = context.createStereoPanner?.();
      if (position) {
        position.pan.value = pan;
        tap.connect(position).connect(this.indoor);
      } else tap.connect(this.indoor);
    }
    this.indoor.connect(destination);
    this.setMode(mode, true);
  }

  setMode(mode, immediate = false) {
    if (mode !== 'outdoor' && mode !== 'indoor') throw new RangeError('Ambiente deve ser externo ou interno.');
    this.mode = mode;
    const now = this.context.currentTime;
    for (const [node, target] of [[this.outdoor, mode === 'outdoor' ? 1 : 0], [this.indoor, mode === 'indoor' ? 1 : 0]]) {
      if (immediate) node.gain.value = target;
      else node.gain.setTargetAtTime(target, now, 0.08);
    }
  }
}

// Two overlapping one-shot voices make a long bed without an abrupt loop join.
export class AmbientBeds {
  constructor() {
    this.buffers = new Map();
    this.loading = new Map();
    this.enabled = Object.fromEntries(AMBIENT_KINDS.map((kind) => [kind, false]));
    this.nextStart = new Map();
    this.voices = new Set();
    this.active = false;
    this.context = null;
    this.outputFor = null;
  }

  setEnabled(kind, enabled) {
    if (!AMBIENT_KINDS.includes(kind)) throw new RangeError('Paisagem sonora desconhecida.');
    if (typeof enabled !== 'boolean') throw new TypeError('Estado da paisagem sonora deve ser booleano.');
    this.enabled[kind] = enabled;
    if (!enabled) this.fadeKind(kind);
    else if (this.active && this.buffers.has(kind)) this.nextStart.set(kind, this.context.currentTime + 0.02);
  }

  async load(context, kinds = AMBIENT_KINDS.filter((kind) => this.enabled[kind])) {
    await Promise.all(kinds.map(async (kind) => {
      if (this.buffers.has(kind)) return;
      if (!this.loading.has(kind)) {
        const url = new URL(`../../assets/audio/processed/a20-ambiences/${FILES[kind]}`, import.meta.url);
        const version = new URL(import.meta.url).searchParams.get('v');
        if (version) url.searchParams.set('v', version);
        this.loading.set(kind, (async () => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Som de ${kind} indisponível (${response.status}).`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          if (buffer.duration < 3) throw new Error(`Som de ${kind} inválido.`);
          this.buffers.set(kind, buffer);
        })().finally(() => this.loading.delete(kind)));
      }
      await this.loading.get(kind);
    }));
  }

  start(context, outputFor) {
    this.context = context;
    this.outputFor = outputFor;
    this.active = true;
    for (const kind of AMBIENT_KINDS) if (this.enabled[kind]) this.nextStart.set(kind, context.currentTime + 0.02);
    this.tick();
  }

  tick() {
    if (!this.active) return;
    const horizon = this.context.currentTime + 0.25;
    for (const kind of AMBIENT_KINDS) {
      if (!this.enabled[kind] || !this.buffers.has(kind)) continue;
      const buffer = this.buffers.get(kind);
      const overlap = Math.min(1.2, buffer.duration / 8);
      let next = this.nextStart.get(kind);
      if (next === undefined) next = this.context.currentTime + 0.02;
      while (next < horizon) {
        this.play(kind, buffer, next, overlap);
        next += buffer.duration - overlap;
      }
      this.nextStart.set(kind, next);
    }
  }

  play(kind, buffer, when, overlap) {
    const context = this.context;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(1, when + overlap);
    envelope.gain.setValueAtTime(1, when + buffer.duration - overlap);
    envelope.gain.linearRampToValueAtTime(0, when + buffer.duration);
    const pan = context.createStereoPanner?.();
    source.connect(envelope);
    if (pan) {
      pan.pan.value = PAN[kind];
      envelope.connect(pan).connect(this.outputFor(kind));
    } else envelope.connect(this.outputFor(kind));
    const voice = { kind, source, envelope, pan };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect(); envelope.disconnect(); pan?.disconnect();
      this.voices.delete(voice);
    };
    source.start(when);
    source.stop(when + buffer.duration);
  }

  fadeKind(kind) {
    this.nextStart.delete(kind);
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.voices) {
      if (voice.kind !== kind) continue;
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setTargetAtTime(0, now, 0.06);
      try { voice.source.stop(now + 0.25); } catch { /* Already ended. */ }
    }
  }

  stop() {
    this.active = false;
    for (const kind of AMBIENT_KINDS) this.fadeKind(kind);
  }
}
