import { passagePosition } from './pass.mjs?v=b687164b3843';

export const DIAGNOSTIC_DURATION = 12;
export const DIAGNOSTIC_SCENES = Object.freeze({
  PASS: 'pass',
  CROSS: 'cross',
  FAR: 'far',
  PASS_RIGHT: 'pass-right',
  PASS_RIGHT_RICH: 'pass-right-rich',
});

// Positions are in product coordinates: +X right, +Y up, +Z forward.
export function diagnosticPose(scene, elapsed, duration = DIAGNOSTIC_DURATION) {
  // Reuse the existing time validation and clamping for each diagnostic scene.
  const pass = passagePosition(elapsed, duration);
  const progress = (pass.z + 6) / 12;
  const fixedSource = { x: 1, y: 0, z: 0 };

  switch (scene) {
    case DIAGNOSTIC_SCENES.PASS:
      return { listener: pass, source: fixedSource };
    case DIAGNOSTIC_SCENES.CROSS:
      return {
        listener: { x: 0, y: 0, z: 0 },
        source: { x: 6 - 12 * progress, y: 0, z: 2 },
      };
    case DIAGNOSTIC_SCENES.FAR:
      return {
        listener: { x: 0, y: 0, z: -6 + 18 * progress },
        source: fixedSource,
      };
    case DIAGNOSTIC_SCENES.PASS_RIGHT:
    case DIAGNOSTIC_SCENES.PASS_RIGHT_RICH:
      return {
        listener: { x: 0, y: 0, z: -4 + 8 * progress },
        source: { x: 2.5, y: 0, z: 0 },
      };
    default:
      throw new RangeError(`Trajetória desconhecida: ${scene}`);
  }
}
