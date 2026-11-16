import * as THREE from "three";

// Bloom: the scene is drawn to an off-screen buffer, its bright parts are blurred at five
// scales, and the blurs are added back on the way to the screen.

const ITERATIONS = 5;
const THRESHOLD = 0.3;
const SMOOTH_WIDTH = 0.75;
const RADIUS = 0.25;

const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Keep what should glow. "Luma" lifts everything above a soft threshold; "selective" picks out
// only the brightest elements (headline, speculars, the hot cup).
const highPassFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uLumaStrength;
  uniform float uSelectiveStrength;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(uTexture, vUv);
    float luma = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
    float soft = smoothstep(${THRESHOLD}, ${THRESHOLD + SMOOTH_WIDTH}, luma);
    float bright = smoothstep(0.6, 0.95, luma);
    gl_FragColor = vec4(texel.rgb * (soft * uLumaStrength + bright * uSelectiveStrength), 1.0);
  }
`;

const blurFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform vec2 uResolution;
  uniform vec2 uDirection;
  float gaussianPdf(in float x, in float sigma) {
    return 0.39894 * exp(-0.5 * x * x / (sigma * sigma)) / sigma;
  }
  void main() {
    vec2 invSize = 1.0 / uResolution;
    float sigma = float(SIGMA);
    float weightSum = gaussianPdf(0.0, sigma);
    vec3 sum = texture2D(uTexture, vUv).rgb * weightSum;
    for (int i = 1; i < KERNEL_RADIUS; i++) {
      float x = float(i);
      float w = gaussianPdf(x, sigma);
      vec2 offset = uDirection * invSize * x;
      sum += (texture2D(uTexture, vUv + offset).rgb + texture2D(uTexture, vUv - offset).rgb) * w;
      weightSum += 2.0 * w;
    }
    gl_FragColor = vec4(sum / weightSum, 1.0);
  }
`;

// The scene buffer is premultiplied; adding light without raising alpha keeps the glow additive
// over whatever the page shows behind the canvas.
const compositeFragment = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform sampler2D uBlur0;
  uniform sampler2D uBlur1;
  uniform sampler2D uBlur2;
  uniform sampler2D uBlur3;
  uniform sampler2D uBlur4;
  uniform float uWeights[${ITERATIONS}];
  uniform float uSaturation;
  void main() {
    vec4 color = texture2D(uTexture, vUv);
    vec3 bloom = uWeights[0] * texture2D(uBlur0, vUv).rgb
      + uWeights[1] * texture2D(uBlur1, vUv).rgb
      + uWeights[2] * texture2D(uBlur2, vUv).rgb
      + uWeights[3] * texture2D(uBlur3, vUv).rgb
      + uWeights[4] * texture2D(uBlur4, vUv).rgb;
    float luma = dot(bloom, vec3(0.299, 0.587, 0.114));
    color.rgb += mix(vec3(luma), bloom, uSaturation);
    gl_FragColor = color;
  }
