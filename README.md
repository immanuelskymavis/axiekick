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

<kbd>Esc</kbd> opens the menu — resume, restart the match, or quit to the title.
Gamepads auto-assign to the first free player slot on their first button press.
<kbd>F1</kbd> hitboxes · <kbd>F3</kbd> perf · <kbd>M</kbd> mute.

Kick on the ground is a **kickback** — a backward hop, and your only way to retreat.
There is no walking; all movement comes from jumping, kicking and kicking back.

## Modes

From the title screen: **local versus**, or **vs CPU** at three difficulties.

| | Reacts in | Kick window | Punishes a whiff |
|---|---|---|---|
| **Rookie** | 15 frames | ±84 units | 20% |
| **Veteran** | 8 frames | ±46 units | 60% |
| **Lunacian** | 3 frames | ±38 units | 95% |

The CPU is not special-cased anywhere in the simulation — it reads state and returns
the same 2-bit input mask a player does, so a CPU match steps through exactly the same
code as a human one. Its randomness comes from an LCG seeded per match and stored in
state, so a CPU round replays from its input log like any other.

One piece of geometry does most of the work. A committed divekick travels at a fixed
angle, so from height `h` it covers `h / tan(angle)` before reaching the opponent's
chest. The CPU jumps, watches that number fall, and presses Kick when it matches the
horizontal gap. Difficulty is how tight that window is, how stale its picture of the
opponent is, and how often it takes the fight to you.

Against a reference bot using the same geometry with a fixed ±44 window, over 8 matches:
Rookie wins 1 and loses rounds 15–39, Veteran wins 4 at 26–27, Lunacian wins 5 at 26–20.
A match runs 38–50 seconds, which is the number that matters for the demo queue.

## The art

