// Game — the top-level orchestrator. Owns the engine, the systems, and the
// fixed-step loop, and drives the high-level flow:
//
//   Title -> Menu <-> Garage / Ladder -> VS intro -> Battle -> Result -> Menu
//
// Menus render over a live 3D "showcase" scene; the Garage showcase swaps
// between the full assembled bey and a spotlight on the selected part.

import * as THREE from 'three';
import { Renderer } from '../engine/Renderer';
import { Physics } from '../engine/Physics';
import { Input } from '../engine/Input';
import { Audio } from '../audio/Audio';
import { Particles } from '../visuals/Particles';
import { Progression } from '../systems/Progression';
import { Stadium } from '../systems/Stadium';
import { BattleManager } from '../systems/BattleManager';
import { LaunchController } from './LaunchController';
import { UI, type HudState, type UICallbacks } from '../ui/UI';
import { buildBey, TYPE_COLOR } from '../visuals/BeyMesh';
import { PartViewer } from '../visuals/PartViewer';
import { getDisc, getDriver, getLayer, getPart } from '../data/parts';
import { getStadium, STADIUMS } from '../data/stadiums';
import { LADDER } from '../data/ladder';
import { BALANCE, SPECIALS } from '../data/balance';
import { lerp } from '../core/util';
import type { BattleResult, BeyConfig, Part } from '../core/types';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
const INTRO_DURATION = 2.2;

type Mode = 'menu' | 'battle';

