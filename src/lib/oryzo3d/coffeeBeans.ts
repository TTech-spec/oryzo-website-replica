import * as THREE from "three";

import { fovFromFocal, toGeometry } from "@/lib/oryzo3d/anim";
import { loadBuf } from "@/lib/oryzo3d/buf";

// A stream of coffee beans drifting diagonally behind the footer, spiralling around a wavy path.
// The pointer is a small light that pushes beans aside; beans far from it fade into the dark.
// Simulation constants are the original's.
const RADIUS = 0.01;
const DAMPING = 1;
const MOUSE_Z = -0.3;
const MOUSE_RADIUS = 0.1;
const MOUSE_PUSH = 0.25;
const PATH_START = new THREE.Vector3(-0.5, 0.25, MOUSE_Z);
const PATH_END = new THREE.Vector3(0.5, -0.25, MOUSE_Z);
const CURVE_FREQUENCY = 8;
const CURVE_AMPLITUDE = 0.05;
const CURVE_PHASE_SPEED = 0.25;
const DRIFT_SPEED = 0.1;
const DRIFT_RATE = 2;
const ATTRACTION_RATE = 0.5;
const SPIRAL_FREQUENCY = 8;
const PATH_RADIUS = 0.05;
const CONTACT = RADIUS * 2 * 0.7;
const CONTACT_SQ = CONTACT * CONTACT;

const vertexShader = /* glsl */ `
  attribute float Cd;
  attribute float brightness;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying float vAo;
  varying float vBrightness;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 mv = viewMatrix * world;
    vViewNormal = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    vViewPosition = -mv.xyz;
    vWorldPosition = world.xyz;
    vUv = uv;
    vAo = Cd;
    vBrightness = brightness;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uDiffuse;
  uniform sampler2D uHeight;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying float vAo;
  varying float vBrightness;

  // Bump mapping from the height map (three.js perturbNormalArb).
  vec3 bump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy) {
    vec3 vSigmaX = dFdx(surfPos);
    vec3 vSigmaY = dFdy(surfPos);
    vec3 vN = surfNorm;
    vec3 R1 = cross(vSigmaY, vN);
    vec3 R2 = cross(vN, vSigmaX);
    float fDet = dot(vSigmaX, R1) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surfNorm - vGrad);
  }

  void main() {
    vec3 albedo = pow(texture2D(uDiffuse, vUv, 1.5).rgb, vec3(2.2 + 0.8 * (vBrightness - 0.5)));
    float h = texture2D(uHeight, vUv).r;
    vec2 dHdxy = (vec2(texture2D(uHeight, vUv + dFdx(vUv)).r, texture2D(uHeight, vUv + dFdy(vUv)).r) - h) * 0.3;
    vec3 VN = bump(-vViewPosition, normalize(vViewNormal), dHdxy);
    vec3 N = normalize((vec4(VN, 0.0) * viewMatrix).xyz);
    vec3 V = normalize(cameraPosition - vWorldPosition);
    vec3 L = uLight - vWorldPosition;
    float distance = length(L);
    L /= distance;
    vec3 H = normalize(L + V);
    float NdL = dot(N, L);
    float NdH = clamp(dot(N, H), 0.0, 1.0);
    float specular = pow(NdH, 80.0 - 40.0 * vBrightness);
    float attenuation = 1.0 / (30.0 * distance * distance + 0.01);
    float ao = vAo * vAo * vAo;
    vec3 color = albedo * max(0.0, NdL) * attenuation * ao;
    color += albedo * max(0.0, -NdL) * attenuation * 0.015;
    color += (albedo * 0.8 + 0.2) * specular * attenuation * ao;
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), min(1.0, ao * attenuation));
  }
`;

const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const push = new THREE.Vector3();
const segment = new THREE.Vector3();
const tangent = new THREE.Vector3();
const perpU = new THREE.Vector3();
const perpV = new THREE.Vector3();
const UP = new THREE.Vector3(0, 0, 1);
const UP_ALT = new THREE.Vector3(0, 1, 0);
const quat = new THREE.Quaternion();
const target = new THREE.Quaternion();
const offset = new THREE.Quaternion();
const mat = new THREE.Matrix4();
const scale = new THREE.Vector3(RADIUS, RADIUS, RADIUS);

