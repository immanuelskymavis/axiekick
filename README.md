# AxieKick

**Play it: https://immanuelskymavis.github.io/axiekick/**

A two-button fighting game starring six Origins starter Axies, built for a Sky Mavis
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

`tools/publish_pages.sh` pushes the current build to the `gh-pages` branch, which is what
the live URL serves.

## Controls

| | Dive | Kick |
|---|---|---|
| **P1** | <kbd>A</kbd> | <kbd>S</kbd> |
| **P2** | <kbd>K</kbd> | <kbd>L</kbd> |
| **Gamepad** | A / ✕ | B / ○ |

<kbd>Esc</kbd> backs out of whatever menu you are in, one step at a time, all the way
to the title. In a fight — or on the story ladder, where there is nowhere back to — it
opens the menu instead: resume, restart the match, or quit to the title.
Every menu in the game is clickable too: hover moves the cursor, click confirms, and
hovering an augment medallion explains it.
Gamepads auto-assign to the first free player slot on their first button press.
<kbd>F1</kbd> hitboxes · <kbd>F3</kbd> perf · <kbd>M</kbd> mute.

Kick on the ground is a **kickback** — a backward hop, and your only way to retreat.
There is no walking; all movement comes from jumping, kicking and kicking back.

## Modes

From the title screen: **local versus**, **online versus**, **story mode**, or **vs
CPU**. Picking one walks you through however many questions that mode has, one screen
each — VS CPU asks **how hard** and then **how you fight**, local versus asks only the
second, story asks which story. Each screen is a heading, a row of cards, and the same
two buttons, with dots showing what is left. **Augments** means each side drafts two
Land items before the bell; against the CPU you pick your own two and it takes two off
whatever you left on the table.

`Esc` → **SETTINGS** for master/music/SFX volume, the announcer, screen shake, and
rebindable controls with a reset. Everything persists.

### Stages

Local versus and VS CPU pick their arena on a stage screen — nine Origins class arenas
by name, plus RANDOM. Online rolls a shared arena from the connection seed (both sides
have to land in the same place) and Arcade keeps the surprise.

### Tutorial

Five prompts, about half a minute: jump, divekick, kickback, spend the Kick Meter on a
special, land a hit. **HOW TO** on the menu header.

### Story mode

Ten fights, three choices, three lives, and an arc. Each Axie has its own — a title
card before stage 1, a midpoint card at stage 6, and a finale if you clear all ten, set
over their class arena in their own colours. Two lines of dialogue open every stage,
drawn from a bank of four taunts and four replies per character. Stages 1–3 are single rounds, 4–6 first to 3,
7–10 first to 5; the CPU climbs Rookie → Veteran → Lunacian → Nightmare, and from stage 4
the opponent is drafting augments of its own — two at first, five by stage 9.
Win stages 3, 6 and 9 and you pick one of three **Land items** — real items from the
gtk2d sheet, each one a named augment with its own effect and lore. They are deliberately
loud: a third more reach, a third faster, a third smaller, a hitbox two thirds bigger, an
arc 14° flatter, whiffs that cost you almost nothing. Six bend a rule instead (an extra
air jump, an armed kickback, a quarter-second hover, an opponent a quarter slower, trades
that score for you, a first whiff with no recovery at all); three are legendary and only
appear in the last draft (survive the first hit of every fight, two extra lives, or all
of it at once). Hover any medallion — on the ladder or mid-fight — to see what it does.

Every stage opens with an exchange written for **that matchup** — all 36 pairs,
mirrors included, both directions. Momo needling Venoki about going over the door gets
a different answer than Buba trying to barge through it.

**Nightmare Story** is the same ten stages with every opponent a difficulty tier higher
and carrying two more augments, and the whole thing runs under a violet wash so you can
tell which one you are in from across the room. It costs one **Nightmare Key**; the demo
starts you with 100.

The random rungs draw from the roster minus whoever you just fought, so no two stages in
a row hand you the same Axie — and the rung before the Reflection will not spend it
early.

**Level 10 is your Reflection**: the Axie you beat on level 1, carrying the exact three
augments you drafted. Whatever you decided was strong, you have to beat.

Augments are a modifier table applied when a match is created, so the simulation never
learns what an augment is — only Ward (absorb a hit) and Ironroot (trades score for you)
needed a flag in the round-end path. Full design in
**[docs/ARCADE-PRD.html](docs/ARCADE-PRD.html)**.

Tuned against a sparring bot with a human-shaped 12-frame reaction delay over 18 runs:
median run ends at stage 5, one of eighteen clears all ten. Augments are deliberately
enormous now — Buba with Blade, Duel and Crown goes from reach 50 to 118 and dive speed
14 to 32 — and the opponents draft from the same pool, so doubling them made fights
swingier rather than easier.

| | Reacts in | Kick window | Punishes a whiff |
|---|---|---|---|
| **Rookie** | 15 frames | ±84 units | 20% |
| **Veteran** | 8 frames | ±46 units | 60% |
| **Lunacian** | 1 frame | leads the target | always |
| **Nightmare** | 1 frame | leads the target | always, and never stands still |

