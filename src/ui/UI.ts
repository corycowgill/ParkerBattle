// DOM UI layer. A single overlay above the WebGL canvas. Full-screen panels
// for menus; a lightweight always-on HUD for battle. The HUD is built once and
// only has its numbers mutated each frame — no per-frame innerHTML churn.

import type { BattleResult, BeyConfig, DriverType } from '../core/types';
import { DRIVERS, ENERGY_LAYERS, FORGE_DISCS, getDriver, getPart } from '../data/parts';
import { LADDER } from '../data/ladder';
import { getStadium } from '../data/stadiums';
import { computeStats, estimatedSpinSeconds, powerRating } from '../systems/Stats';
import type { Progression, WinReward } from '../systems/Progression';

export type ScreenName = 'title' | 'menu' | 'garage' | 'ladder' | 'result' | 'none';

export interface UICallbacks {
  onStart(): void;
  onBattle(): void;
  onGarage(): void;
  onBack(): void;
  onSelectOpponent(index: number): void;
  onPickPart(id: string): void;
  onBuyPart(id: string): void;
  onViewFullBey(): void;
  onEquipDone(): void;
  onSpecial(): void;
  onContinue(): void;
  onRematch(): void;
  onToggleMute(): void;
  onResetSave(): void;
}

export interface IntroData {
  playerName: string;
  playerType: DriverType;
  enemyName: string;
  enemyType: DriverType;
  stadiumName: string;
}

export type CalloutKind = 'big' | 'crit' | 'combo' | 'burst' | 'win' | 'lose';

export interface HudState {
  playerName: string;
  playerType: DriverType;
  enemyName: string;
  enemyType: DriverType;
  playerStamina: number;
  enemyStamina: number;
  playerBurst: number;
  enemyBurst: number;
  playerSpecial: number;
  enemySpecial: number;
  specialReady: boolean;
  specialName: string;
  timer: number;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function typeTag(type: DriverType): string {
  return `<span class="type-tag type-${type}">${type}</span>`;
}

const REASON_TEXT: Record<string, string> = {
  spin: 'Spin Finish',
  'ring-out': 'Ring-Out',
  burst: 'Burst Finish',
};

export class UI {
  private cb!: UICallbacks;
  private readonly screens: Record<Exclude<ScreenName, 'none'>, HTMLElement>;
  private readonly hud: HTMLElement;
  private readonly launchPanel: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly introEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly partStage: HTMLElement;
  private readonly partStageMount: HTMLElement;
  private readonly partStageLabel: HTMLElement;

  // Cached HUD nodes (mutated each frame).
  private hudNodes!: {
    pStam: HTMLElement;
    eStam: HTMLElement;
    pBurst: HTMLElement;
    eBurst: HTMLElement;
    pSpec: HTMLElement;
    eSpec: HTMLElement;
    pName: HTMLElement;
    eName: HTMLElement;
    timer: HTMLElement;
    special: HTMLButtonElement;
    specialMeter: HTMLElement;
  };
  private launchFill!: HTMLElement;
  private launchTitle!: HTMLElement;
  private toastTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.screens = {
      title: el('div', 'screen hidden'),
      menu: el('div', 'screen hidden'),
      garage: el('div', 'screen garage hidden'),
      ladder: el('div', 'screen hidden'),
      result: el('div', 'screen hidden'),
    };
    this.hud = el('div', 'hud hidden');
    this.launchPanel = el('div', 'launch-panel hidden');
    this.toastEl = el('div', 'toast');
    this.muteBtn = el('button', 'btn corner-btn hidden', 'SOUND ON');
    this.introEl = el('div', 'intro hidden');
    this.flashEl = el('div', 'screen-flash');

    this.partStage = el('div', 'part-stage hidden');
    this.partStageLabel = el('div', 'ps-label', '');
    this.partStageMount = el('div', 'ps-canvas');
    this.partStage.appendChild(this.partStageLabel);
    this.partStage.appendChild(this.partStageMount);
  }

