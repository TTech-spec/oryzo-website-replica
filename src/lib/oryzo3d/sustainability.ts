import * as THREE from "three";

import { toGeometry } from "./anim";
import { loadBuf } from "./buf";

// Sustainability: a top-down slab of cork-oak bark splits and rolls back like a peel, revealing
// the word "sustainability" on a dark ground that then turns cream, dappled with leaf shadow.

const WHITE = new THREE.Color("#ffedd7");
const BLACK = new THREE.Color("#100904");

const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const groundFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec2 uResolution;
  uniform float uPeel;
  uniform sampler2D uGobo;
  uniform mat4 uGoboMatrix;
  uniform float uOffsetY;
  varying vec2 vUv;
  float linearstep(float a, float b, float v) { return clamp((v - a) / (b - a), 0.0, 1.0); }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    // The ground is a plane one screen-height tall; leaf shadows are projected onto it.
    vec3 worldPos = vec3((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0), 0.0);
    worldPos.y += uOffsetY;
    float gobo = 1.0;
    vec4 ndc = uGoboMatrix * vec4(worldPos, 1.0);
    ndc /= ndc.w;
    vec2 goboUv = ndc.xy * 0.5 + 0.5;
    if (goboUv.x >= 0.0 && goboUv.x <= 1.0 && goboUv.y >= 0.0 && goboUv.y <= 1.0) {
      // Shadows soften towards the lower left, as if the leaves were further from the surface.
      float blurRatio = linearstep(-0.3, 0.5, dot(worldPos.xy, normalize(vec2(-1.0, -1.0))));
      float angle = hash(gl_FragCoord.xy) * 6.28318530718;
      vec2 d = vec2(cos(angle), sin(angle));
      const mat2 rot = mat2(-0.7373688, 0.6754903, -0.6754903, -0.7373688);
      vec2 s = vec2(1.0 / 512.0) * blurRatio * blurRatio * 3.0 / sqrt(6.0);
      float sum = 0.0;
      for (int i = 0; i < 6; i++) {
        sum += texture2D(uGobo, goboUv + d * sqrt(float(i + 1)) * s).r;
        d = rot * d;
      }
      float f = mix(0.3, 0.005, blurRatio);
      gobo = mix(1.0 - f, 1.0, sum / 6.0);
    }
    vec3 color = pow(uColor * gobo, vec3(1.0 / 2.2));
    // Light sweeps in from the right as the bark peels.
    color *= clamp(uPeel * 1.5 - 0.5 + vUv.x * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// The title is a triangulated outline: xy is the shape, z the distance from its edge.
const titleVertex = /* glsl */ `
  uniform vec4 uRect;
  uniform vec2 uViewport;
  varying float vX;
  varying float vDist;
  void main() {
    vec2 pos = position.xy / vec2(1.0, 0.150907) + 0.5;
    // uRect is in CSS pixels from the top-left.
    vec2 px = uRect.xy + vec2(pos.x, 1.0 - pos.y) * uRect.zw;
    vX = px.x / uViewport.x;
    vDist = position.z;
    gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

const titleFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPeel;
  varying float vX;
  varying float vDist;
  float linearstep(float a, float b, float v) { return clamp((v - a) / (b - a), 0.0, 1.0); }
  void main() {
    vec3 color = uColor * clamp(uPeel * 2.0 - 1.0 + vX, 0.0, 1.0);
    float coverage = linearstep(0.01 + fwidth(vDist), 0.0, vDist);
    gl_FragColor = vec4(color, coverage);
  }
`;

// Dashes that run around each letter's outline. They show where the pointer is near, and in a
// single sweep across the word just as the bark finishes peeling.
const outlineVertex = /* glsl */ `
  attribute vec3 OP;
  attribute float radius;
  uniform vec4 uRect;
  uniform vec2 uViewport;
  varying float vX;
  varying float vCurve;
  varying float vPerimeter;
  varying float vRadius;
  varying vec2 vPx;
  void main() {
    vec2 pos = position.xy / vec2(1.0, 0.150907) + 0.5;
    vec2 px = uRect.xy + vec2(pos.x, 1.0 - pos.y) * uRect.zw;
    vX = px.x / uViewport.x;
    vPx = px;
    vCurve = position.z;
    vPerimeter = OP.z;
    vRadius = radius;
    gl_Position = vec4(px.x / uViewport.x * 2.0 - 1.0, 1.0 - px.y / uViewport.y * 2.0, 0.0, 1.0);
  }
`;

const outlineFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPeel;
  uniform float uPulse;
  uniform float uTime;
  uniform vec3 uPointer;
  uniform vec2 uViewport;
  varying float vX;
  varying float vCurve;
  varying float vPerimeter;
  varying float vRadius;
  varying vec2 vPx;
  void main() {
    // A dash travelling along the curve, at a speed independent of the letter's size.
    float t = mod(uTime / vPerimeter * 0.2 - vCurve, 1.0);
    float dash = smoothstep(0.0, 0.05, t) * smoothstep(0.8, 0.5, t);
    float l = 0.5 + uPulse * 2.0;
    float d = (1.0 - uPulse) * (1.0 + l) - vX - l;
    float pulse = smoothstep(-l, -0.0001, d) * smoothstep(0.0, -0.0001, d) * smoothstep(0.0, 0.2, uPulse);
    float near = smoothstep(0.24, 0.07, distance(vPx, uPointer.xy) / uViewport.y) * uPointer.z;
    float alpha = max(pulse, near) * dash * (1.0 - vRadius);
    vec3 color = uColor * clamp(uPeel * 2.0 - 1.0 + vX, 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
  }
`;

const barkVertex = /* glsl */ `
  attribute float side;
  attribute float Cd;
  uniform float uPeel;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  varying vec2 vDiffUv;
  varying vec2 vShadowUv;
  varying float vRatio;
  varying float vAo;
  varying float vSide;
  varying vec3 vLocalPos;
  #define PI 3.141592653589
  vec4 quaternion(float angle, vec3 axis) {
    angle *= 0.5;
    return vec4(axis * sin(angle), cos(angle));
  }
  vec3 qrotate(vec4 q, vec3 v) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }
  // Roll the far end of the slab up around a cylinder: bend 0 is flat, 2*PI a full curl.
  void bendRollShape(inout vec3 pos, inout vec3 nor, float bend, float originZ, float caplen) {
    float s = pos.z > 0.0 ? 1.0 : -1.0;
    pos.z = abs(pos.z);
    vec3 origin = vec3(0.0, 0.0, originZ);
    vec3 dir = normalize(vec3(0.0, 0.1, 1.0));
    vec3 axis1 = vec3(-1.0, 0.0, 0.0);
    vec3 axis2 = cross(axis1, dir);
    mat3 rotMatrix = transpose(mat3(axis1, axis2, dir));
    mat3 inverseMatrix = transpose(rotMatrix);
    vec3 original = (pos - origin) * inverseMatrix;
    if (abs(bend) > 0.0001 && original.z >= 0.0) {
      vec3 center = vec3(0.0, caplen / bend, 0.0);
      vec4 q = quaternion(bend * original.z / caplen, vec3(-1.0, 0.0, 0.0));
      original.z = 0.0;
      original = qrotate(q, original);
      original += center - qrotate(q, center);
      nor.z *= s;
      nor = qrotate(q, nor * inverseMatrix) * rotMatrix;
      nor.z *= s;
    }
    pos = original * rotMatrix + origin;
    pos.z *= s;
  }
  void main() {
    vec3 pos = position;
    vec3 nor = normal;
    // Each half peels along its own diagonal, from the centre seam outwards.
    vec3 posA = vec3(-0.16, 0.0, -0.11 * side);
    vec3 posB = vec3(0.12, 0.0, 0.0);
    float abLength = length(posA - posB);
    pos -= posA;
    float angle = atan(posB.x - posA.x, posB.z - posA.z) + PI * 0.5;
    vec4 q = quaternion(angle, vec3(0.0, 1.0, 0.0));
    pos = qrotate(q, pos);
    nor = qrotate(q, nor);
    bendRollShape(pos, nor, uPeel * PI * 2.0, abLength * (1.0 - uPeel) * 0.8, 0.15);
    q.xyz *= -1.0;
    pos = qrotate(q, pos);
    nor = qrotate(q, nor);
    pos += posA;
    vViewNormal = normalMatrix * nor;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    // The texture sheet holds colour in its lower two thirds and three baked shadow states above.
    vDiffUv = vec2(uv.x, uv.y * 2.0 / 3.0);
    vShadowUv = vec2(uv.x, (uv.y + 2.0) / 3.0);
    vRatio = clamp(dot(position - posA, (posB - posA) / abLength), 0.0, 1.0);
    vAo = Cd;
    vSide = side;
    vLocalPos = position;
  }
`;

const barkFragment = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uShow;
  uniform float uPeel;
  uniform vec2 uPointer;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  varying vec2 vDiffUv;
  varying vec2 vShadowUv;
  varying float vRatio;
  varying float vAo;
  varying float vSide;
  varying vec3 vLocalPos;
  float linearstep(float a, float b, float v) { return clamp((v - a) / (b - a), 0.0, 1.0); }
  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 perturbNormalArb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy) {
    vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
    vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
    vec3 R1 = cross(vSigmaY, surf_norm);
    vec3 R2 = cross(surf_norm, vSigmaX);
    float fDet = dot(vSigmaX, R1);
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * surf_norm - vGrad);
  }
  void main() {
    vec3 viewNormal = normalize(vViewNormal);
    vec3 diff = toLinear(texture2D(uTexture, vDiffUv).rgb);
    vec3 shadowmask = toLinear(texture2D(uTexture, vShadowUv).rgb);
    vec2 dSTdx = dFdx(vDiffUv);
    vec2 dSTdy = dFdy(vDiffUv);
    vec2 dHdxy = (vec2(toLinear(texture2D(uTexture, vDiffUv + dSTdx).rgb).g, toLinear(texture2D(uTexture, vDiffUv + dSTdy).rgb).g) - diff.g) * 3.0;
    viewNormal = perturbNormalArb(-vViewPosition, viewNormal, dHdxy);
    // The baked shadow moves through its three states as the peel lifts.
    float t = min(1.0, uPeel * uPeel * (1.0 + vRatio)) * 2.0;
    float shadow = mix(mix(shadowmask.r, shadowmask.g, linearstep(0.2, 1.0, t + uPointer.x * 0.025)), shadowmask.b, linearstep(1.0, 1.6, t));
    shadow = pow(shadow, 2.0 + (1.0 - vAo * vAo) * 5.0 * t / 2.0 + uPointer.y * 0.1);
    vec3 color = diff * shadow * 1.5;
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma), color, 1.2) * 1.35;
    vec3 reflection = reflect(-normalize(vViewPosition), viewNormal);
    float spec = smoothstep(0.9, 1.0, dot(reflection, normalize(vec3(0.0, vSide * -0.6, 0.85) + vec3(uPointer, 0.0) * 0.2))) * diff.g * diff.g * vAo * vAo * shadow * 10.0;
    color += spec;
    color = clamp(color * uShow * uShow, 0.0, 1.0);
    color *= smoothstep(0.135, 0.12, abs(vLocalPos.x));
    gl_FragColor = vec4(pow(color, vec3(1.0 / 2.2)), 1.0);
  }
`;

export class SustainabilityScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(23.4, 1, 0.01, 10);
  ready = false;
  /** Display colour of the copy over the ground: cream on dark, turning near-black on cream. */
  readonly inkColor = new THREE.Color();

  private ground: THREE.Mesh;
  private groundUniforms = {
    uColor: { value: new THREE.Color() },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPeel: { value: 0 },
    uGobo: { value: null as THREE.Texture | null },
    uGoboMatrix: { value: new THREE.Matrix4() },
    uOffsetY: { value: 0 },
  };
  private titleUniforms = {
    uRect: { value: new THREE.Vector4() },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uColor: { value: new THREE.Color() },
    uPeel: { value: 0 },
  };
  private outlineUniforms = {
    uRect: this.titleUniforms.uRect,
    uViewport: this.titleUniforms.uViewport,
    uColor: this.titleUniforms.uColor,
    uPeel: this.titleUniforms.uPeel,
    uPulse: { value: 0 },
    uTime: { value: 0 },
    /** Pointer in CSS pixels, with z = 1 while it is over the page. */
    uPointer: { value: new THREE.Vector3() },
  };
  private pulse = 0;
  private barkUniforms = {
    uTexture: { value: null as THREE.Texture | null },
    uShow: { value: 0 },
    uPeel: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
  };
  private bark?: THREE.Mesh;
  private title?: THREE.Mesh;
  private outline?: THREE.Mesh;

  constructor() {
    // Straight down from a third of a metre, 50mm lens on the 2:1 gate.
    this.camera.position.set(0, 0.333, 0);
    this.camera.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    this.camera.fov = (2 * Math.atan((1024 * 41.4214) / 2048 / 2 / 50) * 180) / Math.PI;

    const lamp = new THREE.PerspectiveCamera(60, 1, 0.01, 20);
    lamp.position.set(1.27056, 1.04822, 2.05131);
    lamp.quaternion.set(-0.284672, 0.0515004, -0.0734331, 0.95442);
    lamp.updateMatrixWorld();
    this.groundUniforms.uGoboMatrix.value.multiplyMatrices(
      lamp.projectionMatrix,
      lamp.matrixWorldInverse,
    );

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.groundUniforms,
        vertexShader: quadVertex,
        fragmentShader: groundFragment,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.ground.frustumCulled = false;
    this.ground.renderOrder = -15;
    this.scene.add(this.ground);
  }

  async load(modelPath: string, tex: (path: string) => THREE.Texture, gobo: THREE.Texture) {
    this.groundUniforms.uGobo.value = gobo;
    const [barkData, titleData, outlineData] = await Promise.all([
      loadBuf(`${modelPath}BARK.buf`),
      loadBuf(`${modelPath}sustainability_text.buf`),
      loadBuf(`${modelPath}sustainability_text_outline.buf`),
    ]);
    const barkTexture = tex("sustainability/bark.webp");
    barkTexture.anisotropy = 8;
    this.barkUniforms.uTexture.value = barkTexture;
    this.bark = new THREE.Mesh(
      toGeometry(barkData),
      new THREE.ShaderMaterial({
        uniforms: this.barkUniforms,
        vertexShader: barkVertex,
        fragmentShader: barkFragment,
        side: THREE.DoubleSide,
      }),
    );
    this.bark.frustumCulled = false;
    this.scene.add(this.bark);

    const title = new THREE.Mesh(
      toGeometry(titleData),
      new THREE.ShaderMaterial({
        uniforms: this.titleUniforms,
        vertexShader: titleVertex,
        fragmentShader: titleFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    title.frustumCulled = false;
    title.renderOrder = -2;
    this.scene.add(title);
    this.title = title;

    const outline = new THREE.Mesh(
      toGeometry(outlineData),
      new THREE.ShaderMaterial({
        uniforms: this.outlineUniforms,
        vertexShader: outlineVertex,
        fragmentShader: outlineFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    outline.frustumCulled = false;
    outline.renderOrder = -1;
    this.scene.add(outline);
    this.outline = outline;
    this.ready = true;
  }

  /** Ground and title first, then the bark over them (it must hide the title until it peels). */
  render(renderer: THREE.WebGLRenderer) {
    const bark = this.bark;
    const barkVisible = bark?.visible ?? false;
    if (bark) bark.visible = false;
    const flat = [this.ground, this.title, this.outline];
    for (const mesh of flat) if (mesh) mesh.visible = true;
    renderer.render(this.scene, this.camera);
    if (bark && barkVisible) {
      bark.visible = true;
      for (const mesh of flat) if (mesh) mesh.visible = false;
      renderer.render(this.scene, this.camera);
      for (const mesh of flat) if (mesh) mesh.visible = true;
    }
  }

  /**
   * @param t scene clock: 0-1 bark fades up, 1-2 it peels away, 2-3 the ground turns cream
   * @param pointer eased pointer, -1..1
   */
  update(
    t: number,
    dt: number,
    width: number,
    height: number,
    buffer: THREE.Vector2,
    pointer: THREE.Vector2,
    pointerActive: boolean,
  ) {
    // One sweep of dashes across the word as the peel completes.
    const sweeping = t > 1.7 && t < 2.1;
    if (this.pulse > 0 || sweeping) this.pulse = Math.min(1, this.pulse + dt * 0.5);
    if (!sweeping && this.pulse >= 1) this.pulse = 0;
    this.outlineUniforms.uPulse.value = this.pulse;
    this.outlineUniforms.uTime.value += dt;
    this.outlineUniforms.uPointer.value.set(
      (pointer.x * 0.5 + 0.5) * width,
      (0.5 - pointer.y * 0.5) * height,
      pointerActive ? 1 : 0,
    );
    const peel = Math.min(1, Math.max(0, t - 1));
    const cream = Math.min(1, Math.max(0, t - 2));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.groundUniforms.uColor.value.copy(BLACK).lerp(WHITE, cream);
    this.groundUniforms.uResolution.value.copy(buffer);
    this.groundUniforms.uPeel.value = peel;

    // The title sits where the page lays out its (invisible) heading box.
    const inner = width * (1 - 0.0625);
    const boxHeight = (inner * 291.94) / 1799.07;
    this.titleUniforms.uRect.value.set(
      width * 0.03125,
      height / 2 + inner * 0.07 - boxHeight,
      inner,
      width * 0.15,
    );
    this.titleUniforms.uViewport.value.set(width, height);
    this.inkColor.copy(WHITE).lerp(BLACK, cream);
    this.titleUniforms.uColor.value.copy(this.inkColor).convertLinearToSRGB();
    this.titleUniforms.uPeel.value = Math.min(1, Math.max(0, (peel - 0.3) / 0.7));

    if (this.bark) this.bark.visible = t < 2;
    this.barkUniforms.uShow.value = Math.min(1, Math.max(0, t));
    this.barkUniforms.uPeel.value = peel;
    this.barkUniforms.uPointer.value.copy(pointer);
  }
}
