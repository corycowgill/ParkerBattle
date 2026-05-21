// Game — the top-level orchestrator. Owns the engine, the systems, and the
// fixed-step loop, and drives the high-level flow:
//
//   Title -> Menu <-> Garage / Ladder -> Battle -> Result -> Menu
//
// Menus render over a live 3D "showcase" scene (smooth bowl + the player's
// equipped bey turning slowly). A battle swaps that out for a BattleManager.

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
import { buildBey, type BeyVisual } from '../visuals/BeyMesh';
import { getDisc, getDriver, getLayer, getPart } from '../data/parts';
import { getStadium, STADIUMS } from '../data/stadiums';
import { LADDER } from '../data/ladder';
import { BALANCE, SPECIALS } from '../data/balance';
import { bowlSurfaceY } from '../core/arena';
import type { BattleResult, BeyConfig } from '../core/types';

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

type Mode = 'menu' | 'battle';

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly audio = new Audio();
  private readonly progression = new Progression();
  private readonly ui: UI;

  private physics!: Physics;
  private particles!: Particles;
  private launch!: LaunchController;

  private mode: Mode = 'menu';
  private battle: BattleManager | null = null;
  private opponentIndex = 0;

  private menuStadium: Stadium | null = null;
  private previewBey: BeyVisual | null = null;
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

    this.wireUI();
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
    if (this.mode === 'battle' && this.battle) this.battle.fixedUpdate(dt);
  }

  private renderUpdate(dt: number): void {
    if (this.mode === 'menu') {
      this.menuStadium?.update(dt, this.clock);
      if (this.previewBey) {
        this.previewSpin += dt * 2.4;
        this.previewBey.spinner.rotation.y = this.previewSpin;
        this.previewBey.accent.emissiveIntensity = 1.1 + Math.sin(this.clock * 3) * 0.35;
      }
    } else if (this.battle) {
      this.battle.renderSync(dt, this.clock);
      this.launch.update(dt);
      this.ui.updateHud(this.hudState());
      if (this.launch.active) this.ui.updateLaunch(this.launch.power, this.launch.charging);
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
        this.setPreviewBey(this.garageDraft);
      },
      onBuyPart: (id) => {
        const part = getPart(id);
        if (!part) return;
        if (this.progression.buyPart(id)) {
          this.audio.special();
          this.ui.toast(`${part.name} unlocked!`);
          this.applyPartToDraft(id);
        } else {
          this.ui.toast('Not enough coins');
        }
        this.ui.renderGarage(this.progression, this.garageDraft);
        this.setPreviewBey(this.garageDraft);
      },
      onEquipDone: () => {
        this.audio.click();
        this.progression.setEquipped(this.garageDraft);
        this.goMenu();
      },
      onSpecial: () => {
        if (this.battle?.triggerPlayerSpecial()) this.ui.toast('SPECIAL!');
      },
      onContinue: () => {
        this.audio.click();
        this.continueFromResult();
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
    this.input.onDown = () => {
      this.audio.unlock();
      this.launch.pointerDown();
    };
    this.input.onMove = () => this.launch.pointerMove(this.input.dragX);
    this.input.onUp = (release) => this.launch.pointerUp(release);
    this.input.onSpaceChange = (down) => this.launch.spaceChange(down);

    this.launch.onLaunch = (params) => {
      this.battle?.launchPlayer(params);
      this.launch.end();
      this.ui.setLaunchVisible(false);
    };
  }

  // --- Menu scene --------------------------------------------------------

  private enterMenuScene(cfg: BeyConfig): void {
    if (!this.menuStadium) {
      this.menuStadium = new Stadium(STADIUMS[0], this.renderer.scene);
      this.renderer.setAtmosphere(STADIUMS[0].palette.fog);
    }
    this.setPreviewBey(cfg);
  }

  private teardownMenuScene(): void {
    if (this.menuStadium) {
      this.menuStadium.dispose();
      this.menuStadium = null;
    }
    if (this.previewBey) {
      this.previewBey.root.removeFromParent();
      this.previewBey.dispose();
      this.previewBey = null;
    }
  }

  private setPreviewBey(cfg: BeyConfig): void {
    if (this.previewBey) {
      this.previewBey.root.removeFromParent();
      this.previewBey.dispose();
    }
    this.previewBey = buildBey(getLayer(cfg.layer), getDisc(cfg.disc), getDriver(cfg.driver));
    this.previewBey.root.position.set(0, bowlSurfaceY(0) + 3.0, 0);
    this.previewBey.root.scale.setScalar(2.7);
    this.renderer.scene.add(this.previewBey.root);
  }

  // --- Screen transitions ------------------------------------------------

  private goMenu(): void {
    this.mode = 'menu';
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
  }

  private goLadder(): void {
    this.mode = 'menu';
    this.enterMenuScene(this.progression.equipped);
    this.ui.renderLadder(this.progression);
    this.ui.showScreen('ladder');
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
    this.mode = 'battle';

    this.ui.showScreen('none');
    this.ui.setHudNames(this.hudState());
    this.ui.updateHud(this.hudState());
    this.ui.setHudVisible(true);

    // Hand control to the launch mini-game.
    const p = this.battle.player.body.translation();
    const e = this.battle.enemy.body.translation();
    const aim = Math.atan2(e.z - p.z, e.x - p.x);
    this.launch.begin(p.x, p.z, aim);
    this.ui.updateLaunch(0, false);
    this.ui.setLaunchVisible(true);
    this.ui.toast(`${opponent.name} — ${getStadium(opponent.stadium).name}`);
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
