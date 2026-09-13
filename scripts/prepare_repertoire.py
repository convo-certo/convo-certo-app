from __future__ import annotations

import base64
import io
import json
import math
import re
import urllib.request
import zipfile
from pathlib import Path

import mido

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/repertoire'
CACHE = ROOT / '.repertoire-cache'


def download(url: str, name: str) -> bytes:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'ConvoCerto repertoire preparation'})
        with urllib.request.urlopen(request, timeout=60) as response:
            path.write_bytes(response.read())
    return path.read_bytes()


def from_midi(data: bytes, title: str, solo: bool) -> dict:
    midi = mido.MidiFile(file=io.BytesIO(data))
    parts = []
    signatures = []
    tempos = []
    end_tick = 0
    names = {0: 'Piano', 48: 'Strings', 40: 'Violins I & II', 41: 'Violas', 42: 'Cellos', 43: 'Double basses', 60: 'Horns I & II', 70: 'Bassoons I & II', 71: 'Clarinet', 73: 'Flutes I & II'}
    tracks = list(midi.tracks)
    if midi.type == 0:
        split = {}
        absolute = 0
        for message in tracks[0]:
            absolute += message.time
            channel = getattr(message, 'channel', -1)
            split.setdefault(channel, []).append((absolute, message))
        tracks = []
        for events in split.values():
            track = mido.MidiTrack()
            previous = 0
            for time, message in events:
                track.append(message.copy(time=time-previous))
                previous = time
            tracks.append(track)
    for track in tracks:
        tick = 0
        program = 0
        active = {}
        notes = []
        for message in track:
            tick += message.time
            if message.type == 'set_tempo':
                tempos.append({'beatPosition': tick / midi.ticks_per_beat, 'bpm': mido.tempo2bpm(message.tempo), 'type': 'instant'})
            elif message.type == 'time_signature':
                signatures.append({'beatPosition': tick / midi.ticks_per_beat, 'beats': message.numerator, 'beatType': message.denominator})
            elif message.type == 'program_change':
                program = message.program
            elif message.type == 'note_on' and message.velocity:
                active.setdefault((message.channel, message.note), []).append((tick, message.velocity))
            elif message.type in ('note_on', 'note_off'):
                queue = active.get((message.channel, message.note), [])
                if queue:
                    onset, velocity = queue.pop(0)
                    notes.append({'pitch': message.note, 'startBeat': onset / midi.ticks_per_beat, 'durationBeats': max(1, tick - onset) / midi.ticks_per_beat, 'velocity': velocity, 'partIndex': len(parts)})
        end_tick = max(end_tick, tick)
        if notes:
            parts.append({'id': f'P{len(parts)+1}', 'name': names.get(program, track.name or f'Part {len(parts)+1}'), 'isSolo': solo and program == 71, 'midiProgram': program, 'notes': sorted(notes, key=lambda n: (n['startBeat'], n['pitch']))})
    signatures.sort(key=lambda e: e['beatPosition'])
    tempos.sort(key=lambda e: e['beatPosition'])
    initial = signatures[0] if signatures else {'beats': 4, 'beatType': 4}
    total = end_tick / midi.ticks_per_beat
    starts = []
    beat = 0
    while beat < total - 0.01:
        starts.append(beat)
        signature = next((s for s in reversed(signatures) if s['beatPosition'] <= beat), initial)
        beat += signature['beats'] * 4 / signature['beatType']
    return {'title': title, 'tempo': next((event['bpm'] for event in reversed(tempos) if event['beatPosition'] == 0), 100), 'tempoEvents': tempos, 'timeSignature': {'beats': initial['beats'], 'beatType': initial['beatType']}, 'timeSignatureChanges': signatures[1:], 'parts': parts, 'measures': [], 'totalMeasures': len(starts), 'totalBeats': total, 'measureNumbers': list(range(1, len(starts)+1)), 'playbackOrder': list(range(len(starts))), 'measureStartBeats': starts}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mozart = zipfile.ZipFile(io.BytesIO(download('https://www.mutopiaproject.org/ftp/MozartWA/KV622/MozartK622/MozartK622-mids.zip', 'mozart.zip')))
    brahms = zipfile.ZipFile(io.BytesIO(download('https://www.viola-in-music.com/support-files/sonata_no2_in_eb_major_op120_midi.zip', 'brahms.zip')))
    for i, movement in enumerate(['Allegro', 'Adagio', 'Rondo — Allegro'], 1):
        score = from_midi(mozart.read(f'Midi-{i}.mid'), f'Mozart · Clarinet Concerto K.622 · {i}. {movement}', False)
        (OUT / f'mozart-k622-{i}.json').write_text(json.dumps(score, ensure_ascii=False, separators=(',', ':')))
        print(f'Mozart {i}: {score["totalMeasures"]} measures, {len(score["parts"])} orchestral sections')
    local = OUT / 'local'
    local.mkdir(exist_ok=True)
    for i, movement in enumerate(['Allegro amabile', 'Allegro appassionato', 'Andante con moto'], 1):
        path = next(n for n in brahms.namelist() if n.split('/')[-1].startswith(f'0{i}') and n.endswith('.mid'))
        score = from_midi(brahms.read(path), f'Brahms · Clarinet Sonata No.2 Op.120-2 · {i}. {movement}', True)
        (local / f'brahms-op120-2-{i}.json').write_text(json.dumps(score, ensure_ascii=False, separators=(',', ':')))
        print(f'Brahms {i}: {score["totalMeasures"]} measures, {sum(len(p["notes"]) for p in score["parts"])} notes')
    for i in range(1, 4):
        data = download(f'https://bitmidi.com/uploads/{30295+i}.mid', f'mozart-full-{i}.mid')
        score = from_midi(data, f'Mozart · Clarinet Concerto K.622 · {i}', True)
        origin = 127 / 120
        for part in score['parts']:
            for note in part['notes']:
                note['startBeat'] = round(note['startBeat'] - origin, 6)
        score['totalBeats'] -= origin
        for event in score['tempoEvents'] + score['timeSignatureChanges']:
            event['beatPosition'] = max(0, event['beatPosition'] - origin)
        score['tempo'] = next(event['bpm'] for event in reversed(score['tempoEvents']) if event['beatPosition'] == 0)
        score['measureStartBeats'] = [b for b in score['measureStartBeats'] if b < score['totalBeats'] - 0.01]
        count = len(score['measureStartBeats'])
        score['totalMeasures'] = count
        score['measureNumbers'] = list(range(1, count + 1))
        score['playbackOrder'] = list(range(count))
        (local / f'mozart-k622-{i}.json').write_text(json.dumps(score, ensure_ascii=False, separators=(',', ':')))
        print(f'Mozart with solo {i}: {count} playback measures')
    for instrument in ['acoustic_grand_piano', 'string_ensemble_1', 'flute', 'bassoon', 'french_horn', 'contrabass', 'clarinet']:
        source = download(f'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/{instrument}-mp3.js', instrument + '.js').decode()
        folder = ROOT / 'public/audio/fluid' / instrument
        folder.mkdir(parents=True, exist_ok=True)
        for octave in range(1, 8):
            name = f'C{octave}'
            match = re.search(r'"' + name + r'":\s*"data:audio/mp3;base64,([^"\s]+)"', source)
            if match:
                (folder / f'{name}.mp3').write_bytes(base64.b64decode(match[1]))
        print(f'Samples: {instrument}')


if __name__ == '__main__':
    main()
