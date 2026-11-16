import * as THREE from "three";

import { floatAttribute, loadBuf, type BufData } from "./buf";
import { DeskProps, PLANE_HEIGHT, PLANE_WIDTH } from "./deskProps";
import { HandRig } from "./handRig";
import { coasterFragment, coasterVertex, HAND_BONES, handFragment, handVertex } from "./shaders";

const MODEL_PATH = "/oryzo/models/";
const TEXTURE_PATH = "/oryzo/textures/";

// Camera constants of the baked scene (50mm lens on a 41.4mm-wide 2240x1260 gate).
const VIEW_WIDTH = 2240;
const VIEW_HEIGHT = 1260;
const FOV = (2 * Math.atan((VIEW_HEIGHT * 41.4) / VIEW_WIDTH / 2 / 50) * 180) / Math.PI;

const HAND_FRAME_START = 71;

const HERO_LIGHT = new THREE.Vector3(0.346682, 1.00875, -0.368255);
const X_AXIS = new THREE.Vector3(1, 0, 0);
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

const floatTexture = (data: Float32Array) =>
  new THREE.DataTexture(data, HAND_BONES, 1, THREE.RGBAFormat, THREE.FloatType);

export class OryzoStage {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 20);
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
  };

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
      const t = tex(path);
      t.wrapS = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      return t;
    };
    const u = this.coasterUniforms;
    u.uDiffuse.value = diffuse;
    u.uHeight.value = height;
    u.uEnv1.value = env("hero/env_hero.webp");
    u.uEnv2.value = env("hero/env_hand.webp");
    u.uBrdf.value = tex("brdf.png");
    this.coaster.add(
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
    if (rw > 4.4) {
      if (!this.idle) {
        this.renderer.clear();
        this.idle = true;
      }
      return;
    }
    this.idle = false;

    const animationRatio = fit(r, 0, 5.5, 0, 1);
    const frame = animationRatio * (this.cameraAnimation.frameCount - 1);
    this.cameraAnimation.apply(this.camera, frame);
    this.coasterAnimation.apply(this.coaster, frame);
    // In the wearable intro the coaster turns over once inside its frame, then settles back
    // as the photo fades in over it.
    if (rw > 0) {
      const spin = fit(rw, 1, 2.8, 0, 1, (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
      );
      this.coaster.quaternion.multiply(this.q0.setFromAxisAngle(X_AXIS, spin * Math.PI * 2));
    }
    this.coaster.scale.setScalar(fit(rw, 3.2, 4.3, 1, 0.55));
    this.camera.updateMatrixWorld();
    this.coaster.updateMatrixWorld();

    // Lighting moves from the desk lamp to the dark "hand" set as the coaster flips.
    const highlight = fit(r, 5.5, 6, 0, 1) * fit(r, 7.5, 8, 1, 0);
    const lightBlend = fit(frame, 47, 73, 0, 1);
    this.lightPosition.copy(HERO_LIGHT).lerp(HAND_LIGHT, lightBlend);
    const u = this.coasterUniforms;
    u.uLocalLight.value
      .copy(this.lightPosition)
      .applyMatrix4(this.m0.copy(this.coaster.matrixWorld).invert());
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

function toGeometry(data: BufData) {
  const geometry = new THREE.BufferGeometry();
  for (const [id, attr] of Object.entries(data.attributes)) {
    if (id === "indices") geometry.setIndex(new THREE.BufferAttribute(attr.array, 1));
    else geometry.setAttribute(id, new THREE.BufferAttribute(attr.array, attr.itemSize));
  }
  return geometry;
}
