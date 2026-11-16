import * as THREE from "three";

import { propFragment, propVertex } from "./shaders";

export const PLANE_WIDTH = 3296;
export const PLANE_HEIGHT = 1460;

interface PropConfig {
  /** Centre in the 3296x1460 desk image (y down). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise. */
  angle: number;
  /** Where the prop flies in from on load (desk units, y up) and its starting spin. */
  startX: number;
  startY: number;
  startRot: number;
  /** How quickly it comes to rest; heavier objects use higher values. */
  damping: number;
  rotationForce: number;
}

const PROPS: Record<string, PropConfig> = {
  pencil: {
    x: 500,
    y: 1106,
    width: 128,
    height: 1320,
    angle: 52,
    startX: -600,
    startY: -780,
    startRot: 0.3,
    damping: 11,
    rotationForce: 0.12,
  },
  eraser: {
    x: 924.24,
    y: 1186.49,
    width: 180,
    height: 280,
    angle: 30.68,
    startX: -300,
    startY: -400,
    startRot: 3,
    damping: 15,
    rotationForce: 0.01,
  },
  cutter: {
    x: 2574.44,
    y: 1200.85,
    width: 192,
    height: 1024,
    angle: -55.61,
    startX: 300,
    startY: -550,
    startRot: 1,
    damping: 15,
    rotationForce: 0.1,
  },
  pen: {
    x: 2040.69,
    y: 220.92,
    width: 136,
    height: 960,
    angle: -35,
    startX: 300,
    startY: 550,
    startRot: -2,
    damping: 8,
    rotationForce: 0.1,
  },
  paperclip1: {
    x: 677.11,
    y: 458.27,
    width: 100,
    height: 234,
    angle: -40.78,
    startX: 300,
    startY: 750,
    startRot: -5,
    damping: 15,
    rotationForce: 2,
  },
  paperclip2: {
    x: 350,
    y: 646.79,
    width: 100,
    height: 234,
    angle: 47.75,
    startX: -300,
    startY: -200,
    startRot: 4,
    damping: 15,
    rotationForce: 2,
  },
  paperclip3: {
    x: 450,
    y: 396,
    width: 100,
    height: 234,
    angle: 111.54,
    startX: -400,
    startY: 400,
    startRot: 4,
    damping: 15,
    rotationForce: 2,
  },
};

const ORIGIN = new THREE.Vector2();
const MAX_DISPLACEMENT = 100;
const MAX_ROTATION = 0.1 * Math.PI;
const INTRO_SECONDS = 1.8;
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

class DeskProp {
  readonly mesh: THREE.Mesh;
  readonly shadowMesh: THREE.Mesh;
  private uniforms;
  private shadowUniforms;
  private home = new THREE.Vector2();
  private homeRotation: number;
  private offset = new THREE.Vector2();
  private velocity = new THREE.Vector2();
  private rotation = 0;
  private angularVelocity = 0;
  private local = new THREE.Vector2();

  constructor(
    private config: PropConfig,
    color: THREE.Texture,
    alpha: THREE.Texture,
  ) {
    this.home.set(config.x - PLANE_WIDTH / 2, -(config.y - PLANE_HEIGHT / 2));
    this.homeRotation = (-config.angle * Math.PI) / 180;
    this.uniforms = {
      uColor: { value: color },
      uAlpha: { value: alpha },
      uOpacity: { value: 1 },
      uShadow: { value: 0 },
      uVariant: { value: 0 },
    };
    this.shadowUniforms = { ...this.uniforms, uOpacity: { value: 1 }, uShadow: { value: 1 } };
    const geometry = new THREE.PlaneGeometry(config.width, config.height);
    const material = (uniforms: typeof this.uniforms) =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: propVertex,
        fragmentShader: propFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
    this.shadowMesh = new THREE.Mesh(geometry, material(this.shadowUniforms));
    this.shadowMesh.renderOrder = 2;
    this.mesh = new THREE.Mesh(geometry, material(this.uniforms));
    this.mesh.renderOrder = 3;
  }

