# ABOMINAXIE

Start as a cute Axie. Eat. Mutate every level. End as a comical abomination.

A survivors-style roguelite prototype built from the ABOMINAXIE one-pager: one biome,
a ten-minute run, four bosses, and every Axie part in the Origins starter rigs available
as a mutation.

## Run it

Serve the repo root and open `/abominaxie/`:

```bash
python3 -m http.server 8080   # then http://localhost:8080/abominaxie/
```

`assets.js` and `chimeras.js` are generated; rebuild them with:

```bash
python3 tools/abx_pack.py                                   # rigs, parts, UI, VFX, audio
NODE_PATH=$(npm root -g) node tools/abx_bake.mjs            # chimera + banner sprite sheets
```

Both fetch their sources (`axieinfinity/unity-axie-gtk2d`, `axieinfinity/axie-origins-asset-kit`)
into `.cache/abx` on first run.

## Controls

<kbd>WASD</kbd> / arrows, a gamepad stick, or drag anywhere on a touch screen. Attacks are
automatic. <kbd>1</kbd>–<kbd>4</kbd> pick a mutation, <kbd>R</kbd> rerolls, <kbd>Esc</kbd> pauses,
<kbd>M</kbd> mutes. `?debug` adds <kbd>L</kbd> level up, <kbd>T</kbd> +30 s, <kbd>K</kbd> clear the screen, <kbd>G</kbd> god mode.

## How it plays

- **Pick 1 of 6 starters** (Buba, Olek, Puffy, Pomodoro, Venoki, Momo). Each has one awake
  part: Buba's horn gores, Olek's tail sweeps, Puffy's back fires a volley, Pomodoro's ears
  buzz, Venoki's mouth bites, Momo's eyes glare. The other five parts are asleep.
- **Every part is a weapon.** The slot decides what it does (horn = frontal ram, mouth = bite
  and heal, back = radial volley, tail = ring, eyes = homing glare, ears = aura and pickup
  range, chimera limbs = orbiting claws). The class of the Axie it came from decides the
  flavour: beast hits hard, plant heals, aquatic slows, bug poisons, bird is fast, reptile
  shoves and stuns, dusk crits, chimera parts hit for +60%.
- **Eat** the fruit enemies drop. **Level up → pick 1 of 3** mutations. The preview on the
  level-up screen shows your body with the hovered mutation already on it.
  - Tier 1: swap a part for another Axie's (any of the 16 standard starters), or awaken one.
  - Tier 2: evolve a part: it gets bigger, hits harder, fires faster.
  - Tier 3 (level 4+): grow a duplicate (three horns), or misplace a part (eyes on the tail).
  - Tier 4 (level 8+): parts that were never Axie, cut from the chimera rigs: werewolf arm,
    alpha antler, slime shell, a cockroach. Replacing a slot with one locks it. Rarely, a whole
    second Axie as a tail.
- **Abomination meter** (Cute → Weird → Mutant → ABOMINATION): every odd part raises it.
  Higher meter = tougher, denser waves and more XP.
- **Class sets**: three parts of one class unlock a set bonus.
- **Land item chests** drop from elites and bosses: pick 1 of 3 relics.
- **Bosses** telegraph with the Origins intent icons: Mommy Bear (2:30), Alpha Wolf (5:00),
  Slime Fusion (7:30), and the Werewolf (9:00). Eat the Werewolf to win.
- **Hooks**: a downloadable creature card at the end of every run, a Codex of every part you
  have grafted (gold NEW tag on undiscovered ones), and a daily seed.

## How it is built

The fifteen standard Origins starter rigs share one 28-bone skeleton and one set of slot
names. `abx_pack.py` crops every region of every rig into shared sheets, so the game's small
Spine 3.8 runtime (the same one AxieKick uses) can draw any rig's horn on any other rig's
horn bone, a copy of it fanned out beside it, or Momo's eyes on Buba's tail. Moved parts keep
the world orientation they were drawn in.

The chimeras use meshes, deforms and constraints that small runtime does not support, so
`abx_bake.mjs` renders them once with the official spine-ts 3.8 canvas runtime in headless
Chromium and ships the frames. The Origins Victory / Defeated banners are baked the same way.

Assets used: 16 starter rigs; 26 chimera parts and 20 chimera enemies; chimera portraits;
intent icons; part icons, class icons and all part cards; riddle-card frames, boss/avatar
frames; Land items; class backgrounds and the metamorph backdrop; VFX textures (fruit,
leaves, feathers, bubbles, impacts, slashes, glow, bag); class battle SFX and the PvE music.
