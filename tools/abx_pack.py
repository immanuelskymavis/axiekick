#!/usr/bin/env python3
"""Pack everything ABOMINAXIE draws or plays into abominaxie/assets.js.

Sources (shallow sparse clones, cached under .cache/abx):
  axieinfinity/unity-axie-gtk2d       starter Spine rigs, chimera atlases, part icons/cards
  axieinfinity/axie-origins-asset-kit portraits, intents, VFX, UI, backgrounds, audio

Every region of every standard starter rig is cropped upright into shared
sheets, so any Axie's horn can sit on any other Axie's horn bone: the fifteen
standard starters share one 28-bone rig and one set of slot names. That shared
rig is the whole mutation system.

    python3 tools/abx_pack.py
"""
import base64, io, json, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(HERE, ".cache", "abx")
OUT = os.path.join(HERE, "abominaxie", "assets.js")
GTK = os.path.join(CACHE, "gtk2d")
KIT = os.path.join(CACHE, "kit")
SPINES = os.path.join(GTK, "Assets/AxieInfinity/AxieStandardAssets/Spines")
SPRITES = os.path.join(GTK, "Assets/AxieInfinity/AxieStandardAssets/Sprites")
OK = os.path.join(KIT, "Assets/OriginsKit")

REPOS = {
    GTK: ("https://github.com/axieinfinity/unity-axie-gtk2d.git",
          ["Assets/AxieInfinity/AxieStandardAssets/Spines/*",
           "Assets/AxieInfinity/AxieStandardAssets/Sprites/axie-part-icon/*",
           "Assets/AxieInfinity/AxieStandardAssets/Sprites/axie-class-icon/*",
           "Assets/AxieInfinity/AxieStandardAssets/Sprites/axie-part-cards/*",
           "images/*"]),
    KIT: ("https://github.com/axieinfinity/axie-origins-asset-kit.git",
          ["Assets/OriginsKit/PvE/*", "Assets/OriginsKit/Textures/Vfx/*",
           "Assets/OriginsKit/Audio/*", "Assets/OriginsKit/BattleUI/*"]),
}

# id: (folder, file stem, class, display name). Names the Origins roster gives
# are used as-is; the rest are named for what they look like.
STARTERS = {
    "buba":     ("01-buba-beast", "buba", "beast", "Buba"),
    "olek":     ("02-olek-plant", "olek", "plant", "Olek"),
    "puffy":    ("03-puffy-aquatic", "03-puffy-aquatic", "aquatic", "Puffy"),
    "ena":      ("04-ena-plant", "04-ena-plant", "plant", "Ena"),
    "sprout":   ("04-support-plant", "04-support-plan", "plant", "Sprout"),
    "brawler":  ("05-dps-beast", "05-dps-beast", "beast", "Brawler"),
    "pomodoro": ("06-pomodoro-bug", "06-pomodoro-bug", "bug", "Pomodoro"),
    "venoki":   ("07-venoki-reptile", "07-dps-reptile", "reptile", "Venoki"),
    "machito":  ("08-machito-reptile", "08-machito-reptile", "reptile", "Machito"),
    "fin":      ("09-dps-aquatic", "09-dps-aquatic", "aquatic", "Fin"),
    "bramble":  ("10-hybrid-plant", "10-hybrid-plant", "plant", "Bramble"),
    "shilin":   ("11-shilin-bug", "11-dps-bug", "bug", "Shilin"),
    "momo":     ("12-momo-bird", "12-momo-bird", "bird", "Momo"),
    "tusk":     ("13-support-beast", "13-support-beast", "beast", "Tusk"),
    "talon":    ("14-dps-bird", "14-dps-bird", "bird", "Talon"),
    "dusky":    ("15-support-dusk", "15-support-dusk", "dusk", "Dusky"),
}
PLAYABLE = ["buba", "olek", "puffy", "pomodoro", "venoki", "momo"]

KEEP_ANIMS = [
    "action/idle/normal", "action/run", "action/move-forward",
    "defense/hit-by-normal", "defense/hit-by-normal-dramatic",
    "activity/evolve", "activity/eat-bite", "activity/victory-pose-back-flip",
    "attack/melee/horn-gore", "attack/melee/mouth-bite", "attack/melee/tail-smash",
    "attack/ranged/cast-high",
]