  /**
   * @param mouse pointer position in desk space (y up, centred)
   * @param mouseVelocity pointer velocity in desk units per second
   * @param intro 0..1 progress of the fly-in
   */
  update(
    dt: number,
    mouse: THREE.Vector2,
    mouseVelocity: THREE.Vector2,
    intro: number,
    opacity: number,
  ) {
    const { config } = this;
    const x = this.home.x + this.offset.x;
    const y = this.home.y + this.offset.y;
    const angle = this.homeRotation + this.rotation;

    // Pointer position in the prop's own frame: is it brushing past this object?
    this.local.set(mouse.x - x, mouse.y - y).rotateAround(ORIGIN, -angle);
    const reach = Math.max(config.width, 90) * 0.6;
    const inside =
      Math.abs(this.local.x) < reach && Math.abs(this.local.y) < config.height / 2 + reach * 0.3;
    if (inside && intro >= 1) {
      const push = 1 - Math.abs(this.local.x) / reach;
      this.velocity.addScaledVector(mouseVelocity, push * 20 * dt);
      // Hitting it off-centre spins it: torque = lever arm x force.
      const leverX = mouse.x - x;
      const leverY = mouse.y - y;
      const torque = leverX * mouseVelocity.y - leverY * mouseVelocity.x;
      this.angularVelocity += torque * config.rotationForce * 0.0006 * push * dt;
    }

    // Damped spring back to rest.
    this.velocity.addScaledVector(this.offset, -14 * dt);
    this.velocity.multiplyScalar(Math.exp(-config.damping * 0.35 * dt));
    this.offset.addScaledVector(this.velocity, dt);
    if (this.offset.length() > MAX_DISPLACEMENT) this.offset.setLength(MAX_DISPLACEMENT);
    this.angularVelocity += -this.rotation * 18 * dt;
    this.angularVelocity *= Math.exp(-config.damping * 0.3 * dt);
    this.rotation = THREE.MathUtils.clamp(
      this.rotation + this.angularVelocity * dt,
      -MAX_ROTATION,
      MAX_ROTATION,
    );

    const fly = 1 - expoOut(intro);
    const px = this.home.x + this.offset.x + config.startX * fly;
    const py = this.home.y + this.offset.y + config.startY * fly;
    const rot = this.homeRotation + this.rotation + config.startRot * fly;
    this.mesh.position.set(px, py, 0);
    this.mesh.rotation.z = rot;
    // The shadow lags further behind the more the prop is lifted mid-flight.
    const lift = 16 + 60 * fly;
    this.shadowMesh.position.set(px - lift * 0.85, py - lift, 0);
    this.shadowMesh.rotation.z = rot;
    this.uniforms.uOpacity.value = opacity;
    this.shadowUniforms.uOpacity.value = opacity * (1 - fly * 0.6);
    this.uniforms.uVariant.value = Math.min(2, Math.abs(this.rotation) * 8);
  }
}

/** Pencil, cutter, pen, eraser and paperclips lying on the desk; they scatter when the pointer brushes them. */
export class DeskProps {
  readonly group = new THREE.Group();
  private props: DeskProp[] = [];
  private introTime = -1;
  private mouse = new THREE.Vector2(1e5, 1e5);
  private previous = new THREE.Vector2(1e5, 1e5);
  private mouseVelocity = new THREE.Vector2();

  constructor(loadTexture: (path: string) => THREE.Texture) {
    for (const [id, config] of Object.entries(PROPS)) {
      const prop = new DeskProp(
        config,
        loadTexture(`hero/${id}_color.webp`),
        loadTexture(`hero/${id}_alpha.webp`),
      );
      this.props.push(prop);
      this.group.add(prop.shadowMesh, prop.mesh);
    }
  }

  startIntro() {
    this.introTime = 0;
  }

  /** @param pointer pointer position in desk space, or null when it is outside the stage */
  update(dt: number, pointer: THREE.Vector2 | null, opacity: number) {
    if (this.introTime >= 0) this.introTime += dt;
    const intro = this.introTime < 0 ? 0 : Math.min(1, this.introTime / INTRO_SECONDS);
    if (pointer) {
      this.mouse.copy(pointer);
      if (this.previous.x > 9e4) this.previous.copy(pointer);
      this.mouseVelocity
        .copy(this.mouse)
        .sub(this.previous)
        .divideScalar(Math.max(dt, 1e-3))
        .clampLength(0, 4000);
      this.previous.copy(pointer);
    } else {
      this.mouseVelocity.set(0, 0);
      this.previous.set(1e5, 1e5);
    }
    for (const prop of this.props) prop.update(dt, this.mouse, this.mouseVelocity, intro, opacity);
  }
}
