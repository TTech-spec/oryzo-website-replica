import * as THREE from "three";

import { floatAttribute, loadBuf, type BufData } from "./buf";

const MODEL_PATH = "/oryzo/models/";
const TEXTURE_PATH = "/oryzo/textures/";

// Camera constants of the baked scene (50mm lens on a 41.4mm-wide 2240x1260 gate).
const VIEW_WIDTH = 2240;
const VIEW_HEIGHT = 1260;
const PLANE_WIDTH = 3296;
const PLANE_HEIGHT = 1460;
const FOV = (2 * Math.atan((VIEW_HEIGHT * 41.4) / VIEW_WIDTH / 2 / 50) * 180) / Math.PI;

const HAND_FRAME_START = 71;
const HAND_BONES = 36;

const HERO_LIGHT = new THREE.Vector3(0.346682, 1.00875, -0.368255);
const HAND_LIGHT = new THREE.Vector3(0.0237565, 0.77265, 0.435661);

// Desk props, positioned in the 3296x1460 desk image space (y down, degrees clockwise).
const PROPS: Record<
  string,
  { x: number; y: number; width: number; height: number; angle: number }
> = {
  pencil: { x: 500, y: 1106, width: 128, height: 1320, angle: 52 },
  eraser: { x: 924.24, y: 1186.49, width: 180, height: 280, angle: 30.68 },
  cutter: { x: 2574.44, y: 1200.85, width: 192, height: 1024, angle: -55.61 },
  pen: { x: 2040.69, y: 220.92, width: 136, height: 960, angle: -35 },
  paperclip1: { x: 677.11, y: 458.27, width: 100, height: 234, angle: -40.78 },
  paperclip2: { x: 350, y: 646.79, width: 100, height: 234, angle: 47.75 },
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Remap v from [a, b] to [c, d], clamped, with an optional ease. */
export const fit = (
  v: number,
  a: number,
  b: number,
  c: number,
  d: number,
  ease?: (t: number) => number,
) => {
  let t = clamp01((v - a) / (b - a));
  if (ease) t = ease(t);
  return c + (d - c) * t;
};
export const cubicOut = (t: number) => 1 - (1 - t) ** 3;
export const cubicIn = (t: number) => t ** 3;

/** Baked per-frame transform track (position / orientation), sampled with interpolation. */
class FrameAnimation {
  private positions: Float32Array;
  private orients: Float32Array;
  frameCount: number;
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(data: BufData) {
    this.positions = floatAttribute(data, "position");
    this.orients = floatAttribute(data, "orient");
    this.frameCount = this.positions.length / 3;
  }

  apply(target: THREE.Object3D, frame: number) {
    if (!this.frameCount) return;
    const last = this.frameCount - 1;
    const f = Math.min(last, Math.max(0, frame));
    const i = Math.floor(f);
    const j = Math.min(i + 1, last);
    const t = f - i;
    target.position
      .fromArray(this.positions, i * 3)
      .lerp(this.v.fromArray(this.positions, j * 3), t);
    target.quaternion
      .fromArray(this.orients, i * 4)
      .slerp(this.q.fromArray(this.orients, j * 4), t);
  }
}

export interface StageFrame {
  /** Smoothed scroll position, in viewport heights. */
  r: number;
  heroActive: number;
}

const handVertex = /* glsl */ `
  attribute vec4 boneIndices;
  attribute vec4 boneWeights;
  uniform sampler2D uSkinPosition;
  uniform sampler2D uSkinOrient;
  uniform vec2 uUvOffset1;
  uniform vec2 uUvOffset2;
  varying vec2 vUv1;
  varying vec2 vUv2;

  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  void applySkin(inout vec3 pos, float boneIndex, float boneWeight) {
    vec2 skinUv = vec2((boneIndex + 0.5) / ${HAND_BONES}.0, 0.5);
    vec4 quat = texture2D(uSkinOrient, skinUv);
    pos += (qrotate(quat, position) + texture2D(uSkinPosition, skinUv).xyz) * boneWeight;
  }
  void main() {
    vec3 pos = vec3(0.0);
    applySkin(pos, boneIndices.x, boneWeights.x);
    applySkin(pos, boneIndices.y, boneWeights.y);
    applySkin(pos, boneIndices.z, boneWeights.z);
    applySkin(pos, boneIndices.w, boneWeights.w);
    vUv1 = uv * 0.5 + uUvOffset1;
    vUv2 = uv * 0.5 + uUvOffset2;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const handFragment = /* glsl */ `
  uniform sampler2D uHandTexture;
  uniform float uUvBlend;
  uniform float uOpacity;
  uniform float uHighlight;
  uniform vec2 uResolution;
  varying vec2 vUv1;
  varying vec2 vUv2;
  void main() {
    vec3 albedo = mix(texture2D(uHandTexture, vUv1).rgb, texture2D(uHandTexture, vUv2).rgb, uUvBlend);
    float screenY = gl_FragCoord.y / uResolution.y;
    float opacity = smoothstep(0.0, 1.0, uOpacity * 2.0 - (0.5 - min(0.5, screenY) * 2.0));
    vec3 color = albedo * (1.0 + uHighlight * 1.5);
    gl_FragColor = vec4(color, opacity);
  }
`;

const propVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const propFragment = /* glsl */ `
  uniform sampler2D uColor;
  uniform sampler2D uAlpha;
  uniform float uOpacity;
  uniform float uShadow;
  varying vec2 vUv;
  void main() {
    // The colour sheet holds four lighting variants side by side; use the first.
    vec3 color = texture2D(uColor, vec2(vUv.x * 0.25, vUv.y)).rgb;
    float alpha = texture2D(uAlpha, vUv).r;
    gl_FragColor = vec4(mix(color, vec3(0.0), uShadow), alpha * uOpacity * mix(1.0, 0.35, uShadow));
  }
`;

export class OryzoStage {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 20);
  private camera2D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private scene = new THREE.Scene();
  private scene2D = new THREE.Scene();

  private coaster = new THREE.Object3D();
  private coasterMaterial?: THREE.MeshStandardMaterial;
  private light = new THREE.PointLight(0xfff1e0, 0, 0, 2);
  private ambient = new THREE.HemisphereLight(0xfff4e6, 0x6b4a36, 1);
  private rimLight = new THREE.DirectionalLight(0xffb070, 0);

  private cameraAnimation?: FrameAnimation;
  private coasterAnimation?: FrameAnimation;

  private hand?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private handPositions?: Float32Array;
  private handOrients?: Float32Array;
  private handFrameCount = 0;
  private skinPositionData = new Float32Array(HAND_BONES * 4);
  private skinOrientData = new Float32Array(HAND_BONES * 4);
  private skinPositionTexture = new THREE.DataTexture(
    this.skinPositionData,
    HAND_BONES,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  private skinOrientTexture = new THREE.DataTexture(
    this.skinOrientData,
    HAND_BONES,
    1,
    THREE.RGBAFormat,
    THREE.FloatType,
  );

  private handUniforms = {
    uSkinPosition: { value: this.skinPositionTexture },
    uSkinOrient: { value: this.skinOrientTexture },
    uHandTexture: { value: null as THREE.Texture | null },
    uUvOffset1: { value: new THREE.Vector2() },
    uUvOffset2: { value: new THREE.Vector2() },
    uUvBlend: { value: 0 },
    uOpacity: { value: 1 },
    uHighlight: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  private desk = new THREE.Group();
  private propOpacities: { value: number }[] = [];
  private baseMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private shadow?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private width = 1;
  private height = 1;
  private scroll = 0;
  private raf = 0;
  private lastTime = 0;
  private disposed = false;
  private v0 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private q0 = new THREE.Quaternion();
  private q1 = new THREE.Quaternion();

  onFrame?: (frame: StageFrame) => void;
  onReady?: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;

    this.scene.add(this.coaster, this.light, this.ambient, this.rimLight);
    this.scene2D.add(this.desk);
    this.camera2D.position.z = 5;

    this.resize();
    window.addEventListener("resize", this.resize);
    this.scroll = window.scrollY;
    void this.load();
    this.raf = requestAnimationFrame(this.tick);
  }

  private async load() {
    const loader = new THREE.TextureLoader();
    const tex = (path: string, srgb = false) => {
      const t = loader.load(TEXTURE_PATH + path);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

    // Desk image + props (2D layer).
    this.baseMaterial.map = tex("hero/BASE.webp", true);
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT),
      this.baseMaterial,
    );
    base.renderOrder = 0;
    this.desk.add(base);

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 256;
    const ctx = shadowCanvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 128);
      g.addColorStop(0, "rgba(20,12,6,0.85)");
      g.addColorStop(0.55, "rgba(20,12,6,0.55)");
      g.addColorStop(1, "rgba(20,12,6,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
    }
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.shadow.renderOrder = 1;
    this.desk.add(this.shadow);

    for (const [id, prop] of Object.entries(PROPS)) {
      const uniforms = {
        uColor: { value: tex(`hero/${id}_color.webp`) },
        uAlpha: { value: tex(`hero/${id}_alpha.webp`) },
        uOpacity: { value: 1 },
        uShadow: { value: 0 },
      };
      const geometry = new THREE.PlaneGeometry(prop.width, prop.height);
      const place = (mesh: THREE.Mesh, dx: number, dy: number) => {
        mesh.position.set(prop.x - PLANE_WIDTH / 2 + dx, -(prop.y - PLANE_HEIGHT / 2) + dy, 0);
        mesh.rotation.z = (-prop.angle * Math.PI) / 180;
      };
      const shadowUniforms = { ...uniforms, uOpacity: { value: 1 }, uShadow: { value: 1 } };
      const shadowMesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms: shadowUniforms,
          vertexShader: propVertex,
          fragmentShader: propFragment,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      place(shadowMesh, -14, -16);
      shadowMesh.renderOrder = 2;
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: propVertex,
          fragmentShader: propFragment,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      );
      place(mesh, 0, 0);
      mesh.renderOrder = 3;
      this.desk.add(shadowMesh, mesh);
      this.propOpacities.push(uniforms.uOpacity, shadowUniforms.uOpacity);
    }

    const [coasterData, cameraData, coasterAnimData, handData, handAnimData] = await Promise.all([
      loadBuf(MODEL_PATH + "coaster.buf"),
      loadBuf(MODEL_PATH + "hero_camera.buf"),
      loadBuf(MODEL_PATH + "coaster_hero_animation.buf"),
      loadBuf(MODEL_PATH + "hand.buf"),
      loadBuf(MODEL_PATH + "hand_animation.buf"),
    ]);
    if (this.disposed) return;

    this.cameraAnimation = new FrameAnimation(cameraData);
    this.coasterAnimation = new FrameAnimation(coasterAnimData);

    // Coaster.
    const diffuse = tex("coaster/DIFF.webp", true);
    const height = tex("coaster/HEIGHT.webp");
    for (const t of [diffuse, height]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      t.repeat.set(2.5, 2.5);
    }
    this.coasterMaterial = new THREE.MeshStandardMaterial({
      map: diffuse,
      bumpMap: height,
      bumpScale: 0.35,
      roughness: 0.85,
      metalness: 0,
    });
    this.coaster.add(new THREE.Mesh(toGeometry(coasterData), this.coasterMaterial));

    // Hand: skinned on the GPU from a baked per-bone position / orientation track.
    this.handPositions = floatAttribute(handAnimData, "position");
    this.handOrients = floatAttribute(handAnimData, "orient");
    this.handFrameCount = this.handPositions.length / HAND_BONES / 3;
    const handTexture = tex("hero/AI_HAND.webp");
    this.handUniforms.uHandTexture.value = handTexture;
    this.hand = new THREE.Mesh(
      toGeometry(handData),
      new THREE.ShaderMaterial({
        vertexShader: handVertex,
        fragmentShader: handFragment,
        transparent: true,
        uniforms: this.handUniforms,
      }),
    );
    this.hand.frustumCulled = false;
    this.hand.visible = false;
    this.scene.add(this.hand);

    this.onReady?.();
  }

  private resize = () => {
    const parent = this.canvas.parentElement;
    this.width = parent?.clientWidth || window.innerWidth;
    this.height = parent?.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.fov = FOV;
    this.camera.updateProjectionMatrix();
    this.camera2D.left = -this.width / 2;
    this.camera2D.right = this.width / 2;
    this.camera2D.top = this.height / 2;
    this.camera2D.bottom = -this.height / 2;
    this.camera2D.updateProjectionMatrix();
    // The desk image is framed by the same lens as the 3D camera: its 1260px view height fills the screen.
    this.desk.scale.setScalar(this.height / VIEW_HEIGHT);
  };

  private updateHand(frame: number, r: number) {
    const hand = this.hand;
    if (!hand || !this.handPositions || !this.handOrients) return;
    const handOpacity = fit(r, 8, 9, 1, 0);
    const ratio = fit(frame, HAND_FRAME_START, 115, 0, 1);
    hand.visible = ratio > 0 && handOpacity > 0;
    if (!hand.visible) return;

    const f = ratio * (this.handFrameCount - 1);
    const i = Math.floor(f);
    const j = Math.min(i + 1, this.handFrameCount - 1);
    const t = f - i;
    for (let b = 0; b < HAND_BONES; b++) {
      this.v0.fromArray(this.handPositions, (i * HAND_BONES + b) * 3);
      this.v1.fromArray(this.handPositions, (j * HAND_BONES + b) * 3);
      this.v0.lerp(this.v1, t).toArray(this.skinPositionData, b * 4);
      this.q0.fromArray(this.handOrients, (i * HAND_BONES + b) * 4);
      this.q1.fromArray(this.handOrients, (j * HAND_BONES + b) * 4);
      this.q0.slerp(this.q1, t).toArray(this.skinOrientData, b * 4);
    }
    this.skinPositionTexture.needsUpdate = true;
    this.skinOrientTexture.needsUpdate = true;

    // The hand texture is a 2x2 sheet of baked lighting states that cross-fade as the hand rises.
    const fingersActive = fit(r, 5.5, 6, 0, 1) * fit(r, 7.5, 8, 1, 0);
    const l = fit(f, 20, 40, 0, 2, cubicOut);
    let a = Math.floor(l);
    let b = Math.ceil(l);
    let blend = l - a;
    if (fingersActive > 0) {
      a = 2;
      b = 3;
      blend = 0;
    }
    const u = this.handUniforms;
    u.uUvOffset1.value.set((a % 2) / 2, (a >> 1) / 2);
    u.uUvOffset2.value.set((b % 2) / 2, (b >> 1) / 2);
    u.uUvBlend.value = Math.max(blend, 0);
    u.uOpacity.value = handOpacity;
    u.uHighlight.value = fingersActive * 0.25;
    this.renderer.getDrawingBufferSize(u.uResolution.value);
  }

  private tick = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;

    // Ease towards the real scroll position so the camera glides instead of stepping.
    const target = window.scrollY;
    this.scroll += (target - this.scroll) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - this.scroll) < 0.05) this.scroll = target;

    const vh = window.innerHeight;
    const r = this.scroll / vh;
    const heroActive = fit(r, 0, 0.5, 1, 0);
    this.onFrame?.({ r, heroActive });

    // Past the pinned range the stage has scrolled away entirely.
    if (r > 10.2 || !this.cameraAnimation || !this.coasterAnimation) return;

    const animationRatio = fit(r, 0, 5.5, 0, 1);
    const frame = animationRatio * (this.cameraAnimation.frameCount - 1);
    this.cameraAnimation.apply(this.camera, frame);
    this.coasterAnimation.apply(this.coaster, frame);
    this.camera.updateMatrixWorld();

    // Lighting: bright desk light in the hero, a low warm key once the scene goes dark.
    const dark = 1 - heroActive;
    const lightBlend = fit(frame, 47, 73, 0, 1);
    this.light.position.copy(HERO_LIGHT).lerp(HAND_LIGHT, lightBlend);
    this.light.intensity = 0.55 + 0.15 * dark;
    this.ambient.intensity = 2.6 - 1.7 * dark;
    this.rimLight.position.set(-0.4, 1.2, -0.8);
    this.rimLight.intensity = 2.2 * dark * (1 - lightBlend * 0.6);

    this.updateHand(frame, r);

    // Desk layer fades out as the hero scrolls away.
    this.desk.visible = heroActive > 0;
    this.baseMaterial.opacity = heroActive;
    for (const opacity of this.propOpacities) opacity.value = heroActive;
    if (this.shadow) {
      this.v0.copy(this.coaster.position).project(this.camera);
      const s = this.desk.scale.x;
      this.shadow.position.set(
        (this.v0.x * this.width) / 2 / s - 30,
        (this.v0.y * this.height) / 2 / s - 34,
        0,
      );
      this.shadow.scale.setScalar(620);
      this.shadow.material.opacity = heroActive * 0.9;
    }

    this.renderer.clear();
    this.renderer.render(this.scene2D, this.camera2D);
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
  }
}

function toGeometry(data: BufData) {
  const geometry = new THREE.BufferGeometry();
  for (const [id, attr] of Object.entries(data.attributes)) {
    if (id === "indices") geometry.setIndex(new THREE.BufferAttribute(attr.array, 1));
    else geometry.setAttribute(id, new THREE.BufferAttribute(attr.array, attr.itemSize));
  }
  return geometry;
}
