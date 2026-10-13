import { GAIT_STEP_V0 } from './gait.mjs?v=6030691e9309';

export const BODY_EARRING_V0 = 'body.earring.v0';

function unitHash(seed, index, salt) {
  let value = (seed ^ Math.imul(index, 0x9e3779b1) ^ salt) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

// A step excites a small, damped earring motion. No clock or audio API lives here.
export function earringEventForStep(step, {
  speed, enabled = true, seed = 20261013, mobility = 0.8,
  collisionProbability = 0.5, decay = 0.32, intensity = 0.8, variation = 0.2,
} = {}) {
  if (step?.schema !== GAIT_STEP_V0 || !Number.isInteger(step.index) || !Number.isFinite(step.time)
    || !Number.isFinite(step.intensity)) throw new TypeError('Passo inválido para o corpo.');
  if (!Number.isFinite(speed) || speed < 0 || speed > 4) throw new RangeError('Velocidade corporal inválida.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Seed corporal inválida.');
  for (const [name, value] of Object.entries({ mobility, collisionProbability, intensity, variation })) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${name} inválido.`);
  }
  if (!Number.isFinite(decay) || decay < 0.12 || decay > 0.6) throw new RangeError('Decay corporal inválido.');
  if (typeof enabled !== 'boolean') throw new TypeError('Estado corporal inválido.');
  if (!enabled || speed === 0 || mobility === 0 || collisionProbability === 0) return null;

  const excitation = Math.min(1, mobility * step.intensity * (0.35 + 0.32 * speed));
  const chance = collisionProbability * excitation;
  if (unitHash(seed, step.index, 1) >= chance) return null;
  const side = unitHash(seed, step.index, 2) < 0.5 ? 'left' : 'right';
  const color = unitHash(seed, step.index, 3);
  return {
    schema: BODY_EARRING_V0,
    stepIndex: step.index,
    time: step.time + 0.055 + unitHash(seed, step.index, 4) * 0.04,
    side,
    intensity: intensity * excitation * (1 - variation / 2 + variation * color),
    frequency: 1180 + 620 * color,
    decay: decay * (0.86 + 0.28 * unitHash(seed, step.index, 5)),
  };
}
