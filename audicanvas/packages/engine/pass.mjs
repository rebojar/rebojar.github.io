export function passagePosition(elapsed, duration = 12) {
  if (!Number.isFinite(elapsed) || elapsed < 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new RangeError('Tempo inválido');
  }
  return { x: 0, y: 0, z: -6 + 12 * Math.min(elapsed / duration, 1) };
}
