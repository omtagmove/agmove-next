"""Verify preview integrity and model inspection without pretending to decode BIP meshes."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
import struct,subprocess,sys,zlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from extract_bip_preview import extract
from inspect_glb import inspect

def chunk(tag,data):
    return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)

class ModelTests(TestCase):
    def test_preview_is_extracted_only_when_crc_valid(self):
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\x00\x00\x00\xff'))+chunk(b'IEND',b'')
        with TemporaryDirectory() as directory:
            source=Path(directory)/'scene.bip';output=Path(directory)/'preview.png'
            source.write_bytes(b'//---luxion:dal:024---\n'+png)
            report=extract(source,output)
            self.assertEqual(output.read_bytes(),png)
            self.assertEqual(report['preview_dimensions'],[1,1])
            self.assertIsNone(report['mesh_count'])
            corrupt=bytearray(source.read_bytes());corrupt[-1]^=1;source.write_bytes(corrupt)
            with self.assertRaises(ValueError):extract(source,Path(directory)/'invalid.png')
            self.assertFalse((Path(directory)/'invalid.png').exists())

    def test_glb_report_uses_actual_mesh_metadata(self):
        with TemporaryDirectory() as directory:
            target=Path(directory)/'synthetic.glb'
            subprocess.run(['node','--input-type=module','-e',"import {createRoverFixture} from './tests/fixtures/rover-glb.mjs';import fs from 'node:fs';fs.writeFileSync(process.argv[1],createRoverFixture());",str(target)],cwd=ROOT,check=True)
            report=inspect(target)
            self.assertEqual((report['meshes'],report['vertices'],report['triangles']),(1,8,12))
            self.assertEqual(report['parts'],['Test chassis'])
            self.assertEqual(report['materials'],['Test blue'])
            target.write_bytes(b'not a real model')
            with self.assertRaises(ValueError):inspect(target)
