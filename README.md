# Bench — the apple-design skill under test

An evaluation site for the [`apple-design`](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)
skill. Eight rigs, each running one of the skill's claims as working code next to the version that
ignores it, with the live numbers on screen.

Every formula is the skill's own, unmodified — the momentum projection, the rubber-band function,
the damping-ratio/response spring mapping. No animation library, no framework.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | The page: eight benches, the claims they test, and the readouts |
| `styles.css` | Tokens and layout. Light and dark are both defined token-level |
| `spring.js` | The physics: `Spring`, `project()`, `rubberband()`, `VelocityTracker` |
| `benches.js` | The eight rigs |
| `build.mjs` | Inlines everything into `dist/bench.html`, a single self-contained file |
| `.claude/skills/apple-design/` | The installed skill |

## Running it

The page uses ES modules, so it needs to be served rather than opened from disk:

```sh
python3 -m http.server 8123   # then open http://localhost:8123/index.html
node build.mjs                # → dist/bench.html, one self-contained file
```

## What the benches measure

1. **Response** — real `pointerdown`-to-paint latency, press-feedback vs click-feedback
2. **Direct manipulation** — 1:1 tracking with and without the grab offset
3. **Interruptibility** — a CSS transition retargeted from its logical value vs a spring retargeted
   from the presentation value, both grabbable mid-flight
4. **Momentum projection** — `(v/1000)·d/(1−d)`, with the projected endpoint drawn next to the
   release point
5. **Spring parameters** — damping and response as sliders, plotted, with Apple's shipped presets
6. **Rubber-banding** — progressive resistance vs a hard stop, with the follow ratio shown
7. **A sheet** — detents, velocity-sign commit, rubber-band, scrim, interruption, reduced motion
8. **Typography** — size-specific tracking vs one value everywhere

## Findings

Written up on the page itself. The short version: the physics is real and correctly specified,
interruptibility is the load-bearing idea, and the visual sections (§12, §15) are the thinner half.
One measured qualification — the skill's "response is not a duration" warning only bites below
damping ~0.5; at damping 0.8–1.0 response predicts settle time within about 8%.

## Accessibility

Respects `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`. The first
two also have switches in the header so the reduced paths can be felt without changing system
settings.
