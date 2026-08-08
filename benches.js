/* ==========================================================================
   benches.js — eight rigs, each running one claim from apple-design/SKILL.md
   next to the version that ignores it. No animation library.
   ========================================================================== */

import { Spring, project, rubberband, nearest, VelocityTracker, motionReduced, tick } from './spring.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const px = (n) => `${Math.round(n)} px`;

/** Segmented control. Calls back with the value of the pressed button. */
function segment(root, attr, onChange) {
  const buttons = $$(`button[data-${attr}]`, root);
  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      buttons.forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      onChange(b.dataset[attr]);
    });
  });
}

/**
 * §2 — Pointer Events with capture, so tracking survives the pointer leaving
 * the element's bounds. One active pointer at a time.
 */
function draggable(el, { onStart, onMove, onEnd }) {
  let id = null;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    el.setPointerCapture(id);
    el.dataset.held = 'true';
    onStart?.(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    onMove?.(e);
  });
  const finish = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    el.dataset.held = 'false';
    onEnd?.(e);
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

/** Rig + puck geometry, recomputed on resize rather than cached blindly. */
function metrics(rig, puck) {
  const r = rig.getBoundingClientRect();
  const p = puck.getBoundingClientRect();
  return { rig: r, w: r.width, h: r.height, pw: p.width, ph: p.height,
           maxX: Math.max(0, r.width - p.width), maxY: Math.max(0, r.height - p.height) };
}

/* ==========================================================================
   Header — §14 switches. These force the reduced paths so the difference is
   feelable on a machine that has neither setting turned on.
   ========================================================================== */
{
  const root = document.documentElement;
  const motion = $('#motion-switch');
  const transparency = $('#transparency-switch');

  motion.checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
  transparency.checked = matchMedia('(prefers-reduced-transparency: reduce)').matches;

  motion.addEventListener('change', () => {
    root.dataset.motion = motion.checked ? 'reduce' : 'full';
  });
  transparency.addEventListener('change', () => {
    root.dataset.transparency = transparency.checked ? 'reduce' : 'full';
  });
}

/* ==========================================================================
   1 — Response. Latency measured for real: pointerdown → the frame the lit
   style is actually painted on.
   ========================================================================== */
{
  const good = $('#tap-good');
  const bad = $('#tap-bad');
  const latGood = $('#lat-good');
  const latBad = $('#lat-bad');

  const report = (out, startedAt) => {
    // Two frames: one to apply the style, one that confirms it was painted.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      out.textContent = `${Math.round(performance.now() - startedAt)} ms`;
    }));
  };

  // The good one: light up on pointerdown, immediately.
  good.addEventListener('pointerdown', (e) => {
    const t0 = e.timeStamp || performance.now();
    good.dataset.lit = 'true';
    report(latGood, t0);
  });
  const unlitGood = () => { good.dataset.lit = 'false'; };
  good.addEventListener('pointerup', unlitGood);
  good.addEventListener('pointercancel', unlitGood);
  good.addEventListener('pointerleave', unlitGood);

  // The bad one: wait for the click, then a small "settle" timer on top.
  let pressedAt = 0;
  bad.addEventListener('pointerdown', (e) => { pressedAt = e.timeStamp || performance.now(); });
  bad.addEventListener('click', () => {
    const t0 = pressedAt || performance.now();
    setTimeout(() => {
      bad.dataset.lit = 'true';
      report(latBad, t0);
      setTimeout(() => { bad.dataset.lit = 'false'; }, 450);
    }, 140);
  });

  // Keyboard parity, since both are exposed as buttons.
  [good, bad].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
    });
  });
}

