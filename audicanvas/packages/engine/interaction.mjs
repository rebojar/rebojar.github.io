import { surfaceContact, SURFACES } from './surface.mjs?v=6030691e9309';
import { cadenceForSpeed } from './gait.mjs?v=6030691e9309';

export const MICRO_INTERACTION_V0 = 'micro.interaction.v0';
export const MICRO_KINDS = Object.freeze(['dry_flower', 'dry_leaf', 'pebble']);

// Perceptual calibration for the diagnostic scene: even slow walking should
// encounter objects, while the chance per step and cadence both grow with speed.
// The seeded planner still determines when each irregular contact occurs.
export function densityScaleForSpeed(sliderScale, speed) {
  if (!Number.isFinite(sliderScale) || sliderScale < 0 || sliderScale > 2) {
    throw new RangeError('Frequência manual deve estar entre 0 e 2.');
  }
  const cadence = cadenceForSpeed(speed);
  return cadence === 0 ? 0 : sliderScale * (2.2 + speed);
}

function unitHash(seed, index, salt) {
  let value = (seed ^ Math.imul(index, 0x9e3779b1) ^ Math.imul(salt, 0x85ebca6b)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x100000000;
}

function validateConfig(config) {
  const seed = config?.seed ?? 1;
  if (config?.schema !== 'surface-interaction.config.v0' || !SURFACES[config.surface]
      || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff
      || !Number.isInteger(config.minimumSpacingSteps) || config.minimumSpacingSteps < 1
      || !Number.isInteger(config.clusterWindowSteps) || config.clusterWindowSteps < config.minimumSpacingSteps
      || !config.microObjects || Object.keys(config.microObjects).sort().join(',') !== [...MICRO_KINDS].sort().join(',')) {
    throw new RangeError('Configuração de interações inválida.');
  }
  for (const kind of MICRO_KINDS) {
    const item = config.microObjects[kind];
    if (!item || !Number.isFinite(item.density) || item.density < 0 || item.density > 1
        || !Number.isInteger(item.cooldownSteps) || item.cooldownSteps < config.minimumSpacingSteps
        || !Number.isFinite(item.clusterProbability) || item.clusterProbability < 0 || item.clusterProbability > 1
        || !Array.isArray(item.intensity) || item.intensity.length !== 2
        || !Number.isFinite(item.intensity[0]) || !Number.isFinite(item.intensity[1])
        || item.intensity[0] < 0 || item.intensity[1] > 1 || item.intensity[0] > item.intensity[1]) {
      throw new RangeError(`Parâmetros inválidos: ${kind}`);
    }
  }
}

// Decisions are keyed by step index, not by timer polls. Repeated or rescheduled steps
// keep the same objects, and density changes rebuild the sequence from the seed.
export class InteractionEngine {
  constructor(config) {
    validateConfig(config);
    this.config = {
      schema: config.schema,
      surface: config.surface,
      seed: config.seed ?? 1,
      minimumSpacingSteps: config.minimumSpacingSteps,
      clusterWindowSteps: config.clusterWindowSteps,
      microObjects: Object.fromEntries(MICRO_KINDS.map((kind) => [kind, { ...config.microObjects[kind], intensity: [...config.microObjects[kind].intensity] }])),
    };
    this.densityScale = 1;
    this.resetPlan();
  }

  resetPlan() {
    this.plan = [null];
    this.lastAny = -Infinity;
    this.lastKind = null;
    this.lastKindIndex = -Infinity;
    this.lastByKind = Object.fromEntries(MICRO_KINDS.map((kind) => [kind, -Infinity]));
  }

  setDensityScale(scale) {
    if (!Number.isFinite(scale) || scale < 0 || scale > 9) throw new RangeError('Densidade efetiva deve estar entre 0 e 9.');
    this.densityScale = scale;
    this.resetPlan();
  }

  estimatedEncountersPerMinute(speed) {
    const cadence = cadenceForSpeed(speed);
    if (!cadence) return 0;
    const sampleSteps = 1000;
    this.planThrough(sampleSteps);
    let encounters = 0;
    for (let index = 1; index <= sampleSteps; index++) if (this.plan[index]) encounters++;
    return encounters * cadence * 60 / sampleSteps;
  }

  planThrough(index) {
    for (let n = this.plan.length; n <= index; n++) {
      let choice = null;
      if (n - this.lastAny >= this.config.minimumSpacingSteps) {
        const candidates = [];
        for (let i = 0; i < MICRO_KINDS.length; i++) {
          const kind = MICRO_KINDS[i];
          const item = this.config.microObjects[kind];
          if (n - this.lastByKind[kind] < item.cooldownSteps) continue;
          const clustered = kind === this.lastKind && n - this.lastKindIndex <= this.config.clusterWindowSteps;
          const probability = Math.min(1, (item.density + (clustered ? item.clusterProbability : 0)) * this.densityScale);
          if (unitHash(this.config.seed, n, i + 1) < probability) {
            candidates.push({ kind, priority: unitHash(this.config.seed, n, i + 11) });
          }
        }
        candidates.sort((a, b) => a.priority - b.priority);
        choice = candidates[0]?.kind ?? null;
      }
      this.plan.push(choice);
      if (choice) {
        this.lastAny = n;
        this.lastKind = choice;
        this.lastKindIndex = n;
        this.lastByKind[choice] = n;
      }
    }
  }

  eventsForStep(step, { speed, position }) {
    const contact = surfaceContact(step, { surface: this.config.surface, speed, position });
    this.planThrough(step.index);
    const kind = this.plan[step.index];
    if (!kind) return [];
    const item = this.config.microObjects[kind];
    const salt = MICRO_KINDS.indexOf(kind) + 1;
    return [{
      schema: MICRO_INTERACTION_V0,
      kind,
      family: kind,
      surface: contact.surface,
      stepIndex: contact.stepIndex,
      foot: contact.foot,
      // Pressure from the footfall comes first; the material responds shortly after.
      time: contact.time + 0.042 + unitHash(this.config.seed, step.index, 30 + salt) * 0.008,
      intensity: contact.intensity * (item.intensity[0] + unitHash(this.config.seed, step.index, 40 + salt) * (item.intensity[1] - item.intensity[0])),
      position: contact.position,
    }];
  }
}
