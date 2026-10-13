export const TRAFFIC_PASS_V0 = 'world.traffic.pass.v0';

function unitHash(seed, index, salt) {
  let value = (seed ^ Math.imul(index, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

function validRange(range, min, max) {
  return Array.isArray(range) && range.length === 2
    && range.every((value) => Number.isFinite(value) && value >= min && value <= max)
    && range[0] <= range[1];
}

// Sparse world events use the walk's elapsed clock, independent of gait cadence.
export class TrafficPlanner {
  constructor(config) {
    if (config?.schema !== 'world.traffic.config.v0'
        || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff
        || !Number.isFinite(config.firstPassSeconds) || config.firstPassSeconds < 0
        || !validRange(config.gapSeconds, 4, 120)
        || !validRange(config.durationSeconds, 2, 15)
        || !validRange(config.intensity, 0, 1)
        || !Number.isFinite(config.lateralMeters) || config.lateralMeters < 3 || config.lateralMeters > 50
        || !Number.isFinite(config.approachMeters) || config.approachMeters < 8 || config.approachMeters > 100) {
      throw new RangeError('Configuração de trânsito inválida.');
    }
    this.config = { ...config, gapSeconds: [...config.gapSeconds],
      durationSeconds: [...config.durationSeconds], intensity: [...config.intensity] };
    this.reset();
  }

  reset() { this.events = []; this.nextTime = this.config.firstPassSeconds; }

  eventsThrough(elapsed) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError('Tempo de trânsito inválido.');
    const { seed, gapSeconds, durationSeconds, intensity, lateralMeters, approachMeters } = this.config;
    while (this.nextTime <= elapsed) {
      const index = this.events.length + 1;
      const direction = unitHash(seed, index, 3) < 0.5 ? 1 : -1;
      this.events.push({
        schema: TRAFFIC_PASS_V0,
        index,
        time: this.nextTime,
        duration: durationSeconds[0] + unitHash(seed, index, 1) * (durationSeconds[1] - durationSeconds[0]),
        intensity: intensity[0] + unitHash(seed, index, 2) * (intensity[1] - intensity[0]),
        x: lateralMeters,
        zFrom: -direction * approachMeters,
        zTo: direction * approachMeters,
      });
      this.nextTime += gapSeconds[0] + unitHash(seed, index, 4) * (gapSeconds[1] - gapSeconds[0]);
    }
    return this.events.filter((event) => event.time <= elapsed);
  }
}
