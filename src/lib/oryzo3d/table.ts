import * as THREE from "three";

import { FrameAnimation, fovFromFocal, toGeometry } from "./anim";
import { loadBuf } from "./buf";
import { goboChunk, thermalChunk } from "./shaders";
import { Splats } from "./splats";

// The desk set the magazine cover opens onto: desk, pegboard and wall as baked-texture meshes,
// the props as gaussian splats, plus the takeaway coffee cup that lands on the coaster.

const deskVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vModelPosition;
  varying vec3 vWorldPosition;
  #ifdef IS_PINBOARD
    attribute float instanceId;
  #endif
  #ifdef IS_DESK
    attribute float type;
    varying float vShadow;
    varying float vType;
  #endif
  void main() {
    vec3 pos = position;
    vec2 outUv = uv;
    #ifdef IS_PINBOARD
      // The pegboard is one panel drawn twice side by side, each half using its own texture half.
      pos.x += instanceId * 0.767429;
      outUv.y += instanceId * 0.5;
    #endif
    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    vUv = outUv;
    vModelPosition = position;
    vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
    #ifdef IS_DESK
      vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
      vShadow = min(1.0, abs(mod(floor(type + 0.5), 2.0) - 1.0)) * 0.95 + 0.05;
      vShadow *= mix(max(0.0, dot(worldNormal.xz, normalize(vec2(1.0, 0.2)))) * 0.9 + 0.1, 1.0, min(1.0, abs(type - 3.0)));
      vType = type;
    #endif
  }