# Tier 4: parts that were never Axie. (chimera, atlas region, slot it grafts
# onto, x, y, rotation, scale) - x/y/rotation in that slot's bone space.
CHIMERA_PARTS = {
    "werewolf-claw":   ("werewolf", "arm-right", "limb", "Werewolf Arm"),
    "werewolf-jaw":    ("werewolf", "jaw-upper", "mouth", "Werewolf Jaw"),
    "werewolf-ear":    ("werewolf", "ear-left", "ears", "Werewolf Ear"),
    "alpha-antler":    ("wolf-alpha", "horn-01", "horn", "Alpha Antler"),
    "alpha-skull":     ("wolf-alpha", "Skull-01", "back", "Alpha Skull"),
    "alpha-tail":      ("wolf-alpha", "tail", "tail", "Alpha Tail"),
    "alpha-paw":       ("wolf-alpha", "paw-front-left", "limb", "Alpha Paw"),
    "fishwolf-tail":   ("wolf-aquatic", "tail", "tail", "Fishwolf Tail"),
    "fishwolf-scale":  ("wolf-aquatic", "scale", "back", "Fishwolf Scale"),
    "fishwolf-tongue": ("wolf-aquatic", "tongue-out", "mouth", "Long Tongue"),
    "graywolf-jaw":    ("wolf-gray", "jaw-upper", "mouth", "Gray Wolf Jaw"),
    "treant-branch":   ("treant-flowering", "branch", "horn", "Treant Branch"),
    "treant-flower":   ("treant-flowering", "flower", "back", "Treant Bloom"),
    "treant-hand":     ("treant-fighter", "hand-right", "limb", "Treant Fist"),
    "slime-shell":     ("slime-defense", "shell", "back", "Slime Shell"),
    "slime-eye":       ("slime-attack", "eyes-01", "eyes", "Goo Eyes"),
    "slime-horn":      ("slime-support", "horn", "horn", "Goo Horn"),
    "fusion-lotus":    ("slime-fusion", "lotus", "back", "Fusion Lotus"),
    "fusion-eye":      ("slime-fusion", "eye-left", "eyes", "Fusion Eye"),
    "beetle-wing":     ("dryad-fighter", "beetel-wing-right", "back", "Beetle Wing"),
    "mushroom":        ("dryad-ranger", "ganoderma-01", "horn", "Ganoderma"),
    "bear-paw":        ("bear-dad", "hand-left", "limb", "Bear Paw"),
    "bear-tomato":     ("bear-dad", "tomato", "back", "Tomato?"),
    "bear-shuriken":   ("bear-dad", "shuriken", "back", "Shuriken Rack"),
    "cockroach":       ("bear-mom", "cockroach", "back", "Cockroach Friend"),
    "mommy-horn":      ("bear-mom", "horn", "horn", "Mommy Horn"),
}

PORTRAITS = ["alpha-wolf", "aqua-alpha-wolf", "aqua-slime-atk", "aqua-slime-boss",
             "aqua-slime-def", "aqua-slime-sup", "aqua-wolf", "daddy-bear",
             "dryad-fighter", "dryad-mage", "dryad-ranger", "flowering-treant",
             "forest-slime-fighter", "forest-slime-flower", "gray-wolf", "mommy-bear",
             "slime", "treant-fighter", "treant", "werewolf"]
INTENTS = ["StrongAttack", "DangerousAction", "AttackRanged", "AttackMelee",
           "Buff", "SecretAction", "StrongDefend"]
