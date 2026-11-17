"""Extract a CRC-verified embedded PNG; does not attempt proprietary mesh decoding."""
from pathlib import Path
import argparse,json,struct,zlib

def extract(source,output):
    source,output=Path(source),Path(output)
    with source.open('rb') as stream:
        data=stream.read(8*1024*1024)
    if not data.startswith(b'//---luxion:dal:'):
        raise ValueError('Not a recognized Luxion/KeyShot scene header')
    offset=0
    while True:
        start=data.find(b'\x89PNG\r\n\x1a\n',offset)
        if start<0:raise ValueError('No complete embedded preview found in the first 8 MiB')
        offset=start+8
        position=offset
        while position+12<=len(data):
            size=struct.unpack('>I',data[position:position+4])[0]
            if size>len(data)-position-12:break
            tag=data[position+4:position+8]
            payload=data[position+8:position+8+size]
            crc=struct.unpack('>I',data[position+8+size:position+12+size])[0]
            if zlib.crc32(tag+payload)&0xffffffff!=crc:break
            position+=size+12
            if tag==b'IEND':
                output.parent.mkdir(parents=True,exist_ok=True)
                output.write_bytes(data[start:position])
                width,height=struct.unpack('>II',data[start+16:start+24])
                return {'file':str(source),'scene_bytes':source.stat().st_size,'format':'Luxion KeyShot BIP','mesh_extraction':'not attempted: no supported exporter available','mesh_count':None,'part_names':None,'materials':None,'preview':str(output),'preview_dimensions':[width,height],'preview_bytes':position-start}
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    print(json.dumps(extract(args.source,args.output),indent=2))