Rookie and Veteran fire whenever the gap is roughly right. Lunacian plays a different
game: it solves for where you will be when its weapon arrives rather than where you are
now, it only jumps when you are already committed or out of its reach, it swings Venoki's
kickback as an attack and floats Puffy's inflate to make you whiff, and if the clock
would hand it the round on Hold the Line it simply stands still and lets it.

The smart tiers spend meter on specials too. Nightmare is Lunacian with the patience
removed: it dodges what is genuinely aimed at it
and then attacks in every other situation, so there is no neutral to hide in.

Measured against a sparring bot with a human-shaped 12-frame reaction delay, over 24
matches, with both sides using meter: Rookie 0, Veteran 6, Lunacian 7, **Nightmare 11**
out of 12. All 36 character pairings finish without stalling, and two Lunacians against
each other still resolve.

The CPU is not special-cased anywhere in the simulation — it reads state and returns
the same 2-bit input mask a player does, so a CPU match steps through exactly the same
code as a human one. Its randomness comes from an LCG seeded per match and stored in
state, so a CPU round replays from its input log like any other.

One piece of geometry does most of the work. A committed divekick travels at a fixed
angle, so from height `h` it covers `h / tan(angle)` before reaching the opponent's
chest. The CPU jumps, watches that number fall, and presses Kick when it matches the
horizontal gap. Difficulty is how tight that window is, how stale its picture of the
opponent is, and how often it takes the fight to you.

The reference bot for those numbers uses the same geometry with a fixed ±44 window.
A match runs 39–47 seconds, which is the number that matters for the demo queue.

## Meter, specials and Kick Factor

Committing a divekick fills the **Kick Meter** — the three-cell bar in your bottom
corner. Three kicks buys one special, spent with **DIVE + KICK together** (either order; the special cancels whatever that
first press started). One per Axie, and each one is that character's idea taken too far:

| Axie | Special | |
|---|---|---|
| Olek | **TAIL SWEEP** | a flat lunge along the floor nobody jumps over in time |
| Buba | **METEOR** | cancels whatever he was doing into a straight drop |
| Puffy | **BURST** | pops and crosses the stage flat out |
| Pomodoro | **SPLIT** | fires the angle he was aiming at, half again as fast |
| Venoki | **COIL** | leaves, and takes the whole doorway with him |
| Momo | **DIVEBOMB** | turns the second wind into a stoop |

**Kick Factor** is the comeback rule: fall two rounds behind and you get faster, jump
higher and recover quicker, a little more for every round after that, up to three. It
shows as an ember aura on the fighter and a tag on the HUD. Nobody has to earn it and
nobody can turn it off — it exists so a 0–4 match is still worth watching.

Mirror matches recolour the second Axie, so Olek vs Olek is legible.

## Season pass

A shallow prototype of a live-service loop, built to show the shape rather than to take
anyone's money. **Nothing here charges anything** — the pass is free in this build, the
prize pool is a mock, and there is no payment code.

The reward track is one horizontal run with a rail through it, the way a season pass
reads everywhere else. It scrolls — wheel, drag, or the arrows — and parks itself on the
tier you are working towards. The rail fills node to node rather than point to point,
because the thresholds climb 10, 25, 45 … 400 while the nodes are evenly spaced.

- **10 challenges** in the pool; six are live at a time (two daily, two weekly, two
  seasonal), rotating off the date so it works without a server. Easy/medium/hard, worth
  5 to 100 points.
- **Points are always yours.** Challenges pay whether or not you own the pass; what the
  pass unlocks is the right to *claim* the reward track. Buy it after a week of playing
  and every tier you already earned opens at once.
- **One season**, always 30 days, one pass at $5 (free here). It also unlocks **Momo**.
- **10 tiers** of rewards, each one rendered on the track as the thing you get: the
  Nightmare Key item, or the actual Axie wearing the skin. Five **skins** — a palette
  shift plus a face swap using the rig's own alternate eyes and mouths, so Ember Buba is
  angry and Ruin Warden Venoki has his eyes shut. Equip them on the **SKINS** screen or
  by clicking the chip on a character card.
- **Prize pool** on the main menu, ticking upward, captioned *leaderboard coming soon*.
  It is a seeded number plus whatever this machine "spent"; the code says so.

Menus are flat, and an edge means you can press it: buttons and whatever the cursor is
on get a stroke in their own colour, and a panel that is only holding information gets a
bar along its top instead of a box around it. There was an Origins parchment-and-stone nine-slice behind all
of this for a while; it read as clutter at menu density, and its border covered about
19px of every panel edge against the 13 the layouts were told about, so half the screens
were quietly fighting their own frame. The Origins art that carries meaning stays — the
ladder nodes, the augment medallions and their avatar rings, the Nightmare Key.

Ranked matchmaking does not exist, so for the demo a CPU match counts as ranked. That is
a deliberate cheat and the only one.

## Online