VFX = {  # name: (file, tint-able white mask?)
    "fruits": "Fruits_2x2_Tx.png", "leaves": "Leaves_TX.png", "feather": "Feather_TX.png",
    "rock": "Rock_01_TX.png", "impact": "Impact_Element_TX.png", "slash": "Slash_Ray_TX.png",
    "bite": "BITE_mesh_TX.png", "nova": "Circle_Nova_TX.png", "glow": "glow.png",
    "bubble": "bubble_round3.png", "star": "Star_bubble_TX.png", "confetti": "Confetti_Tx.png",
    "smash": "Smash_ATK_07_TX.png", "spark": "Spark_Stretch_TX.png", "splat": "water_2x2_2_TX.png",
    "cloud": "cloud_2x2_hard_softshadow.png", "lightning": "lightning_02_TX.png",
    "boom": "sharp_red.png", "zz": "text_ah_zz.png", "flame": "FlameFlowers_TX.png",
    "beam": "light_Ray_01_TX.png", "crack": "Crack_TX.png", "projectile": "projectile_Vertical_TX.png",
    "sword": "Sword_DMG_TX.png", "fear": "Fear_Face_TX.png", "bag": "Secret_Bag_TX.png",
}
UI = {
    "frame_back": "PvE/UI/Frames/frame_back.png", "frame_border": "PvE/UI/Frames/frame_border.png",
    "star": "PvE/UI/Frames/star.png", "slider_bg": "PvE/UI/Frames/slider-bg.png",
    "slider_fill": "PvE/UI/Frames/slider-fill.png", "avatar_frame": "PvE/UI/InBattle/avatar_frame.png",
    "boss": "PvE/UI/Chapter/icon_stage_boss.png", "elite": "PvE/UI/Chapter/icon_stage_elite.png",
    "normal": "PvE/UI/Chapter/icon_stage_normal.png", "name_panel": "PvE/UI/InBattle/name_panel.png",
    "hp_big": "PvE/UI/HpBar2/hp-bar-big.png", "hp_fill_big": "PvE/UI/HpBar2/hp-big.png",
    "shield": "PvE/UI/HpBar/icon-shield-up.png",
}
for c in ["aquatic", "beast", "bird", "bug", "plant", "reptile", "dawn", "dusk", "merch", "question"]:
    UI["card_" + c] = f"PvE/UI/Chapter/riddle_card_{c}.png"
BACKGROUNDS = ["plant", "beast", "aquatic", "bug", "bird", "reptile", "dusk", "dawn", "mech"]
STORY_BG = {"metamorph": "PvE/Backgrounds/class/bg_metamorph.png",
            "lobby": "PvE/UI/Lobby/bg_pve_lobby_chimera_lv_3.png"}
# Land items as relics: (row, col) on the 64px grid of images/land-item.png
RELICS = {
    "blade": (1, 8), "maul": (1, 12), "wings": (6, 4), "ward": (4, 13), "elixir": (8, 12),
    "bramble": (5, 6), "tide": (8, 10), "crown": (6, 8), "moonshard": (5, 7), "haste": (7, 9),
    "plume": (6, 14), "helm": (4, 14), "band": (5, 11), "bloom": (8, 13), "key": (13, 6),
    "magnet": (3, 3), "lantern": (10, 4), "clover": (9, 2),
}
SFX = {}
for cls in ["beast", "plant", "aquatic", "bug", "bird", "reptile", "dusk", "mech"]:
    for k in ["gore_attack", "bite_attack", "smash_attack", "projectile_attack", "projectile_hit",
              "cast_hit", "slash_attack", "throw_attack"]:
        SFX[f"{cls}_{k}"] = f"{cls}_{k}.wav"
SFX.update({k: k + ".wav" for k in [
    "bubble", "power_gain", "power_awaken", "buff", "debuff", "heal", "stunned", "death_mark",
    "morph_aura_burst", "summon_on", "feather", "leaf", "poison", "shield", "fear", "taunt",
    "secret", "weak", "damage_boost", "bubble_bomb", "drain"]})
MUSIC = {"menu": "home.wav", "run1": "pve_1.wav", "run2": "pve_2.wav", "run3": "pve_3.wav",
         "boss": "boss.wav"}


def ensure_sources():
    for dest, (url, paths) in REPOS.items():
        if os.path.isdir(dest):
            continue
        os.makedirs(CACHE, exist_ok=True)
        subprocess.run(["git", "clone", "-q", "--filter=blob:none", "--no-checkout", "--depth", "1",
                        url, dest], check=True)
        subprocess.run(["git", "-C", dest, "sparse-checkout", "set", "--no-cone", *paths], check=True)
        subprocess.run(["git", "-C", dest, "checkout", "-q"], check=True)


def uri(mime, blob):
    return f"data:{mime};base64," + base64.b64encode(blob).decode()


def webp(im, q=82):
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    return uri("image/webp", buf.getvalue())


def fit(im, cap):
    if max(im.size) > cap:
        k = cap / max(im.size)
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
    return im


