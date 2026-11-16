import * as THREE from "three";

import type { BufSceneNode } from "./buf";

// The hand animation stores, per bone, the skinning transform (world pose x inverse bind pose).
// To curl a finger we rebuild each finger joint's local pose from those, add a rotation at the
// joint, and write the resulting skinning transforms back.

const ROOT = new THREE.Matrix4()
  .fromArray([
    1.08842, 0, -0.159194, 0, 19082e-22, 1.1, 763278e-23, 0, 0.159194, 0, 1.08842, 0, -0.00995603,
    0.524108, -0.0576238, 1,
  ])
  .transpose();
const ROOT_INV = ROOT.clone().invert();
/** How far each finger curls at full weight, in radians. */
const FINGER_ANGLES = [0.1, 0.25, 0.25, 0.3];
const X_AXIS = new THREE.Vector3(1, 0, 0);
const ONE = new THREE.Vector3(1, 1, 1);

interface Joint {
  boneId: number;
  finger: number;
  parent: Joint | null;
  hasChildren: boolean;
  /** For a finger's first joint: the palm bone it hangs off, and its offset from that bone. */
  anchorBone: number;
  anchorMatrix: THREE.Matrix4;
  bindWorld: THREE.Matrix4;
  bindWorldInverse: THREE.Matrix4;
  world: THREE.Matrix4;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export class HandRig {
  private joints: Joint[] = [];
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private m0 = new THREE.Matrix4();
  private m1 = new THREE.Matrix4();

  constructor(sceneData: BufSceneNode[]) {
    const byIndex = new Map<number, Joint>();
    let finger = -1;
    sceneData.forEach((node, index) => {
      // The first node only carries the animation samples.
      if (index === 0) return;
      const parent = node.parentIndex >= 0 ? (byIndex.get(node.parentIndex) ?? null) : null;
      if (!parent) finger++;
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(node.position),
        new THREE.Quaternion().fromArray(node.quaternion),
        new THREE.Vector3().fromArray(node.scale),
      );
      const bindWorld = parent ? parent.bindWorld.clone().multiply(local) : local;
      const joint: Joint = {
        boneId: parseInt(node.name, 10),
        finger: parent ? parent.finger : finger,
        parent,
        hasChildren: false,
        anchorBone: node.data?.parentIdx?.value ?? 0,
        anchorMatrix: new THREE.Matrix4().fromArray(node.data?.parentMatrix?.value ?? []),
        bindWorld,
        bindWorldInverse: bindWorld.clone().invert(),
        world: new THREE.Matrix4(),
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
      };
      if (parent) parent.hasChildren = true;
      byIndex.set(index, joint);
      this.joints.push(joint);
    });
  }

  /** World matrix of the palm bone a finger is attached to. */
  private anchorWorld(joint: Joint, positions: Float32Array, orients: Float32Array) {
    this.v.fromArray(positions, joint.anchorBone * 4);
    this.q.fromArray(orients, joint.anchorBone * 4);
    return this.m1.compose(this.v, this.q, ONE).premultiply(ROOT_INV).multiply(joint.anchorMatrix);
  }

  /**
   * Curl the fingers in place.
   * @param positions per-bone skin positions (xyzw), updated in place
   * @param orients per-bone skin orientations (xyzw), updated in place
   * @param weights curl amount per finger, 0..1
   */
  apply(positions: Float32Array, orients: Float32Array, weights: number[]) {
    // Pass 1: recover every joint's local pose from the baked skinning transforms.
    for (const joint of this.joints) {
      this.v.fromArray(positions, joint.boneId * 4);
      this.q.fromArray(orients, joint.boneId * 4);
      joint.world.compose(this.v, this.q, ONE).premultiply(ROOT_INV).multiply(joint.bindWorld);
      if (joint.parent) this.m1.copy(joint.parent.world).invert();
      else this.anchorWorld(joint, positions, orients).invert();
      this.m0
        .multiplyMatrices(this.m1, joint.world)
        .decompose(joint.position, joint.quaternion, this.s);
    }
    // Pass 2: add the curl and rebuild world poses down each chain.
    for (const joint of this.joints) {
      const weight = weights[joint.finger] ?? 0;
      if (joint.hasChildren && weight) {
        this.q.setFromAxisAngle(X_AXIS, weight * (FINGER_ANGLES[joint.finger] ?? 0));
        joint.quaternion.premultiply(this.q);
      }
      this.m0.compose(joint.position, joint.quaternion, ONE);
      if (joint.parent) joint.world.multiplyMatrices(joint.parent.world, this.m0);
      else joint.world.multiplyMatrices(this.anchorWorld(joint, positions, orients), this.m0);
      this.m0
        .copy(joint.world)
        .multiply(joint.bindWorldInverse)
        .premultiply(ROOT)
        .decompose(this.v, this.q, this.s);
      this.v.toArray(positions, joint.boneId * 4);
      this.q.toArray(orients, joint.boneId * 4);
    }
  }
}