export class CoffeeBeans {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(fovFromFocal(50), 1, 0.01, 10);
  private mesh?: THREE.InstancedMesh;
  private count: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private quat: Float32Array;
  private rotOffset: Float32Array;
  private pathRadius: Float32Array;
  private pathPhase: Float32Array;
  private spiral: Float32Array;
  private pathTime = 0;
  private light = new THREE.Vector3();
  private mouse = new THREE.Vector3();
  private mousePrev = new THREE.Vector3();
  /** Pointer in -1..1 over the canvas, eased. */
  private pointer = new THREE.Vector2(0, -0.2);
  private pointerTarget = new THREE.Vector2(0, -0.2);
  private uniforms = {
    uDiffuse: { value: null as THREE.Texture | null },
    uHeight: { value: null as THREE.Texture | null },
    uLight: { value: this.light },
  };
  private width = 0;
  private height = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    basePath: string,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    const side = window.innerWidth < 768 ? 24 : 32;
    this.count = side * side;
    const n = this.count;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.quat = new Float32Array(n * 4);
    this.rotOffset = new Float32Array(n * 4);
    this.pathRadius = new Float32Array(n);
    this.pathPhase = new Float32Array(n);
    this.spiral = new Float32Array(n);

    this.camera.position.set(0, 0.4, 0.45);
    this.camera.lookAt(0, 0.06, MOUSE_Z);