def parse_atlas(path):
    """libgdx atlas (single page) -> {name: {x,y,w,h,ow,oh,ox,oy,rot}}"""
    lines = open(path).read().splitlines()
    regions, i = {}, 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    i += 1
    while i < len(lines) and ":" in lines[i]:
        i += 1
    while i < len(lines):
        name = lines[i].strip()
        i += 1
        if not name:
            continue
        f = {}
        while i < len(lines) and lines[i].startswith(" "):
            k, v = lines[i].split(":", 1)
            f[k.strip()] = v.strip()
            i += 1
        iv = lambda k: [int(v) for v in f[k].split(",")]
        xy, size = iv("xy"), iv("size")
        orig = iv("orig") if "orig" in f else size
        off = iv("offset") if "offset" in f else [0, 0]
        regions[name] = {"x": xy[0], "y": xy[1], "w": size[0], "h": size[1], "ow": orig[0],
                         "oh": orig[1], "ox": off[0], "oy": off[1], "rot": f.get("rotate") == "true"}
    return regions


def crop_region(page, r):
    """The region's pixels, upright. libgdx stores a rotated region turned 90
    degrees clockwise, so it comes back with a 90 degree counter-clockwise turn."""
    if r["rot"]:
        im = page.crop((r["x"], r["y"], r["x"] + r["h"], r["y"] + r["w"]))
        return im.transpose(Image.ROTATE_90)
    return page.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))


class Sheets:
    """Shelf-pack crops into 2048 sheets; each crop gets {s, x, y, w, h}."""
    def __init__(self, size=2048):
        self.size, self.pages, self.cur = size, [], None
        self.new()

    def new(self):
        self.cur = Image.new("RGBA", (self.size, self.size), (0, 0, 0, 0))
        self.pages.append(self.cur)
        self.x = self.y = self.row = 0

    def add(self, im):
        w, h = im.size
        if self.x + w + 2 > self.size:
            self.x, self.y, self.row = 0, self.y + self.row + 2, 0
        if self.y + h + 2 > self.size:
            self.new()
        self.cur.paste(im, (self.x, self.y))
        out = {"s": len(self.pages) - 1, "x": self.x, "y": self.y, "w": w, "h": h}
        self.x += w + 2
        self.row = max(self.row, h)
        return out

    def export(self):
        out = []
        for p in self.pages:
            bb = p.getbbox()
            p = p.crop((0, 0, p.size[0], bb[3] if bb else 1))
            out.append(webp(p, 88))
        return out


def trim_skel(skel):
    anims = {k: v for k, v in skel["animations"].items() if k in KEEP_ANIMS}
    return {"bones": skel["bones"], "slots": skel["slots"], "ik": skel.get("ik", []),
            "skin": skel["skins"][0]["attachments"], "animations": anims}


