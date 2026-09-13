import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
mkdirSync('build/native',{recursive:true});
execFileSync('swiftc',['-swift-version','5','native/ConvoCerto/MIDIBytes.swift','native/tests/main.swift','-o','build/native/midi-bytes-test'],{stdio:'inherit'});
execFileSync('build/native/midi-bytes-test',[],{stdio:'inherit'});
