// Three.js rendering: scene, camera, lights, environment, and camera shake.
//
// Mobile-perf choices: no real-time shadows, pixel-ratio capped at 2, a single
// prefiltered environment map for all PBR reflections, ACES tone mapping.

import * as THREE from 'three';
import { BALANCE } from '../data/balance';
import { damp } from '../core/util';
import { makeEnvironmentTexture } from '../visuals/textures';

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly target = new THREE.Vector3(0, 0.5, 0.6);
  private readonly baseCamPos = new THREE.Vector3();
  private readonly elevation = THREE.MathUtils.degToRad(53);
  private readonly frameRadius = BALANCE.ringOutRadius + 3.2;
  private readonly shakeOffset = new THREE.Vector3();
  private shake = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 240);

    // One prefiltered environment map drives every metallic/glossy surface.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envSrc = makeEnvironmentTexture();
    this.scene.environment = pmrem.fromEquirectangular(envSrc).texture;
    envSrc.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xc4d2ff, 0x1a1c2c, 0.65);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(9, 17, 7);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x6f82ff, 0.55);
    rim.position.set(-11, 7, -9);
    this.scene.add(rim);

    this.resize();
  }

  /** Tint the background + fog to match the current stadium. */
  setAtmosphere(fogColor: number): void {
    this.scene.background = new THREE.Color(fogColor);
    this.scene.fog = new THREE.Fog(fogColor, 34, 86);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.reframe();
  }

  /** Position the camera so the whole arena fits whatever the aspect ratio. */
  private reframe(): void {
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const fov = Math.min(vFov, hFov);
    const dist = (this.frameRadius / Math.sin(fov / 2)) * 1.02;
    this.baseCamPos
      .set(0, Math.sin(this.elevation) * dist, Math.cos(this.elevation) * dist)
      .add(this.target);
  }

  /** Add an impulse of camera shake (clamped). */
  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, BALANCE.cameraShakeMaxHit);
  }

  render(dt: number): void {
    this.shake = damp(this.shake, 0, BALANCE.cameraShakeDecay, dt);
    if (this.shake > 0.001) {
      this.shakeOffset.set(
        (Math.random() * 2 - 1) * this.shake,
        (Math.random() * 2 - 1) * this.shake,
        (Math.random() * 2 - 1) * this.shake * 0.5,
      );
    } else {
      this.shakeOffset.set(0, 0, 0);
    }
    this.camera.position.copy(this.baseCamPos).add(this.shakeOffset);
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