interface Preview {
  root: THREE.Object3D;
  spinNode: THREE.Object3D;
  accent: THREE.MeshStandardMaterial | null;
  dispose(): void;
}

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly audio = new Audio();
  private readonly progression = new Progression();
  private readonly ui: UI;

  private physics!: Physics;
  private particles!: Particles;
  private launch!: LaunchController;
  private partViewer!: PartViewer;

  private mode: Mode = 'menu';
  private battle: BattleManager | null = null;
  private opponentIndex = 0;
  private introActive = false;
  private introTimer = 0;
  private inGarage = false;

  private menuStadium: Stadium | null = null;
  private preview: Preview | null = null;
  private previewSpin = 0;

  private garageDraft: BeyConfig;

  private last = 0;
  private accumulator = 0;
  private clock = 0;
  private muted = false;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    const uiRoot = document.getElementById('ui-root') as HTMLElement;
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.ui = new UI(uiRoot);
    this.garageDraft = this.progression.equipped;
    window.addEventListener('resize', () => this.renderer.resize());
  }

  async init(): Promise<void> {
    await Physics.ready();
    this.physics = new Physics(BALANCE.gravity);
    this.particles = new Particles();
    this.renderer.scene.add(this.particles.points);
    this.launch = new LaunchController(this.renderer.scene);
    this.partViewer = new PartViewer();

    this.wireUI();
    this.ui.getPartStageMount().appendChild(this.partViewer.canvas);
    this.wireInput();

    this.enterMenuScene(this.progression.equipped);
    this.ui.renderTitle();
    this.ui.showScreen('title');
    this.ui.setMuted(false);
  }

  start(): void {
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // --- Main loop ---------------------------------------------------------

  private loop = (now: number): void => {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.clock += dt;

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    this.renderUpdate(dt);
    this.renderer.render(dt);
    this.ui.tickToast(dt);
    requestAnimationFrame(this.loop);
  };

  private fixedUpdate(dt: number): void {
    if (this.mode === 'battle' && this.battle && !this.introActive) {
      this.battle.fixedUpdate(dt);
    }
  }

  private renderUpdate(dt: number): void {
    if (this.mode === 'menu') {
      this.renderer.setAzimuth(Math.sin(this.clock * 0.16) * 0.5);
      this.menuStadium?.update(dt, this.clock);
      this.spinPreview(dt);
      if (this.inGarage) this.partViewer.render(dt);
    } else if (this.battle) {
      if (this.introActive) {
        this.introTimer -= dt;
        this.renderer.setAzimuth(lerp(-0.7, 0, 1 - this.introTimer / INTRO_DURATION));
        this.battle.renderSync(dt, this.clock);
        if (this.introTimer <= 0) {
          this.introActive = false;
          this.ui.hideIntro();
          this.renderer.setAzimuth(0);
          this.beginLaunch();
        }
      } else {
        this.battle.renderSync(dt, this.clock);
        this.launch.update(dt);
        this.ui.updateHud(this.hudState());
        if (this.launch.active) this.ui.updateLaunch(this.launch.power, this.launch.charging);
      }
    }
  }

  private spinPreview(dt: number): void {
    if (!this.preview) return;
    this.previewSpin += dt * 2.2;
    this.preview.spinNode.rotation.y = this.previewSpin;
    if (this.preview.accent) {
      this.preview.accent.emissiveIntensity = 1.3 + Math.sin(this.clock * 3) * 0.45;
    }
  }

  // --- Wiring ------------------------------------------------------------

  private wireUI(): void {
    const cb: UICallbacks = {
      onStart: () => {
        this.audio.unlock();
        this.audio.click();
        this.goMenu();
      },
      onBattle: () => {
        this.audio.click();
        this.goLadder();
      },
      onGarage: () => {
        this.audio.click();
        this.goGarage();
      },
      onBack: () => {
        this.audio.click();
        this.goMenu();
      },
      onSelectOpponent: (i) => {
        this.audio.click();
        this.startBattle(i);
      },
      onPickPart: (id) => {
        this.audio.click();
        this.applyPartToDraft(id);
        this.ui.renderGarage(this.progression, this.garageDraft);
        const part = getPart(id);
        if (part) {
          this.partViewer.showPart(part);
          this.ui.setPartStageLabel(this.partLabel(part));
        }
      },
      onBuyPart: (id) => {
        const part = getPart(id);
        if (!part) return;
        if (this.progression.buyPart(id)) {
          this.audio.special();
          this.ui.toast(`${part.name} unlocked!`);
          this.applyPartToDraft(id);
          this.partViewer.showPart(part);
          this.ui.setPartStageLabel(this.partLabel(part));
        } else {
          this.ui.toast('Not enough coins');
        }
        this.ui.renderGarage(this.progression, this.garageDraft);
      },
      onViewFullBey: () => {
        this.audio.click();
        this.partViewer.showBey(this.garageDraft);
        this.ui.setPartStageLabel('FULL BEY');
      },
      onEquipDone: () => {
        this.audio.click();
        this.progression.setEquipped(this.garageDraft);
        this.goMenu();
      },
      onSpecial: () => {
        if (this.battle?.triggerPlayerSpecial()) {
          const type = this.battle.player.stats.type;
          this.ui.specialBanner(SPECIALS[type].name.toUpperCase(), TYPE_COLOR[type]);
        }
      },
      onContinue: () => {
        this.audio.click();
        this.continueFromResult();
      },
      onRematch: () => {
        this.audio.click();
        if (this.battle) {
          this.battle.dispose();
          this.battle = null;
        }
        this.startBattle(this.opponentIndex);
      },
      onToggleMute: () => {
        this.muted = !this.muted;
        this.audio.setMuted(this.muted);
        this.ui.setMuted(this.muted);
      },
      onResetSave: () => {
        this.progression.reset();
        this.garageDraft = this.progression.equipped;
        this.ui.toast('Progress reset');
        this.goMenu();
      },
    };
    this.ui.init(cb);
  }

  private wireInput(): void {
    const isBattlePhase = (): boolean => this.battle?.phase === 'battle';

    this.input.onDown = () => {
      this.audio.unlock();
      if (isBattlePhase()) {
        this.updateSteer();
      } else {
        this.launch.pointerDown();
      }
    };
    this.input.onMove = () => {
      if (isBattlePhase() && this.input.isDown) {
        this.updateSteer();
      } else {
        this.launch.pointerMove(this.input.dragX);
      }
    };
    this.input.onUp = (release) => {
      if (isBattlePhase()) {
        this.battle?.setPlayerSteer(0, 0);
      } else {
        this.launch.pointerUp(release);
      }
    };
    this.input.onSpaceChange = (down) => this.launch.spaceChange(down);

    this.launch.onLaunch = (params) => {
      this.battle?.launchPlayer(params);
      this.launch.end();
      this.ui.setLaunchVisible(false);
    };
  }

  /** Map the current drag vector to a clamped steer for the player's bey. */
  private updateSteer(): void {
    if (!this.battle) return;
    const dx = this.input.dragX;
    const dy = this.input.dragY;
    const len = Math.hypot(dx, dy);
    if (len < 12) {
      this.battle.setPlayerSteer(0, 0);
      return;
    }
    const MAX = 160;
    const m = Math.min(len / MAX, 1);
    const nx = (dx / len) * m;
    const nz = (dy / len) * m;
    this.battle.setPlayerSteer(nx, nz);
  }

  // --- Menu showcase scene ----------------------------------------------

  private enterMenuScene(cfg: BeyConfig): void {
    if (!this.menuStadium) {
      this.menuStadium = new Stadium(STADIUMS[0], this.renderer.scene);
      this.renderer.setAtmosphere(STADIUMS[0].palette.fog);
    }
    this.showBeyPreview(cfg);
  }

  private teardownMenuScene(): void {
    if (this.menuStadium) {
      this.menuStadium.dispose();
      this.menuStadium = null;
    }
    this.clearPreview();
  }

  private clearPreview(): void {
    if (this.preview) {
      this.renderer.scene.remove(this.preview.root);
      this.preview.dispose();
      this.preview = null;
    }
  }

  /** Showcase the full assembled bey. */
  private showBeyPreview(cfg: BeyConfig): void {
    this.clearPreview();
    const v = buildBey(getLayer(cfg.layer), getDisc(cfg.disc), getDriver(cfg.driver));
    v.root.position.set(0, 3.0, 0);
    v.root.scale.setScalar(2.7);
    this.renderer.scene.add(v.root);
    this.preview = { root: v.root, spinNode: v.spinner, accent: v.accent, dispose: () => v.dispose() };
  }

  // --- Screen transitions ------------------------------------------------

  private goMenu(): void {
    this.mode = 'menu';
    this.inGarage = false;
    this.ui.setPartStageVisible(false);
    this.enterMenuScene(this.progression.equipped);
    this.ui.renderMenu(this.progression);
    this.ui.showScreen('menu');
    this.ui.setHudVisible(false);
    this.ui.setLaunchVisible(false);
  }

  private goGarage(): void {
    this.mode = 'menu';
    this.garageDraft = this.progression.equipped;
    this.enterMenuScene(this.garageDraft);
    this.ui.renderGarage(this.progression, this.garageDraft);
    this.ui.showScreen('garage');
    this.inGarage = true;
    this.partViewer.showBey(this.garageDraft);
    this.ui.setPartStageLabel('FULL BEY');
    this.ui.setPartStageVisible(true);
  }

  private goLadder(): void {
    this.mode = 'menu';
    this.inGarage = false;
    this.ui.setPartStageVisible(false);
    this.enterMenuScene(this.progression.equipped);
    this.ui.renderLadder(this.progression);
    this.ui.showScreen('ladder');
  }

  private partLabel(part: Part): string {
    const kind =
      part.kind === 'layer' ? 'ENERGY LAYER' : part.kind === 'disc' ? 'FORGE DISC' : 'DRIVER';
    return `${kind} · ${part.name}`;
  }

  private applyPartToDraft(id: string): void {
    const part = getPart(id);
    if (!part || !this.progression.isUnlocked(id)) return;
    if (part.kind === 'layer') this.garageDraft = { ...this.garageDraft, layer: id };
    else if (part.kind === 'disc') this.garageDraft = { ...this.garageDraft, disc: id };
    else this.garageDraft = { ...this.garageDraft, driver: id };
  }

  // --- Battle flow -------------------------------------------------------

  private startBattle(index: number): void {
    const opponent = LADDER[index];
    if (!opponent) return;
    this.opponentIndex = index;
    this.inGarage = false;
    this.ui.setPartStageVisible(false);
    this.teardownMenuScene();

    this.battle = new BattleManager({
      playerConfig: this.progression.equipped,
      opponent,
      enemyConfig: opponent.bey,
      stadium: getStadium(opponent.stadium),
      physics: this.physics,
      scene: this.renderer.scene,
      renderer: this.renderer,
      particles: this.particles,
      audio: this.audio,
    });
    this.battle.onResolved = (result) => this.onBattleResolved(result);
    this.battle.onCallout = (text, kind) => this.ui.callout(text, kind);
    this.mode = 'battle';

    this.ui.showScreen('none');
    this.ui.setHudNames(this.hudState());
    this.ui.updateHud(this.hudState());
    this.ui.setHudVisible(true);
    this.ui.setLaunchVisible(false);

    // VS intro plays first; the launch mini-game begins when it finishes.
    this.introActive = true;
    this.introTimer = INTRO_DURATION;
    this.ui.playIntro({
      playerName: 'Your Bey',
      playerType: this.battle.player.stats.type,
      enemyName: opponent.name,
      enemyType: this.battle.enemy.stats.type,
      stadiumName: getStadium(opponent.stadium).name,
    });
  }

  private beginLaunch(): void {
    if (!this.battle) return;
    const p = this.battle.player.body.translation();
    const e = this.battle.enemy.body.translation();
    const aim = Math.atan2(e.z - p.z, e.x - p.x);
    this.launch.begin(p.x, p.z, aim);
    this.ui.updateLaunch(0, false);
    this.ui.setLaunchVisible(true);
  }

  private onBattleResolved(result: BattleResult): void {
    if (!this.battle) return;
    const opponent = LADDER[this.opponentIndex];
    const reward = result.playerWon
      ? this.progression.recordWin(opponent, this.opponentIndex)
      : (this.progression.recordLoss(), null);
    this.garageDraft = this.progression.equipped;
    this.ui.renderResult(result, opponent.name, reward);
    this.ui.showScreen('result');
    this.ui.setHudVisible(false);
    this.ui.setLaunchVisible(false);
  }

  private continueFromResult(): void {
    if (this.battle) {
      this.battle.dispose();
      this.battle = null;
    }
    this.goMenu();
  }

  private hudState(): HudState {
    const b = this.battle!;
    return {
      playerName: 'You',
      playerType: b.player.stats.type,
      enemyName: b.enemy.label,
      enemyType: b.enemy.stats.type,
      playerStamina: b.player.stamina,
      enemyStamina: b.enemy.stamina,
      playerBurst: b.player.burstMeter,
      enemyBurst: b.enemy.burstMeter,
      playerSpecial: b.player.specialMeter,
      enemySpecial: b.enemy.specialMeter,
      specialReady: b.player.specialReady,
      specialName: SPECIALS[b.player.stats.type].name,
      timer: b.timeRemaining,
    };
  }
}
