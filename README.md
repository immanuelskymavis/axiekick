# Divekick Lunacia

A two-button fighting game starring the three Origins starter Axies, built for a Sky Mavis
internal gamejam. One hit ends a round. First to five wins the match.

- **[PITCH.md](PITCH.md)** — the one-page pitch
- **[docs/PRD.html](docs/PRD.html)** — the full PRD (open in a browser)
- **[game/index.html](game/index.html)** — the game

## Run it

No build step, no dependencies. Open `game/index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/game/`.

## Controls

| | Dive | Kick |
|---|---|---|
| **P1** | <kbd>A</kbd> | <kbd>S</kbd> |
| **P2** | <kbd>K</kbd> | <kbd>L</kbd> |
| **Gamepad** | A / ✕ | B / ○ |

Gamepads auto-assign to the first free player slot on their first button press.
<kbd>F1</kbd> hitboxes · <kbd>F3</kbd> perf · <kbd>M</kbd> mute.

Kick on the ground is a **kickback** — a backward hop, and your only way to retreat.
There is no walking; all movement comes from jumping, kicking and kicking back.

## The roster

| Axie | Class | Weapon | Plays like |
|---|---|---|---|
| **Olek** | Plant | Leaf tail | Shallow 32° arc, longest reach on the stage, whiffs over anyone who is already underneath him |
| **Buba** | Beast | Horn drill | Steep 55° dive at 14 u/f, smallest hitbox, 27 frames of recovery when he misses |
| **Puffy** | Aqua | Inflate | Hold DIVE at the apex to hover up to 14 frames; biggest hurtbox in the game while she does it |

Effective kick ranges, measured from the sim: Olek 200–420 units, Buba 140–260, Puffy
140–260. Round-start distance is 460, so nobody can win from the opening bell — someone
has to approach.

## How it is built

Single HTML file, vanilla JS, Canvas 2D. No framework and no bundler, because a jam demo
that anyone can open by double-clicking is worth more than a build pipeline.

The simulation is deliberately separable from everything else:

- `step(state, in0, in1)` is pure — same inputs, same state, every time. Verified by
  hashing 600 ticks of scripted input and comparing runs.
- Fixed 60 Hz tick with an accumulator loop, clamped at 5 ticks per frame.
- Inputs are a 2-bit mask per player per tick (`IN_DIVE | IN_KICK`).
- No `Math.random` and no wall-clock reads inside the sim. Starfields and trails are
  render-side only and never feed back into state.
- Swept segment-vs-circle hit tests, so Buba's 14 u/f dive cannot tunnel through anyone.

That is the groundwork for WebRTC lockstep and, later, rollback — see §08 of the PRD.

## Built vs. the PRD

Everything in the v1 scope is in: two buttons, one-hit rounds, FT5, 20-second timer,
Hold the Line, trades, three Axies, character select with lore flavour text, HUD, impact
VFX, procedural audio, gamepads, one-button rematch.

Deviations worth naming:

- **No Vite/TypeScript.** One static HTML file instead. Faster to ship, trivial to host,
  and it doubles as the published artifact.
- **Procedural art, not exported Origins assets.** The Axies are drawn with Canvas paths
  in-engine. The asset kit ships VFX, UI and SFX but not starter bodies, and the bodies
  live behind a Unity + Spine 3.8 pipeline that does not fit in the build window. Swapping
  in baked pose atlases later touches only `drawAxie()`.
- **Audio is synthesized** with WebAudio rather than pulled from the kit's 152 SFX files,
  for the same reason.
- **No F2 tuning overlay.** Character values live in the `CHARS` table at the top of the
  file; edit and reload.
- **Local versus only**, as scoped. Online P2P is the fast-follow.
