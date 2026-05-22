// PartViewer — a small self-contained 3D viewer for the Garage.
//
// The main game canvas sits *behind* the DOM menus, so a part rendered there
// is hidden by the garage panels. This is its own tiny WebGL renderer whose
// canvas is embedded directly inside a garage card, guaranteeing the selected
// part is actually visible — turntable-style, framed and lit on its own.

import * as THREE from 'three';
import type { BeyConfig, Part } from '../core/types';
import { buildBey, buildPartVisual } from './BeyMesh';
import { makeEnvironmentTexture } from './textures';
import { getDisc, getDriver, getLayer } from '../data/parts';

interface Model {
  object: THREE.Object3D;
  dispose(): void;
}

export class PartViewer {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly holder = new THREE.Group();
  private model: Model | null = null;
  private spin = 0;
  private lastW = 0;
  private lastH = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this.scene.add(this.holder);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const envSrc = makeEnvironmentTexture();
    this.scene.environment = pmrem.fromEquirectangular(envSrc).texture;
    envSrc.dispose();
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xcdd8ff, 0x1a1c2c, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6f82ff, 1.1);
    rim.position.set(-5, 2, -5);
    this.scene.add(rim);
  }

  private clearModel(): void {
    if (this.model) {
      this.holder.remove(this.model.object);
      this.model.dispose();
      this.model = null;
    }
  }

  /** Show a single part — its own distinct procedural design. */
  showPart(part: Part): void {
    this.clearModel();
    const pv = buildPartVisual(part);
    this.frame(pv.object);
    this.model = pv;
  }

  /** Show the full assembled bey. */
  showBey(cfg: BeyConfig): void {
    this.clearModel();
    const v = buildBey(getLayer(cfg.layer), getDisc(cfg.disc), getDriver(cfg.driver));
    this.frame(v.root);
    this.model = { object: v.root, dispose: () => v.dispose() };
  }

  /** Centre the object at the origin and frame the camera to fit it. */
  private frame(obj: THREE.Object3D): void {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const center = box.getCenter(new THREE.Vector3());
    obj.position.sub(center);
    this.holder.add(obj);

    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = (sphere.radius / Math.sin(fov / 2)) * 1.25;
    this.camera.position.set(0, sphere.radius * 0.45, dist);
    this.camera.lookAt(0, 0, 0);
    this.spin = 0;
  }

  private syncSize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === 0 || h === 0 || (w === this.lastW && h === this.lastH)) return;
    this.lastW = w;
    this.lastH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    this.syncSize();
    if (this.lastW === 0) return;
    this.spin += dt * 1.25;
    this.holder.rotation.y = this.spin;
    this.holder.rotation.x = 0.12 + Math.sin(this.spin * 0.5) * 0.06;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clearModel();
    this.renderer.dispose();
  }
}
