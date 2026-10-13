import { BODY_EARRING_V0 } from '../engine/body.mjs?v=6030691e9309';

// A short, low-level metallic double resonance close to the listener.
export class BodyEarringAudio {
  constructor() { this.voices = new Set(); }

  play(event, context, clockOffset) {
    if (event?.schema !== BODY_EARRING_V0) throw new TypeError('Evento corporal inválido.');
    const start = Math.max(event.time - clockOffset, context.currentTime + 0.003);
    if (event.time - clockOffset < context.currentTime - 0.03) return false;
    const end = start + event.decay;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.055 * event.intensity, start + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, end - 0.008);
    gain.gain.setValueAtTime(0, end);
    const pan = context.createStereoPanner?.();
    if (pan) {
      pan.pan.value = event.side === 'left' ? -0.32 : 0.32;
      gain.connect(pan).connect(context.destination);
    } else gain.connect(context.destination);

    const oscillators = [1, 1.43].map((ratio, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index ? 'sine' : 'triangle';
      oscillator.frequency.value = event.frequency * ratio;
      const partial = context.createGain();
      partial.gain.value = index ? 0.28 : 1;
      oscillator.connect(partial).connect(gain);
      oscillator.start(start);
      oscillator.stop(end);
      return { oscillator, partial };
    });
    const voice = { start, gain, pan, oscillators };
    this.voices.add(voice);
    oscillators[0].oscillator.onended = () => {
      for (const { oscillator, partial } of oscillators) { oscillator.disconnect(); partial.disconnect(); }
      gain.disconnect(); pan?.disconnect(); this.voices.delete(voice);
    };
    return true;
  }

  cancelVoices(includeCurrent, context) {
    if (!context) return;
    const now = context.currentTime;
    for (const voice of this.voices) {
      if (!includeCurrent && voice.start <= now) continue;
      voice.gain.gain.cancelScheduledValues(now);
      if (voice.start > now) voice.gain.gain.setValueAtTime(0, now);
      else {
        voice.gain.gain.cancelAndHoldAtTime(now);
        voice.gain.gain.linearRampToValueAtTime(0, now + 0.04);
      }
      for (const { oscillator } of voice.oscillators) {
        try { oscillator.stop(now + 0.05); } catch { /* Already stopped. */ }
      }
    }
  }
}