  init(cb: UICallbacks): void {
    this.cb = cb;
    for (const s of Object.values(this.screens)) this.root.appendChild(s);
    this.buildHud();
    this.buildLaunchPanel();
    this.root.appendChild(this.hud);
    this.root.appendChild(this.launchPanel);
    this.root.appendChild(this.partStage);
    this.root.appendChild(this.introEl);
    this.root.appendChild(this.flashEl);
    this.root.appendChild(this.toastEl);
    this.root.appendChild(this.muteBtn);
    this.muteBtn.addEventListener('click', () => this.cb.onToggleMute());
  }

  /** Mount point for the Garage's dedicated part-viewer canvas. */
  getPartStageMount(): HTMLElement {
    return this.partStageMount;
  }

  setPartStageVisible(v: boolean): void {
    this.partStage.classList.toggle('hidden', !v);
  }

  setPartStageLabel(text: string): void {
    this.partStageLabel.textContent = text;
  }

  // --- Screen switching --------------------------------------------------

  showScreen(name: ScreenName): void {
    for (const [key, node] of Object.entries(this.screens)) {
      node.classList.toggle('hidden', key !== name);
    }
    this.muteBtn.classList.toggle('hidden', name === 'none');
  }

  // --- Title -------------------------------------------------------------

  renderTitle(): void {
    const s = this.screens.title;
    s.innerHTML = '';
    s.appendChild(el('div', 'logo', 'SPIN<br>ARENA'));
    s.appendChild(el('div', 'tagline', 'Beyblade-style top battler'));
    const start = el('button', 'btn btn-primary tap-start', 'TAP TO START');
    start.addEventListener('click', () => this.cb.onStart());
    s.appendChild(start);
    s.appendChild(el('div', 'hint', 'Choose your bey, master the launch, and read the stadium. Attack beats Stamina beats Defense beats Attack.'));
  }

  // --- Main menu ---------------------------------------------------------

  renderMenu(progression: Progression): void {
    const s = this.screens.menu;
    s.innerHTML = '';
    s.appendChild(el('div', 'logo', 'SPIN ARENA'));

    const panel = el('div', 'panel');
    const next = LADDER[progression.ladderIndex];
    panel.innerHTML = `
      <div class="kv"><span>Coins</span><span class="currency">${progression.currency}</span></div>
      <div class="kv"><span>Record</span><span>${progression.wins}W / ${progression.losses}L</span></div>
      <div class="kv"><span>Next challenger</span><span>${next ? next.name : 'All cleared!'}</span></div>
    `;
    s.appendChild(panel);

    const battle = el('button', 'btn btn-primary btn-wide', progression.ladderComplete ? 'REMATCH LADDER' : 'BATTLE');
    battle.addEventListener('click', () => this.cb.onBattle());
    const garage = el('button', 'btn btn-wide', 'GARAGE — CUSTOMIZE BEY');
    garage.addEventListener('click', () => this.cb.onGarage());
    const wrap = el('div', 'panel');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '10px';
    wrap.appendChild(battle);
    wrap.appendChild(garage);
    const reset = el('button', 'btn', 'Reset progress');
    reset.style.fontSize = '12px';
    reset.addEventListener('click', () => {
      if (confirm('Reset all progress and unlocks?')) this.cb.onResetSave();
    });
    wrap.appendChild(reset);
    s.appendChild(wrap);
  }

  // --- Garage ------------------------------------------------------------

