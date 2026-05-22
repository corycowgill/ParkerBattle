// Three.js rendering: scene, camera, lights, environment, bloom, and the
// "feel" layer — camera shake plus a zoom-punch on big impacts.
//
// Mobile-perf choices: no real-time shadows, pixel-ratio capped at 2, a single
// prefiltered environment map, a modest UnrealBloom pass for the energy glow.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BALANCE } from '../data/balance';
import { clamp, damp, lerp } from '../core/util';
import { makeEnvironmentTexture } from '../visuals/textures';

export class Renderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  private readonly target = new THREE.Vector3(0, 0.5, 0.6);
  private readonly baseCamPos = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly closeCamPos = new THREE.Vector3();
  private readonly elevation = THREE.MathUtils.degToRad(53);
  private readonly frameRadius = BALANCE.ringOutRadius + 3.2;

  private azimuth = 0;
  private shake = 0;
  private zoom = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 240);

    // One prefiltered environment map drives every metallic/glossy surface.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envSrc = makeEnvironmentTexture();
    this.scene.environment = pmrem.fromEquirectangular(envSrc).texture;
    envSrc.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xccd6ff, 0x141426, 0.7);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(9, 17, 7);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x6f82ff, 0.8);
    rim.position.set(-11, 7, -9);
    this.scene.add(rim);

    const warm = new THREE.DirectionalLight(0xff7a4a, 0.45);
    warm.position.set(6, 4, -12);
    this.scene.add(warm);

    // Post-processing: scene -> bloom -> tone-mapped output.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(pr);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.92, 0.62, 0.6);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  /** Tint the background + fog to match the current stadium. */
  setAtmosphere(fogColor: number): void {
    this.scene.background = new THREE.Color(fogColor);
    this.scene.fog = new THREE.Fog(fogColor, 34, 90);
  }

  /** Orbit the camera around the arena (used in menus + the VS intro). */
  setAzimuth(angle: number): void {
    this.azimuth = angle;
    this.reframe();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
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
    const cosE = Math.cos(this.elevation);
    this.baseCamPos
      .set(Math.sin(this.azimuth) * cosE, Math.sin(this.elevation), Math.cos(this.azimuth) * cosE)
      .multiplyScalar(dist)
      .add(this.target);
    // A point 38% closer to the target — the zoom-punch destination.
    this.closeCamPos.copy(this.baseCamPos).lerp(this.target, 0.38);
  }

  /** Add an impulse of camera shake (clamped). */
  addShake(amount: number): void {
    this.shake = Math.min(this.shake + amount, BALANCE.cameraShakeMaxHit);
  }

  /** Snap the camera inward briefly for impact emphasis. */
  punch(amount: number): void {
    this.zoom = Math.min(this.zoom + amount, 1);
  }

  render(dt: number): void {
    this.shake = damp(this.shake, 0, BALANCE.cameraShakeDecay, dt);
    this.zoom = damp(this.zoom, 0, 6.5, dt);

    this.camPos.copy(this.baseCamPos).lerp(this.closeCamPos, clamp(this.zoom, 0, 1));
    if (this.shake > 0.001) {
      this.camPos.x += (Math.random() * 2 - 1) * this.shake;
      this.camPos.y += (Math.random() * 2 - 1) * this.shake;
      this.camPos.z += (Math.random() * 2 - 1) * this.shake * 0.5;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.target);

    // Bloom pulses subtly with camera energy so big hits feel brighter.
    this.bloom.strength = lerp(0.92, 1.5, clamp(this.zoom + this.shake, 0, 1));
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.renderer.dispose();
  }
}
