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
    "dive_plant": "plant_fly.wav",
    "dive_beast": "beast_fly.wav",
    "dive_aqua": "aquatic_fly.wav",
    "hit_plant": "plant_cast_hit.wav",
    "hit_beast": "beast_cast_hit.wav",
    "hit_aqua": "aquatic_cast_hit.wav",
    "trade": "stunned.wav",
    "whiff": "weak.wav",
    "kb": "feather.wav",
    "land": "bubble.wav",
    "lock": "power_gain.wav",
    "fight": "buff.wav",
    "line": "death_mark.wav",                    # Hold the Line warning
}
MUSIC = {"battle": "pvp.wav", "menu": "pve_1.wav"}

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


def main():
    offline = "--offline" in sys.argv
    out = {"bg": [], "sfx": {}, "music": {}}
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

    block = "const KIT_ASSETS = " + json.dumps(out, separators=(",", ":")) + ";"
    html = open(TARGET).read()
    a, b = html.index(BEGIN), html.index(END)
    html = html[:a] + BEGIN + "\n" + block + "\n" + html[b:]
    open(TARGET, "w").write(html)
    print(f"\n{total//1024} KB of media -> {len(block)//1024} KB of base64 in {TARGET}")


if __name__ == "__main__":
    main()
