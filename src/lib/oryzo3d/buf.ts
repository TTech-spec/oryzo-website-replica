// Decoder for the ".buf" geometry / baked-animation container used by the ORYZO scene.
// Layout: uint32 header length, JSON header, then one typed-array block per attribute.

type TypedArrayCtor =
  | Float32ArrayConstructor
  | Uint8ArrayConstructor
  | Int8ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint32ArrayConstructor;

const STORAGE: Record<string, TypedArrayCtor> = {
  Float32Array,
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
};

export interface BufAttribute {
  array: Float32Array | Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array;
  itemSize: number;
  count: number;
}

export interface BufData {
  vertexCount: number;
  indexCount: number;
  attributes: Record<string, BufAttribute>;
}

interface HeaderAttribute {
  id: string;
  needsPack: boolean;
  componentSize: number;
  storageType: string;
  packedComponents?: { from: number; delta: number }[];
}

export function parseBuf(buffer: ArrayBuffer): BufData {
  const headerLength = new Uint32Array(buffer, 0, 1)[0] ?? 0;
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerLength))) as {
    vertexCount: number;
    indexCount: number;
    attributes: HeaderAttribute[];
  };

  let offset = 4 + headerLength;
  const attributes: Record<string, BufAttribute> = {};

  for (const attr of header.attributes) {
    const count = attr.id === "indices" ? header.indexCount : header.vertexCount;
    const Ctor = STORAGE[attr.storageType];
    if (!Ctor) throw new Error(`Unsupported storage type ${attr.storageType}`);
    const length = count * attr.componentSize;
    const byteLength = length * Ctor.BYTES_PER_ELEMENT;
    // Copy so the view is always aligned, whatever the header length was.
    const raw = new Ctor(buffer.slice(offset, offset + byteLength));
    offset += byteLength;

    let array: BufAttribute["array"] = raw;
    if (attr.needsPack && attr.packedComponents) {
      const range = 2 ** (Ctor.BYTES_PER_ELEMENT * 8);
      const bias = attr.storageType.startsWith("Int") ? range * 0.5 : 0;
      const scale = 1 / (range - 1);
      const out = new Float32Array(length);
      const comps = attr.packedComponents;
      let k = 0;
      for (let i = 0; i < count; i++) {
        for (const comp of comps) {
          out[k] = ((raw[k] ?? 0) + bias) * scale * comp.delta + comp.from;
          k++;
        }
      }
      array = out;
    }
    attributes[attr.id] = { array, itemSize: attr.componentSize, count };
  }

  return { vertexCount: header.vertexCount, indexCount: header.indexCount, attributes };
}

export async function loadBuf(url: string): Promise<BufData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
  return parseBuf(await response.arrayBuffer());
}

/** Float attribute lookup that fails loudly if the file does not carry it. */
export function floatAttribute(data: BufData, id: string): Float32Array {
  const attr = data.attributes[id];
  if (!attr) throw new Error(`Missing "${id}" attribute`);
  return attr.array as Float32Array;
}
