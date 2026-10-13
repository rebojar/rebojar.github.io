export const GAIT_STEP_V0 = 'gait.step.v0';
const MAX_JITTER = 0.015;

function validTime(time) {
  if (!Number.isFinite(time) || time < 0) throw new RangeError('Tempo inválido.');
}

export function cadenceForSpeed(speed) {
  if (!Number.isFinite(speed) || speed < 0 || speed > 4) throw new RangeError('Velocidade inválida.');
  return speed === 0 ? 0 : Math.min(2.8, Math.max(0.6, 0.8 + 0.75 * speed));
}

function unitHash(seed, index, salt) {
  let value = (seed ^ Math.imul(index, 0x9e3779b1) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

export class GaitClock {
  constructor({ seed = 1 } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed inválida.');
    this.seed = seed;
    this.phase = 0;
    this.anchorTime = 0;
    this.cadence = 0;
    this.lastChange = 0;
  }

  phaseAt(time) {
    validTime(time);
    if (time < this.anchorTime) throw new RangeError('Tempo anterior à mudança de marcha.');
    return this.phase + this.cadence * (time - this.anchorTime);
  }

  update(time, { moving, speed }) {
    validTime(time);
    if (time < this.lastChange) throw new RangeError('Mudança de marcha fora de ordem.');
    const nextCadence = moving ? cadenceForSpeed(speed) : 0;
    this.phase = this.phaseAt(time);
    this.anchorTime = time;
    this.lastChange = time;
    this.cadence = nextCadence;
  }

  eventsBetween(from, to) {
    validTime(from);
    validTime(to);
    if (from < this.anchorTime || to < from) throw new RangeError('Intervalo inválido.');
    if (!this.cadence) return [];
    const first = Math.max(1, Math.floor(this.phaseAt(Math.max(this.anchorTime, from - MAX_JITTER))) + 1);
    const last = Math.ceil(this.phaseAt(to + MAX_JITTER));
    const events = [];
    for (let index = first; index <= last; index++) {
      const jitter = (unitHash(this.seed, index, 1) * 2 - 1) * MAX_JITTER;
      const time = this.anchorTime + (index - this.phase) / this.cadence + jitter;
      if (time <= from || time > to) continue;
      events.push({
        schema: GAIT_STEP_V0,
        index,
        time,
        foot: index % 2 ? 'left' : 'right',
        intensity: 0.85 + unitHash(this.seed, index, 2) * 0.25,
        pitch: 0.92 + unitHash(this.seed, index, 3) * 0.16,
      });
    }
    return events;
  }
}
