import * as THREE from "three";

// Gaussian splat renderer for ".sog" files (an uncompressed zip of WebP images holding quantised
// splat data). The desk props - keyboard, controller, pegboard clutter - are stored this way.

interface SogMeta {
  count: number;
  means: { mins: number[]; maxs: number[] };
  scales: { codebook: number[] };
  sh0: { codebook: number[] };
  shN?: { bands: number; codebook: number[] };
}

const vertexShader = /* glsl */ `
precision highp float;
precision highp int;
#define varying out

uint pack8888(vec4 v) { uvec4 t = uvec4(v * 255.0 + .5) << uvec4(24u, 16u, 8u, 0u); return t.x | t.y | t.z | t.w; }
vec4 unpack8888(uint v) { return vec4((uvec4(v) >> uvec4(24u, 16u, 8u, 0u)) & 0xffu) / 255.0; }
vec3 unpack101010(uint v) { return vec3((uvec3(v) >> uvec3(20u, 10u, 0u)) & 0x3ffu) / 1023.0; }
vec3 unpack111110(uint v) { return vec3((uvec3(v) >> uvec3(21u, 10u, 0u)) & uvec3(0x7ffu, 0x7ffu, 0x3ffu)) / vec3(2047.0, 2047.0, 1023.0); }

uniform highp usampler2D splatIndexTexture;
uniform highp usampler2D splatTexture;
uniform ivec2 splatTextureSize;
uniform sampler2D sh0Texture;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec2 viewport;
uniform vec2 focal;
uniform vec3 means_mins;
uniform vec3 means_maxs;
uniform float scales_mins;
uniform float scales_maxs;
uniform float sh0_mins;
uniform float sh0_maxs;
uniform float opacity;
uniform float colorMultiplier;
varying vec4 vColor;
varying vec2 vConic;
varying float vConicW;
varying vec2 vCenter;

mat3 quatToMat3(vec4 q) {
  float x = q.x; float y = q.y; float z = q.z; float w = q.w;
  float x2 = x + x; float y2 = y + y; float z2 = z + z;
  float xx = x * x2; float xy = x * y2; float xz = x * z2;
  float yy = y * y2; float yz = y * z2; float zz = z * z2;
  float wx = w * x2; float wy = w * y2; float wz = w * z2;
  return mat3(1.0 - (yy + zz), xy + wz, xz - wy, xy - wz, 1.0 - (xx + zz), yz + wx, xz + wy, yz - wx, 1.0 - (xx + yy));
}
const vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

vec3 unpackCenter(uvec4 packedData) {
  vec3 l = unpack8888(packedData.x).xyz;
  vec3 u = unpack8888(packedData.y).xyz;
  vec3 n = (l + u * 256.0) / 257.0;
  vec3 v = mix(means_mins, means_maxs, n);
  return sign(v) * (exp(abs(v)) - 1.0);
}
vec4 unpackQuat(uvec4 packedData) {
  vec3 qdata = unpack8888(packedData.z).xyz;
  uint qmode = packedData.w & 0x3u;
  vec3 abc = (qdata - 0.5) * sqrt(2.0);
  float d = sqrt(max(0.0, 1.0 - dot(abc, abc)));
  return ((qmode == 0u) ? vec4(d, abc) : ((qmode == 1u) ? vec4(abc.x, d, abc.yz) : ((qmode == 2u) ? vec4(abc.xy, d, abc.z) : vec4(abc, d)))).yzwx;
}
vec3 unpackScale(uvec4 packedData) {
  vec3 sdata = unpack101010(packedData.w >> 2u);
  return exp(mix(vec3(scales_mins), vec3(scales_maxs), sdata));
}

#ifdef SH_COEFFS
uniform sampler2D shNTexture;
uniform float shN_mins;
uniform float shN_maxs;
vec3[SH_COEFFS] unpackShN(uvec4 packedData) {
  ivec2 tmp = ivec2(packedData.xy & 255u);
  int idx = tmp.x + tmp.y * 256;
  int x = (idx % 64) * SH_COEFFS;
  int y = idx / 64;
  vec3 sh[SH_COEFFS];
  for (int i = 0; i < SH_COEFFS; i++) {
    sh[i] = mix(vec3(shN_mins), vec3(shN_maxs), unpack111110(pack8888(texelFetch(shNTexture, ivec2(x + i, y), 0))));
  }
  return sh;
}
const float SH_C1 = 0.4886025119029199;
#if SH_COEFFS > 3
const float SH_C2_0 = 1.0925484305920792; const float SH_C2_1 = -1.0925484305920792; const float SH_C2_2 = 0.31539156525252005; const float SH_C2_3 = -1.0925484305920792; const float SH_C2_4 = 0.5462742152960396;
#endif
#if SH_COEFFS > 8
const float SH_C3_0 = -0.5900435899266435; const float SH_C3_1 = 2.890611442640554; const float SH_C3_2 = -0.4570457994644658; const float SH_C3_3 = 0.3731763325901154; const float SH_C3_4 = -0.4570457994644658; const float SH_C3_5 = 1.445305721320277; const float SH_C3_6 = -0.5900435899266435;
#endif
vec3 evalSH(in vec3 sh[SH_COEFFS], in vec3 dir) {
  float x = dir.x; float y = dir.y; float z = dir.z;
  vec3 result = SH_C1 * (-sh[0] * y + sh[1] * z - sh[2] * x);
  #if SH_COEFFS > 3
  float xx = x * x; float yy = y * y; float zz = z * z; float xy = x * y; float yz = y * z; float xz = x * z;
  result += sh[3] * (SH_C2_0 * xy) + sh[4] * (SH_C2_1 * yz) + sh[5] * (SH_C2_2 * (2.0 * zz - xx - yy)) + sh[6] * (SH_C2_3 * xz) + sh[7] * (SH_C2_4 * (xx - yy));
  #endif
  #if SH_COEFFS > 8
  result += sh[8] * (SH_C3_0 * y * (3.0 * xx - yy)) + sh[9] * (SH_C3_1 * xy * z) + sh[10] * (SH_C3_2 * y * (4.0 * zz - xx - yy)) + sh[11] * (SH_C3_3 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy)) + sh[12] * (SH_C3_4 * x * (4.0 * zz - xx - yy)) + sh[13] * (SH_C3_5 * z * (xx - yy)) + sh[14] * (SH_C3_6 * x * (xx - 3.0 * yy));
  #endif
  return result;
}
#endif
const float SH_C0 = 0.28209479177387814;

void main() {
  int splatID = gl_VertexID / 4;
  int splatIndex = int(texelFetch(splatIndexTexture, ivec2(splatID % splatTextureSize.x, splatID / splatTextureSize.x), 0).r);
  ivec2 splatXY = ivec2(splatIndex % splatTextureSize.x, splatIndex / splatTextureSize.x);
  int cornerID = gl_VertexID % 4;
  vec2 position = vec2(cornerID % 2, cornerID / 2) * 2. - 1.;
  uvec4 packedData = texelFetch(splatTexture, splatXY, 0);
  vec4 sh0Data = texelFetch(sh0Texture, splatXY, 0);
  vec3 center = unpackCenter(packedData);
  vec4 quat = unpackQuat(packedData);
  vec3 scale = unpackScale(packedData);
  vec3 sh0 = vec3(0.5) + mix(vec3(sh0_mins), vec3(sh0_maxs), unpack111110(pack8888(sh0Data))) * SH_C0;
  float alpha = float(packedData.z & 0xffu) / 255.0;

  vec4 viewCenter = modelViewMatrix * vec4(center, 1.);
  vec4 clipCenter = projectionMatrix * viewCenter;
  if (viewCenter.z > 0.) { gl_Position = discardVec; return; }

  // Project the 3D gaussian's covariance to a 2D ellipse on screen.
  float s = 1.0 / (viewCenter.z * viewCenter.z);
  mat3 J = mat3(focal.x / viewCenter.z, 0., -(focal.x * viewCenter.x) * s, 0., focal.y / viewCenter.z, -(focal.y * viewCenter.y) * s, 0.0, 0.0, 0.0);
  mat3 rot = quatToMat3(quat);
  mat3 M = transpose(mat3(scale.x * rot[0], scale.y * rot[1], scale.z * rot[2]));
  vec3 covA = vec3(dot(M[0], M[0]), dot(M[0], M[1]), dot(M[0], M[2]));
  vec3 covB = vec3(dot(M[1], M[1]), dot(M[1], M[2]), dot(M[2], M[2]));
  mat3 Vrk = mat3(covA.x, covA.y, covA.z, covA.y, covB.x, covB.y, covA.z, covB.y, covB.z);
  mat3 W = transpose(mat3(modelViewMatrix));
  mat3 T = W * J;
  mat3 cov = transpose(T) * Vrk * T;
  vec3 cov2D = vec3(cov[0][0], cov[0][1], cov[1][1]);
  cov2D.x += 0.3;
  cov2D.z += 0.3;
  float det = cov2D.x * cov2D.z - cov2D.y * cov2D.y;
  vec3 conic = vec3(cov2D.z, -cov2D.y, cov2D.x) / det;
  float traceOver2 = 0.5 * (cov2D.x + cov2D.z);
  float radius = length(vec2((cov2D.x - cov2D.z) / 2.0, cov2D.y));
  float eigenValue1 = traceOver2 + radius;
  float eigenValue2 = max(traceOver2 - radius, 0.1);
  float vmin = min(1024.0, min(viewport.x, viewport.y));
  vec2 radius_vec = (2.0 * min(sqrt(vec2(eigenValue1, eigenValue2) * 2.), vmin));
  vec2 c = clipCenter.ww / viewport;
  if (any(greaterThan(abs(clipCenter.xy) - vec2(max(radius_vec.x, radius_vec.y)) * c, clipCenter.ww))) { gl_Position = discardVec; return; }
  vec2 eigenVector1 = normalize(vec2(cov2D.y, eigenValue1 - cov2D.x));
  vec2 eigenVector2 = vec2(eigenVector1.y, -eigenVector1.x);
  vec2 offsetPixels = position.x * eigenVector1 * radius_vec.x + position.y * eigenVector2 * radius_vec.y;
  clipCenter.xy += (offsetPixels / viewport) * clipCenter.w * 2.;
  gl_Position = clipCenter;

  vec3 color = sh0;
  #ifdef SH_COEFFS
  vec3 dir = normalize((viewCenter.xyz / viewCenter.w) * mat3(modelViewMatrix));
  vec3 sh[SH_COEFFS] = unpackShN(packedData);
  color += evalSH(sh, dir);
  #endif
  vColor = vec4(color * colorMultiplier * mix(alpha, 1., .5 + colorMultiplier * .5), alpha * opacity);
  vConic = conic.xy;
  vConicW = conic.z;
  vCenter = offsetPixels;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
in vec4 vColor;
in vec2 vConic;
in float vConicW;
in vec2 vCenter;
out vec4 fragColor;
void main() {
  float power = -0.5 * (vCenter.x * (vCenter.x * vConic.x + vCenter.y * vConic.y) + vCenter.y * (vCenter.x * vConic.y + vCenter.y * vConicW));
  if (power > 0.0) discard;
  float alpha = min(0.99, vColor.a * exp(power));
  if (alpha < 1.0 / 255.0) discard;
  fragColor = vec4(vColor.rgb, alpha);
}
`;

const copyVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const copyFragment = /* glsl */ `
  uniform sampler2D uTexture;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uTexture, vUv);
  }
`;

/** Read the stored (uncompressed) entries of a zip archive. */
function readStoredZip(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const size = buffer.byteLength;
  let eocd = -1;
  for (let i = 0; i < Math.min(size - 22, 65535); i++) {
    if (view.getUint32(size - 22 - i, true) === 0x06054b50) {
      eocd = size - 22 - i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip archive");
  const files: Record<string, Uint8Array> = {};
  const decoder = new TextDecoder();
  const entries = view.getUint16(eocd + 8, true);
  let offset = view.getUint32(eocd + 16, true);
  for (let i = 0; i < entries && view.getUint32(offset, true) === 0x02014b50; i++) {
    const method = view.getUint16(offset + 10, true);
    const length = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
    if (method === 0) {
      const start =
        local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      files[name] = new Uint8Array(buffer, start, length);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const unlog = (n: number) => Math.sign(n) * (Math.exp(Math.abs(n)) - 1);

export class Splats extends THREE.Object3D {
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.RawShaderMaterial>;
  private centers = new Float32Array(0);
  private splatCount = 0;
  private indexData = new Uint32Array(0);
  private indexTexture?: THREE.DataTexture;
  private depths = new Float32Array(0);
  private buckets = new Uint32Array(65537);
  private lastDir = new THREE.Vector3(0, 0, 1);
  private lastZ = 1e4;
  private focal = new THREE.Vector2();
  private viewport = new THREE.Vector2();
  private dir = new THREE.Vector3();
  private modelView = new THREE.Matrix4();

  /** Decode the exact RGBA bytes of an image by drawing it to an 8-bit target and reading back. */
  private static async readPixels(renderer: THREE.WebGLRenderer, bytes: Uint8Array) {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    const texture = new THREE.Texture(bitmap);
    texture.flipY = false;
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const target = new THREE.WebGLRenderTarget(bitmap.width, bitmap.height, { depthBuffer: false });
    const scene = new THREE.Scene();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uTexture: { value: texture } },
        vertexShader: copyVertex,
        fragmentShader: copyFragment,
        depthTest: false,
      }),
    );
    quad.frustumCulled = false;
    scene.add(quad);
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, new THREE.Camera());
    const pixels = new Uint8Array(bitmap.width * bitmap.height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, bitmap.width, bitmap.height, pixels);
    renderer.setRenderTarget(previous);
    texture.dispose();
    target.dispose();
    quad.geometry.dispose();
    quad.material.dispose();
    const { width, height } = bitmap;
    bitmap.close();
    return { pixels, width, height };
  }

  async load(url: string, renderer: THREE.WebGLRenderer) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    const files = readStoredZip(await response.arrayBuffer());
    const metaBytes = files["meta.json"];
    if (!metaBytes) throw new Error("Splat file has no meta.json");
    const meta = JSON.parse(new TextDecoder().decode(metaBytes)) as SogMeta;
    const read = (name: string) => {
      const bytes = files[name];
      if (!bytes) throw new Error(`Splat file is missing ${name}`);
      return Splats.readPixels(renderer, bytes);
    };
    const [meansL, meansU, quats, scales, sh0, labels, centroids] = await Promise.all([
      read("means_l.webp"),
      read("means_u.webp"),
      read("quats.webp"),
      read("scales.webp"),
      read("sh0.webp"),
      meta.shN ? read("shN_labels.webp") : null,
      meta.shN ? read("shN_centroids.webp") : null,
    ]);

    const { width, height } = meansL;
    const texels = width * height;
    const count = (this.splatCount = meta.count);
    // Quantised values index a 256-entry codebook; renormalise them to 0..1 across its range.
    const normaliser = (codebook: number[]) => {
      const lo = codebook[0] ?? 0;
      const span = (codebook[255] ?? 1) - lo;
      return (byte: number) => ((codebook[byte] ?? lo) - lo) / span;
    };
    const pack111110 = (r: number, g: number, b: number) =>
      ((Math.floor(r * 2047) << 21) | (Math.floor(g * 2047) << 10) | Math.floor(b * 1023)) >>> 0;
    const be = (a: number, b: number, c: number, d: number) =>
      ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;

    const scaleNorm = normaliser(meta.scales.codebook);
    const sh0Norm = normaliser(meta.sh0.codebook);
    const packed = new Uint32Array(texels * 4);
    const sh0Packed = new Uint8Array(texels * 4);
    this.centers = new Float32Array(count * 3);
    const { mins, maxs } = meta.means;
    for (let i = 0, p = 0; i < texels; i++, p += 4) {
      const l = meansL.pixels;
      const u = meansU.pixels;
      const q = quats.pixels;
      const s = scales.pixels;
      const c = sh0.pixels;
      packed[p] = be(l[p] ?? 0, l[p + 1] ?? 0, l[p + 2] ?? 0, labels?.pixels[p] ?? 0);
      packed[p + 1] = be(u[p] ?? 0, u[p + 1] ?? 0, u[p + 2] ?? 0, labels?.pixels[p + 1] ?? 0);
      packed[p + 2] = be(q[p] ?? 0, q[p + 1] ?? 0, q[p + 2] ?? 0, c[p + 3] ?? 0);
      const scale =
        ((Math.floor(scaleNorm(s[p] ?? 0) * 1023) << 20) |
          (Math.floor(scaleNorm(s[p + 1] ?? 0) * 1023) << 10) |
          Math.floor(scaleNorm(s[p + 2] ?? 0) * 1023)) >>>
        0;
      packed[p + 3] = ((scale << 2) | (((q[p + 3] ?? 252) - 252) & 3)) >>> 0;
      const colour = pack111110(sh0Norm(c[p] ?? 0), sh0Norm(c[p + 1] ?? 0), sh0Norm(c[p + 2] ?? 0));
      sh0Packed[p] = colour >>> 24;
      sh0Packed[p + 1] = (colour >>> 16) & 255;
      sh0Packed[p + 2] = (colour >>> 8) & 255;
      sh0Packed[p + 3] = colour & 255;
      if (i < count) {
        for (let k = 0; k < 3; k++) {
          const n = (((u[p + k] ?? 0) << 8) | (l[p + k] ?? 0)) / 65535;
          const lo = mins[k] ?? 0;
          this.centers[i * 3 + k] = unlog(lo + n * ((maxs[k] ?? 0) - lo));
        }
      }
    }

    const splatTexture = new THREE.DataTexture(
      packed,
      width,
      height,
      THREE.RGBAIntegerFormat,
      THREE.UnsignedIntType,
    );
    splatTexture.internalFormat = "RGBA32UI";
    splatTexture.needsUpdate = true;
    const sh0Texture = new THREE.DataTexture(
      sh0Packed,
      width,
      height,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    sh0Texture.needsUpdate = true;

    this.indexData = new Uint32Array(texels);
    for (let i = 0; i < count; i++) this.indexData[i] = i;
    this.indexTexture = new THREE.DataTexture(
      this.indexData,
      width,
      height,
      THREE.RedIntegerFormat,
      THREE.UnsignedIntType,
    );
    this.indexTexture.internalFormat = "R32UI";
    this.indexTexture.needsUpdate = true;
    this.depths = new Float32Array(count);

    const uniforms: Record<string, THREE.IUniform> = {
      splatIndexTexture: { value: this.indexTexture },
      splatTexture: { value: splatTexture },
      splatTextureSize: { value: new THREE.Vector2(width, height) },
      sh0Texture: { value: sh0Texture },
      focal: { value: this.focal },
      viewport: { value: this.viewport },
      means_mins: { value: new THREE.Vector3().fromArray(mins) },
      means_maxs: { value: new THREE.Vector3().fromArray(maxs) },
      scales_mins: { value: meta.scales.codebook[0] },
      scales_maxs: { value: meta.scales.codebook[255] },
      sh0_mins: { value: meta.sh0.codebook[0] },
      sh0_maxs: { value: meta.sh0.codebook[255] },
      opacity: { value: 1 },
      colorMultiplier: { value: 1 },
    };
    const defines: Record<string, number> = {};
    if (meta.shN && centroids) {
      const shNorm = normaliser(meta.shN.codebook);
      const src = centroids.pixels;
      const out = new Uint8Array(src.length);
      for (let p = 0; p < src.length; p += 4) {
        const v = pack111110(shNorm(src[p] ?? 0), shNorm(src[p + 1] ?? 0), shNorm(src[p + 2] ?? 0));
        out[p] = v >>> 24;
        out[p + 1] = (v >>> 16) & 255;
        out[p + 2] = (v >>> 8) & 255;
        out[p + 3] = v & 255;
      }
      const shNTexture = new THREE.DataTexture(
        out,
        centroids.width,
        centroids.height,
        THREE.RGBAFormat,
        THREE.UnsignedByteType,
      );
      shNTexture.needsUpdate = true;
      uniforms["shNTexture"] = { value: shNTexture };
      uniforms["shN_mins"] = { value: meta.shN.codebook[0] };
      uniforms["shN_maxs"] = { value: meta.shN.codebook[255] };
      defines["SH_COEFFS"] = [3, 8, 15][meta.shN.bands - 1] ?? 3;
    }

    // Four corner vertices per splat, positioned entirely in the vertex shader from gl_VertexID.
    const geometry = new THREE.BufferGeometry();
    const index = new Uint32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const v = i * 4;
      index.set([v, v + 3, v + 1, v, v + 2, v + 3], i * 6);
    }
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(count * 4 * 3), 3),
    );

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.RawShaderMaterial({
        uniforms,
        defines,
        vertexShader,
        fragmentShader,
        glslVersion: THREE.GLSL3,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const size = renderer.getDrawingBufferSize(this.viewport);
      this.focal.set(
        ((camera.projectionMatrix.elements[0] ?? 1) * size.x) / 2,
        ((camera.projectionMatrix.elements[5] ?? 1) * size.y) / 2,
      );
    };
    this.add(this.mesh);
  }

  /** Re-sort back to front whenever the view direction or distance changes. */
  update(camera: THREE.Camera) {
    const mesh = this.mesh;
    if (!mesh || !this.indexTexture) return;
    this.modelView.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    const e = this.modelView.elements;
    const dx = e[2] ?? 0;
    const dy = e[6] ?? 0;
    const dz = e[10] ?? 1;
    const tz = e[14] ?? 0;
    this.dir.set(dx, dy, dz).normalize();
    if (this.dir.dot(this.lastDir) >= 0.99999 && Math.abs(tz - this.lastZ) <= 1e-5) return;
    this.lastDir.copy(this.dir);
    this.lastZ = tz;

    const { centers, depths, buckets, indexData } = this;
    const count = this.splatCount;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0, k = 0; i < count; i++, k += 3) {
      const z =
        dx * (centers[k] ?? 0) + dy * (centers[k + 1] ?? 0) + dz * (centers[k + 2] ?? 0) + tz;
      depths[i] = z;
      if (z < min) min = z;
      if (z > max) max = z;
    }
    // Counting sort on 16-bit depth: farthest (most negative view z) first.
    const scale = 65535 / Math.max(max - min, 1e-9);
    buckets.fill(0);
    for (let i = 0; i < count; i++) {
      const bucket = (((depths[i] ?? 0) - min) * scale) | 0;
      buckets[bucket + 1] = (buckets[bucket + 1] ?? 0) + 1;
    }
    for (let i = 1; i <= 65536; i++) buckets[i] = (buckets[i] ?? 0) + (buckets[i - 1] ?? 0);
    for (let i = 0; i < count; i++) {
      const bucket = (((depths[i] ?? 0) - min) * scale) | 0;
      const slot = buckets[bucket] ?? 0;
      buckets[bucket] = slot + 1;
      indexData[slot] = i;
    }
    this.indexTexture.needsUpdate = true;
  }
}
