import * as THREE from "three";

import { toGeometry } from "@/lib/oryzo3d/anim";
import { loadBuf } from "@/lib/oryzo3d/buf";

// The big water bear that climbs out of the microscope window once its smaller cousins wake.
// The original drives its legs and head with a wiggle-bone rig; here the body is posed as one
// piece and sways with smooth noise, turning towards the pointer.

const vertexShader = /* glsl */ `
  attribute float Cd;
  attribute float thickness;
  uniform mat4 uProjection;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying vec2 vUv;
  varying float vAo;
  varying float vThickness;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mv.xyz;
    vViewNormal = normalMatrix * normal;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vAo = Cd;
    vThickness = thickness;
    vUv = uv;
    gl_Position = uProjection * mv;
  }
`;

// The original's look: a pale, translucent body lit like a microscope image (drawn inverted).
const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying vec2 vUv;
  varying float vAo;
  varying float vThickness;

  vec3 bump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy) {
    vec3 vSigmaX = dFdx(surfPos);
    vec3 vSigmaY = dFdy(surfPos);
    vec3 R1 = cross(vSigmaY, surfNorm);
    vec3 R2 = cross(surfNorm, vSigmaX);
    float fDet = dot(vSigmaX, R1) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surfNorm - vGrad);
  }

  void main() {
    if (vWorldPosition.z < -0.1 && vWorldPosition.y < -0.22) discard;
    float h = texture2D(uTexture, vUv).r;
    vec2 dHdxy = (vec2(texture2D(uTexture, vUv + dFdx(vUv)).r, texture2D(uTexture, vUv + dFdy(vUv)).r) - h) * 3.0;
    vec3 N = bump(-vViewPosition, normalize(vViewNormal), dHdxy);
    vec3 V = normalize(-vViewPosition);
    vec3 R = reflect(V, N);
    float NdV = clamp(abs(dot(N, V)), 0.001, 1.0);
    float fresnel = pow(1.0 - NdV, 3.0);
    float smallPart = pow(1.0 - vThickness, 8.0) * pow(1.0 - vAo, 5.0);
    vec3 color = vec3(vAo * 0.025 + smallPart * smoothstep(-0.5, 1.0, R.z) * 0.975);
    color += (1.0 - color) * fresnel * (0.25 + vAo * 0.75);
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), smoothstep(-0.1, 0.2, vWorldPosition.z));
    gl_FragColor.rgb = 1.0 - gl_FragColor.ggg;
  }
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const backOut = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const noise = (t: number, seed: number) =>
  Math.sin(t * 1.3 + seed) * 0.6 +
  Math.sin(t * 2.9 + seed * 2.1) * 0.3 +
  Math.sin(t * 5.3 + seed * 3.7) * 0.1;

export class WaterBear3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
  private container = new THREE.Object3D();
  private mesh?: THREE.Mesh;
  private time = 0;
  private active = 0;
  private drift = 0;
  private uniforms = {
    uTexture: { value: null as THREE.Texture | null },
    uProjection: { value: this.camera.projectionMatrix },
  };
  private drawn = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 2);
    this.camera.updateMatrixWorld();
    this.scene.add(this.container);
    const texture = new THREE.TextureLoader().load("/oryzo/textures/table/WATERBEAR.webp");
    texture.colorSpace = THREE.NoColorSpace;
    this.uniforms.uTexture.value = texture;
    void loadBuf("/oryzo/models/table/water_bear.buf").then((data) => {
      const mesh = new THREE.Mesh(
        toGeometry(data),
        new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader,
          fragmentShader,
          transparent: true,
          side: THREE.DoubleSide,
        }),
      );
      mesh.frustumCulled = false;
      this.container.add(mesh);
      this.mesh = mesh;
    });
  }

  /**
   * @param rect the microscope window on screen
   * @param on whether the water bears are awake
   * @param show how far the microscope is shown (0-1)
   * @param pointer pointer in CSS pixels
   */
  update(dt: number, rect: DOMRect, on: boolean, show: number, pointer: { x: number; y: number }) {
    this.active = on ? Math.min(1, this.active + dt) : 0;
    const visible = on && show > 0 && !!this.mesh;
    if (!visible) {
      if (this.drawn) {
        this.renderer.clear();
        this.drawn = false;
      }
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(vw * dpr) || this.canvas.height !== Math.round(vh * dpr)) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(vw, vh, false);
    }
    dt = Math.min(Math.max(dt, 1 / 120), 1 / 45);
    this.time += dt;

    const rise = backOut(Math.min(show, this.active));
    const scale = (rect.height / vh) * 4;
    const unit = (Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z * 2) / vh;
    const cx = rect.left + rect.width / 2 - vw / 2;
    const cy = rect.top + rect.height / 2;
    this.camera.aspect = vw / vh;
    this.camera.setViewOffset(vw, vh, 0, vh / 2 - cy, vw, vh);
    this.camera.updateProjectionMatrix();

    // Lags behind the window as it is dragged, then catches up.
    this.drift += (cx - this.drift) * (1 - Math.exp(-dt * 10));
    const lag = (cx - this.drift) / Math.max(1, rect.width);
    const x = cx * unit;
    this.container.scale.setScalar(scale);
    this.container.rotation.set(THREE.MathUtils.lerp((-110 / 180) * Math.PI, 0.1, rise), 0, 0);
    this.container.position.set(x * 0.8, -0.6, 0);

    // Turn towards the pointer, with a slow living sway on top.
    const px = (pointer.x - rect.left - rect.width / 2) / vw;
    const py = -(pointer.y - rect.top - rect.height / 2) / vh;
    const mesh = this.mesh;
    if (mesh) {
      mesh.position.set((x * 0.2) / scale, 0.5 / scale, 0);
      mesh.rotation.set(
        -py / 2 + noise(this.time, 1) * 0.08,
        px + noise(this.time, 2) * 0.12,
        -lag + noise(this.time, 3) * 0.05,
      );
    }
    this.canvas.style.opacity = clamp01(show).toFixed(3);
    this.renderer.render(this.scene, this.camera);
    this.drawn = true;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.renderer.dispose();
  }
}
