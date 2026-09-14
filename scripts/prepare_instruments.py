import base64
import hashlib
import json
import re
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]
INSTRUMENTS = ['acoustic_grand_piano', 'string_ensemble_1', 'flute', 'bassoon', 'french_horn', 'contrabass', 'clarinet', 'oboe', 'english_horn', 'trumpet', 'trombone', 'tuba', 'violin', 'viola', 'cello', 'orchestral_harp', 'piccolo', 'timpani', 'alto_sax', 'tenor_sax', 'baritone_sax', 'soprano_sax', 'acoustic_guitar_nylon', 'harpsichord', 'glockenspiel', 'marimba', 'acoustic_bass', 'electric_piano_1', 'electric_piano_2', 'church_organ', 'rock_organ', 'choir_aahs', 'synth_strings_1', 'synth_strings_2']

def prepare(instrument):
    url = f'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/{instrument}-mp3.js'
    cache = ROOT / '.repertoire-cache' / (instrument + '.js')
    if not cache.exists():
        temp = cache.with_suffix('.part')
        subprocess.run(['curl', '-Ls', '--fail', '--max-time', '120', url, '-o', str(temp)], check=True)
        temp.replace(cache)
    source = cache.read_text()
    folder = ROOT / 'public/audio/fluid' / instrument
    folder.mkdir(parents=True, exist_ok=True)
    hashes = {}
    for octave in range(1, 8):
        name = f'C{octave}'
        match = re.search(r'"' + name + r'":\s*"data:audio/mp3;base64,([^"\s]+)"', source)
        if not match:
            raise ValueError(f'Missing sample {instrument}/{name}')
        data = base64.b64decode(match[1])
        (folder / (name + '.mp3')).write_bytes(data)
        hashes[name] = hashlib.sha256(data).hexdigest()
    return {'instrument': instrument, 'source': url, 'license': 'CC-BY-3.0', 'creator': 'Frank Wen; MIDI.js Soundfonts rendering by Benjamin Gleitzman', 'samples': hashes}

if __name__ == '__main__':
    manifest = list(ThreadPoolExecutor(3).map(prepare, INSTRUMENTS))
    (ROOT / 'public/audio/fluid/sources.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{len(manifest)} sampled instruments prepared')
