/* Pure angular motion and versioned learner-state validation. */
(function (global) {
  'use strict';
  const VERSION = '20261024.084153';
  const TAU = 2 * Math.PI;
  const END = 2 * TAU;

  /** Validate the complete saved state without coercion or silent recovery. */
  function validateState(value) {
    if (!value || Array.isArray(value) || value.schema !== 1 ||
        !Number.isFinite(value.x) || value.x < 0 || value.x > END ||
        !Number.isFinite(value.speed) || value.speed < 5 || value.speed > 120 || value.speed % 5 !== 0) {
      throw new TypeError('Invalid sine-formation state');
    }
    return {schema: 1, x: value.x, speed: value.speed};
  }

  /** Integrate the current speed over elapsed seconds, stopping exactly at 4π. */
  function advance(x, speed, seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Invalid elapsed time');
    return Math.min(END, x + speed * Math.PI / 180 * seconds);
  }

  /** Retain a full-circle remainder at exact positive revolution boundaries. */
  function phase(x) {
    if (x === 0) return {turns: 0, angle: 0};
    const turns = Math.max(0, Math.ceil(x / TAU) - 1);
    return {turns, angle: x - turns * TAU};
  }

  const api = Object.freeze({VERSION, TAU, END, validateState, advance, phase});
  global.SineFormation = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