`;

const deskFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vModelPosition;
  varying vec3 vWorldPosition;
  uniform sampler2D uTexture;
  uniform vec3 uLightPosition;
  uniform float uThermalRatio;
  uniform vec2 uBufferSize;
  ${goboChunk}
  #ifdef IS_DESK
    uniform sampler2D uReflection;
    varying float vType;
    uniform sampler2D uHdTexture;
    uniform float uHdShift;
    uniform mat4 uCoffeeInv;
    uniform mat4 uCoasterInv;
    uniform float uCoffeeOn;
    varying float vShadow;

    float linearstep(float a, float b, float v) { return clamp((v - a) / (b - a), 0.0, 1.0); }
    float sdCappedCone(vec3 p, vec3 a, vec3 b, float ra, float rb) {
      float rba = rb - ra;
      float baba = dot(b - a, b - a);
      float papa = dot(p - a, p - a);
      float paba = dot(p - a, b - a) / baba;
      float x = sqrt(papa - paba * paba * baba);
      float cax = max(0.0, x - ((paba < 0.5) ? ra : rb));
      float cay = abs(paba - 0.5) - 0.5;
      float k = rba * rba + baba;
      float f = clamp((rba * (x - ra) + paba * baba) / k, 0.0, 1.0);
      float cbx = x - ra - f * rba;
      float cby = paba - f;
      float s = (cbx < 0.0 && cay < 0.0) ? -1.0 : 1.0;
      return s * sqrt(min(cax * cax + cay * cay * baba, cbx * cbx + cby * cby * baba));
    }
    // Analytic stand-ins for the coaster and the cup, used to ray-march their shadows on the desk.
    float map(in vec3 worldPos) {
      vec3 c = (uCoasterInv * vec4(worldPos, 1.0)).xyz;
      float yBias = -0.000025;
      float cTop = sdCappedCone(c, vec3(0.0, 0.003 + yBias, 0.0), vec3(0.0, 0.0175 + yBias, 0.0), 0.0415, 0.045);
      float cBottom = sdCappedCone(c, vec3(0.0, yBias, 0.0), vec3(0.0, 0.003 + yBias, 0.0), 0.03912, 0.0397);
      float d = min(cTop, cBottom);
      vec3 k = (uCoffeeInv * vec4(worldPos, 1.0)).xyz;
      float coffee = sdCappedCone(k, vec3(0.0), vec3(0.0, 0.10891598463058472, 0.0), 0.029881315305829048, 0.04465631768107414);
      return min(mix(1.0, coffee, uCoffeeOn), d);
    }
    float calcSoftshadow(in vec3 ro, in vec3 rd, float mint, float maxt, float w) {
      float res = 1.0;
      float t = mint;
      for (int i = 0; i < 32 && t < maxt; i++) {
        float h = map(ro + t * rd);
        res = min(res, h / (w * t));
        t += clamp(h, 0.0005, 0.1);
        if (res < -1.0 || t > maxt) break;
      }
      res = max(res, -1.0);
      return 0.25 * (1.0 + res) * (1.0 + res) * (2.0 - res);
    }
  #endif

  void main() {
    vec2 uv = vUv;
    #ifdef IS_DESK
      // The desk texture gives most of its width to the area around the mat.
      uv.x = pow(linearstep(0.0, 0.25, uv.x), 2.0) * 0.1 + linearstep(0.25, 0.75, uv.x) * 0.8 + pow(linearstep(0.75, 1.0, uv.x), 0.5) * 0.1;
    #endif
    vec3 color = pow(texture2D(uTexture, uv).rgb, vec3(2.2));
    #ifdef IS_DESK
      vec2 hdUv = vModelPosition.xz / vec2(0.45, -0.225) + vec2(0.5, 0.5 - 0.005 * uHdShift);
      hdUv.y = pow(max(0.0, hdUv.y), 1.0 / 1.35);
      float hdBlend = smoothstep(1.0, 0.95, length(hdUv - 0.5) * 2.0);
      color = mix(color, pow(texture2D(uHdTexture, hdUv).rgb, vec3(2.2)), hdBlend);
      color *= vShadow;
      float shadow = calcSoftshadow(vWorldPosition + vec3(0.0, -0.003, 0.0), normalize(uLightPosition - vWorldPosition), 0.005, 1.0, 0.03);
      shadow = clamp(shadow + uThermalRatio * 0.5, 0.0, 1.0);
      color *= 0.05 + 0.95 * shadow * shadow;
      // Faint mirror image of the props in the varnish.
      vec3 reflection = pow(texture2D(uReflection, gl_FragCoord.xy / uBufferSize).rgb, vec3(2.2));
      color += reflection * (vType > 1.5 ? 0.65 : 1.0) * (shadow * 0.8 + 0.2);
    #endif
    float gobo = clamp(sampleGobo(vWorldPosition) + uThermalRatio * 0.5, 0.0, 1.0);
    color *= 0.35 + 0.65 * mix(vec3(0.1, 0.05, 0.0), vec3(1.0), gobo);
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

const coffeeVertex = /* glsl */ `
  #ifdef IS_COVER
    attribute float Cd;
    varying float vAo;
  #else
    varying vec2 vUv;
    varying vec2 vLabelUv;
  #endif
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    #ifdef IS_COVER
      vAo = Cd;
    #else
      // Cup and sleeve share one baked-lighting sheet: cup on the left half, sleeve on the right.
      vUv = uv * vec2(0.5, 1.0);
      #ifdef IS_LABEL
        vUv.x += 0.5;
      #endif
      vLabelUv = uv * vec2(2.0, 1.0);
    #endif
  }
