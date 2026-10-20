"""Builds each Move's sound, as faithful to the games as the sources allow.

1. The game rips of BellBlitzKing's "Pokemon SFX Attack Moves & Sound Effects Collection" (Gen 1 to 7), named by
   Move: the newest generation that has the Move wins.
2. The Gen 9 Move Animation Project (Pokémon Essentials), for the rest (Gen 8 and 9 Moves): its
   Data/PkmnAnimations.rxdata names, for every "Move:XXX" animation, the sound it plays first.

Each sound is converted to .ogg (with ffmpeg) into assets/audio/moves/, and data/move-sounds.json maps
{ moveId: fileName }.

    python tools/build-move-sounds.py "<BellBlitzKing collection folder>" "<Gen 9 Move Animation Project folder>"
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "audio" / "moves"
MAP_FILE = ROOT / "data" / "move-sounds.json"
PREFERRED = [".ogg", ".mp3", ".wav"]
# Moves whose internal name in the Essentials pack is spelled differently.
ALIASES = {"vice-grip": "VISEGRIP"}


def normalized(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def strip_extension(name):
    return re.sub(r"\.(wav|ogg|mp3)$", "", name, flags=re.I)


def game_sounds(collection):
    """[(generation, { normalized name: path })], newest generation first. Pieces ("part 2") are left out."""
    generations = []
    for folder in collection.iterdir():
        match = re.match(r"GEN (\d+)", folder.name)
        if not match or not folder.is_dir():
            continue
        files = {}
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() in PREFERRED and not re.search(r"part \d+$", path.stem, re.I):
                files.setdefault(normalized(path.stem), path)
        generations.append((int(match.group(1)), files))
    return sorted(generations, reverse=True)


def game_sounds_for(generations, keys):
    """Its files, newest generation first: by its exact name, or else a variant of it ("Arm Thrust 1hit", "Thunderbolt1")."""
    for generation, files in generations:
        exact = next((files[key] for key in keys if key in files), None)
        variants = sorted(name for key in keys for name in files if name.startswith(key) and re.fullmatch(r"\d*(hits?)?", name[len(key):]))
        found = exact or (files[variants[0]] if variants else None)
        if found:
            yield generation, found


def pack_sounds(pack):
    """{ lowercased name: path }, the best format of each sound."""
    sounds = {}
    order = lambda path: PREFERRED.index(path.suffix.lower()) if path.suffix.lower() in PREFERRED else 9
    for path in sorted((pack / "Audio" / "SE").rglob("*"), key=order):
        if path.suffix.lower() in PREFERRED:
            sounds.setdefault(path.stem.lower(), path)
    return sounds


def animation_sounds(pack, sounds):
    """{ "EMBER": path }: the first sound each Move's animation names."""
    data = (pack / "Data" / "PkmnAnimations.rxdata").read_bytes()
    starts = [(match.start(), match.group(1).decode()) for match in re.finditer(rb"(?<![A-Za-z])Move:([A-Z0-9]+)", data)]
    found = {}
    for index, (position, move) in enumerate(starts):
        end = starts[index + 1][0] if index + 1 < len(starts) else len(data)
        # A file name ("PRSFX- Ember.wav"), even with the format's length bytes glued before it ('I"!PRSFX- …').
        names = [match.decode() for match in re.findall(rb"[A-Za-z0-9 _'().,-]+?(?=\.(?:wav|ogg|mp3))", data[position:end], flags=re.I)]
        names += [text.decode() for text in re.findall(rb"[ -~]{3,}", data[position:end])]
        for name in names:
            path = sounds.get(strip_extension(name.strip()).lower())
            if path:
                found.setdefault(move, path)
                break
    return found


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + ".ogg"


def convert(source, name):
    """Its .ogg name, or None when ffmpeg can't read the file (a few in the collection are broken)."""
    target = OUT_DIR / name
    if not target.exists():
        result = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-c:a", "libvorbis", "-q:a", "3", str(target)])
        if result.returncode != 0:
            target.unlink(missing_ok=True)
            print(f"skipped, unreadable: {source}")
            return None
    return name


def main():
    generations = game_sounds(Path(sys.argv[1]))
    pack = Path(sys.argv[2])
    by_animation = animation_sounds(pack, pack_sounds(pack))
    moves = json.loads((ROOT / "data" / "normalized" / "moves.json").read_text(encoding="utf-8"))["moves"]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mapping = {}
    counts = {}
    for move in moves:
        keys = [key for key in (normalized(move["id"]), normalized(move.get("name", {}).get("en") or "")) if key]
        for generation, source in game_sounds_for(generations, keys):
            name = convert(source, slug(f"gen{generation} {source.stem}"))
            if name:
                mapping[move["id"]] = name
                counts[f"Gen {generation}"] = counts.get(f"Gen {generation}", 0) + 1
                break
        source = None if move["id"] in mapping else by_animation.get(ALIASES.get(move["id"]) or move["id"].upper().replace("-", ""))
        name = source and convert(source, slug(source.stem))
        if name:
            mapping[move["id"]] = name
            counts["Essentials"] = counts.get("Essentials", 0) + 1
    MAP_FILE.write_text(json.dumps(dict(sorted(mapping.items())), indent=2) + "\n", encoding="utf-8")
    missing = [move["id"] for move in moves if move["id"] not in mapping]
    print(f"{len(mapping)} Moves with a sound ({counts}), {len(set(mapping.values()))} files; without one ({len(missing)}): {', '.join(missing)}")


if __name__ == "__main__":
    main()
