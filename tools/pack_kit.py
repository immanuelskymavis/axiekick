#!/usr/bin/env python3
"""Pack Origins battle backgrounds, SFX and music into game/index.html.

Source: github.com/axieinfinity/axie-origins-asset-kit
        Assets/OriginsKit/PvE/Backgrounds/class  (arena art)
        Assets/OriginsKit/Audio                  (class-specific battle SFX)
        Assets/OriginsKit/PvE/Music              (loops)

The kit ships 1920x1080 JPEGs and 44.1k stereo WAVs, which is far more than a
1000x580 canvas and a jam demo need. Backgrounds are resampled to 1440px wide,
audio is re-encoded to mono AAC, and everything is embedded as a data URI so
the build stays one openable file.

    python3 tools/pack_kit.py            # fetch + pack
    python3 tools/pack_kit.py --offline  # pack from .cache only
"""
import base64, io, json, os, subprocess, sys, urllib.request

RAW = ("https://raw.githubusercontent.com/axieinfinity/axie-origins-asset-kit/main/"
       "Assets/OriginsKit")

# the class arenas: same painterly style, one clear fighting plane, ~90 KB each
BACKGROUNDS = ["aquatic", "beast", "bird", "bug", "dawn", "dusk", "mech", "plant", "reptile"]

# game event -> kit file. Attack and impact sounds are per class, so each Axie
# hits with the sound its own class makes in Origins.
SFX = {
    "kick_plant": "plant_smash_attack.wav",      # Olek's tail smash
    "kick_beast": "beast_gore_attack.wav",       # Buba's horn gore
    "kick_aqua": "aquatic_throw_attack.wav",     # Puffy's roll
    "kick_bug": "bug_gore_attack.wav",           # Pomodoro's horn
    "kick_reptile": "reptile_slash_attack.wav",  # Venoki's tail
    "kick_bird": "bird_bite_attack.wav",         # Momo's beak
    "dive_plant": "plant_fly.wav",
    "dive_beast": "beast_fly.wav",
    "dive_aqua": "aquatic_fly.wav",
    "dive_bug": "bug_fly.wav",
    "dive_reptile": "reptile_fly.wav",
    "dive_bird": "bird_fly.wav",
    "hit_plant": "plant_cast_hit.wav",
    "hit_beast": "beast_cast_hit.wav",
    "hit_aqua": "aquatic_cast_hit.wav",
    "hit_bug": "bug_cast_hit.wav",
    "hit_reptile": "reptile_cast_hit.wav",
    "hit_bird": "bird_cast_hit.wav",
    "trade": "stunned.wav",
    "whiff": "weak.wav",
    "kb": "feather.wav",
    "land": "bubble.wav",
    "lock": "power_gain.wav",
    "fight": "buff.wav",
    "line": "death_mark.wav",                    # Hold the Line warning
}
MUSIC = {"battle": "pvp.wav", "menu": "pve_1.wav"}

# Origins interface pieces. Everything here is drawn straight onto the canvas,
# so it is cropped to what the game actually uses and nothing else.
UI = {
    "star": "PvE/UI/Frames/star.png",              # round-win pips
    "frame": "PvE/UI/Frames/frame_border.png",     # 9-sliced panel border
    "avatar": "PvE/UI/InBattle/avatar_frame.png",  # augment medallions
    "node_now": "PvE/UI/Nodes/node_current.png",   # arcade ladder
    "node_next": "PvE/UI/Nodes/node_default.png",
    "node_win": "PvE/UI/Nodes/node_win.png",
    "node_lost": "PvE/UI/Nodes/node_lose.png",
}

# Land items, by (row, col) on the 16x64px grid of gtk2d's images/land-item.png.
# Each one is an augment's face in Arcade mode.
LAND_SHEET = ("https://raw.githubusercontent.com/axieinfinity/unity-axie-gtk2d/"
              "main/images/land-item.png")
ITEMS = {
    "blade": (1, 8),      "maul": (1, 12),     "wings": (6, 4),
    "ward": (4, 13),      "elixir": (8, 12),   "duel": (5, 10),
    "bramble": (5, 6),    "tide": (8, 10),     "crown": (6, 8),
    "moonshard": (5, 7),  "haste": (7, 9),     "plume": (6, 14),
    "helm": (4, 14),      "band": (5, 11),     "bloom": (8, 13),
}

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(HERE, ".cache", "kit")
TARGET = os.path.join(HERE, "game", "index.html")
BEGIN, END = "/* <<KIT-ASSETS>> */", "/* <</KIT-ASSETS>> */"