`;

const cupFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vLabelUv;
  varying vec3 vWorldPosition;
  uniform sampler2D uBase;
  uniform sampler2D uLabel;
  uniform vec3 uPosition;
  ${thermalChunk}
  float linearstep(float a, float b, float v) { return clamp((v - a) / (b - a), 0.0, 1.0); }
  void main() {
    vec3 color = pow(texture2D(uBase, vUv).rgb, vec3(2.2));
    color = pow(clamp(color, 0.0, 1.0), vec3(1.3));
    #ifdef IS_CUP
      // Bounce light on the base of the cup: green from the mat in the air, orange once on the coaster.
      float bottomRatio = linearstep(0.04, -0.01, vWorldPosition.y - uPosition.y);
      bottomRatio *= bottomRatio;
      color *= mix(vec3(1.0), mix(vec3(0.0, 0.3, 0.2), vec3(1.0, 0.3, 0.0), linearstep(0.0, 0.0075, uPosition.y)), bottomRatio);
    #endif
    #ifdef IS_LABEL
      vec3 labelColor = pow(texture2D(uLabel, vLabelUv).rrr, vec3(2.2)) * vec3(1.0, 0.9, 0.85);
    #endif
    // The hot drink glows on the heat camera, hotter higher up the cup.
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float thermalLevel = 0.65 + 0.35 * smoothstep(0.1, 0.3, vUv.x);
    vec3 thermal = texture2D(uThermalTexture, vec2(thermalLevel * (0.85 + 0.15 * luma), 0.5)).rgb;
    #ifdef IS_LABEL
      thermal = texture2D(uThermalTexture, vec2(thermalLevel * 0.72 * (1.0 - 0.15 * labelColor.r), 0.5)).rgb;
      color *= mix(labelColor, vec3(1.0), color.r * color.r * 0.07);
    #endif
    color = mix(color, pow(0.1 + thermal, vec3(2.2)), thermalFade());
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

const coverFragment = /* glsl */ `
  varying float vAo;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  ${thermalChunk}
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 L = normalize(vec3(0.5, 0.48, 1.0));
    float NdL = max(0.0, dot(N, L));
    float spec = pow(max(0.0, dot(N, normalize(L + V))), 60.0);
    float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 4.0);
    vec3 color = vec3(0.012) + vec3(0.02) * NdL + vec3(0.55, 0.5, 0.42) * spec + vec3(0.12, 0.1, 0.08) * fresnel;
    color *= 0.35 + 0.65 * vAo;
    vec3 thermal = pow(0.1 + texture2D(uThermalTexture, vec2(0.92 * (0.8 + 0.2 * vAo), 0.5)).rgb, vec3(2.2));
    color = mix(color, thermal, thermalFade());
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// The window-light texture stores a base shadow plus sway amounts and phases per texel, so the
// leaves' shadow moves without any simulation.
const goboFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec4 params = texture2D(uTexture, vUv);
    float amp1 = params.g * uStrength;
    float phase1 = (params.b - 0.5) * 6.283185;
    float amp23 = params.a * uStrength;
    vec3 waves = sin(uTime * vec3(1.0, 2.0, 3.0) + phase1 * vec3(1.0, 2.0, 0.5));
    float motion = amp1 * waves.x + amp23 * 0.5 * waves.y + amp23 * 0.3 * waves.z;
    gl_FragColor = vec4(vec3(clamp(params.r + motion, 0.0, 1.0)), 1.0);
  }
`;

const thermalFragment = /* glsl */ `
  uniform sampler2D uScene;
  ${thermalChunk}
  void main() {
    vec3 scene = texture2D(uScene, gl_FragCoord.xy / uResolution).rgb;
    float luma = dot(scene, vec3(0.299, 0.587, 0.114));
    luma = 0.8 * smoothstep(0.0, 1.5, luma);
    vec3 thermal = 0.1 + pow(texture2D(uThermalTexture, vec2(luma, 0.5)).rgb, vec3(2.2));
    gl_FragColor = vec4(mix(scene, thermal, thermalFade()), 1.0);
  }
`;

const smokeVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Steam: a baked wisp whose density is rebuilt each frame from stored cosine harmonics.
const smokeFragment = /* glsl */ `
  uniform sampler2D uBase;
  uniform sampler2D uHarmonics0;
  uniform sampler2D uHarmonics1;
  uniform float uTime;
  varying vec2 vUv;
  ${thermalChunk}
  const float TAU = 6.283185307179586;
  const float STRENGTH = 0.322202;
  float harmonic(float amp, float pha, float freq) {
    return cos(uTime * freq + (pha - 0.5) * TAU) * amp;
  }
  void main() {
    vec4 base = texture2D(uBase, vUv);
    vec4 h0 = texture2D(uHarmonics0, vUv);
    vec4 h1 = texture2D(uHarmonics1, vUv);
    float c = base.r + harmonic(base.g, base.b, 1.0) * STRENGTH
      + (harmonic(h0.r, h0.g, 2.0) + harmonic(h0.b, h0.a, 3.0)) * STRENGTH
      + (harmonic(h1.r, h1.g, 4.0) + harmonic(h1.b, h1.a, 5.0)) * STRENGTH;
    float s = pow(clamp(c, 0.0, 1.0), 1.0 / 2.2);
    vec4 color = vec4(vec3(s * 0.3 + 0.7), s * 0.15);
    vec3 thermal = pow(texture2D(uThermalTexture, vec2(s, 0.5)).rgb * 0.6 + 0.4, vec3(2.2));
    gl_FragColor = mix(color, vec4(thermal, s), thermalFade());
  }
