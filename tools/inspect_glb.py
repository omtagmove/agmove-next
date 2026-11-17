"""Report real GLB mesh data, materials and part names after a supported export."""
from pathlib import Path
import argparse,json,struct

def inspect(file):
    file=Path(file)
    with file.open('rb') as stream:
        magic,version,total=struct.unpack('<4sII',stream.read(12))
        if magic!=b'glTF' or version!=2 or total!=file.stat().st_size:raise ValueError('Not a valid GLB 2.0 container')
        size,kind=struct.unpack('<I4s',stream.read(8))
        if kind!=b'JSON':raise ValueError('Missing JSON chunk')
        data=json.loads(stream.read(size).rstrip(b' \x00'))
    vertices=triangles=0
    for mesh in data.get('meshes',[]):
        for primitive in mesh.get('primitives',[]):
            count=data['accessors'][primitive['attributes']['POSITION']]['count']
            vertices+=count
            index_count=data['accessors'][primitive['indices']]['count'] if 'indices' in primitive else count
            if primitive.get('mode',4)==4:triangles+=index_count//3
    return {'file':str(file),'bytes':file.stat().st_size,'meshes':len(data.get('meshes',[])),'vertices':vertices,'triangles':triangles,'parts':[node.get('name',f'node-{i}') for i,node in enumerate(data.get('nodes',[])) if 'mesh' in node],'materials':[material.get('name',f'material-{i}') for i,material in enumerate(data.get('materials',[]))]}
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('file',nargs='?',default='assets/models/rover.glb');args=parser.parse_args()
    if not Path(args.file).exists():print('No rover.glb supplied. The Product experience uses the illustrative rover.');raise SystemExit(0)
    print(json.dumps(inspect(args.file),indent=2))