The three Axies are the **official Origins Spine rigs**, taken from
[axieinfinity/unity-axie-gtk2d](https://github.com/axieinfinity/unity-axie-gtk2d)
(`Assets/AxieInfinity/AxieStandardAssets/Spines/starter-axies`) and played back by a
small Spine 3.8 runtime written for this game — bone hierarchy with `normal`/`noScale`
transforms, single-bone IK for the legs, rotate/translate/scale timelines with Spine's
bezier curves, slot attachment swaps, and region attachments drawn straight onto the 2D
canvas. The starter rigs use region attachments only — no meshes, no skinning — which is
what makes a runtime that size possible.

Animations come from the rig, so the Axies fight with their own moves:

| State | Animation |
|---|---|
| Idle, jump, land | `action/idle/normal`, `action/run`, `defense/hit-by-normal` |
| Kickback | `defense/evade` |
| Olek's divekick | `attack/melee/tail-smash` |
| Buba's divekick | `attack/melee/horn-gore` |
| Puffy's divekick | `attack/melee/tail-roll` |
| Losing a round | `defense/hit-by-normal-dramatic` |
| Winning a match | `activity/victory-pose-back-flip` |

`tools/pack_spines.py` fetches the upstream atlas, skeleton and page image, drops the
~30 animations the game never plays, and splices the result into `game/index.html` as a
data URI so the build stays one file:

```bash
python3 tools/pack_spines.py
```

## The arena and the noise

Every match is fought in one of nine Origins class arenas, picked at random, from
[axie-origins-asset-kit](https://github.com/axieinfinity/axie-origins-asset-kit)
(`Assets/OriginsKit/PvE/Backgrounds/class`). The art is zoomed so its fighting plane
lands on our floor line and dimmed under a gradient so a white HUD still reads over it.

Sound is the kit's too, and it is class-specific, so each Axie hits with the noise its
own class makes in Origins:

| | Olek (plant) | Buba (beast) | Puffy (aqua) |
|---|---|---|---|
| Dive | `plant_fly` | `beast_fly` | `aquatic_fly` |
| Kick | `plant_smash_attack` | `beast_gore_attack` | `aquatic_throw_attack` |
| KO | `plant_cast_hit` | `beast_cast_hit` | `aquatic_cast_hit` |

Plus `stunned` on a trade, `feather` on a kickback, `death_mark` when Hold the Line
appears, and `pvp` / `pve_1` as the battle and menu loops. These are battle-card sounds
with long tails — a 3.5-second whoosh on a jump you take twice a second turns to mud —
so `SFX_LEN` gives each event a length and the voice is faded out at it.

```bash
python3 tools/pack_kit.py
```

Backgrounds are resampled to 1440px wide and audio re-encoded to mono AAC, which is what
keeps 2.2 MB of media out of a 22 MB one.

## The roster

| Axie | Class | Weapon | Plays like |
|---|---|---|---|
| **Olek** | Plant | Leaf tail | Shallow 32° arc, longest reach on the stage; to catch someone already underneath him he has to kick late |
| **Buba** | Beast | Horn drill | Steep 55° dive at 14 u/f, smallest hitbox, 27 frames of recovery when he misses |
| **Puffy** | Aqua | Inflate | Hold DIVE at the apex to hover up to 14 frames; biggest hurtbox in the game while she does it |

Effective kick ranges, measured from the sim across kick timings: Olek 120–460 units,
Buba 80–280, Puffy 80–320. Round-start distance is 520, and no character can cover that
at any timing, so somebody has to approach.

Hurtboxes are ellipses fitted to each Axie's **body** attachment, measured off the rig at
load — so the box is whatever the art is, and horns, leaves, fins and tails are all
outside it. `BODY_FIT` trims them to 94% of the drawn body for the transparent margin the
packed region carries. Press <kbd>F1</kbd> to see them.

## How it is built

Single HTML file, vanilla JS, Canvas 2D. No framework and no bundler, because a jam demo
that anyone can open by double-clicking is worth more than a build pipeline.

The simulation is deliberately separable from everything else:

- `step(state, in0, in1)` is pure — same inputs, same state, every time. Verified by
  hashing 600 ticks of scripted input and comparing runs.
- Fixed 60 Hz tick with an accumulator loop, clamped at 5 ticks per frame.
- Inputs are a 2-bit mask per player per tick (`IN_DIVE | IN_KICK`).
- No `Math.random` and no wall-clock reads inside the sim. The CPU's LCG lives in state
  and is seeded when a match is created; starfields and trails are render-side only and
  never feed back into state.
- Swept segment-vs-ellipse hit tests (the world is squashed so the hurtbox is a unit
  circle), so Buba's 14 u/f dive cannot tunnel through anyone.

That is the groundwork for WebRTC lockstep and, later, rollback — see §08 of the PRD.

## Built vs. the PRD

Everything in the v1 scope is in: two buttons, one-hit rounds, FT5, 20-second timer,
Hold the Line, trades, three Axies on their official Origins rigs, character select with
lore flavour text, HUD, impact VFX, gamepads, one-button rematch — plus first-party
arenas and audio, an Esc menu, and a CPU opponent at three difficulties, which the PRD
did not ask for.

Deviations worth naming:

- **No Vite/TypeScript.** One static HTML file instead. Faster to ship, trivial to host,
  and it doubles as the published artifact.
- **A hand-written Spine runtime instead of a Unity export.** The rigs are the official
  ones, but nothing about the Unity + Spine 3.8 pipeline runs in a browser, so the game
  plays the skeletons directly. The procedural canvas Axies from the first build are still
  in `drawAxieShapes()` as the fallback for the frames before the atlas image decodes.
- **Synth voices are still in there**, but only as the fallback for events the kit has no
  obvious clip for, and for the whole game if the packed asset block is stripped out.
- **No F2 tuning overlay.** Character values live in the `CHARS` table at the top of the
  file, CPU difficulty in `DIFFS`, sound lengths in `SFX_LEN`; edit and reload.
- **Local versus only** for human-vs-human, as scoped. Online P2P is the fast-follow —
  the CPU fills the gap at the demo station when only one person is standing there.