    const loader = new THREE.TextureLoader();
    const load = (path: string) => {
      const t = loader.load(basePath + path);
      t.colorSpace = THREE.NoColorSpace;
      t.flipY = false;
      return t;
    };
    this.uniforms.uDiffuse.value = load("textures/coffeeBean/DIFF.webp");
    this.uniforms.uHeight.value = load("textures/coffeeBean/HEIGHT.webp");
    void loadBuf(basePath + "models/COFFEE_BEAN.buf").then((data) => this.build(toGeometry(data)));
  }

  private updateBasis() {
    segment.subVectors(PATH_END, PATH_START);
    const length = segment.length() || 1e-6;
    tangent.copy(segment).divideScalar(length);
    perpU.crossVectors(tangent, UP);
    if (perpU.lengthSq() < 1e-6) perpU.crossVectors(tangent, UP_ALT);
    perpU.normalize();
    perpV.crossVectors(tangent, perpU).normalize();
    return length;
  }

  /** Writes the path target for a bean at ratio t along the path into v0. */
  private pathTarget(t: number, length: number, radius: number, phase: number, spiral: number) {
    const a = CURVE_FREQUENCY * t * length + this.pathTime * CURVE_PHASE_SPEED;
    v0.copy(PATH_START).addScaledVector(segment, t);
    v0.addScaledVector(perpU, CURVE_AMPLITUDE * Math.sin(a));
    v0.addScaledVector(perpV, CURVE_AMPLITUDE * Math.cos(a));
    const b = SPIRAL_FREQUENCY * spiral * t * length + phase;
    v0.addScaledVector(perpU, radius * Math.cos(b));
    v0.addScaledVector(perpV, radius * Math.sin(b));
  }

  /** Orientation facing along the velocity, written into target. */
  private faceVelocity() {
    v0.copy(vel).normalize();
    v1.set(0, 0, 1);
    if (Math.abs(v0.z) > 0.99) v1.set(1, 0, 0);
    v1.crossVectors(v0, v1).normalize();
    const z = v1.clone().cross(v0).normalize();
    mat.makeBasis(v1, v0, z);
    target.setFromRotationMatrix(mat);
  }

  private build(geometry: THREE.BufferGeometry) {
    const n = this.count;
    const brightness = new Float32Array(n);
    const length = this.updateBasis();
    for (let i = 0; i < n; i++) {
      this.pathRadius[i] = 2 * Math.random() * PATH_RADIUS;
      this.pathPhase[i] = Math.PI * 2 * Math.random();
      this.spiral[i] = 2 * Math.random();
      this.pathTarget(
        Math.random(),
        length,
        this.pathRadius[i] ?? 0,
        this.pathPhase[i] ?? 0,
        this.spiral[i] ?? 0,
      );
      v0.toArray(this.pos, i * 3);
      vel
        .copy(tangent)
        .multiplyScalar(DRIFT_SPEED)
        .toArray(this.vel, i * 3);
      this.faceVelocity();
      target.toArray(this.quat, i * 4);
      v0.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      offset
        .setFromAxisAngle(v0, (Math.random() - 0.5) * 2 * Math.PI)
        .toArray(this.rotOffset, i * 4);
      brightness[i] = Math.random();
    }
    geometry.setAttribute("brightness", new THREE.InstancedBufferAttribute(brightness, 1));
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
      }),
      n,
    );
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.mesh = mesh;
  }

  /** Pointer position relative to the canvas, in pixels; null when it leaves. */
  setPointer(x: number, y: number) {
    this.pointerTarget.set((x / this.width) * 2 - 1, -((y / this.height) * 2 - 1));
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Wide screens see the whole stream; narrow ones zoom out so it still crosses the screen.
    this.camera.zoom = 0.8 * Math.min(1, this.camera.aspect / 1.6);
    this.camera.updateProjectionMatrix();
  }

  update(dt: number) {
    this.resize();
    const mesh = this.mesh;
    if (!mesh) return;
    dt = Math.min(dt, 1 / 30);
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 8));

    // The pointer as a point on the beans' plane.
    v0.set(this.pointer.x, this.pointer.y, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
    v0.multiplyScalar((MOUSE_Z - this.camera.position.z) / v0.z);
    this.mouse.copy(this.camera.position).add(v0);
    push
      .copy(this.mouse)
      .sub(this.mousePrev)
      .multiplyScalar(Math.exp(-dt * 10));
    this.mousePrev.copy(this.mouse);
    this.light.copy(this.mouse);
    this.light.z += 0.1;
    this.pathTime += dt;

    const length = this.updateBasis();
    const lengthSq = segment.lengthSq() || 1e-12;
    const n = this.count;
    const attract = 1 - Math.exp(-dt * ATTRACTION_RATE);
    const drift = 1 - Math.exp(-dt * DRIFT_RATE);
    const damp = Math.exp(-dt * DAMPING);
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      pos.fromArray(this.pos, k);
      vel.fromArray(this.vel, k);
      const radius = this.pathRadius[i] ?? 0;
      const phase = this.pathPhase[i] ?? 0;
      const spiral = this.spiral[i] ?? 0;
      let t = segment.dot(v1.copy(pos).sub(PATH_START)) / lengthSq;
      this.pathTarget(t, length, radius, phase, spiral);
      v1.subVectors(pos, v0);
      vel.addScaledVector(v1, -attract);
      const along = vel.dot(tangent);
      vel.addScaledVector(tangent, (DRIFT_SPEED - along) * drift);
      vel.multiplyScalar(damp);
      pos.addScaledVector(vel, dt);
      t = segment.dot(v1.copy(pos).sub(PATH_START)) / lengthSq;
      if (t > 1) {
        this.pathTarget(0, length, radius, phase, spiral);
        pos.copy(v0);
      } else if (t < 0) {
        this.pathTarget(1, length, radius, phase, spiral);
        pos.copy(v0);
      }
      v0.subVectors(pos, this.mouse);
      const d = v0.length();
      if (d < MOUSE_RADIUS + RADIUS && d > 0.001) {
        v0.divideScalar(d);
        vel.addScaledVector(v0, MOUSE_PUSH * (MOUSE_RADIUS + RADIUS - d));
        vel.add(push);
      }
      pos.toArray(this.pos, k);
      vel.toArray(this.vel, k);
    }

    // Keep beans from overlapping.
    const p = this.pos;
    for (let i = 0; i < n; i++) {
      const a = i * 3;
      for (let j = i + 1; j < n; j++) {
        const b = j * 3;
        const dx = (p[b] ?? 0) - (p[a] ?? 0);
        const dy = (p[b + 1] ?? 0) - (p[a + 1] ?? 0);
        const dz = (p[b + 2] ?? 0) - (p[a + 2] ?? 0);
        const sq = dx * dx + dy * dy + dz * dz;
        if (sq >= CONTACT_SQ || sq < 1e-12) continue;
        const dist = Math.sqrt(sq);
        const s = ((CONTACT - dist) * 0.5) / dist;
        p[a] = (p[a] ?? 0) - dx * s;
        p[a + 1] = (p[a + 1] ?? 0) - dy * s;
        p[a + 2] = (p[a + 2] ?? 0) - dz * s;
        p[b] = (p[b] ?? 0) + dx * s;
        p[b + 1] = (p[b + 1] ?? 0) + dy * s;
        p[b + 2] = (p[b + 2] ?? 0) + dz * s;
      }
    }

    for (let i = 0; i < n; i++) {
      pos.fromArray(this.pos, i * 3);
      vel.fromArray(this.vel, i * 3);
      if (vel.length() > 0.001) this.faceVelocity();
      else target.fromArray(this.quat, i * 4);
      quat
        .fromArray(this.quat, i * 4)
        .slerp(target, 0.8)
        .toArray(this.quat, i * 4);
      quat.multiply(offset.fromArray(this.rotOffset, i * 4));
      mat.compose(pos, quat, scale);
      mesh.setMatrixAt(i, mat);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.renderer.dispose();
  }
}
