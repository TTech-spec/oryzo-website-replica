import * as THREE from "three";

import { FrameAnimation, toGeometry } from "./anim";
import { floatAttribute, loadBuf } from "./buf";
import { DeskProps, PLANE_HEIGHT, PLANE_WIDTH } from "./deskProps";
import { HandRig } from "./handRig";
import {
  coasterFragment,
  coasterVertex,
  HAND_BONES,
  handFragment,
  handVertex,
  headlineFragment,
  jacketFragment,
  propVertex,
} from "./shaders";
import { TableScene } from "./table";
import { Wrapper } from "./wrapper";

const MODEL_PATH = "/oryzo/models/";
const TEXTURE_PATH = "/oryzo/textures/";

// Camera constants of the baked scene (50mm lens on a 41.4mm-wide 2240x1260 gate).
const VIEW_WIDTH = 2240;
const VIEW_HEIGHT = 1260;
const FOV = (2 * Math.atan((VIEW_HEIGHT * 41.4) / VIEW_WIDTH / 2 / 50) * 180) / Math.PI;

const HAND_FRAME_START = 71;

const HERO_LIGHT = new THREE.Vector3(0.346682, 1.00875, -0.368255);
const sineInOut = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
/** Number of gallery steps before the magazine cover. */
const GALLERY_LAST = 7;
/** How far right of centre the desk sits once the features copy takes the left of the screen. */
const FEATURES_VIEW_OFFSET = 0.165;

const riseVertex = /* glsl */ `
  uniform vec4 uRect;
  uniform vec2 uViewport;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // uRect is in CSS pixels from the top-left; place the quad there directly in clip space.
    vec2 px = uRect.xy + vec2(uv.x, 1.0 - uv.y) * uRect.zw;
    gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;
const riseFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uOpacity;
  varying vec2 vUv;
  float median(float r, float g, float b) { return max(min(r, g), min(max(r, g), b)); }
  void main() {
    vec3 msdf = texture2D(uTexture, vUv).rgb;
    float sd = median(msdf.r, msdf.g, msdf.b);
    // Distance field spans 4 texels of a 256x92 sheet; convert to screen pixels for a crisp edge.
    float pxDistance = (sd - 0.4) * 4.0 / length(vec2(dFdx(vUv.x), dFdy(vUv.y)) * vec2(256.0, 92.0));
    float alpha = clamp(pxDistance * 2.0, 0.0, 1.0);
    gl_FragColor = vec4(vec3(1.0, 0.929, 0.843), alpha * uOpacity);
  }
`;

const WEARABLE_LIGHT = new THREE.Vector3(-10, -2, 6);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
// The wrapper model is authored lying flat; these stand it up around the coaster.
const WRAPPER_ROT_X = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);
const WRAPPER_ROT_Z = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.PI);
const ZERO = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const HAND_LIGHT = new THREE.Vector3(0.0237565, 0.77265, 0.435661);

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

export interface StageFrame {
  /** Smoothed scroll position, in viewport heights. */
  r: number;
  heroActive: number;
}

const floatTexture = (data: Float32Array) =>
  new THREE.DataTexture(data, HAND_BONES, 1, THREE.RGBAFormat, THREE.FloatType);