  renderGarage(progression: Progression, draft: BeyConfig): void {
    const s = this.screens.garage;
    s.innerHTML = '';
    s.appendChild(el('div', 'tagline', 'Customize Your Bey'));

    const stats = computeStats(draft);
    const statPanel = el('div', 'panel');
    statPanel.innerHTML = `
      <h2>Your Bey ${typeTag(stats.type)}</h2>
      <div class="kv"><span>Attack</span><span>${stats.attack}</span></div>
      <div class="kv"><span>Defense</span><span>${stats.defense}</span></div>
      <div class="kv"><span>Weight</span><span>${stats.weight}</span></div>
      <div class="kv"><span>Spin life</span><span>~${estimatedSpinSeconds(stats)}s</span></div>
      <div class="kv"><span>Power rating</span><span class="currency">${powerRating(stats)}</span></div>
      <div class="kv"><span>Coins</span><span class="currency">${progression.currency}</span></div>
    `;
    s.appendChild(statPanel);

    const viewBtn = el('button', 'btn btn-wide', 'VIEW FULL BEY');
    viewBtn.style.maxWidth = '560px';
    viewBtn.addEventListener('click', () => this.cb.onViewFullBey());
    s.appendChild(viewBtn);

    const picker = el('div', 'panel');
    picker.appendChild(this.partGroup('Energy Layer', ENERGY_LAYERS, draft.layer, progression));
    picker.appendChild(this.partGroup('Forge Disc', FORGE_DISCS, draft.disc, progression));
    picker.appendChild(this.partGroup('Driver / Tip', DRIVERS, draft.driver, progression));
    picker.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!target) return;
      const id = target.dataset.id!;
      if (target.dataset.act === 'buy') this.cb.onBuyPart(id);
      else this.cb.onPickPart(id);
    });
    s.appendChild(picker);

    const done = el('button', 'btn btn-primary btn-wide', 'DONE');
    done.style.maxWidth = '560px';
    done.addEventListener('click', () => this.cb.onEquipDone());
    s.appendChild(done);
  }

  private partGroup(
    label: string,
    parts: { id: string; name: string; cost: number }[],
    selectedId: string,
    progression: Progression,
  ): HTMLElement {
    const group = el('div', 'part-group');
    group.appendChild(el('div', 'part-group-label', label));
    const list = el('div', 'part-list');
    for (const part of parts) {
      const unlocked = progression.isUnlocked(part.id);
      const selected = part.id === selectedId;
      const chip = el('div', `part-chip${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`);
      chip.innerHTML = `<span class="pname">${part.name}</span>
        <span class="pmeta">${this.partMeta(part.id)}</span>`;
      if (unlocked) {
        chip.dataset.act = 'pick';
        chip.dataset.id = part.id;
      } else {
        const buy = el('button', 'btn btn-buy', `Buy ${part.cost}`);
        buy.dataset.act = 'buy';
        buy.dataset.id = part.id;
        if (!progression.canAfford(part.cost)) buy.setAttribute('disabled', 'true');
        chip.appendChild(buy);
      }
      list.appendChild(chip);
    }
    group.appendChild(list);
    return group;
  }

  private partMeta(id: string): string {
    const part = getPart(id);
    if (!part) return '';
    if (part.kind === 'layer') return `ATK ${part.attack}`;
    if (part.kind === 'disc') return `WT ${part.weight} · STAB ${part.stability}`;
    return `${typeTag(part.type)} drain x${part.drainMul}`;
  }

  // --- Ladder ------------------------------------------------------------

  renderLadder(progression: Progression): void {
    const s = this.screens.ladder;
    s.innerHTML = '';
    s.appendChild(el('div', 'logo', 'LADDER'));
    s.style.justifyContent = 'flex-start';

    const panel = el('div', 'panel');
    LADDER.forEach((op, i) => {
      const cleared = i < progression.ladderIndex;
      const current = i === progression.ladderIndex;
      const locked = i > progression.ladderIndex;
      const row = el('div', `opponent-row ${cleared ? 'cleared' : current ? 'current' : 'locked'}`);
      const stadium = getStadium(op.stadium);
      const driverType = getDriver(op.bey.driver).type;
      const info = el('div', 'opponent-info');
      info.innerHTML = `<div class="oname">${op.name} ${typeTag(driverType)}</div>
        <div class="ometa">${op.title} · ${stadium.name} · ${op.reward} coins</div>`;
      row.appendChild(info);
      if (cleared) {
        row.appendChild(el('div', 'currency', 'CLEAR'));
      } else if (current) {
        const fight = el('button', 'btn btn-primary', 'FIGHT');
        fight.addEventListener('click', () => this.cb.onSelectOpponent(i));
        row.appendChild(fight);
      } else {
        row.appendChild(el('div', 'muted', 'LOCKED'));
      }
      panel.appendChild(row);
    });
    s.appendChild(panel);

    if (progression.ladderComplete) {
      const replay = el('button', 'btn btn-primary', 'Replay champion');
      replay.addEventListener('click', () => this.cb.onSelectOpponent(LADDER.length - 1));
      s.appendChild(replay);
    }

    const back = el('button', 'btn', 'BACK');
    back.addEventListener('click', () => this.cb.onBack());
    s.appendChild(back);
  }

  // --- Result ------------------------------------------------------------

  renderResult(result: BattleResult, opponentName: string, reward: WinReward | null): void {
    const s = this.screens.result;
    s.innerHTML = '';
    const won = result.playerWon;
    s.appendChild(el('div', `result-banner ${won ? 'win' : 'lose'}`, won ? 'VICTORY' : 'DEFEAT'));

    const reason = result.reason ? REASON_TEXT[result.reason] ?? '' : '';
    const panel = el('div', 'panel');
    if (won) {
      let html = `<div class="reward-line">${reason} vs ${opponentName}</div>`;
      if (reward) {
        html += `<div class="reward-line">Earned <span class="gain">+${reward.currency}</span> coins</div>`;
        if (reward.newParts.length) {
          html += '<div class="reward-line">New parts unlocked:</div><div>';
          for (const id of reward.newParts) {
            html += `<span class="new-part">${getPart(id)?.name ?? id}</span>`;
          }
          html += '</div>';
        }
        if (reward.advanced) html += '<div class="reward-line">Ladder advanced!</div>';
      }
      panel.innerHTML = html;
    } else {
      panel.innerHTML = `<div class="reward-line">${opponentName} won by ${reason || 'survival'}.</div>
        <div class="muted">Re-spec in the Garage — read the stadium and the type triangle.</div>`;
    }
    s.appendChild(panel);

    const rematch = el('button', 'btn', 'REMATCH');
    rematch.addEventListener('click', () => this.cb.onRematch());
    s.appendChild(rematch);

    const cont = el('button', 'btn btn-primary', 'CONTINUE');
    cont.addEventListener('click', () => this.cb.onContinue());
    s.appendChild(cont);
  }

  // --- Battle HUD --------------------------------------------------------

  private buildHud(): void {
    const top = el('div', 'hud-top');
    const player = el('div', 'hud-bey');
    const enemy = el('div', 'hud-bey enemy');
    player.innerHTML = `
      <div class="bname"><span class="pn"></span></div>
      <div class="bar"><div class="bar-fill fill-stamina" style="width:100%"></div></div>
      <div class="bar-label">Spin</div>
      <div class="bar"><div class="bar-fill fill-special" style="width:0%"></div></div>
      <div class="bar"><div class="bar-fill fill-burst" style="width:0%"></div></div>`;
    enemy.innerHTML = player.innerHTML;
    top.appendChild(player);
    top.appendChild(enemy);

    const timer = el('div', 'hud-timer', '0');
    const special = el('button', 'special-btn', '<span>SPECIAL</span><span class="smeter">0%</span>');
    special.addEventListener('click', () => this.cb.onSpecial());

    this.hud.appendChild(top);
    this.hud.appendChild(timer);
    this.hud.appendChild(special);

    const fills = (node: HTMLElement) => node.querySelectorAll<HTMLElement>('.bar-fill');
    const pf = fills(player);
    const ef = fills(enemy);
    this.hudNodes = {
      pStam: pf[0],
      pSpec: pf[1],
      pBurst: pf[2],
      eStam: ef[0],
      eSpec: ef[1],
      eBurst: ef[2],
      pName: player.querySelector('.pn')!,
      eName: enemy.querySelector('.pn')!,
      timer,
      special,
      specialMeter: special.querySelector('.smeter')!,
    };
  }

  setHudVisible(v: boolean): void {
    this.hud.classList.toggle('hidden', !v);
  }

  setHudNames(state: HudState): void {
    this.hudNodes.pName.innerHTML = `${state.playerName} ${typeTag(state.playerType)}`;
    this.hudNodes.eName.innerHTML = `${typeTag(state.enemyType)} ${state.enemyName}`;
  }

  updateHud(state: HudState): void {
    const n = this.hudNodes;
    n.pStam.style.width = `${Math.max(0, state.playerStamina)}%`;
    n.eStam.style.width = `${Math.max(0, state.enemyStamina)}%`;
    n.pSpec.style.width = `${state.playerSpecial}%`;
    n.eSpec.style.width = `${state.enemySpecial}%`;
    n.pBurst.style.width = `${state.playerBurst}%`;
    n.eBurst.style.width = `${state.enemyBurst}%`;
    n.timer.textContent = String(Math.ceil(state.timer));
    n.special.classList.toggle('ready', state.specialReady);
    n.specialMeter.textContent = state.specialReady ? state.specialName : `${Math.floor(state.playerSpecial)}%`;
  }

  // --- Launch panel ------------------------------------------------------

  private buildLaunchPanel(): void {
    this.launchTitle = el('h3', undefined, 'LAUNCH');
    const hint = el('div', 'hint', 'Hold / swipe down to charge — drag left & right to aim. Release to launch.');
    const meter = el('div', 'power-meter');
    this.launchFill = el('div', 'power-fill');
    meter.appendChild(this.launchFill);
    this.launchPanel.appendChild(this.launchTitle);
    this.launchPanel.appendChild(hint);
    this.launchPanel.appendChild(meter);
  }

  setLaunchVisible(v: boolean): void {
    this.launchPanel.classList.toggle('hidden', !v);
    // The Special button shares the bottom-centre slot — hide it while aiming.
    this.hudNodes.special.classList.toggle('hidden', v);
  }

  updateLaunch(power: number, charging: boolean): void {
    this.launchFill.style.width = `${Math.round(power * 100)}%`;
    this.launchTitle.textContent = charging ? `CHARGING ${Math.round(power * 100)}%` : 'LAUNCH';
  }

  // --- Toast -------------------------------------------------------------

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    this.toastTimer = 1.8;
  }

  tickToast(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
  }

  setMuted(muted: boolean): void {
    this.muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  }

  // --- Battle intro / callouts ------------------------------------------

  playIntro(data: IntroData): void {
    this.introEl.innerHTML = `
      <div class="intro-cards">
        <div class="intro-card player">
          <div class="ic-role">CHALLENGER</div>
          <div class="ic-name">${data.playerName}</div>
          ${typeTag(data.playerType)}
        </div>
        <div class="intro-vs">VS</div>
        <div class="intro-card enemy">
          <div class="ic-role">OPPONENT</div>
          <div class="ic-name">${data.enemyName}</div>
          ${typeTag(data.enemyType)}
        </div>
      </div>
      <div class="intro-stadium">${data.stadiumName}</div>`;
    this.introEl.classList.remove('hidden', 'play');
    void this.introEl.offsetWidth; // restart entrance animations
    this.introEl.classList.add('play');
  }

  hideIntro(): void {
    this.introEl.classList.add('hidden');
  }

  /** Spawn a big animated callout (combo, smash, burst finish, ...). */
  callout(text: string, kind: CalloutKind): void {
    const node = el('div', `callout callout-${kind}`, text);
    this.root.appendChild(node);
    node.addEventListener('animationend', () => node.remove());
    window.setTimeout(() => node.remove(), 2200);
    if (kind === 'burst' || kind === 'win') this.flash('rgba(255,214,128,0.8)');
    else if (kind === 'crit') this.flash('rgba(255,120,90,0.5)');
  }

  /** Brief full-screen colour flash. */
  flash(color: string): void {
    this.flashEl.style.background = color;
    this.flashEl.classList.remove('show');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('show');
  }

  /** Anime-style cut-in stripe for a Special move. */
  specialBanner(name: string, color: number): void {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const node = el('div', 'special-banner', name);
    node.style.setProperty('--bcolor', hex);
    this.root.appendChild(node);
    node.addEventListener('animationend', () => node.remove());
    window.setTimeout(() => node.remove(), 1900);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    this.flash(`rgba(${r}, ${g}, ${b}, 0.5)`);
  }
}