`;

export class TableScene {
  /** Desk, wall, pegboard, props and the cup. */
  readonly group = new THREE.Group();
  readonly coffee = new THREE.Object3D();
  readonly splats = new Splats();
  /** Light the coaster and desk shadows use on this set. */
  readonly lightPosition = new THREE.Vector3(0.346682, 1.00875, 0.168255);
  ready = false;
  /** Desk, wall, pegboard and splat props: everything the heat camera re-colours as a backdrop. */
  readonly surfaces = new THREE.Group();
  /** 0..1 strength of the heat-camera look, and its wipe position (0 -> 1 in, 1 -> 2 out). */
  thermalRatio = 0;
  thermalAnimation = 0;

  private reflectionSplats = new Splats();
  private reflectionTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private sceneTarget = new THREE.WebGLRenderTarget(1, 1);
  private goboTarget = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false });
  private goboScene = new THREE.Scene();
  private goboUniforms = {
    uTexture: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStrength: { value: 0.4630597 },
  };
  private goboTextures: { desk: THREE.Texture | null; leaves: THREE.Texture | null } = {
    desk: null,
    leaves: null,
  };
  private thermalScene = new THREE.Scene();
  private quadCamera = new THREE.Camera();
  private smoke?: THREE.Mesh;
  private smokeTime = { value: 0 };
  private bufferSize = new THREE.Vector2(1, 1);
  private q = new THREE.Quaternion();

  private cameraAnimation?: FrameAnimation;
  private coasterAnimation?: FrameAnimation;
  private coffeeAnimation?: FrameAnimation;
  private uniforms = {
    uLightPosition: { value: this.lightPosition },
    uCoffeeInv: { value: new THREE.Matrix4() },
    uCoasterInv: { value: new THREE.Matrix4() },
    uCoffeeOn: { value: 1 },
    uHdShift: { value: 0 },
    uPosition: { value: new THREE.Vector3() },
    uGobo: { value: this.goboTarget.texture as THREE.Texture },
    uGoboMatrix: { value: new THREE.Matrix4() },
    uGoboOpacity: { value: 1 },
    uReflection: { value: this.reflectionTarget.texture as THREE.Texture },
    uBufferSize: { value: this.bufferSize },
    uResolution: { value: this.bufferSize },
    uThermalTexture: { value: null as THREE.Texture | null },
    uThermalAnimation: { value: 0 },
    uThermalRatio: { value: 0 },
  };
  /** Window-light and heat-camera uniforms, for materials outside this module (the coaster). */
  get lightUniforms() {
    const u = this.uniforms;
    return {
      uGobo: u.uGobo,
      uGoboMatrix: u.uGoboMatrix,
      uGoboOpacity: u.uGoboOpacity,
      uThermalTexture: u.uThermalTexture,
      uThermalAnimation: u.uThermalAnimation,
      uResolution: u.uResolution,
    };
  }

  constructor() {
    this.group.visible = false;
    this.group.add(this.surfaces, this.coffee);

    // The lamp behind the leaves: a fixed 60 degree projector aimed across the desk.
    const lamp = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
    lamp.position.set(-0.603634, 0.514833, 0.953714);
    lamp.quaternion.set(-0.191836, 0.0352637, 0.391623, 0.899215);
    lamp.updateMatrixWorld();
    this.uniforms.uGoboMatrix.value.multiplyMatrices(
      lamp.projectionMatrix,
      lamp.matrixWorldInverse,
    );

    const quad = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          vertexShader: quadVertex,
          fragmentShader,
          uniforms,
          depthTest: false,
          depthWrite: false,
        }),
      );
      mesh.frustumCulled = false;
      return mesh;
    };
    this.goboScene.add(quad(goboFragment, this.goboUniforms));
    this.thermalScene.add(
      quad(thermalFragment, {
        uScene: { value: this.sceneTarget.texture },
        uThermalTexture: this.uniforms.uThermalTexture,
        uThermalAnimation: this.uniforms.uThermalAnimation,
        uResolution: this.uniforms.uResolution,
      }),
    );
  }

  async load(
    renderer: THREE.WebGLRenderer,
    modelPath: string,
    splatUrl: string,
    tex: (path: string) => THREE.Texture,
    dataTex: (path: string) => THREE.Texture,
    reflectionUrl: string,
  ) {
    const nearest = (path: string) => {
      const t = dataTex(path);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    };
    this.goboTextures.desk = nearest("gobo/gobo_b_0.4630597.avif");
    this.goboTextures.leaves = nearest("gobo/gobo_c_0.38847005.avif");
    this.useGobo("desk");
    const thermalTexture = tex("thermal_gradient.webp");
    thermalTexture.minFilter = THREE.LinearFilter;
    thermalTexture.generateMipmaps = false;
    this.uniforms.uThermalTexture.value = thermalTexture;
    const smooth = (path: string) => {
      const t = tex(path);
      t.anisotropy = 8;
      return t;
    };
    const [desk, pinboard, wall, cover, cup, label, cameraAnim, coasterAnim, coffeeAnim] =
      await Promise.all([
        loadBuf(`${modelPath}table/DESK.buf`),
        loadBuf(`${modelPath}table/PINBOARD.buf`),
        loadBuf(`${modelPath}table/WALL.buf`),
        loadBuf(`${modelPath}table/COFFEE/COVER.buf`),
        loadBuf(`${modelPath}table/COFFEE/CUP.buf`),
        loadBuf(`${modelPath}table/COFFEE/LABEL.buf`),
        loadBuf(`${modelPath}featuresAnimations/CAMERA_ANIM.buf`),
        loadBuf(`${modelPath}featuresAnimations/COASTER_ANIM.buf`),
        loadBuf(`${modelPath}featuresAnimations/COFFEE_ANIM.buf`),
      ]);
    this.cameraAnimation = new FrameAnimation(cameraAnim);
    this.coasterAnimation = new FrameAnimation(coasterAnim);
    this.coffeeAnimation = new FrameAnimation(coffeeAnim);

    const addSurface = (name: "DESK" | "PINBOARD" | "WALL", geometry: THREE.BufferGeometry) => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader: deskVertex,
          fragmentShader: deskFragment,
          defines: { [`IS_${name}`]: 1 },
          uniforms: {
            ...this.uniforms,
            uTexture: { value: smooth(`table/${name}.webp`) },
            ...(name === "DESK" ? { uHdTexture: { value: smooth("table/DESK_HD.webp") } } : {}),
          },
        }),
      );
      mesh.renderOrder = -3;
      mesh.frustumCulled = false;
      this.surfaces.add(mesh);
    };
    addSurface("DESK", toGeometry(desk));
    addSurface("WALL", toGeometry(wall));
    const board = toGeometry(pinboard);
    const instanced = new THREE.InstancedBufferGeometry();
    for (const [name, attribute] of Object.entries(board.attributes))
      instanced.setAttribute(name, attribute);
    instanced.setIndex(board.index);
    instanced.setAttribute(
      "instanceId",
      new THREE.InstancedBufferAttribute(new Float32Array([0, 1]), 1),
    );
    instanced.instanceCount = 2;
    addSurface("PINBOARD", instanced);

    const base = tex("coffee/BASE_COLOR.webp");
    const labelTexture = smooth("coffee/LABEL.webp");
    const addCoffee = (geometry: THREE.BufferGeometry, kind: "CUP" | "LABEL" | "COVER") => {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          vertexShader: coffeeVertex,
          fragmentShader: kind === "COVER" ? coverFragment : cupFragment,
          defines: { [`IS_${kind}`]: 1 },
          uniforms: { ...this.uniforms, uBase: { value: base }, uLabel: { value: labelTexture } },
        }),
      );
      mesh.frustumCulled = false;
      this.coffee.add(mesh);
    };
    addCoffee(toGeometry(cup), "CUP");
    addCoffee(toGeometry(label), "LABEL");
    addCoffee(toGeometry(cover), "COVER");

    // Steam rising from the lid: a camera-facing card.
    const smokeHeight = 0.15;
    const smokeGeometry = new THREE.PlaneGeometry((84 / 184) * smokeHeight, smokeHeight);
    smokeGeometry.translate(0, 0.5 * smokeHeight, 0);
    this.smoke = new THREE.Mesh(
      smokeGeometry,
      new THREE.ShaderMaterial({
        vertexShader: smokeVertex,
        fragmentShader: smokeFragment,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uBase: { value: nearest("coffee/smoke/base.webp") },
          uHarmonics0: { value: nearest("coffee/smoke/harmonics_0.webp") },
          uHarmonics1: { value: nearest("coffee/smoke/harmonics_1.webp") },
          uTime: this.smokeTime,
          uThermalTexture: this.uniforms.uThermalTexture,
          uThermalAnimation: this.uniforms.uThermalAnimation,
          uResolution: this.uniforms.uResolution,
        },
      }),
    );
    this.smoke.position.set(-0.0324208, 0.13, -0.0109422);
    this.smoke.renderOrder = 1;
    this.coffee.add(this.smoke);

    await this.splats.load(splatUrl, renderer);
    if (this.splats.mesh) this.splats.mesh.renderOrder = -2;
    this.surfaces.add(this.splats);
    await this.reflectionSplats.load(reflectionUrl, renderer);
    this.reflectionSplats.setLook(0.5, 0.5);
    this.ready = true;
  }

  /**
   * Pose camera, coaster and cup at a frame of the baked features animation.
   * @returns the camera's vertical field of view at that frame
   */
  applyFrame(frame: number, camera: THREE.Object3D, coaster: THREE.Object3D) {
    const focal = this.cameraAnimation?.apply(camera, frame);
    this.coasterAnimation?.apply(coaster, frame);
    this.coffeeAnimation?.apply(this.coffee, frame);
    this.coffee.visible = frame < 195;
    return focal ? fovFromFocal(focal) : undefined;
  }

  /** The moving shadow texture, for other scenes that want the same light. */
  get goboTexture() {
    return this.goboTarget.texture;
  }

  /** Switch between the desk's window light and the broader leaf shadow used on plain ground. */
  useGobo(kind: "desk" | "leaves") {
    this.goboUniforms.uTexture.value = this.goboTextures[kind];
    this.goboUniforms.uStrength.value = kind === "desk" ? 0.4630597 : 0.38847005;
  }

  /** Advance the swaying window light and the steam. */
  animate(renderer: THREE.WebGLRenderer, dt: number) {
    this.goboUniforms.uTime.value += dt * 5;
    this.smokeTime.value += dt * 2;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(this.goboTarget);
    renderer.render(this.goboScene, this.quadCamera);
    renderer.setRenderTarget(previous);
  }

  /** Draw the props' mirror image for the desk shader to pick up. */
  renderReflection(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    renderer.getDrawingBufferSize(this.bufferSize);
    const { x, y } = this.bufferSize;
    if (this.reflectionTarget.width !== x || this.reflectionTarget.height !== y) {
      this.reflectionTarget.setSize(x, y);
      this.sceneTarget.setSize(x, y);
    }
    if (!this.reflectionSplats.mesh) return;
    this.reflectionSplats.updateMatrixWorld(true);
    this.reflectionSplats.update(camera);
    const previous = renderer.getRenderTarget();
    const scissor = renderer.getScissorTest();
    renderer.setScissorTest(false);
    renderer.setRenderTarget(this.reflectionTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.reflectionSplats, camera);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(previous);
    renderer.setScissorTest(scissor);
  }

  /**
   * Draw the backdrop (surfaces and props). With the heat camera on, it is drawn to a buffer and
   * re-coloured on the way to the screen. The caller draws the coaster and cup on top afterwards.
   */
  renderBackdrop(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    if (this.thermalRatio <= 0) {
      renderer.render(scene, camera);
      return;
    }
    const output = renderer.getRenderTarget();
    const scissor = renderer.getScissorTest();
    renderer.setScissorTest(false);
    renderer.setRenderTarget(this.sceneTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(output);
    renderer.setScissorTest(scissor);
    renderer.render(this.thermalScene, this.quadCamera);
  }

  /** Call after world matrices are current. */
  update(camera: THREE.Camera, coasterInner: THREE.Object3D) {
    this.uniforms.uThermalRatio.value = this.thermalRatio;
    this.uniforms.uThermalAnimation.value = this.thermalAnimation;
    if (this.smoke) {
      // Face the camera: undo the cup's own rotation, then take the camera's.
      this.coffee.getWorldQuaternion(this.q).invert();
      this.smoke.quaternion.copy(this.q).multiply(camera.quaternion);
    }
    this.coffee.updateMatrixWorld(true);
    this.uniforms.uCoffeeInv.value.copy(this.coffee.matrixWorld).invert();
    this.uniforms.uCoasterInv.value.copy(coasterInner.matrixWorld).invert();
    this.uniforms.uCoffeeOn.value = this.coffee.visible ? 1 : 0;
    this.uniforms.uPosition.value.copy(this.coffee.position);
    this.splats.update(camera);
  }
}
