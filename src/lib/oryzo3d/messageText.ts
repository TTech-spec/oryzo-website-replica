import * as THREE from "three";

// Renders the coaster's stamped message from a multi-channel distance-field font sheet into a
// small texture: red/green hold the emboss slope, blue the ink coverage.

interface FontChar {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  xoffset: number;
  yoffset: number;
  xadvance: number;
}

interface FontData {
  chars: FontChar[];
  common: { scaleW: number; scaleH: number };
  kernings?: { first: number; second: number; amount: number }[];
}

const WIDTH = 1024;
const HEIGHT = 128;
const ZOOM = 5.5;
const LETTER_SPACING = -0.25;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uMap;
  float median(float r, float g, float b) { return max(min(r, g), min(max(r, g), b)); }
  float getAlpha(vec2 uv) {
    vec3 s = texture2D(uMap, uv).rgb;
    float sigDist = median(s.r, s.g, s.b) - 0.4;
    return clamp(sigDist / fwidth(4.0 * sigDist) + 0.5, 0.0, 1.0);
  }
  void main() {
    vec2 texel = 1.0 / vec2(${WIDTH}.0, ${HEIGHT}.0);
    float alpha = getAlpha(vUv);
    vec2 bump = vec2(getAlpha(vUv + vec2(texel.x, 0.0)), getAlpha(vUv + vec2(0.0, texel.y))) - alpha;
    if (alpha < 0.1) discard;
    gl_FragColor = vec4(bump, alpha, 1.0);
  }
`;

export class MessageText {
  readonly target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: false });
  private font?: FontData;
  private glyphs = new Map<number, FontChar>();
  private kernings = new Map<string, number>();
  private scene = new THREE.Scene();
  // Top and bottom are swapped on purpose: the font's layout runs y-down.
  private camera = new THREE.OrthographicCamera(
    -WIDTH / ZOOM,
    WIDTH / ZOOM,
    -HEIGHT / ZOOM,
    HEIGHT / ZOOM,
    0.1,
    2,
  );
  private mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private pending: string | null = null;

  constructor(atlas: THREE.Texture) {
    atlas.minFilter = THREE.LinearFilter;
    atlas.generateMipmaps = false;
    this.camera.position.z = 2;
    this.mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: { uMap: { value: atlas } },
        vertexShader: vertex,
        fragmentShader: fragment,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  async load(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: ${response.status}`);
    const font = (await response.json()) as FontData;
    this.font = font;
    for (const char of font.chars) this.glyphs.set(char.id, char);
    for (const k of font.kernings ?? []) this.kernings.set(`${k.first},${k.second}`, k.amount);
  }

  /** Lay the text out on one line, centred, and draw it. Characters the font lacks are skipped. */
  render(renderer: THREE.WebGLRenderer, text: string) {
    const font = this.font;
    if (!font) {
      this.pending = text;
      return;
    }
    this.pending = null;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const { scaleW, scaleH } = font.common;
    let pen = 0;
    let previous = -1;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const symbol of text) {
      const code = symbol.codePointAt(0) ?? 0;
      const glyph = this.glyphs.get(code);
      if (!glyph) continue;
      pen += this.kernings.get(`${previous},${code}`) ?? 0;
      if (glyph.width > 0 && glyph.height > 0) {
        const x0 = pen + glyph.xoffset;
        const y0 = glyph.yoffset;
        const x1 = x0 + glyph.width;
        const y1 = y0 + glyph.height;
        const base = positions.length / 3;
        positions.push(x0, y0, 0, x1, y0, 0, x0, y1, 0, x1, y1, 0);
        const u0 = glyph.x / scaleW;
        const u1 = (glyph.x + glyph.width) / scaleW;
        const v0 = 1 - glyph.y / scaleH;
        const v1 = 1 - (glyph.y + glyph.height) / scaleH;
        uvs.push(u0, v0, u1, v0, u0, v1, u1, v1);
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        minX = Math.min(minX, x0);
        maxX = Math.max(maxX, x1);
        minY = Math.min(minY, y0);
        maxY = Math.max(maxY, y1);
      }
      pen += glyph.xadvance + LETTER_SPACING;
      previous = code;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    if (indices.length) this.mesh.position.set(-(minX + maxX) / 2, -(minY + maxY) / 2, 1);

    const previousTarget = renderer.getRenderTarget();
    const scissor = renderer.getScissorTest();
    renderer.setScissorTest(false);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    if (indices.length) renderer.render(this.scene, this.camera);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(previousTarget);
    renderer.setScissorTest(scissor);
  }

  /** Draw anything requested before the font finished loading. */
  flush(renderer: THREE.WebGLRenderer) {
    if (this.pending !== null) this.render(renderer, this.pending);
  }
}
