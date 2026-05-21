// Stadium system — pairs a StadiumConfig (the rules) with its procedural mesh
// (the look). The config is consumed by Bey and Combat; this class just owns
// the visual lifecycle.

import type * as THREE from 'three';
import type { StadiumConfig } from '../core/types';
import { buildStadium, type StadiumVisual } from '../visuals/StadiumMesh';

export class Stadium {
  readonly visual: StadiumVisual;

  constructor(
    readonly config: StadiumConfig,
    private readonly scene: THREE.Scene,
  ) {
    this.visual = buildStadium(config);
    scene.add(this.visual.group);
  }

  update(dt: number, time: number): void {
    this.visual.update(dt, time);
  }

  dispose(): void {
    this.scene.remove(this.visual.group);
    this.visual.dispose();
  }
}
