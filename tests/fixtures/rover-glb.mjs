/** A deliberately synthetic cube for loader tests. Never copied into dist/. */
export function createRoverFixture() {
  const positions = [
    -1, 0, -1, 1, 0, -1, 1, 1, -1, -1, 1, -1, -1, 0, 1, 1, 0, 1, 1, 1, 1, -1, 1, 1,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2,
    6, 1, 6, 5,
  ];
  const binary = Buffer.alloc(168);
  positions.forEach((value, index) => binary.writeFloatLE(value, index * 4));
  indices.forEach((value, index) => binary.writeUInt16LE(value, 96 + index * 2));
  const data = {
    asset: { version: "2.0", generator: "AgMove synthetic loader test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Test chassis", mesh: 0 }],
    meshes: [
      {
        name: "Synthetic box",
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      {
        name: "Test blue",
        pbrMetallicRoughness: {
          baseColorFactor: [0.5, 0.7, 1, 1],
          metallicFactor: 0.3,
          roughnessFactor: 0.6,
        },
        doubleSided: true,
      },
    ],
    buffers: [{ byteLength: 168 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 96, target: 34962 },
      { buffer: 0, byteOffset: 96, byteLength: 72, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: "VEC3",
        min: [-1, 0, -1],
        max: [1, 1, 1],
      },
      { bufferView: 1, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };
  const text = JSON.stringify(data);
  const json = Buffer.from(text + " ".repeat((4 - (Buffer.byteLength(text) % 4)) % 4));
  const output = Buffer.alloc(28 + json.length + binary.length);
  output.write("glTF");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.write("JSON", 16);
  json.copy(output, 20);
  output.writeUInt32LE(binary.length, 20 + json.length);
  output.write("BIN\0", 24 + json.length);
  binary.copy(output, 28 + json.length);
  return output;
}