`;

export interface BloomSettings {
  amount: number;
  lumaStrength: number;
  selectiveStrength: number;
  saturation: number;
}

/** Move a settings object a fraction of the way towards a target look. */
export function blendBloom(settings: BloomSettings, target: BloomSettings, t: number) {
  const k = Math.min(1, Math.max(0, t));
  settings.amount += (target.amount - settings.amount) * k;
  settings.lumaStrength += (target.lumaStrength - settings.lumaStrength) * k;
  settings.selectiveStrength += (target.selectiveStrength - settings.selectiveStrength) * k;
  settings.saturation += (target.saturation - settings.saturation) * k;
}

export class Bloom {
  /** Draw the scene into this when bloom is on. */
  readonly target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  private highPass = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private horizontal: THREE.WebGLRenderTarget[] = [];
  private vertical: THREE.WebGLRenderTarget[] = [];
  private blurMaterials: THREE.ShaderMaterial[] = [];
  private highPassMaterial: THREE.ShaderMaterial;
  private compositeMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private weights: number[] = new Array<number>(ITERATIONS).fill(0);
  private size = new THREE.Vector2();
  private directionX = new THREE.Vector2(1, 0);
  private directionY = new THREE.Vector2(0, 1);

  constructor() {
    const material = (
      fragmentShader: string,
      uniforms: Record<string, THREE.IUniform>,
      defines = {},
    ) =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader,
        uniforms,
        defines,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    this.highPassMaterial = material(highPassFragment, {
      uTexture: { value: this.target.texture },
      uLumaStrength: { value: 0 },
      uSelectiveStrength: { value: 0 },
    });
    const compositeUniforms: Record<string, THREE.IUniform> = {
      uTexture: { value: this.target.texture },
      uWeights: { value: this.weights },
      uSaturation: { value: 1 },
    };
    for (let i = 0; i < ITERATIONS; i++) {
      const h = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
      const v = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
      this.horizontal.push(h);
      this.vertical.push(v);
      const radius = 3 + i * 2;
      this.blurMaterials.push(
        material(
          blurFragment,
          {
            uTexture: { value: null },
            uResolution: { value: new THREE.Vector2() },
            uDirection: { value: this.directionX },
          },
          { KERNEL_RADIUS: radius, SIGMA: radius },
        ),
      );
      compositeUniforms[`uBlur${i}`] = { value: v.texture };
    }
    this.compositeMaterial = material(compositeFragment, compositeUniforms);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.highPassMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Match the buffers to the canvas' drawing size. */
  resize(renderer: THREE.WebGLRenderer) {
    renderer.getDrawingBufferSize(this.size);
    const { x, y } = this.size;
    if (this.target.width === x && this.target.height === y) return;
    this.target.setSize(x, y);
    let w = Math.ceil(x / 2);
    let h = Math.ceil(y / 2);
    this.highPass.setSize(w, h);
    for (let i = 0; i < ITERATIONS; i++) {
      this.horizontal[i]?.setSize(w, h);
      this.vertical[i]?.setSize(w, h);
      this.blurMaterials[i]?.uniforms["uResolution"]?.value.set(w, h);
      w = Math.ceil(w / 2);
      h = Math.ceil(h / 2);
    }
  }

  private pass(
    renderer: THREE.WebGLRenderer,
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null,
  ) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  /** Blur the bright parts of `target` and draw scene + glow to the screen. */
  render(renderer: THREE.WebGLRenderer, settings: BloomSettings) {
    const scissor = renderer.getScissorTest();
    renderer.setScissorTest(false);
    const hp = this.highPassMaterial.uniforms;
    if (hp["uLumaStrength"]) hp["uLumaStrength"].value = settings.lumaStrength;
    if (hp["uSelectiveStrength"]) hp["uSelectiveStrength"].value = settings.selectiveStrength;
    this.pass(renderer, this.highPassMaterial, this.highPass);

    let source = this.highPass;
    for (let i = 0; i < ITERATIONS; i++) {
      const material = this.blurMaterials[i];
      const h = this.horizontal[i];
      const v = this.vertical[i];
      if (!material || !h || !v) continue;
      const u = material.uniforms;
      if (u["uTexture"]) u["uTexture"].value = source.texture;
      if (u["uDirection"]) u["uDirection"].value = this.directionX;
      this.pass(renderer, material, h);
      if (u["uTexture"]) u["uTexture"].value = h.texture;
      if (u["uDirection"]) u["uDirection"].value = this.directionY;
      this.pass(renderer, material, v);
      source = v;
      // Wider blurs contribute less; the balance between tight and wide is the bloom "radius".
      const d = (ITERATIONS - i) / ITERATIONS;
      this.weights[i] =
        (settings.amount * (d + (1.2 - d * 2) * RADIUS)) / 2 ** (ITERATIONS - i - 1);
    }
    const cu = this.compositeMaterial.uniforms;
    if (cu["uSaturation"]) cu["uSaturation"].value = settings.saturation;
    this.pass(renderer, this.compositeMaterial, null);
    renderer.setScissorTest(scissor);
  }

  dispose() {
    for (const t of [this.target, this.highPass, ...this.horizontal, ...this.vertical]) t.dispose();
  }
}