/* ==========================================================================
   2 — 1:1 tracking and the grab offset.
   ========================================================================== */
{
  const rig = $('#rig-tracking');
  const puck = $('#puck-tracking');
  const outOffset = $('#tr-offset');
  const outPointer = $('#tr-pointer');
  const outElement = $('#tr-element');

  let respectOffset = true;
  let grab = { x: 0, y: 0 };
  let pos = { x: 12, y: 12 };

  const paint = () => { puck.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`; };
  paint();

  segment($('#tracking'), 'offset', (v) => { respectOffset = v === 'true'; });

  draggable(puck, {
    onStart(e) {
      const m = metrics(rig, puck);
      if (respectOffset) {
        // Where they actually grabbed it (§2).
        grab = { x: e.clientX - (m.rig.left + pos.x), y: e.clientY - (m.rig.top + pos.y) };
      } else {
        // The bug: assume the centre, and the element jumps to the finger.
        grab = { x: m.pw / 2, y: m.ph / 2 };
      }
      outOffset.textContent = `${Math.round(grab.x)}, ${Math.round(grab.y)}`;
    },
    onMove(e) {
      const m = metrics(rig, puck);
      pos.x = clamp(e.clientX - m.rig.left - grab.x, 0, m.maxX);
      pos.y = clamp(e.clientY - m.rig.top - grab.y, 0, m.maxY);
      paint();
      outPointer.textContent = `${Math.round(e.clientX - m.rig.left)}, ${Math.round(e.clientY - m.rig.top)}`;
      outElement.textContent = `${Math.round(pos.x + grab.x)}, ${Math.round(pos.y + grab.y)}`;
    },
  });

  new ResizeObserver(() => {
    const m = metrics(rig, puck);
    pos.x = clamp(pos.x, 0, m.maxX);
    pos.y = clamp(pos.y, 0, m.maxY);
    paint();
  }).observe(rig);
}

/* ==========================================================================
   3 — Interruption. Left: a CSS transition retargeted from its logical value.
   Right: independent X and Y springs retargeted from the presentation value,
   carrying velocity through (§3).
   ========================================================================== */
{
  const HOME = { x: 12, y: 12 };
  const outCss = $('#int-css');
  const outSpring = $('#int-spring');
  const outVel = $('#int-vel');

  /* --- left: the transition, with the bug the skill describes -------------- */
  {
    const rig = $('#rig-css');
    const puck = $('#puck-css');
    // `logical` is what the code thinks the position is. It is only correct
    // when nothing is moving — which is exactly the trap.
    let logical = { ...HOME };
    let grab = { x: 0, y: 0 };

    const paint = () => { puck.style.transform = `translate3d(${logical.x}px, ${logical.y}px, 0)`; };
    paint();

    const painted = () => {
      const m = new DOMMatrixReadOnly(getComputedStyle(puck).transform);
      return { x: m.m41, y: m.m42 };
    };

    draggable(puck, {
      onStart(e) {
        const live = painted();
        const jump = Math.hypot(live.x - logical.x, live.y - logical.y);
        outCss.textContent = jump > 1 ? `jumped ${px(jump)}` : 'no jump';
        puck.style.transition = 'none';
        paint(); // ← starts from the logical value, not the painted one
        const m = metrics(rig, puck);
        grab = { x: e.clientX - (m.rig.left + logical.x), y: e.clientY - (m.rig.top + logical.y) };
      },
      onMove(e) {
        const m = metrics(rig, puck);
        logical.x = clamp(e.clientX - m.rig.left - grab.x, 0, m.maxX);
        logical.y = clamp(e.clientY - m.rig.top - grab.y, 0, m.maxY);
        paint();
      },
      onEnd() {
        logical = { ...HOME };
        puck.style.transition = motionReduced()
          ? 'transform 1ms linear'
          : 'transform 600ms cubic-bezier(0.32, 0.72, 0, 1)';
        paint();
      },
    });
  }

  /* --- right: two springs, one per axis ----------------------------------- */
  {
    const rig = $('#rig-spring');
    const puck = $('#puck-spring');

    const paint = () => {
      puck.style.transform = `translate3d(${sx.x}px, ${sy.x}px, 0)`;
    };
    // §3: decompose 2D motion into independent X and Y springs — a single
    // spring on the 2D distance desyncs when the axes have different velocity.
    const sx = new Spring({ from: HOME.x, damping: 0.8, response: 0.5, onChange: () => paint() });
    const sy = new Spring({ from: HOME.y, damping: 0.8, response: 0.5, onChange: () => paint() });
    paint();

    const vx = new VelocityTracker();
    const vy = new VelocityTracker();
    let grab = { x: 0, y: 0 };

    draggable(puck, {
      onStart(e) {
        // The velocity the puck was already carrying when you caught it. This
        // is what survives the interruption instead of being cut to zero.
        outSpring.textContent = 'no jump';
        outVel.textContent = `${Math.round(Math.hypot(sx.v, sy.v))} px/s`;
        // Stop the springs but keep their position — that position IS what is
        // on screen, so there is nothing to reconcile.
        sx.stop(); sy.stop();
        const m = metrics(rig, puck);
        grab = { x: e.clientX - (m.rig.left + sx.x), y: e.clientY - (m.rig.top + sy.x) };
        vx.clear(); vy.clear();
      },
      onMove(e) {
        const m = metrics(rig, puck);
        const nx = clamp(e.clientX - m.rig.left - grab.x, 0, m.maxX);
        const ny = clamp(e.clientY - m.rig.top - grab.y, 0, m.maxY);
        vx.add(nx, e.timeStamp);
        vy.add(ny, e.timeStamp);
        sx.set(nx); sy.set(ny);
      },
      onEnd() {
        if (motionReduced()) { sx.set(HOME.x); sy.set(HOME.y); return; }
        // §5: hand the release velocity to the spring — no seam between the
        // drag and the animation.
        sx.to(HOME.x, { velocity: vx.velocity });
        sy.to(HOME.y, { velocity: vy.velocity });
      },
    });
  }
}

/* ==========================================================================
   4 — Momentum projection (§6) with velocity handoff (§5).
   ========================================================================== */
{
  const rig = $('#rig-momentum');
  const puck = $('#puck-momentum');
  const mkRelease = $('#mk-release');
  const mkProjected = $('#mk-projected');
  const outVel = $('#mo-vel');
  const outProj = $('#mo-proj');
  const outTarget = $('#mo-target');
  const decel = $('#decel');
  const decelVal = $('#decel-val');

  let useProjection = true;
  let decelRate = 0.998;
  let y = 0;

  const spring = new Spring({ from: 0, damping: 0.8, response: 0.35, onChange: (x) => {
    puck.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }});

  const detents = () => {
    const m = metrics(rig, puck);
    return [0, m.maxX / 3, (m.maxX * 2) / 3, m.maxX];
  };

  const drawDetents = () => {
    $$('.detent', rig).forEach((d) => d.remove());
    const m = metrics(rig, puck);
    y = (m.h - m.ph) / 2;
    detents().forEach((d) => {
      const dot = document.createElement('span');
      dot.className = 'detent';
      dot.style.left = `${d + m.pw / 2}px`;
      dot.style.top = `${m.h - 14}px`;
      rig.append(dot);
    });
    puck.style.transform = `translate3d(${clamp(spring.x, 0, m.maxX)}px, ${y}px, 0)`;
  };
  drawDetents();
  new ResizeObserver(drawDetents).observe(rig);

  segment($('#momentum'), 'projection', (v) => { useProjection = v === 'true'; });
  decel.addEventListener('input', () => {
    decelRate = Number(decel.value);
    decelVal.textContent = decelRate.toFixed(3);
  });

  const track = new VelocityTracker();
  let grabX = 0;

  draggable(puck, {
    onStart(e) {
      spring.stop();
      const m = metrics(rig, puck);
      grabX = e.clientX - (m.rig.left + spring.x);
      track.clear();
      mkRelease.hidden = mkProjected.hidden = true;
    },
    onMove(e) {
      const m = metrics(rig, puck);
      const nx = clamp(e.clientX - m.rig.left - grabX, 0, m.maxX);
      track.add(nx, e.timeStamp);
      spring.set(nx);
    },
    onEnd() {
      const m = metrics(rig, puck);
      const v = track.velocity;
      const points = detents();

      // §6: project where the gesture is *going*, then snap to the nearest
      // detent to that point — not to the nearest detent to the release point.
      const projected = spring.x + (useProjection ? project(v, decelRate) : 0);
      const target = nearest(projected, points);

      mkRelease.hidden = false;
      mkRelease.style.left = `${spring.x + m.pw / 2}px`;
      mkProjected.hidden = !useProjection;
      mkProjected.style.left = `${clamp(projected + m.pw / 2, 2, m.w - 2)}px`;

      outVel.textContent = `${Math.round(v)} px/s`;
      outProj.textContent = useProjection ? px(projected - spring.x) : 'off';
      outTarget.textContent = `detent ${points.indexOf(target) + 1} of 4`;

      if (motionReduced()) { spring.set(target); return; }
      // §5: continue at the finger's exact velocity.
      spring.to(target, { velocity: v });
      tick(6);
    },
  });
}

/* ==========================================================================
   5 — Damping ratio + response, plotted.
   ========================================================================== */
{
  const canvas = $('#plot');
  const ctx = canvas.getContext('2d');
  const damp = $('#damp');
  const resp = $('#resp');
  const dampVal = $('#damp-val');
  const respVal = $('#resp-val');
  const outOver = $('#pa-over');
  const outSettle = $('#pa-settle');
  const outOmega = $('#pa-omega');
  const rig = $('#rig-param');
  const puck = $('#puck-param');

  const DURATION = 1.6; // seconds of trace

  /** Same integrator as Spring, run offline for the curve. */
  function simulate(damping, response, duration = DURATION, dt = 1 / 600) {
    const w = (2 * Math.PI) / response;
    let x = 0, v = 0;
    const out = [];
    for (let t = 0; t <= duration; t += dt) {
      out.push(x);
      const a = -2 * damping * w * v - w * w * (x - 1);
      v += a * dt;
      x += v * dt;
    }
    return { series: out, dt };
  }

  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  let at = 0; // which end the demo puck sits at
  const demo = new Spring({ from: 0, onChange: (x) => {
    const m = metrics(rig, puck);
    puck.style.transform = `translate3d(${x * m.maxX}px, ${(m.h - m.ph) / 2}px, 0)`;
  }});

  function draw() {
    const damping = Number(damp.value);
    const response = Number(resp.value);
    const { series, dt } = simulate(damping, response);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = 18;
    const top = pad;
    const bottom = h - pad;
    // Headroom so an overshoot of up to ~40% stays inside the frame.
    const yFor = (val) => bottom - (val / 1.45) * (bottom - top);
    const xFor = (t) => (t / DURATION) * w;

    // target line
    ctx.strokeStyle = token('--rule-strong');
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, yFor(1));
    ctx.lineTo(w, yFor(1));
    ctx.stroke();
    ctx.setLineDash([]);

    // the "response" instant — deliberately drawn so you can see it is not
    // where the motion stops
    ctx.strokeStyle = token('--gesture');
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(xFor(response), top);
    ctx.lineTo(xFor(response), bottom);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = token('--gesture');
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('response', xFor(response) + 4, top + 10);

    // the curve
    ctx.strokeStyle = token('--trace');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    series.forEach((val, i) => {
      const t = i * dt;
      const X = xFor(t);
      const Y = yFor(val);
      i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
    });
    ctx.stroke();

    // readouts
    const peak = Math.max(...series);
    outOver.textContent = `${Math.max(0, (peak - 1) * 100).toFixed(1)} %`;
    let settleIdx = series.length - 1;
    while (settleIdx > 0 && Math.abs(series[settleIdx - 1] - 1) < 0.01) settleIdx--;
    const settle = settleIdx * dt;
    outSettle.textContent = settle >= DURATION ? `> ${DURATION.toFixed(1)} s` : `${settle.toFixed(2)} s`;
    outOmega.textContent = `${((2 * Math.PI) / response).toFixed(1)} rad/s`;

    dampVal.textContent = damping.toFixed(2);
    respVal.textContent = response.toFixed(2);
  }

  function run() {
    at = at ? 0 : 1;
    demo.to(at, { damping: Number(damp.value), response: Number(resp.value) });
    if (motionReduced()) { demo.stop(); demo.set(at); }
  }

  damp.addEventListener('input', draw);
  resp.addEventListener('input', draw);
  damp.addEventListener('change', run);
  resp.addEventListener('change', run);
  $('#replay').addEventListener('click', run);

  $$('button[data-preset]', $('#parameters')).forEach((b) => {
    b.addEventListener('click', () => {
      const [d, r] = b.dataset.preset.split(',');
      damp.value = d;
      resp.value = r;
      draw();
      run();
    });
  });

  draw();
  new ResizeObserver(draw).observe(canvas);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
}

/* ==========================================================================
   6 — Rubber-banding (§9).
   ========================================================================== */
{
  const rig = $('#rig-band');
  const puck = $('#puck-band');
  const wall = $('#band-wall');
  const outOver = $('#rb-over');
  const outApplied = $('#rb-applied');
  const outRatio = $('#rb-ratio');

  let band = true;
  let y = 0;
  let limit = 0;

  const spring = new Spring({ from: 12, damping: 1, response: 0.35, onChange: (x) => {
    puck.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }});

  const layout = () => {
    const m = metrics(rig, puck);
    y = (m.h - m.ph) / 2;
    limit = Math.max(0, m.w * 0.55 - m.pw);
    wall.style.left = `${limit + m.pw}px`;
    wall.style.top = '0';
    wall.style.bottom = '0';
    wall.style.width = '1px';
    puck.style.transform = `translate3d(${spring.x}px, ${y}px, 0)`;
  };
  layout();
  new ResizeObserver(layout).observe(rig);

  segment($('#rubberband'), 'band', (v) => { band = v === 'true'; });

  let grabX = 0;
  draggable(puck, {
    onStart(e) {
      spring.stop();
      grabX = e.clientX - (rig.getBoundingClientRect().left + spring.x);
    },
    onMove(e) {
      const m = metrics(rig, puck);
      const raw = clamp(e.clientX - m.rig.left - grabX, 0, m.w);
      let applied = raw;
      if (raw > limit) {
        const overshoot = raw - limit;
        applied = band ? limit + rubberband(overshoot, m.w) : limit;
        outOver.textContent = px(overshoot);
        outApplied.textContent = px(applied - limit);
        outRatio.textContent = overshoot > 0 ? `${((applied - limit) / overshoot).toFixed(2)}×` : '—';
      } else {
        outOver.textContent = '0 px';
        outApplied.textContent = '0 px';
        outRatio.textContent = '1.00×';
      }
      spring.set(applied);
    },
    onEnd() {
      if (spring.x <= limit) return;
      if (motionReduced()) { spring.set(limit); return; }
      spring.to(limit);
    },
  });
}

/* ==========================================================================
   7 — The sheet. Detents, velocity-sign commit, rubber-band, a scrim, a
   parent layer pushed back, and blur that arrives with the surface (§12).
   ========================================================================== */
{
  const host = $('#sheet-host');
  const sheet = $('#sheet');
  const grabber = $('#sheet-grabber');
  const scrim = $('#sheet-scrim');
  const bg = $('#sheet-bg');
  const openBtn = $('#sheet-open');
  const outDetent = $('#sh-detent');
  const outVel = $('#sh-vel');
  const outProj = $('#sh-proj');
  const outWhy = $('#sh-why');

  let commitRule = 'velocity';
  let H = sheet.getBoundingClientRect().height || 260;
  // translateY values: 0 = full, H = dismissed.
  let detents = [0, H * 0.45, H];
  const names = ['full', 'half', 'closed'];

  const paint = (ty) => {
    const t = clamp(ty, -80, H);
    sheet.style.transform = `translate3d(0, ${t}px, 0)`;
    const progress = clamp(1 - t / H, 0, 1);

    // Dim to focus, and push the parent layer back (§12).
    scrim.style.opacity = String(progress);
    bg.style.transform = `scale(${1 - progress * 0.035}) translateY(${-progress * 6}px)`;

    // Materialize, don't just fade: blur and scale arrive together.
    if (document.documentElement.dataset.transparency !== 'reduce') {
      const blur = 4 + progress * 20;
      sheet.style.backdropFilter = `blur(${blur.toFixed(1)}px) saturate(180%)`;
      sheet.style.webkitBackdropFilter = sheet.style.backdropFilter;
    }
    // Fade only in the last stretch, so the surface reads as solid glass at
    // every detent and only dissolves as it leaves.
    sheet.style.opacity = String(clamp(progress * 4, 0, 1));
  };

  const spring = new Spring({ from: H, damping: 0.8, response: 0.3, onChange: paint });

  const layout = () => {
    H = sheet.getBoundingClientRect().height || H;
    detents = [0, H * 0.45, H];
    paint(spring.x);
  };
  const ro = new ResizeObserver(layout);
  ro.observe(host);
  paint(H);

  const settle = (target, why) => {
    const idx = detents.indexOf(target);
    outDetent.textContent = names[idx] ?? '—';
    outWhy.textContent = why;
    if (idx !== 2) tick(idx === 0 ? 10 : 6);
    if (motionReduced()) {
      // §14: a gentler, non-vestibular equivalent — no travel, just a fade.
      sheet.style.transition = 'opacity 200ms ease';
      spring.stop();
      spring.set(target);
      setTimeout(() => { sheet.style.transition = ''; }, 220);
      return;
    }
    spring.to(target);
  };

  openBtn.addEventListener('click', () => {
    settle(spring.x > detents[1] ? detents[1] : detents[0], 'button');
  });

  segment($('#sheet-bench'), 'commit', (v) => { commitRule = v; });

  const track = new VelocityTracker();
  let grabY = 0;

  const rig = { onStart(e) {
      spring.stop();
      grabY = e.clientY - (sheet.getBoundingClientRect().top);
      track.clear();
      outWhy.textContent = 'dragging';
    },
    onMove(e) {
      const hostTop = host.getBoundingClientRect().top;
      const sheetTop = host.getBoundingClientRect().height - H;
      let ty = e.clientY - hostTop - sheetTop - grabY;
      // §9: resist above the top detent rather than stopping dead.
      if (ty < 0) ty = -rubberband(-ty, H);
      ty = Math.min(ty, H);
      track.add(ty, e.timeStamp);
      spring.set(ty);
      outVel.textContent = `${Math.round(track.velocity)} px/s`;
    },
    onEnd() {
      const v = track.velocity;
      const projected = spring.x + project(v, 0.996);
      outVel.textContent = `${Math.round(v)} px/s`;
      outProj.textContent = px(projected);

      if (commitRule === 'position') {
        // The rule the skill argues against: ignore the throw entirely.
        settle(nearest(spring.x, detents), 'nearest position');
        return;
      }
      // §3/§6: a decisive flick uses the velocity *sign*; otherwise fall back
      // to the projected resting point.
      if (Math.abs(v) > 350) {
        const dir = Math.sign(v);
        const ordered = [...detents].sort((a, b) => a - b);
        const next = dir > 0
          ? ordered.find((d) => d > spring.x + 1) ?? ordered[ordered.length - 1]
          : [...ordered].reverse().find((d) => d < spring.x - 1) ?? ordered[0];
        settle(next, `velocity sign ${dir > 0 ? '↓' : '↑'}`);
      } else {
        settle(nearest(projected, detents), 'projected point');
      }
    },
  };

  draggable(grabber, rig);
  draggable(sheet, rig);
}

/* ==========================================================================
   8 — Size-specific tracking (§15).
   ========================================================================== */
{
  const sample = $('#type-sample');
  const rows = { xl: $('[data-size="xl"] .txt', sample), md: $('[data-size="md"] .txt', sample), sm: $('[data-size="sm"] .txt', sample) };
  const outs = { xl: $('#ty-xl'), md: $('#ty-md'), sm: $('#ty-sm') };

  const SETS = {
    optical: { xl: '-0.035em', md: '-0.018em', sm: '0.008em' },
    flat: { xl: '-0.01em', md: '-0.01em', sm: '-0.01em' },
  };

  const apply = (mode) => {
    const set = SETS[mode];
    for (const key of ['xl', 'md', 'sm']) {
      rows[key].style.letterSpacing = set[key];
      outs[key].textContent = set[key];
    }
  };
  apply('optical');
  segment($('#typography'), 'tracking', apply);
}
