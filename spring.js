/* ==========================================================================
   spring.js — the physics the skill specifies, nothing more.

   Everything here is a direct translation of apple-design SKILL.md:
   §4  springs parameterised by damping ratio + response (not mass/stiffness)
   §5  velocity handoff at the seam between drag and animation
   §6  Apple's exponential-decay momentum projection
   §9  rubber-banding
   §11 one rAF loop as the display-synced clock
   ========================================================================== */

/* --- §11: a single display-synced clock driving every active spring ------ */
const running = new Set();
let rafId = null;
let lastT = 0;

function frame(t) {
  const dt = lastT ? Math.min((t - lastT) / 1000, 0.064) : 1 / 60;
  lastT = t;
  for (const s of running) s.advance(dt);
  rafId = running.size ? requestAnimationFrame(frame) : (lastT = 0, null);
}

function wake() {
  if (rafId === null) rafId = requestAnimationFrame(frame);
}

/**
 * A spring in Apple's designer-facing parameters (§4).
 *
 *   damping  — damping ratio. 1.0 = critically damped, no overshoot.
 *              < 1.0 overshoots; lower = bouncier.
 *   response — seconds to reach the target. NOT a duration: settle time
 *              emerges from the parameters.
 *
 * Retargeting never resets position or velocity, which is what makes it
 * interruptible (§3) and lets a reversal blend velocity instead of hitting a
 * "brick wall".
 */
export class Spring {
  constructor({ from = 0, velocity = 0, damping = 1, response = 0.4, onChange, onRest } = {}) {
    this.x = from;
    this.v = velocity;
    this.target = from;
    this.damping = damping;
    this.response = response;
    this.onChange = onChange;
    this.onRest = onRest;
    this.active = false;
  }

  get omega() { return (2 * Math.PI) / this.response; }

  /** Retarget mid-flight. Position and velocity carry through (§3). */
  to(target, { velocity, damping, response } = {}) {
    this.target = target;
    if (velocity !== undefined) this.v = velocity;
    if (damping !== undefined) this.damping = damping;
    if (response !== undefined) this.response = response;
    this.start();
    return this;
  }

  /** Hard set — used while a finger is driving the value 1:1 (§2). */
  set(x, v = 0) {
    this.x = x;
    this.v = v;
    this.onChange?.(this.x, this.v);
    return this;
  }

  start() {
    if (!this.active) { this.active = true; running.add(this); wake(); }
    return this;
  }

  stop() {
    this.active = false;
    running.delete(this);
    return this;
  }

  advance(dt) {
    // Fixed substeps keep semi-implicit Euler stable at low response values.
    const h = 1 / 600;
    let left = dt;
    const w = this.omega;
    const z = this.damping;
    while (left > 0) {
      const s = Math.min(h, left);
      const a = -2 * z * w * this.v - w * w * (this.x - this.target);
      this.v += a * s;
      this.x += this.v * s;
      left -= s;
    }
    if (Math.abs(this.v) < 0.4 && Math.abs(this.x - this.target) < 0.4) {
      this.x = this.target;
      this.v = 0;
      this.stop();
      this.onChange?.(this.x, this.v);
      this.onRest?.(this.x);
      return;
    }
    this.onChange?.(this.x, this.v);
  }
}

/**
 * §6 — Apple's momentum projection, from the Designing Fluid Interfaces
 * sample code. Note this is the exponential-decay form, NOT v²/(2·decel).
 * decelerationRate ≈ 0.998 for normal scroll feel; 0.99 is snappier.
 */
export function project(initialVelocity, decelerationRate = 0.998) {
  return ((initialVelocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** §9 — progressive resistance past a boundary. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Pick the snap point nearest a position. */
export function nearest(value, points) {
  return points.reduce((best, p) => (Math.abs(p - value) < Math.abs(best - value) ? p : best), points[0]);
}

/**
 * §2 — a short position/time history, so release velocity comes from the
 * gesture's recent trend rather than the last single event (which is noisy
 * and reads as zero if the finger paused for one frame).
 */
export class VelocityTracker {
  constructor(window = 100) { this.window = window; this.samples = []; }

  clear() { this.samples.length = 0; }

  add(value, time = performance.now()) {
    this.samples.push({ value, time });
    while (this.samples.length > 2 && time - this.samples[0].time > this.window) {
      this.samples.shift();
    }
  }

  /** px/s over the tracked window. */
  get velocity() {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = (last.time - first.time) / 1000;
    if (dt <= 0) return 0;
    return (last.value - first.value) / dt;
  }
}

/** True when motion should be reduced — media query OR the in-page switch (§14). */
export function motionReduced() {
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    (document.documentElement.dataset.motion !== 'full' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

/** §13 — haptics only where they earn their place, and only if supported. */
export function tick(pattern = 8) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