def main():
    ensure_sources()
    sheets = Sheets()
    out = {"rigs": {}, "chimeraParts": {}, "playable": PLAYABLE}

    # ---- starter rigs: skeleton + every region cropped into the shared sheets
    for sid, (folder, stem, cls, name) in STARTERS.items():
        d = os.path.join(SPINES, "starter-axies", folder)
        skel = json.load(open(os.path.join(d, stem + ".json")))
        regs = parse_atlas(os.path.join(d, stem + ".atlas.txt"))
        page = Image.open(os.path.join(d, stem + ".png")).convert("RGBA")
        regions = {}
        for rn, r in regs.items():
            pos = sheets.add(crop_region(page, r))
            pos.update({"ow": r["ow"], "oh": r["oh"], "ox": r["ox"], "oy": r["oy"]})
            regions[rn] = pos
        out["rigs"][sid] = {"name": name, "cls": cls, "skel": trim_skel(skel), "regions": regions}
        print(f"{sid:9s} {len(regions)} regions")

    # ---- tier 4: parts that were never Axie, cropped from the chimera atlases
    for pid, (chim, region, slot, name) in CHIMERA_PARTS.items():
        d = os.path.join(SPINES, "chimeras", chim)
        regs = parse_atlas(os.path.join(d, chim + ".atlas.txt"))
        page = Image.open(os.path.join(d, chim + ".png")).convert("RGBA")
        im = crop_region(page, regs[region])
        bb = im.getbbox()
        im = fit(im.crop(bb), 260)
        pos = sheets.add(im)
        out["chimeraParts"][pid] = {"src": chim, "slot": slot, "name": name, "r": pos}
    print(f"chimera parts: {len(CHIMERA_PARTS)}")

    out["sheets"] = sheets.export()
    print(f"sheets: {len(out['sheets'])}, {sum(len(s) for s in out['sheets']) // 1024} KB")

    # ---- 2D art
    img = {}
    def put(key, path, cap, q=82):
        im = Image.open(path).convert("RGBA")
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
        img[key] = webp(fit(im, cap), q)
    for p in PORTRAITS:
        put("portrait_" + p, f"{OK}/PvE/Avatars/portraits/{p}.png", 128)
    for p in INTENTS:
        put("intent_" + p, f"{OK}/PvE/Intents/{p}.png", 72)
    for k, f in VFX.items():
        put("vfx_" + k, f"{OK}/Textures/Vfx/{f}", 256 if k not in ("fruits", "confetti") else 384)
    for k, f in UI.items():
        put("ui_" + k, f"{OK}/{f}", 320)
    for cls in ["aquatic", "beast", "bird", "bug", "plant", "reptile", "dawn", "dusk", "mech"]:
        put("class_" + cls, f"{SPRITES}/axie-class-icon/{cls}.png", 48) if os.path.exists(
            f"{SPRITES}/axie-class-icon/{cls}.png") else None
    for f in sorted(os.listdir(f"{SPRITES}/axie-part-icon")):
        if f.endswith(".png"):
            put("part_" + f[:-4], f"{SPRITES}/axie-part-icon/{f}", 56)
    cards = {}
    for f in sorted(os.listdir(f"{SPRITES}/axie-part-cards")):
        if f.endswith(".png"):
            key = "-".join(f[:-4].split("-")[:2])
            cards.setdefault(key, []).append("card_" + f[:-4])
            put("card_" + f[:-4], f"{SPRITES}/axie-part-cards/{f}", 120, 78)
    out["cardsBySlot"] = cards
    sheet = Image.open(f"{GTK}/images/land-item.png").convert("RGBA")
    for k, (r, c) in RELICS.items():
        im = sheet.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64))
        img["relic_" + k] = webp(im.crop(im.getbbox()) if im.getbbox() else im, 90)
    for s in ["1", "2", "3", "5", "7", "11", "12", "14"]:
        put("avatar_" + s, f"{OK}/PvE/Avatars/starters/{s}.png", 128)
    def bg(key, path, w):
        im = Image.open(path).convert("RGB")
        im = im.resize((w, round(w * im.size[1] / im.size[0])), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=72, optimize=True, progressive=True)
        img[key] = uri("image/jpeg", buf.getvalue())
    for b in BACKGROUNDS:
        bg("bg_" + b, f"{OK}/PvE/Backgrounds/class/bg-{b}.jpg", 1280)
    for k, p in STORY_BG.items():
        bg("bg_" + k, f"{OK}/{p}", 1280)
    out["img"] = img
    print(f"images: {len(img)}, {sum(len(v) for v in img.values()) // 1024} KB")

    # ---- audio: mono AAC
    def aac(path, kbps):
        tmp = os.path.join(CACHE, os.path.basename(path) + f".{kbps}.m4a")
        if not os.path.exists(tmp):
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ac", "1",
                            "-c:a", "aac", "-b:a", f"{kbps}k", "-movflags", "+faststart", tmp], check=True)
        return uri("audio/mp4", open(tmp, "rb").read())
    out["sfx"] = {k: aac(f"{OK}/Audio/{f}", 48) for k, f in SFX.items() if os.path.exists(f"{OK}/Audio/{f}")}
    out["music"] = {k: aac(f"{OK}/PvE/Music/{f}", 40) for k, f in MUSIC.items()}
    print(f"sfx {len(out['sfx'])}, {sum(len(v) for v in out['sfx'].values()) // 1024} KB;"
          f" music {sum(len(v) for v in out['music'].values()) // 1024} KB")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write("/* generated by tools/abx_pack.py - do not edit */\nwindow.ABX_ASSETS=")
        json.dump(out, f, separators=(",", ":"))
        f.write(";\n")
    print(f"\nwrote {os.path.getsize(OUT) // 1024} KB -> {OUT}")


if __name__ == "__main__":
    main()
