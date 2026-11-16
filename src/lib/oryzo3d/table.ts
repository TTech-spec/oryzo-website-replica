import * as THREE from "three";

import { FrameAnimation, fovFromFocal, toGeometry } from "./anim";
import { loadBuf } from "./buf";
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
    #endif
  }
`;

const deskFragment = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vModelPosition;
  varying vec3 vWorldPosition;
  uniform sampler2D uTexture;
  uniform vec3 uLightPosition;
  #ifdef IS_DESK
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
      shadow = clamp(shadow, 0.0, 1.0);
      color *= 0.05 + 0.95 * shadow * shadow;
    #endif
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
      color *= mix(labelColor, vec3(1.0), color.r * color.r * 0.07);
    #endif
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

const coverFragment = /* glsl */ `
  varying float vAo;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 L = normalize(vec3(0.5, 0.48, 1.0));
    float NdL = max(0.0, dot(N, L));
    float spec = pow(max(0.0, dot(N, normalize(L + V))), 60.0);
    float fresnel = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 4.0);
    vec3 color = vec3(0.012) + vec3(0.02) * NdL + vec3(0.55, 0.5, 0.42) * spec + vec3(0.12, 0.1, 0.08) * fresnel;
    color *= 0.35 + 0.65 * vAo;
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
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
  };

  constructor() {
    this.group.visible = false;
    this.group.add(this.coffee);
  }

  async load(
    renderer: THREE.WebGLRenderer,
    modelPath: string,
    splatUrl: string,
    tex: (path: string) => THREE.Texture,
  ) {
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
      this.group.add(mesh);
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

    await this.splats.load(splatUrl, renderer);
    if (this.splats.mesh) this.splats.mesh.renderOrder = -2;
    this.group.add(this.splats);
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

  /** Call after world matrices are current. */
  update(camera: THREE.Camera, coasterInner: THREE.Object3D) {
    this.coffee.updateMatrixWorld(true);
    this.uniforms.uCoffeeInv.value.copy(this.coffee.matrixWorld).invert();
    this.uniforms.uCoasterInv.value.copy(coasterInner.matrixWorld).invert();
    this.uniforms.uCoffeeOn.value = this.coffee.visible ? 1 : 0;
    this.uniforms.uPosition.value.copy(this.coffee.position);
    this.splats.update(camera);
  }
}