Delay-based lockstep over a WebRTC data channel, with the offer and answer passed by
hand. There is no signalling server, no lobby and nothing deployed — which also means
nothing to stand up before a test and nothing to keep running after it.

Both players open **https://immanuelskymavis.github.io/axiekick/**, then:

1. One of you picks **PLAY ONLINE → HOST A MATCH** and sends the link it generates over
   Slack. The host is player 1, on the left.
2. The other opens that link. It joins automatically and produces a reply code.
3. They send the reply code back; the host pastes it and hits **Connect**. You land on
   character select together.

The invite lives in the URL fragment, which browsers never send to a server — so the
"host" in "GitHub Pages hosting" only ever serves the same static file to both of you.
It never sees a match. There is also a manual **JOIN A MATCH** box if you would rather
paste the code than open a link.

Not the published Claude artifact, though: that page blocks the STUN lookup at the CSP
level and falls back to host candidates only — fine for two laptops on one office wifi,
useless between continents. The panel says so when it happens.

How it works, and what it costs:

- Inputs for frame *F* are decided at frame *F − delay*. Both peers run the same
  `step()` over the same input pairs, so neither ever has to send game state.
- The host picks the delay from the round trip it can actually measure —
  `round(rtt/2 / 16.7ms) + 2`, clamped to 3–14 frames — and tells the guest. Toronto to
  Ho Chi Minh City is around 250ms, so expect **10 frames (~170ms) of input lag**. That
  is the honest price of delay-based lockstep at that distance, and the reason rollback
  is next: it needs nothing new from this transport, which already carries a full input
  history.
- The channel is unordered and unreliable on purpose, and every packet re-sends the last
  24 frames of input (12 bytes a tick), so a dropped datagram heals on the next tick
  instead of stalling the match waiting for a retransmit.
- A state hash goes across every 30 frames. If the two ever disagree the HUD says
  `DESYNC @ frame` instead of quietly drifting.
- Ping, delay, stall count and worst stall are on screen for the whole match.

Verified end to end between two browser contexts over a real data channel: a full FT5
match plus a rematch, 2,228 frames, 73 hash checkpoints, zero desyncs; and again through
the link handshake, with STUN returning server-reflexive candidates, the host's chosen
delay propagating to the guest, and both sides agreeing on every checkpoint.

**Not yet verified across continents** — that test needs two people, and it is the one
that matters. If it will not connect at all, the cause is NAT rather than netcode: add a
TURN relay to the `ICE` list in `game/index.html` and try again.

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

…and the same three rows again for Pomodoro (bug), Venoki (reptile) and Momo (bird).

Plus `stunned` on a trade, `feather` on a kickback, `death_mark` when Hold the Line
appears, and `pvp` / `pve_1` as the battle and menu loops. These are battle-card sounds
with long tails — a 3.5-second whoosh on a jump you take twice a second turns to mud —
so `SFX_LEN` gives each event a length and the voice is faded out at it.

### The announcer

The one thing in the build that is not first-party Axie art. The Origins kit has no
voice lines at all, and the announcer used to be the browser's own speech synthesis —
which could say anything, in whatever voice the machine happened to have, and none of it
sounded like a fighting game. It is now
[Kenney's Voiceover Pack (Fighter)](https://kenney.nl/assets/voiceover-pack-fighter),
**CC0**, no attribution required, free for commercial use.

Fourteen of its forty-five lines are packed — only the ones that map onto something the
game actually does: `fight`, `round 1`–`round 5`, `final round` at match point,
`sudden death` when Hold the Line appears, `time`, `it's a tie` on a trade, `winner`,
`flawless victory`, `choose your character`, and `game over` when a run ends. The rest
of the time it says nothing, which is the trade: a real voice saying fewer words beats a
robot saying all of them. Still off in settings for anyone who hates it.

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
| **Puffy** | Aqua | Inflate | Hold DIVE at the apex to hang for 24 frames and sail forward while she does it — a stall that is also an approach |
| **Pomodoro** | Bug | Aimed hang | The highest jump in the game, and holding KICK in the air sweeps the dive from 36° to 78°. Release to fire |
| **Venoki** | Reptile | Armed retreat | His kickback swings wide for 20 frames and kills out past 200 units, so crowding him is its own mistake |
| **Momo** | Bird | Second wind | One extra jump, any time she's airborne — bait the whiff, then take the air back |

Effective kick ranges, measured from the sim across kick timings: Olek 120–460 units,
Pomodoro 60–420 (he chooses), Momo 140–360, Puffy 60–300, Buba 60–280, Venoki 60–280. Round-start
distance is 520, and no character can cover that at any timing, so somebody has to
approach.

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
- **Synth voices are still in there** as the fallback for events the kit has no obvious
  clip for, and for the whole game if the packed asset block is stripped out.
- **No F2 tuning overlay.** Character values live in the `CHARS` table at the top of the
  file, CPU difficulty in `DIFFS`, sound lengths in `SFX_LEN`; edit and reload.
- **Local versus only** for human-vs-human, as scoped. Online P2P is the fast-follow —
  the CPU fills the gap at the demo station when only one person is standing there.
