#!/usr/bin/env python3
"""Pack the official Origins Spine assets for the three starter Axies into game/index.html.

Source: github.com/axieinfinity/unity-axie-gtk2d
        Assets/AxieInfinity/AxieStandardAssets/Spines/starter-axies

We keep the skeleton rig exactly as authored and drop the ~30 animations the game
never plays, which is most of the file weight. Atlas pages are embedded as data
URIs because the published build is a single HTML file.

    python3 tools/pack_spines.py            # fetch + pack
    python3 tools/pack_spines.py --offline  # pack from .cache only
"""
import base64, json, os, re, sys, urllib.request

RAW = ("https://raw.githubusercontent.com/axieinfinity/unity-axie-gtk2d/main/"
       "Assets/AxieInfinity/AxieStandardAssets/Spines/starter-axies")
AXIES = {
    "buba":     ("01-buba-beast", "buba"),
    "olek":     ("02-olek-plant", "olek"),
    "puffy":    ("03-puffy-aquatic", "03-puffy-aquatic"),
    "pomodoro": ("06-pomodoro-bug", "06-pomodoro-bug"),
    "venoki":   ("07-venoki-reptile", "07-dps-reptile"),
    "momo":     ("12-momo-bird", "12-momo-bird"),
}
# Everything the game can play. Anything not listed here is stripped.
KEEP = [
    "action/idle/normal",
    "action/run",
    "action/move-forward",
    "defense/evade",
    "defense/hit-by-normal",
    "defense/hit-by-normal-dramatic",
    "activity/victory-pose-back-flip",
    "activity/entrance",
    "attack/melee/horn-gore",
    "attack/melee/normal-attack",
    "attack/melee/tail-smash",
    "attack/melee/tail-roll",
    "attack/melee/tail-thrash",
    "attack/melee/mouth-bite",
]
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(HERE, ".cache", "spines")
TARGET = os.path.join(HERE, "game", "index.html")
BEGIN, END = "/* <<AXIE-ASSETS>> */", "/* <</AXIE-ASSETS>> */"


def grab(rel, offline):
    dest = os.path.join(CACHE, rel.replace("/", "_"))
    if not os.path.exists(dest):
        if offline:
            sys.exit("missing cache file: " + dest)
        os.makedirs(CACHE, exist_ok=True)
        with urllib.request.urlopen(RAW + "/" + rel) as r, open(dest, "wb") as f:
            f.write(r.read())
    return open(dest, "rb").read()


def parse_atlas(text):
    """libgdx atlas -> {page:{w,h}, regions:{name:{x,y,w,h,ow,oh,ox,oy,rot}}}"""
    lines = text.splitlines()
    i = 0
    while not lines[i].strip():
        i += 1
    i += 1                                   # page image filename
    hdr = {}
    while ":" in lines[i]:
        k, v = lines[i].split(":", 1)
        hdr[k.strip()] = v.strip()
        i += 1
    pw, ph = [int(v) for v in hdr["size"].split(",")]
    regions = {}
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
        xy = [int(v) for v in f["xy"].split(",")]
        size = [int(v) for v in f["size"].split(",")]
        orig = [int(v) for v in f["orig"].split(",")]
        off = [int(v) for v in f["offset"].split(",")]
        regions[name] = {
            "x": xy[0], "y": xy[1], "w": size[0], "h": size[1],
            "ow": orig[0], "oh": orig[1], "ox": off[0], "oy": off[1],
            "rot": 1 if f.get("rotate") == "true" else 0,
        }
    return {"pw": pw, "ph": ph, "regions": regions}


def trim(skel):
    kept = {k: v for k, v in skel["animations"].items() if k in KEEP}
    missing = [k for k in KEEP if k not in kept]
    if missing:
        print("  ! not in this skeleton:", ", ".join(missing))
    return {
        "bones": skel["bones"],
        "slots": skel["slots"],
        "ik": skel.get("ik", []),
        "skins": skel["skins"],
        "animations": kept,
    }


def main():
    offline = "--offline" in sys.argv
    out = {}
    for key, (folder, stem) in AXIES.items():
        print(key)
        atlas = parse_atlas(grab(f"{folder}/{stem}.atlas.txt", offline).decode())
        skel = trim(json.loads(grab(f"{folder}/{stem}.json", offline)))
        png = grab(f"{folder}/{stem}.png", offline)
        out[key] = {
            "atlas": atlas,
            "skel": skel,
            "png": "data:image/png;base64," + base64.b64encode(png).decode(),
        }
        print(f"  atlas {atlas['pw']}x{atlas['ph']} · {len(atlas['regions'])} regions"
              f" · {len(skel['animations'])} animations · png {len(png)//1024} KB")

    block = "const AXIE_ASSETS = " + json.dumps(out, separators=(",", ":")) + ";"
    html = open(TARGET).read()
    a, b = html.index(BEGIN), html.index(END)
    html = html[:a] + BEGIN + "\n" + block + "\n" + html[b:]
    open(TARGET, "w").write(html)
    print(f"\nwrote {len(block)//1024} KB of assets into {TARGET}")


if __name__ == "__main__":
    main()
