import * as THREE from "three";

import { floatAttribute, type BufData } from "./buf";

/** Baked per-frame transform track (position / orientation / optional lens), sampled with interpolation. */
export class FrameAnimation {
  private positions: Float32Array;
  private orients: Float32Array;
  private focals?: Float32Array;
  frameCount: number;
  private v = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(data: BufData) {
    this.positions = floatAttribute(data, "position");
    this.orients = floatAttribute(data, "orient");
    const focal = data.attributes["focal"];
    if (focal) this.focals = Float32Array.from(focal.array);
    this.frameCount = this.positions.length / 3;
  }

  /** Apply the pose at a (fractional) frame. Returns the lens focal length there, if the track has one. */
  apply(target: THREE.Object3D, frame: number): number | undefined {
    if (!this.frameCount) return undefined;
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
    if (!this.focals) return undefined;
    const a = this.focals[i] ?? 50;
    return a + ((this.focals[j] ?? a) - a) * t;
  }
}

/** Vertical field of view (degrees) for a focal length on the scene's 41.4214mm 2:1 film gate. */
export const fovFromFocal = (focal: number) =>
  (2 * Math.atan((1024 * 41.4214) / 2048 / 2 / focal) * 180) / Math.PI;

export function toGeometry(data: BufData) {
  const geometry = new THREE.BufferGeometry();
  for (const [id, attr] of Object.entries(data.attributes)) {
    if (id === "indices") geometry.setIndex(new THREE.BufferAttribute(attr.array, 1));
    else geometry.setAttribute(id, new THREE.BufferAttribute(attr.array, attr.itemSize));
  }
  return geometry;
}
