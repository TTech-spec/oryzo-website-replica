import * as THREE from "three";

import { toGeometry } from "./anim";
import { loadBuf } from "./buf";
import { wrapperFragment, wrapperVertex } from "./shaders";

const BONES = 1024;
const FRAMES = 32;
const quadIn = (t: number) => t * t;
const fit01 = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

/**
 * The red foil wrapper that tears open around the coaster. Two meshes (clear front film, printed
 * back) share one baked tear simulation stored in a texture.
 */
export class Wrapper {
  readonly group = new THREE.Group();
  opacity = 0;
  /** 0 = sealed, 1 = fully torn and gone. */
  tearRatio = 0;

  private shared = {
    uAnimTexture: { value: null as THREE.Texture | null },
    uAnimTexelSize: { value: new THREE.Vector2(1 / (BONES * 2), 1 / (FRAMES * 2)) },
    uAnimBlend: { value: new THREE.Vector3() },
    uHarmonicsTime: { value: 0 },
    uOpacity: { value: 0 },
    uOffset: { value: 0 },
  };

  constructor(
    private modelPath: string,
    private loadTexture: (path: string) => THREE.Texture,
    private env: { value: THREE.Texture | null },
  ) {
    this.group.visible = false;
  }

  async load() {
    const nearest = (path: string) => {
      const t = this.loadTexture(path);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    };
    const repeating = (path: string) => {
      const t = this.loadTexture(path);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    };
    this.shared.uAnimTexture.value = nearest("wearable/condom/condom_anim.webp");
    const normalMap = repeating("wearable/condom/normal.png");
    const pattern = repeating("wearable/condom/pattern.png");
    const specEnv = this.loadTexture("hero/env_hand_spec_20.webp");
    specEnv.wrapS = THREE.RepeatWrapping;

    const [front, back] = await Promise.all([
      loadBuf(`${this.modelPath}wearable/condom_front.buf`),
      loadBuf(`${this.modelPath}wearable/condom_back.buf`),
    ]);
    for (const [side, data] of [
      ["front", front],
      ["back", back],
    ] as const) {
      const isBack = side === "back";
      const geometry = toGeometry(data);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox ?? new THREE.Box3();
      const material = new THREE.ShaderMaterial({
        vertexShader: wrapperVertex,
        fragmentShader: wrapperFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: isBack,
        defines: isBack ? { IS_BACK: 1 } : {},
        uniforms: {
          ...this.shared,
          uBase: { value: this.loadTexture(`wearable/condom/${side}/base.avif`) },
          uHarmonics0: { value: nearest(`wearable/condom/${side}/harmonics_0.avif`) },
          uHarmonics1: { value: nearest(`wearable/condom/${side}/harmonics_1.avif`) },
          uHarmonicsStrength: { value: isBack ? 0.561381 : 0.567662 },
          uUvMap: {
            value: new THREE.Vector4(
              box.min.x,
              box.min.y,
              box.max.x - box.min.x,
              box.max.y - box.min.y,
            ),
          },
          uPMin: {
            value: new THREE.Vector3(
              -0.3394055962562561,
              -0.14426785707473755,
              -0.11583681404590607,
            ),
          },
          uPMax: {
            value: new THREE.Vector3(0.24513307213783264, 0.13702133297920227, 0.13621310889720917),
          },
          uOrientMin: {
            value: new THREE.Vector4(
              -0.9976852536201477,
              -0.9990588426589966,
              -0.9972358345985413,
              -0.7041476368904114,
            ),
          },
          uOrientMax: {
            value: new THREE.Vector4(0.7065264582633972, 0.7041239738464355, 0.7047980427742004, 1),
          },
          uIsBack: { value: isBack ? 1 : 0 },
          uEnv: this.env,
          uSpecEnv: { value: specEnv },
          uColor: { value: new THREE.Color("#e7691d").convertSRGBToLinear() },
          uNormalMap: { value: normalMap },
          uPattern: { value: pattern },
        },
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = isBack ? -1 : 1;
      this.group.add(mesh);
    }
  }

  update() {
    this.group.visible = this.opacity > 0;
    if (!this.group.visible) return;
    const frame = this.tearRatio * (FRAMES - 1);
    const from = Math.floor(frame);
    const to = Math.ceil(frame);
    this.shared.uAnimBlend.value.set(from * 2, to * 2, frame - from);
    this.shared.uHarmonicsTime.value = (frame / 31) * Math.PI;
    // Once torn, the two halves drop away and spread apart.
    this.group.position.y = quadIn(fit01(frame, 18, 32)) * -0.1;
    this.shared.uOffset.value = fit01(frame, 18, 32) * 0.3;
    this.shared.uOpacity.value = this.opacity;
  }
}
