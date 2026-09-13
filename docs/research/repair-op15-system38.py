from pathlib import Path
from copy import deepcopy
from collections import Counter
import hashlib
import json
import xml.etree.ElementTree as E

base = Path('.repertoire-cache/beethoven-op15/omr-breitkopf-largo')
source = base / 'imslp-505853-full.musicxml'
original = E.parse(source).getroot()
root = deepcopy(original)
parts = {p.attrib['id']: p for p in root.findall('part')}
source_parts = {p.attrib['id']: p for p in original.findall('part')}

def measure(part, number):
    found = [m for m in part.findall('measure') if m.attrib['number'] == str(number)]
    assert len(found) == 1
    return found[0]

def pitched(root):
    return Counter((n.findtext('pitch/step'), n.findtext('pitch/alter', '0'), n.findtext('pitch/octave'), n.findtext('duration'), n.find('chord') is not None) for n in root.findall('.//note') if n.find('pitch') is not None)

def replace(part, number, new):
    old = measure(part, number)
    index = list(part).index(old)
    part.remove(old)
    part.insert(index, new)

def add_staff(element, value):
    staff = element.find('staff')
    if staff is None:
        staff = E.Element('staff')
        before = next((i for i, c in enumerate(element) if c.tag in ['beam', 'notations', 'lyric', 'play', 'listen', 'sound']), len(element))
        element.insert(before, staff)
    staff.text = str(value)

def attributes(part, number, fifths, clefs):
    m = measure(part, number)
    for a in list(m.findall('attributes')):
        m.remove(a)
    a = E.Element('attributes')
    E.SubElement(a, 'divisions').text = '24'
    E.SubElement(E.SubElement(a, 'key'), 'fifths').text = str(fifths)
    if len(clefs) > 1:
        E.SubElement(a, 'staves').text = str(len(clefs))
    for i, (sign, line) in enumerate(clefs, 1):
        c = E.SubElement(a, 'clef', {'number': str(i)} if len(clefs) > 1 else {})
        E.SubElement(c, 'sign').text = sign
        E.SubElement(c, 'line').text = str(line)
    m.insert(1 if len(m) and m[0].tag == 'print' else 0, a)

for number in range(18, 22):
    for source_id, destination in [('P1', 'P3'), ('P2', 'P4'), ('P3', 'P5')]:
        replace(parts[destination], number, deepcopy(measure(source_parts[source_id], number)))
    upper = deepcopy(measure(source_parts['P4'], number))
    lower = deepcopy(measure(source_parts['P5'], number))
    assert not measure(parts['P6'], number).findall('note/pitch')
    cursor = 0
    for element in upper:
        duration = int(element.findtext('duration', '0'))
        if element.tag == 'backup': cursor -= duration
        elif element.tag == 'forward': cursor += duration
        elif element.tag == 'note' and element.find('chord') is None and element.find('grace') is None: cursor += duration
        if element.tag in ['note', 'direction', 'forward']: add_staff(element, 1)
    assert cursor >= 0
    if cursor:
        E.SubElement(E.SubElement(upper, 'backup'), 'duration').text = str(cursor)
    for element in lower:
        if element.tag in ['attributes', 'print', 'barline']: continue
        if element.tag in ['note', 'direction', 'forward']: add_staff(element, 2)
        voice = element.find('voice')
        if voice is not None: voice.text = str(int(voice.text) + 4)
        upper.append(element)
    replace(parts['P6'], number, upper)

for pid, fifths, clefs in [('P3', -2, [('G', 2)]), ('P4', -4, [('F', 4)]), ('P5', 0, [('G', 2)]), ('P6', -4, [('G', 2), ('F', 4)])]:
    resume = min(int(m.attrib["number"]) for m in parts[pid].findall("measure") if int(m.attrib["number"]) >= 22)
    for number in [18, resume]: attributes(parts[pid], number, fifths, clefs)

for pid in ['P1', 'P2']:
    assert all(not m.findall('note/pitch') for m in source_parts[pid].findall('measure') if m.attrib['number'] not in ['18', '19', '20', '21'])
    root.remove(parts[pid])
    declaration = root.find(f'./part-list/score-part[@id="{pid}"]')
    root.find('part-list').remove(declaration)
assert pitched(root) == pitched(original)
output = base / 'largo-system38-repaired.musicxml'
E.indent(root)
E.ElementTree(root).write(output, encoding='utf-8', xml_declaration=True)
assert pitched(E.parse(output).getroot()) == pitched(original)
report = {'source': str(source), 'sourceSHA256': hashlib.sha256(source.read_bytes()).hexdigest(), 'output': str(output), 'outputSHA256': hashlib.sha256(output.read_bytes()).hexdigest(), 'scorePage': 38, 'system': 2, 'draftMeasures': [18, 19, 20, 21], 'partsBefore': len(original.findall('part')), 'partsAfter': len(root.findall('part')), 'pitchedNotesPreserved': sum(pitched(root).values()), 'operation': 'Move P1/P2/P3 to clarinet/bassoon/horn; merge original P4/P5 into piano staves 1/2; restore key and clef at boundaries', 'remaining': ['Other systems with split piano or shifted cutaway winds', 'Unverified note recognition and rhythm', 'Missing transpositions', 'Measure count mismatch'], 'acceptedForPerformance': False}
Path('docs/research/beethoven-op15-system38-repair.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False))
