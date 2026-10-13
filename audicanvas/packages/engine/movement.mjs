// Flat forward motion in product coordinates (+Z). Time is monotonic seconds;
// position is analytic, so skipped or extra display frames cannot change it.
export const MOVEMENT_V0 = 'movement.v0';
export const MAX_MOVEMENT_SPEED = 4;

function validTime(time, previous) {
  if (!Number.isFinite(time) || time < 0 || (previous !== null && time < previous)) {
    throw new RangeError('O tempo deve ser finito, não negativo e monotônico.');
  }
}

function validSpeed(speed) {
  if (!Number.isFinite(speed) || speed < 0 || speed > MAX_MOVEMENT_SPEED) {
    throw new RangeError(`A velocidade deve estar entre 0 e ${MAX_MOVEMENT_SPEED} m/s.`);
  }
}

export class MovementSimulator {
  constructor({ speed = 1, initialZ = 0 } = {}) {
    validSpeed(speed);
    if (!Number.isFinite(initialZ)) throw new RangeError('A posição inicial deve ser finita.');
    this.speed = speed;
    this.anchorZ = initialZ;
    this.anchorTime = null;
    this.lastTime = null;
    this.moving = false;
  }

  positionAt(time) {
    return this.anchorZ + (this.moving ? this.speed * (time - this.anchorTime) : 0);
  }

  observe(time) {
    validTime(time, this.lastTime);
    this.lastTime = time;
    return { schema: MOVEMENT_V0, moving: this.moving, speed: this.speed, position: { x: 0, y: 0, z: this.positionAt(time) } };
  }

  start(time) {
    validTime(time, this.lastTime);
    if (!this.moving) { this.anchorTime = time; this.moving = true; }
    return this.observe(time);
  }

  stop(time) {
    validTime(time, this.lastTime);
    if (this.moving) { this.anchorZ = this.positionAt(time); this.moving = false; }
    this.anchorTime = time;
    return this.observe(time);
  }

  setSpeed(speed, time) {
    validSpeed(speed);
    validTime(time, this.lastTime);
    if (this.moving) this.anchorZ = this.positionAt(time);
    this.anchorTime = time;
    this.speed = speed;
    return this.observe(time);
  }

  reset(time) {
    validTime(time, this.lastTime);
    this.anchorZ = 0;
    this.anchorTime = time;
    this.moving = false;
    return this.observe(time);
  }
}