export class OryzoStage {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 10);
  private camera2D = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  private scene = new THREE.Scene();
  private scene2D = new THREE.Scene();

  private coaster = new THREE.Object3D();
  private lightPosition = new THREE.Vector3();
  private coasterUniforms = {
    uDiffuse: { value: null as THREE.Texture | null },
    uHeight: { value: null as THREE.Texture | null },
    uEnv1: { value: null as THREE.Texture | null },
    uEnv2: { value: null as THREE.Texture | null },
    uBrdf: { value: null as THREE.Texture | null },
    uEnvBlend: { value: 0 },
    uLocalLight: { value: new THREE.Vector3(0, 1, 0) },
    uHighlight: { value: 0 },
    uExtraBump: { value: 0 },
    uHeroRatio: { value: 1 },
    uTime: { value: 0 },
    uZoom: { value: 1 },
    uZoomCenter: { value: new THREE.Vector2() },
    uWrapperRatio: { value: 0 },
    uWearableBlend: { value: 0 },
  };
  /** Child of the coaster that carries its flight onto the jacket. */
  private coasterInner = new THREE.Object3D();
  private coasterFlight?: FrameAnimation;
  private flightDummy = new THREE.Object3D();
  private wrapperPivot = new THREE.Object3D();
  private wrapper?: Wrapper;
  private jacket?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private jacketShow = { value: 0 };
  private jacketFrameHeight = { value: 0.8 };
  private headlineMesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private headlineUniforms = {
    uTexture: { value: null as THREE.Texture | null },
    uRect: { value: new THREE.Vector4() },
    uFrame: { value: new THREE.Vector4() },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uDpr: { value: 1 },
    uShow: this.jacketShow,
    uOpacity: { value: 0 },
  };
  /**
   * Where the headline should be drawn, in CSS pixels from the stage's top-left. The page sets
   * this each frame from its layout; opacity 0 hides it.
   */
  headline = { x: 0, y: 0, width: 0, height: 0, opacity: 0 };

  private cameraAnimation?: FrameAnimation;
  private coasterAnimation?: FrameAnimation;

  private hand?: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private handRig?: HandRig;
  private handPositions?: Float32Array;
  private handOrients?: Float32Array;
  private handFrameCount = 0;
  private fingerWeights = [0, 0, 0, 0];
  private fingerVelocities = [0, 0, 0, 0];
  private skinPositionData = new Float32Array(HAND_BONES * 4);
  private skinOrientData = new Float32Array(HAND_BONES * 4);
  private skinPositionTexture = floatTexture(this.skinPositionData);
  private skinOrientTexture = floatTexture(this.skinOrientData);
  private handUniforms = {
    uSkinPosition: { value: this.skinPositionTexture },
    uSkinOrient: { value: this.skinOrientTexture },
    uHandTexture: { value: null as THREE.Texture | null },
    uUvOffset1: { value: new THREE.Vector2() },
    uUvOffset2: { value: new THREE.Vector2() },
    uUvBlend: { value: 0 },
    uOpacity: { value: 1 },
    uHighlight: { value: 0 },
    uTime: { value: 0 },
    uFingerWeights: { value: new THREE.Vector4() },
    uResolution: { value: new THREE.Vector2(1, 1) },
  };

  private desk = new THREE.Group();
  private deskProps?: DeskProps;
  private baseMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  private shadow?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private width = 1;
  private height = 1;
  private scroll = 0;
  private time = 0;
  private raf = 0;
  private lastTime = 0;
  private disposed = false;
  private idle = false;
  private table = new TableScene();
  private envHero: THREE.Texture | null = null;
  private envTable: THREE.Texture | null = null;
  private rise?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private riseUniforms = {
    uTexture: { value: null as THREE.Texture | null },
    uRect: { value: new THREE.Vector4() },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uOpacity: { value: 1 },
  };
  /** Pointer in normalised stage coordinates (-1..1, y up); null while outside the stage. */
  private pointer: THREE.Vector2 | null = null;
  private deskPointer = new THREE.Vector2();
  private v0 = new THREE.Vector3();
  private v1 = new THREE.Vector3();
  private q0 = new THREE.Quaternion();
  private q1 = new THREE.Quaternion();
  private m0 = new THREE.Matrix4();

  onFrame?: (frame: StageFrame) => void;
  onReady?: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;

    this.scene.add(this.coaster);
    this.scene2D.add(this.desk);
    this.camera2D.position.z = 5;

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerleave", this.onPointerLeave);
    this.scroll = window.scrollY;
    void this.load();
    this.raf = requestAnimationFrame(this.tick);
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    if (event.clientY < rect.top || event.clientY > rect.bottom) {
      this.pointer = null;
      return;
    }
    this.pointer ??= new THREE.Vector2();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  };

  private onPointerLeave = () => {
    this.pointer = null;
  };

  private async load() {
    const loader = new THREE.TextureLoader();
    const tex = (path: string, srgb = false) => {
      const t = loader.load(TEXTURE_PATH + path);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

    // Textures that carry data rather than colour (RGBM light maps, baked animation, harmonics)
    // use their alpha channel as a fourth value. Decoding through ImageBitmap with premultiply
    // off keeps the other channels intact where alpha is low; the plain image path does not.
    const bitmapLoader = new THREE.ImageBitmapLoader();
    bitmapLoader.setOptions({
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
      imageOrientation: "flipY",
    });
    const dataTex = (path: string) => {
      const t = new THREE.Texture();
      t.flipY = false;
      bitmapLoader.load(TEXTURE_PATH + path, (bitmap) => {
        t.image = bitmap;
        t.needsUpdate = true;
      });
      return t;
    };

    // Desk image, coaster shadow and props (2D layer).
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

    this.deskProps = new DeskProps((path) => tex(path));
    this.desk.add(this.deskProps.group);

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

    // Coaster: cork albedo + height map, lit by two cross-fading environment maps.
    const diffuse = tex("coaster/DIFF.webp");
    const height = tex("coaster/HEIGHT.webp");
    for (const t of [diffuse, height]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }
    const env = (path: string) => {
      const t = dataTex(path);
      t.wrapS = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return t;
    };
    const u = this.coasterUniforms;
    u.uDiffuse.value = diffuse;
    u.uHeight.value = height;
    u.uEnv1.value = this.envHero = env("hero/env_hero.webp");
    u.uEnv2.value = env("hero/env_hand.webp");
    u.uBrdf.value = tex("brdf.png");
    this.coaster.add(this.coasterInner);
    this.coasterInner.add(
      new THREE.Mesh(
        toGeometry(coasterData),
        new THREE.ShaderMaterial({
          uniforms: u,
          vertexShader: coasterVertex,
          fragmentShader: coasterFragment,
        }),
      ),
    );

    // Hand: skinned on the GPU from a baked per-bone position / orientation track.
    this.handPositions = floatAttribute(handAnimData, "position");
    this.handOrients = floatAttribute(handAnimData, "orient");
    this.handFrameCount = this.handPositions.length / HAND_BONES / 3;
    if (handAnimData.sceneData) this.handRig = new HandRig(handAnimData.sceneData);
    this.handUniforms.uHandTexture.value = tex("hero/AI_HAND.webp");
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

    this.deskProps.startIntro();
    this.onReady?.();

    // Wearable intro assets load after the first paint; they are not needed until well down the page.
    const jacketTexture = tex("wearable/1.webp");
    this.jacket = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: jacketTexture },
          uShow: this.jacketShow,
          uFrameHeight: this.jacketFrameHeight,
        },
        vertexShader: propVertex,
        fragmentShader: jacketFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.jacket.visible = false;
    this.jacket.renderOrder = 11;
    const headlineTexture = tex("wearable/wearable_text.webp");
    headlineTexture.minFilter = THREE.LinearFilter;
    headlineTexture.generateMipmaps = false;
    this.headlineUniforms.uTexture.value = headlineTexture;
    this.headlineMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.headlineUniforms,
        vertexShader: propVertex,
        fragmentShader: headlineFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.headlineMesh.renderOrder = 10;
    this.headlineMesh.visible = false;
    this.scene2D.add(this.headlineMesh, this.jacket);
    this.coasterFlight = new FrameAnimation(
      await loadBuf(MODEL_PATH + "wearable/coaster_first.buf"),
    );
    const wrapper = new Wrapper(MODEL_PATH, dataTex, u.uEnv2);
    await wrapper.load();
    if (this.disposed) return;
    this.wrapperPivot.add(wrapper.group);
    this.scene.add(this.wrapperPivot);
    this.wrapper = wrapper;

    // Desk set for the magazine cover and features section.
    this.envTable = env("table/env_table.webp");
    const riseTexture = tex("wearable/rise.webp");
    riseTexture.minFilter = THREE.LinearFilter;
    riseTexture.generateMipmaps = false;
    this.riseUniforms.uTexture.value = riseTexture;
    this.rise = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        uniforms: this.riseUniforms,
        vertexShader: riseVertex,
        fragmentShader: riseFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.rise.frustumCulled = false;
    this.rise.renderOrder = -1;
    this.rise.visible = false;
    this.scene.add(this.rise, this.table.group);
    await this.table.load(this.renderer, MODEL_PATH, "/oryzo/splats/props.sog", (path) =>
      tex(path),
    );
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

  /** Each finger reacts when the pointer passes over its height band in the lower-middle of the screen. */
  private updateFingers(dt: number, active: number) {
    for (let p = 0; p < 4; p++) {
      let target = 0;
      if (this.pointer && active > 0) {
        target = 1 - Math.abs(fit(this.pointer.y, -0.2 - p * 0.1, -0.7 - p * 0.1, 0, 1) - 0.5) * 2;
        target *= fit(Math.abs(this.pointer.x), 0.2, 0.3, 1, 0);
      }
      // Slightly under-damped spring so the fingers overshoot and settle.
      const weight = this.fingerWeights[p] ?? 0;
      let velocity = this.fingerVelocities[p] ?? 0;
      velocity += ((target - weight) * 90 - velocity * 9) * dt;
      this.fingerVelocities[p] = velocity;
      this.fingerWeights[p] = weight + velocity * dt;
    }
  }

  private updateHand(dt: number, frame: number, r: number, highlight: number) {
    const hand = this.hand;
    if (!hand || !this.handPositions || !this.handOrients) return;
    const handOpacity = fit(r, 8, 9, 1, 0);
    const ratio = fit(frame, HAND_FRAME_START, 115, 0, 1) * handOpacity;
    hand.visible = ratio > 0;
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

    const fingersActive = highlight;
    this.updateFingers(dt, fingersActive);
    const weights = this.fingerWeights.map((w) => w * fingersActive);
    if (ratio === 1 && fingersActive > 0) {
      this.handRig?.apply(this.skinPositionData, this.skinOrientData, weights);
    }
    this.skinPositionTexture.needsUpdate = true;
    this.skinOrientTexture.needsUpdate = true;

    // The hand texture is a 2x2 sheet of baked lighting states that cross-fade as the hand rises.
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
    u.uUvBlend.value = blend;
    u.uOpacity.value = handOpacity;
    u.uHighlight.value = highlight;
    u.uTime.value = this.time * 0.25;
    u.uFingerWeights.value.fromArray(weights);
    this.renderer.getDrawingBufferSize(u.uResolution.value);
  }

  /**
   * Wearable intro: the coaster spins while a foil wrapper closes around it, the wrapper tears
   * open, and the coaster flies back to land on the jacket photo.
   * @param rw viewport heights since the wearable section started
   */
  private updateWearable(rw: number) {
    // The section's own animation clock: 0-1 spin, 1-2 tear, 2-3 land on the jacket.
    let t = fit(rw, 0.5, 1.5, 0, 1);
    t = fit(rw, 1.5, 3, t, 2);
    t = fit(rw, 3, 5.25, t, 3);
    const turn = fit(t, 0, 1, 0, 1);
    const tear = fit(t, 1, 2, 0, 1);

    this.coasterInner.position.set(0, 0, 0);
    this.coasterInner.quaternion.identity();
    this.coasterInner.scale.set(1, 1, 1);
    let zoom = 1;
    if (t > 0) {
      const pivot = this.wrapperPivot;
      pivot.position.copy(this.coaster.position);
      pivot.quaternion
        .copy(this.coaster.quaternion)
        .premultiply(WRAPPER_ROT_Z)
        .premultiply(WRAPPER_ROT_X)
        .multiply(this.q0.setFromAxisAngle(Y_AXIS, Math.PI * 2 * turn));
      this.coaster.quaternion.multiply(this.q0.setFromAxisAngle(Z_AXIS, Math.PI * 2 * turn));
      this.coasterInner.position.y -= fit(turn, 0, 0.15, 0, 0.0086);

      if (t >= 1.55 && this.coasterFlight) {
        // The flight path is authored in camera space: conjugate it by the camera's rotation.
        const dummy = this.flightDummy;
        this.coasterFlight.apply(
          dummy,
          fit(t, 1.55, 2.6, 0, 1) * (this.coasterFlight.frameCount - 1),
        );
        dummy.updateMatrix();
        this.m0.compose(ZERO, this.camera.quaternion, ONE);
        dummy.matrix.premultiply(this.m0).multiply(this.m0.invert());
        dummy.matrix.decompose(
          this.coasterInner.position,
          this.coasterInner.quaternion,
          this.coasterInner.scale,
        );
      }
      zoom = fit(t, 1.55, 2, 1, 1.5);
      zoom = fit(t, 2, 2.8, zoom, 1, cubicOut);
    }
    if (this.wrapper) {
      this.wrapper.opacity = t > 0 ? fit(turn, 0.75, 0.85, 0, tear < 1 ? 1 : 0) : 0;
      this.wrapper.tearRatio = tear;
      this.wrapper.update();
    }
    if (this.jacket) {
      this.jacket.visible = t > 2;
      this.jacketShow.value = fit(t, 2, 2.8, 0, 1);
      const height = this.height * 0.8;
      this.jacket.scale.set((height * 85) / 110, height, 1);
    }
    if (this.headlineMesh) {
      const { x, y, width, opacity } = this.headline;
      this.headlineMesh.visible = opacity > 0 && width > 0;
      if (this.headlineMesh.visible) {
        // The texture's text block is 7.311:1; fit it to the measured width, centred on the box.
        const w = width;
        const h = width / 7.311;
        const top = y + this.headline.height / 2 - h / 2;
        // Cover the whole stage so blurred taps can land outside the text box.
        this.headlineMesh.scale.set(this.width, this.height, 1);
        const u = this.headlineUniforms;
        u.uRect.value.set(x, top, w, h);
        const frameHeight = this.height * 0.8;
        const frameWidth = (frameHeight * 85) / 110;
        u.uFrame.value.set(
          (this.width - frameWidth) / 2,
          (this.height - frameHeight) / 2,
          frameWidth,
          frameHeight,
        );
        u.uViewport.value.set(this.width, this.height);
        u.uDpr.value = this.renderer.getPixelRatio();
        u.uOpacity.value = opacity;
      }
    }
    return {
      zoom,
      wrapperLight: fit(t, 0.3, 1, 0, 1) * fit(t, 1, 2, 1, 0),
      blend: fit(t, 2, 2.6, 0, 1),
    };
  }

  /**
   * The desk set: seen first through the magazine frame, then opening up to full screen and
   * playing the baked features camera move.
   * @param rw viewport heights into the wearable section
   * @param a viewport heights into the features section
   * @returns true when it drew the frame
   */
  private renderTable(rw: number, a: number) {
    // The set's animation clock: 0-3 inside the magazine frame, 3-6 across the features section.
    let t = fit(rw, 10, 10.75, 0, 1);
    t = fit(rw, 10.75, 11.75, t, 2);
    t = fit(rw, 11.75, 13.25, t, 3);
    t = fit(a, 0, 1.45, t, 4);
    t = fit(a, 1.55, 3.45, t, 5);
    t = fit(a, 3.55, 5, t, 6);
    const table = this.table;
    if (t <= 0 || !table.ready) return false;
    // At 6 the set cuts to the dark roundness study.
    if (t >= 6) {
      this.renderer.setScissorTest(false);
      this.renderer.clear();
      return true;
    }

    let frame = fit(t, 1.5, 3, 0, 44);
    frame = fit(t, 3, 4, frame, 89);
    frame = fit(t, 5, 5.5, frame, 209);

    const camera = this.camera;
    this.coasterInner.position.set(0, 0, 0);
    this.coasterInner.quaternion.identity();
    this.coasterInner.scale.set(1, 1, 1);
    this.coaster.scale.set(1, 1, 1);
    const fov = table.applyFrame(frame, camera, this.coaster);
    camera.fov = fov ?? FOV;
    camera.zoom = 1;
    if (t < 1) {
      // The cover slides in with the gallery: slightly zoomed and tilted, settling as it arrives.
      const settle = fit(t, 0.1, 0.9, 0, 1, sineInOut);
      camera.zoom = 1.2 - 0.2 * settle;
      camera.quaternion.multiply(
        this.q0.setFromAxisAngle(Z_AXIS, ((10 * Math.PI) / 180) * (1 - settle)),
      );
    }

    // Where the magazine frame is on screen right now (it slides in from the right).
    const { width, height } = this;
    const frameHeight = height * 0.8;
    const frameWidth = (frameHeight * 85) / 110;
    const frameLeft = (width - frameWidth) / 2;
    const frameTop = (height - frameHeight) / 2;
    const raw = ((rw - 5.5) / 5.25) * GALLERY_LAST;
    const whole = Math.floor(raw);
    const index = Math.min(
      GALLERY_LAST,
      Math.max(0, whole + fit(raw - whole, 0.1, 0.9, 0, 1, sineInOut)),
    );
    const itemLeft = frameLeft + (GALLERY_LAST - index) * frameWidth;
    const visibleLeft = Math.min(frameLeft + frameWidth, Math.max(frameLeft, itemLeft));
    const visibleWidth = Math.max(1, frameLeft + frameWidth - visibleLeft);

    // Aim the lens at the frame, then drift right to make room for the features copy.
    const open = fit(t, 3, 3.5, 0, 1);
    const fromOffset = (itemLeft + frameWidth / 2) / width - 0.5;
    const offset = fromOffset + (FEATURES_VIEW_OFFSET - fromOffset) * open;
    camera.setViewOffset(width, height, -offset * width, 0, width, height);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    this.coaster.updateMatrixWorld();

    const u = this.coasterUniforms;
    u.uEnv1.value = this.envTable;
    u.uEnvBlend.value = 0;
    u.uHeroRatio.value = 0;
    u.uHighlight.value = 0;
    u.uExtraBump.value = 0;
    u.uWrapperRatio.value = 0;
    u.uWearableBlend.value = 0;
    u.uZoom.value = 1;
    u.uLocalLight.value
      .copy(table.lightPosition)
      .applyMatrix4(this.m0.copy(this.coasterInner.matrixWorld).invert());

    table.group.visible = true;
    table.update(camera, this.coasterInner);
    this.desk.visible = false;
    if (this.jacket) this.jacket.visible = false;
    if (this.hand) this.hand.visible = false;
    if (this.wrapper) this.wrapper.group.visible = false;

    if (this.rise) {
      const px = frameWidth / 850;
      const magHide = fit(raw - GALLERY_LAST, 0, 3.2, 0, 1);
      this.rise.visible = magHide < 0.8;
      this.riseUniforms.uRect.value.set(
        itemLeft + 45.19 * px,
        frameTop + 24.85 * px - fit(magHide, 0.3, 0.8, 0, 60 * px),
        754.4 * px,
        268.72 * px,
      );
      this.riseUniforms.uViewport.value.set(width, height);
      this.riseUniforms.uOpacity.value = fit(magHide, 0.3, 0.8, 1, 0);
    }

    this.renderer.setScissorTest(false);
    this.renderer.clear();
    if (t < 4) {
      // Draw only inside the frame; from 3 the window grows until it covers the screen.
      const cx = visibleLeft + visibleWidth / 2 + FEATURES_VIEW_OFFSET * width * open;
      const cy = height / 2;
      const reachX = Math.max(Math.abs(width - cx), width - Math.abs(width - cx));
      const reachY = Math.max(Math.abs(height - cy), height - Math.abs(height - cy));
      const grow = 1 + (Math.max(reachX / visibleWidth, reachY / frameHeight) * 2 - 1) * open;
      const w = visibleWidth * grow;
      const h = frameHeight * grow;
      this.renderer.setScissor(cx - w / 2, height - (cy + h / 2), w, h);
      this.renderer.setScissorTest(true);
    }
    this.renderer.render(this.scene, camera);
    this.renderer.setScissorTest(false);
    return true;
  }

  private tick = (time: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    this.time += dt;

    // Ease towards the real scroll position so the camera glides instead of stepping.
    const target = window.scrollY;
    this.scroll += (target - this.scroll) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - this.scroll) < 0.05) this.scroll = target;

    const vh = window.innerHeight;
    const r = this.scroll / vh;
    const heroActive = fit(r, 0, 0.5, 1, 0);
    this.onFrame?.({ r, heroActive });

    // Past the pinned range the stage has scrolled away entirely.
    if (!this.cameraAnimation || !this.coasterAnimation) return;
    // Once the wearable gallery has taken over, the 3D layer is empty: clear it once and idle.
    const rw = r - 8;
    if (this.renderTable(rw, r - 21.25)) {
      this.idle = false;
      return;
    }
    if (rw > 5.3) {
      if (!this.idle) {
        this.renderer.clear();
        this.idle = true;
      }
      return;
    }
    this.idle = false;

    this.table.group.visible = false;
    if (this.rise) this.rise.visible = false;
    this.camera.zoom = 1;
    this.camera.fov = FOV;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.coasterUniforms.uEnv1.value = this.envHero;
    this.renderer.setScissorTest(false);

    const animationRatio = fit(r, 0, 5.5, 0, 1);
    const frame = animationRatio * (this.cameraAnimation.frameCount - 1);
    this.cameraAnimation.apply(this.camera, frame);
    this.coasterAnimation.apply(this.coaster, frame);
    const wearable = this.updateWearable(rw);
    this.camera.updateMatrixWorld();
    this.coaster.updateMatrixWorld();

    // Lighting moves from the desk lamp to the dark "hand" set as the coaster flips.
    const highlight = fit(r, 5.5, 6, 0, 1) * fit(r, 7.5, 8, 1, 0);
    const lightBlend = fit(frame, 47, 73, 0, 1);
    this.lightPosition.copy(HERO_LIGHT).lerp(HAND_LIGHT, lightBlend);
    const u = this.coasterUniforms;
    u.uLocalLight.value
      .copy(this.lightPosition)
      .lerp(WEARABLE_LIGHT, wearable.blend)
      .applyMatrix4(this.m0.copy(this.coasterInner.matrixWorld).invert());
    u.uWrapperRatio.value = wearable.wrapperLight;
    u.uWearableBlend.value = wearable.blend;
    u.uZoom.value = wearable.zoom;
    this.v0.setFromMatrixPosition(this.coasterInner.matrixWorld).project(this.camera);
    u.uZoomCenter.value.set(this.v0.x, this.v0.y);
    u.uEnvBlend.value = lightBlend;
    u.uHeroRatio.value = heroActive;
    u.uHighlight.value = highlight;
    u.uExtraBump.value = fit(animationRatio, 0.45, 0.5, 1.75, 0);
    u.uTime.value = this.time * 0.25;

    this.updateHand(dt, frame, r, highlight);

    // Desk layer fades out as the hero scrolls away.
    this.desk.visible = heroActive > 0;
    if (this.desk.visible) {
      const s = this.desk.scale.x;
      this.baseMaterial.opacity = heroActive;
      const pointer = this.pointer
        ? this.deskPointer.set(
            (this.pointer.x * this.width) / 2 / s,
            (this.pointer.y * this.height) / 2 / s,
          )
        : null;
      this.deskProps?.update(dt, pointer, heroActive);
      if (this.shadow) {
        this.v0.copy(this.coaster.position).project(this.camera);
        this.shadow.position.set(
          (this.v0.x * this.width) / 2 / s - 30,
          (this.v0.y * this.height) / 2 / s - 34,
          0,
        );
        this.shadow.scale.setScalar(620);
        this.shadow.material.opacity = heroActive * 0.9;
      }
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
    window.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerleave", this.onPointerLeave);
    this.renderer.dispose();
  }
}