def grab(rel, offline):
    dest = os.path.join(CACHE, rel.replace("/", "_"))
    if not os.path.exists(dest):
        if offline:
            sys.exit("missing cache file: " + dest)
        os.makedirs(CACHE, exist_ok=True)
        with urllib.request.urlopen(RAW + "/" + rel) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest


def as_jpeg(path, width=1440, quality=74):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    h = round(width * im.size[1] / im.size[0])
    im = im.resize((width, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


def as_aac(path, kbps):
    """macOS afconvert: mono AAC in an m4a container."""
    out = path + f".{kbps}.m4a"
    if not os.path.exists(out):
        subprocess.run(
            ["afconvert", "-f", "m4af", "-d", "aac", "-b", str(kbps * 1000),
             "-c", "1", "-s", "3", path, out],
            check=True, capture_output=True)
    return open(out, "rb").read()


def uri(mime, blob):
    return f"data:{mime};base64," + base64.b64encode(blob).decode()


def grab_url(url, name, offline):
    dest = os.path.join(CACHE, name)
    if not os.path.exists(dest):
        if offline:
            sys.exit("missing cache file: " + dest)
        os.makedirs(CACHE, exist_ok=True)
        with urllib.request.urlopen(url) as r, open(dest, "wb") as f:
            f.write(r.read())
    return dest


def as_png(path, box=None, cap=None):
    """Trim to the artwork, optionally cap the long side, keep the alpha."""
    from PIL import Image
    im = Image.open(path).convert("RGBA")
    if box:
        im = im.crop(box)
    bb = im.getbbox()
    if bb:
        im = im.crop(bb)
    if cap and max(im.size) > cap:
        k = cap / max(im.size)
        im = im.resize((max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k))), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def main():
    offline = "--offline" in sys.argv
    out = {"bg": [], "sfx": {}, "music": {}, "ui": {}, "items": {}}
    total = 0

    print("backgrounds")
    for name in BACKGROUNDS:
        blob = as_jpeg(grab(f"PvE/Backgrounds/class/bg-{name}.jpg", offline))
        out["bg"].append(uri("image/jpeg", blob))
        total += len(blob)
        print(f"  bg-{name:<8} {len(blob)//1024:>4} KB")

    print("sfx")
    for key, fn in SFX.items():
        blob = as_aac(grab("Audio/" + fn, offline), 64)
        out["sfx"][key] = uri("audio/mp4", blob)
        total += len(blob)
        print(f"  {key:<12} {fn:<26} {len(blob)//1024:>4} KB")

    print("music")
    for key, fn in MUSIC.items():
        blob = as_aac(grab("PvE/Music/" + fn, offline), 44)
        out["music"][key] = uri("audio/mp4", blob)
        total += len(blob)
        print(f"  {key:<12} {fn:<26} {len(blob)//1024:>4} KB")

    print("ui")
    for key, rel in UI.items():
        blob = as_png(grab(rel, offline), cap=192)
        out["ui"][key] = uri("image/png", blob)
        total += len(blob)
        print(f"  {key:<12} {len(blob) // 1024:>4} KB")

    print("land items")
    sheet = grab_url(LAND_SHEET, "land-item.png", offline)
    for key, (r, c) in ITEMS.items():
        blob = as_png(sheet, box=(c * 64, r * 64, c * 64 + 64, r * 64 + 64), cap=64)
        out["items"][key] = uri("image/png", blob)
        total += len(blob)
    print(f"  {len(ITEMS)} icons, {sum(len(v) for v in out['items'].values()) // 1024} KB")

    block = "const KIT_ASSETS = " + json.dumps(out, separators=(",", ":")) + ";"
    html = open(TARGET).read()
    a, b = html.index(BEGIN), html.index(END)
    html = html[:a] + BEGIN + "\n" + block + "\n" + html[b:]
    open(TARGET, "w").write(html)
    print(f"\n{total//1024} KB of media -> {len(block)//1024} KB of base64 in {TARGET}")


if __name__ == "__main__":
    main()
