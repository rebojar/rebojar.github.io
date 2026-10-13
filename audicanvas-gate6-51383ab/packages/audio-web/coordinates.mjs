// Product coordinates: +X right, +Y up, +Z forward.
// Web Audio is right-handed and faces -Z when +X means right.
export const AUDIO_FORWARD = Object.freeze({ x: 0, y: 0, z: -1 });
export const AUDIO_UP = Object.freeze({ x: 0, y: 1, z: 0 });

export function toAudioPosition(world) {
  return { x: world.x, y: world.y, z: -world.z };
}
