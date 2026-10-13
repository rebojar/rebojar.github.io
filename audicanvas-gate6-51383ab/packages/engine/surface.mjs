export const SURFACE_CONTACT_V0 = 'surface.contact.v0';

export const SURFACES = Object.freeze({
  asphalt: Object.freeze({ id: 'asphalt', stepFamily: 'step.asphalt', microFamilies: Object.freeze(['dry_flower', 'dry_leaf', 'pebble']) }),
});

export function surfaceContact(step, { surface = 'asphalt', speed, position } = {}) {
  const definition = SURFACES[surface];
  if (!definition) throw new RangeError(`Superfície desconhecida: ${surface}`);
  if (!Number.isInteger(step?.index) || step.index < 1 || !Number.isFinite(step.time) || step.time < 0
      || !['left', 'right'].includes(step.foot) || !Number.isFinite(step.intensity) || step.intensity < 0) {
    throw new RangeError('Passo inválido para contato.');
  }
  if (!Number.isFinite(speed) || speed < 0 || speed > 4) throw new RangeError('Velocidade inválida para contato.');
  if (!position || !['x', 'y', 'z'].every((axis) => Number.isFinite(position[axis]))) {
    throw new RangeError('Posição inválida para contato.');
  }
  return {
    schema: SURFACE_CONTACT_V0,
    stepIndex: step.index,
    time: step.time,
    foot: step.foot,
    intensity: step.intensity,
    speed,
    surface: definition.id,
    stepFamily: definition.stepFamily,
    position: { x: position.x, y: position.y, z: position.z },
  };
}
