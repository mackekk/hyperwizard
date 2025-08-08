Roadmap (high level)
V0.1 – Baseline playable build (done).

Visuals – Neon sky, warp streaks, controlled glows (incremental).

Mechanics – Run boost tuning, jump arcs, polish collisions.

Content – Tricksters & hyper-creatures variants, portals, spells.

UX – Debug overlay (fps/draw calls), simple menu, pause/reset.


Current Game State (baseline)
Controls: ←/→ move, SPACE jump, SHIFT/X run, S attack, R restart

Known safe settings: streakCount = 30 (warp streaks), no optional chaining in hot paths

Collision: simple AABB vs tiles (baseline; corner-snag minimized)

Perf Notes
Aim for ≤ 8ms draw time/frame at 60 FPS.

Expensive effects (shadowBlur, many line strokes) should be ramped gradually.

Profile before and after each visual change.

Folder Structure
css
Kopiera
Redigera
src/
  components/
    HyperWizard.tsx   # canvas game component
  App.tsx
  main.tsx
index.html



---

# `docs/AGENT_BRIEF.md` (Cursor agent instructions)

```md
# Agent Brief – HyperWizard

## Mission
Help develop a small, fast canvas platformer in React/TypeScript, with psychedelic visuals and responsive controls. Maintain stability, performance, and minimal complexity.

## Tech & Constraints
- **React + TypeScript** (Vite)
- **Node 22.14.0** (nvm-windows). Always ensure `nvm use` respects `.nvmrc (22.14.0)`.
- **No additional libraries** unless explicitly approved (keep dependency surface tiny).
- **Canvas 2D API** only; no WebGL without approval.

## Definition of Done (per change)
- App initializes cleanly (no console errors).
- Maintains ~60 FPS locally; draw time ≤ 8ms avg.
- No regressions in controls: SPACE jump, SHIFT/X run, R restart.
- TypeScript passes `npm run typecheck`.

## Guardrails
- Avoid optional chaining in **hot loops** / collision to minimize transpile/compat glitches; prefer explicit bounds checks.
- Keep `streakCount` and `shadowBlur` modest; ramp visuals gradually.
- If changing tile size, physics constants, or camera behavior, **document the change** in this file and the README.
- Do not introduce global state outside the component without approval.

## Code Style
- Strong typing over `any`.
- Pure helpers where possible. Keep side effects near the main loop.
- Small, named functions (e.g., `drawBackground`, `drawTiles`, `rectVsTiles`).

## File Layout
- Core component lives at `src/components/HyperWizard.tsx`.
- If complexity grows, split into:
  - `engine/collision.ts` (tile/AABB helpers)
  - `engine/physics.ts` (integrators/constants)
  - `engine/render.ts` (background/world/hud)
  - but keep default single-file until needed.

## Performance Budget
- Baseline target machine: modern laptop.
- Track:
  - Frame time (paint/draw) before/after changes.
  - Number of draw calls per frame.
- Avoid large shadows or hundreds of strokes in one frame without profiling.

## Test Plan (per PR)
1. Boot app (`npm run dev`), confirm no “Initializing environment” stalls.
2. Move, run, jump; verify collisions across edges/ledges.
3. Run forward ≥ 3 screens to ensure no “invisible wall” snags.
4. If visuals changed, compare FPS before/after.

## Tasks You May Do Without Asking
- Refactor functions inside `HyperWizard.tsx` for clarity (no behavior change).
- Add small visual tweaks that don’t exceed perf budget.
- Improve TypeScript typings and comments.
- Add a gated debug overlay (toggle via key) that shows fps/draw counts.

## Tasks Requiring Approval
- Adding third-party libraries.
- Changing physics constants or tile size.
- Switching to WebGL or a different renderer.
- Restructuring folders beyond the plan above.

## Commands Cheat Sheet
```bash
nvm use         # reads .nvmrc
npm run dev     # start dev server
npm run build   # production bundle
npm run preview # serve built assets
npm run typecheck
