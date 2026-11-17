import type { AppActions, HudSnapshot, ModalKind } from './uiTypes';

function formatTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICONS = {
  spade: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2.5C7.2 7.8 4 11.1 4 15.1c0 3 2.3 5.1 5.1 5.1 1.4 0 2.4-.5 2.9-1.4v2.7c0 .8-.7 1.3-1.7 1.7h3.4c-1-.4-1.7-.9-1.7-1.7v-2.7c.5.9 1.5 1.4 2.9 1.4 2.8 0 5.1-2.1 5.1-5.1 0-4-3.2-7.3-8-12.6z"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c1.2 3.2 4.5 5.1 4.5 9.2A4.5 4.5 0 0 1 12 15.7a4.5 4.5 0 0 1-4.5-4.5c0-1.9.7-3.4 1.8-4.7 0 1.8.9 2.9 2.2 3.2-.4-2.1-.3-4.6.5-7.7z"/><path d="M7.5 14.5A5.5 5.5 0 0 0 12 22a5.5 5.5 0 0 0 4.5-7.5"/></svg>`,
  hint: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A6 6 0 1 0 7.5 11.5c.76.76 1.23 1.52 1.41 2.5"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`,
  deal: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/><path d="M10 13.5h.01"/></svg>`,
  sparkles: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="13" height="16" rx="2"/><path d="M16 8h3a2 2 0 0 1 2 2v9"/><path d="M9.5 10v6"/><path d="M6.5 13h6"/></svg>`,
  saves: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
  stats: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`,
  customize: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
  help: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
} as const;

export class HudView {
  public onModalRequest: ((modal: ModalKind) => void) | null = null;

  private readonly root: HTMLElement;
  private readonly actions: AppActions;
  private readonly onOpenModal?: (modal: ModalKind) => void;
  private readonly toastHost: HTMLElement;

  private lastSnapshot: HudSnapshot | null = null;
  private toastEl!: HTMLElement;
  private toastTextEl!: HTMLElement;
  private toastTimer: number | null = null;
  private timedToastActive = false;
  private lastRenderToast: string | null = null;

  // Persistent DOM references so 1s timer ticks never recreate controls or break listeners/hover
  private hudBarEl!: HTMLElement;
  private modePillBtn!: HTMLButtonElement;
  private modeLabelEl!: HTMLElement;
  private findingPillEl!: HTMLElement;
  private timeEl!: HTMLElement;
  private movesEl!: HTMLElement;
  private scoreEl!: HTMLElement;
  private streakBtn!: HTMLButtonElement;
  private streakCountEl!: HTMLElement;
  private autoCompleteBtn!: HTMLButtonElement;
  private hintGroupEl!: HTMLElement;
  private hintBtn!: HTMLButtonElement;
  private hintLabelEl!: HTMLElement;
  private hintBadgeEl!: HTMLElement;
  private hintClearBtn!: HTMLButtonElement;
  private undoBtn!: HTMLButtonElement;
  private dealStockBtn!: HTMLButtonElement;
  private stockWavesEl!: HTMLElement;
  private newGameBtn!: HTMLButtonElement;
  private savesBtn!: HTMLButtonElement;
  private statsBtn!: HTMLButtonElement;
  private customizeBtn!: HTMLButtonElement;
  private soundBtn!: HTMLButtonElement;
  private soundIconEl!: HTMLElement;
  private helpBtn!: HTMLButtonElement;

  constructor(
    root: HTMLElement,
    actions: AppActions,
    onOpenModal?: (modal: ModalKind) => void,
  ) {
    this.root = root;
    this.actions = actions;
    this.onOpenModal = onOpenModal;
    this.toastHost = this.resolveToastHost();

    this.buildDom();
    this.bindEvents();
  }

  render(snapshot: HudSnapshot, toastMessage: string | null): void {
    this.lastSnapshot = snapshot;

    const { state, stats, settings } = snapshot;
    const { config } = state;

    this.hudBarEl.classList.toggle('is-left-handed', settings.leftHanded);

    // Mode pill
    const suitWord = config.suits === 1 ? 'Suit' : 'Suits';
    const dealType = config.winningDealOnly ? 'Winning Deal' : 'Open Deal';
    const relaxedTag = config.relaxedStockDeal ? ' · Relaxed' : '';
    this.modeLabelEl.textContent = `${config.decks} Decks · ${config.suits} ${suitWord} · ${dealType}${relaxedTag}`;
    this.modePillBtn.title = `Seed #${config.seed} — Click to change mode or deal`;

    // Finding winning deal spinner
    this.findingPillEl.hidden = !snapshot.findingWinningDeal;

    // Tabular counters
    this.timeEl.textContent = formatTime(state.elapsedSeconds);
    this.movesEl.textContent = String(state.moves);
    this.scoreEl.textContent = String(state.score);

    // Win streak
    this.streakCountEl.textContent = String(stats.currentWinStreak);
    this.streakBtn.classList.toggle('is-active', stats.currentWinStreak > 0);
    this.streakBtn.title = `Current Win Streak: ${stats.currentWinStreak} · Best Streak: ${stats.bestWinStreak}`;

    // Auto-complete
    this.autoCompleteBtn.hidden = !snapshot.canAutoComplete;
    this.autoCompleteBtn.classList.toggle('is-highlighted', snapshot.canAutoComplete);

    // Hint button + active N/M badge + cancel
    if (snapshot.hintCounter) {
      const { index, total, label } = snapshot.hintCounter;
      const counterText = label.trim().length > 0 ? label.trim() : `${index}/${total}`;
      const stripped = counterText.replace(/^hint\s*/i, '');
      this.hintLabelEl.textContent = 'Hint';
      this.hintBadgeEl.textContent = stripped;
      this.hintBadgeEl.hidden = false;
      this.hintClearBtn.hidden = false;
      this.hintGroupEl.classList.add('has-active-hint');
      this.hintBtn.classList.add('is-active');
      this.hintBtn.setAttribute('aria-label', `Hint ${stripped} — click for next hint`);
    } else {
      this.hintLabelEl.textContent = 'Hint';
      this.hintBadgeEl.textContent = '';
      this.hintBadgeEl.hidden = true;
      this.hintClearBtn.hidden = true;
      this.hintGroupEl.classList.remove('has-active-hint');
      this.hintBtn.classList.remove('is-active');
      this.hintBtn.setAttribute('aria-label', 'Show tactical hint (H)');
    }

    // Undo & Deal Stock
    this.undoBtn.disabled = !snapshot.canUndo;
    this.dealStockBtn.disabled = !snapshot.canDealStock;
    const waves = state.stock.length;
    this.stockWavesEl.textContent = String(waves);
    this.dealStockBtn.title =
      waves > 0
        ? `Deal stock wave (${waves} ${waves === 1 ? 'wave' : 'waves'} remaining) [D]`
        : 'No stock waves remaining';

    // Sound toggle
    this.soundIconEl.innerHTML = settings.soundEnabled ? ICONS.soundOn : ICONS.soundOff;
    this.soundBtn.setAttribute('aria-pressed', String(settings.soundEnabled));
    this.soundBtn.classList.toggle('is-muted', !settings.soundEnabled);
    this.soundBtn.title = settings.soundEnabled
      ? 'Mute Sound (M)'
      : 'Unmute Sound (M)';

    // Toast sync without clobbering timed showToast calls
    if (toastMessage !== null && toastMessage.trim().length > 0) {
      this.lastRenderToast = toastMessage;
      this.timedToastActive = false;
      this.clearToastTimer();
      this.displayToastElement(toastMessage);
    } else if (this.lastRenderToast !== null) {
      this.lastRenderToast = null;
      if (!this.timedToastActive) {
        this.hideToastElement();
      }
    }
  }

  showToast(message: string, durationMs = 3400): void {
    const trimmed = message.trim();
    if (!trimmed) {
      this.clearToastTimer();
      this.timedToastActive = false;
      this.lastRenderToast = null;
      this.hideToastElement();
      return;
    }

    this.clearToastTimer();
    this.timedToastActive = true;
    this.lastRenderToast = null;
    this.displayToastElement(trimmed);

    if (typeof window !== 'undefined' && durationMs > 0) {
      this.toastTimer = window.setTimeout(() => {
        this.toastTimer = null;
        this.timedToastActive = false;
        if (!this.lastRenderToast) {
          this.hideToastElement();
        }
      }, durationMs);
    }
  }

  private resolveToastHost(): HTMLElement {
    if (this.root.id === 'hud-root' && typeof document !== 'undefined') {
      const existing = document.getElementById('toast-root');
      if (existing) {
        return existing;
      }
    }
    const localToast = document.createElement('div');
    localToast.className = 'toast-root toast-root--inline';
    this.root.appendChild(localToast);
    return localToast;
  }

  private buildDom(): void {
    this.root.innerHTML = `
      <header class="hud-bar" id="hud-bar">
        <div class="hud-cluster hud-cluster--left">
          <button
            type="button"
            id="btn-mode-pill"
            class="hud-mode-pill"
            title="Game Mode & Deal Settings"
          >
            <span class="hud-brand-mark">${ICONS.spade}</span>
            <span id="hud-mode-label" class="hud-mode-label">2 Decks · 2 Suits · Winning Deal</span>
          </button>

          <div id="hud-finding-deal" class="hud-finding-pill" hidden>
            <span class="hud-spinner" aria-hidden="true"></span>
            <span>Curating deal…</span>
          </div>

          <div class="hud-telemetry" role="group" aria-label="Game statistics">
            <div class="hud-metric">
              <span class="hud-metric-label">Time</span>
              <span id="hud-time" class="hud-metric-value">00:00</span>
            </div>
            <div class="hud-metric-divider" aria-hidden="true"></div>
            <div class="hud-metric">
              <span class="hud-metric-label">Moves</span>
              <span id="hud-moves" class="hud-metric-value">0</span>
            </div>
            <div class="hud-metric-divider" aria-hidden="true"></div>
            <div class="hud-metric">
              <span class="hud-metric-label">Score</span>
              <span id="hud-score" class="hud-metric-value">500</span>
            </div>
          </div>

          <button
            type="button"
            id="hud-streak"
            class="hud-streak-badge"
            title="Current Win Streak"
          >
            <span class="hud-streak-icon">${ICONS.flame}</span>
            <span class="hud-streak-label">Streak</span>
            <span id="hud-streak-count" class="hud-streak-count">0</span>
          </button>
        </div>

        <div class="hud-cluster hud-cluster--right">
          <div class="hud-primary-actions" role="group" aria-label="Play actions">
            <button
              type="button"
              id="btn-auto-complete"
              class="hud-btn hud-btn--brass"
              hidden
              title="Automatically finish remaining suits (A)"
            >
              <span class="hud-btn-icon">${ICONS.sparkles}</span>
              <span class="hud-btn-text">Auto-Complete</span>
            </button>

            <div id="hud-hint-group" class="hud-hint-group">
              <button
                type="button"
                id="btn-hint"
                class="hud-btn"
                title="Show tactical hint (H · Enter plays hint)"
              >
                <span class="hud-btn-icon">${ICONS.hint}</span>
                <span id="hud-hint-label" class="hud-btn-text">Hint</span>
                <span id="hud-hint-badge" class="hud-hint-badge" hidden></span>
              </button>
              <button
                type="button"
                id="btn-hint-clear"
                class="hud-hint-clear"
                hidden
                title="Clear active hint (Esc)"
                aria-label="Clear active hint"
              >
                ${ICONS.close}
              </button>
            </div>

            <button
              type="button"
              id="btn-undo"
              class="hud-btn"
              disabled
              title="Undo last move (Z)"
            >
              <span class="hud-btn-icon">${ICONS.undo}</span>
              <span class="hud-btn-text">Undo</span>
            </button>

            <button
              type="button"
              id="btn-deal-stock"
              class="hud-btn hud-btn--deal"
              title="Deal stock wave (D)"
            >
              <span class="hud-btn-icon">${ICONS.deal}</span>
              <span class="hud-btn-text">Deal</span>
              <span id="hud-stock-waves" class="hud-stock-pill">5</span>
            </button>
          </div>

          <div class="hud-utility-actions" role="group" aria-label="Cardroom tools">
            <button
              type="button"
              id="btn-new-game"
              class="hud-btn hud-btn--subtle"
              title="New Game & Modes (N)"
            >
              <span class="hud-btn-icon">${ICONS.plus}</span>
              <span class="hud-btn-text hud-btn-text--desktop">New</span>
            </button>

            <button
              type="button"
              id="btn-saves"
              class="hud-btn hud-btn--icon"
              title="Saved Games (B)"
              aria-label="Saved Games"
            >
              <span class="hud-btn-icon">${ICONS.saves}</span>
            </button>

            <button
              type="button"
              id="btn-stats"
              class="hud-btn hud-btn--icon"
              title="Statistics & Win Streak (S)"
              aria-label="Statistics & Win Streak"
            >
              <span class="hud-btn-icon">${ICONS.stats}</span>
            </button>

            <button
              type="button"
              id="btn-customize"
              class="hud-btn hud-btn--icon"
              title="Customize Table & Cards (C)"
              aria-label="Customize Table & Cards"
            >
              <span class="hud-btn-icon">${ICONS.customize}</span>
            </button>

            <button
              type="button"
              id="btn-sound"
              class="hud-btn hud-btn--icon"
              title="Toggle Sound (M)"
              aria-label="Toggle Sound"
              aria-pressed="true"
            >
              <span id="hud-sound-icon" class="hud-btn-icon">${ICONS.soundOn}</span>
            </button>

            <button
              type="button"
              id="btn-help"
              class="hud-btn hud-btn--icon"
              title="Rules & Keyboard Shortcuts (?)"
              aria-label="Rules & Keyboard Shortcuts"
            >
              <span class="hud-btn-icon">${ICONS.help}</span>
            </button>
          </div>
        </div>
      </header>
    `;

    this.toastHost.innerHTML = `
      <div id="hud-toast" class="hud-toast" role="status" aria-hidden="true">
        <span id="hud-toast-text" class="hud-toast-text"></span>
      </div>
    `;

    this.hudBarEl = this.query('#hud-bar');
    this.modePillBtn = this.query('#btn-mode-pill');
    this.modeLabelEl = this.query('#hud-mode-label');
    this.findingPillEl = this.query('#hud-finding-deal');
    this.timeEl = this.query('#hud-time');
    this.movesEl = this.query('#hud-moves');
    this.scoreEl = this.query('#hud-score');
    this.streakBtn = this.query('#hud-streak');
    this.streakCountEl = this.query('#hud-streak-count');
    this.autoCompleteBtn = this.query('#btn-auto-complete');
    this.hintGroupEl = this.query('#hud-hint-group');
    this.hintBtn = this.query('#btn-hint');
    this.hintLabelEl = this.query('#hud-hint-label');
    this.hintBadgeEl = this.query('#hud-hint-badge');
    this.hintClearBtn = this.query('#btn-hint-clear');
    this.undoBtn = this.query('#btn-undo');
    this.dealStockBtn = this.query('#btn-deal-stock');
    this.stockWavesEl = this.query('#hud-stock-waves');
    this.newGameBtn = this.query('#btn-new-game');
    this.savesBtn = this.query('#btn-saves');
    this.statsBtn = this.query('#btn-stats');
    this.customizeBtn = this.query('#btn-customize');
    this.soundBtn = this.query('#btn-sound');
    this.soundIconEl = this.query('#hud-sound-icon');
    this.helpBtn = this.query('#btn-help');

    this.toastEl = this.toastHost.querySelector('#hud-toast') as HTMLElement;
    this.toastTextEl = this.toastHost.querySelector('#hud-toast-text') as HTMLElement;
  }

  private bindEvents(): void {
    this.modePillBtn.addEventListener('click', () => this.requestModal('new-game'));
    this.newGameBtn.addEventListener('click', () => this.requestModal('new-game'));
    this.savesBtn.addEventListener('click', () => this.requestModal('saves'));
    this.statsBtn.addEventListener('click', () => this.requestModal('stats'));
    this.streakBtn.addEventListener('click', () => this.requestModal('stats'));
    this.customizeBtn.addEventListener('click', () => this.requestModal('customize'));
    this.helpBtn.addEventListener('click', () => this.requestModal('help'));

    this.autoCompleteBtn.addEventListener('click', (event) => {
      this.returnFocusToTableIfPointer(event);
      this.actions.onAutoComplete();
    });
    this.hintBtn.addEventListener('click', (event) => {
      this.returnFocusToTableIfPointer(event);
      this.actions.onHint();
    });
    this.hintClearBtn.addEventListener('click', (event) => {
      this.returnFocusToTableIfPointer(event);
      this.lastRenderToast = null;
      this.timedToastActive = false;
      this.clearToastTimer();
      this.hideToastElement();
      this.dispatchCustomEvent('spider:clear-hint');
    });
    this.undoBtn.addEventListener('click', (event) => {
      this.returnFocusToTableIfPointer(event);
      this.actions.onUndo();
    });
    this.dealStockBtn.addEventListener('click', (event) => {
      this.returnFocusToTableIfPointer(event);
      this.actions.onDealStock();
    });

    this.soundBtn.addEventListener('click', (event) => {
      this.returnFocusToTableIfPointer(event);
      const enabled = this.lastSnapshot ? this.lastSnapshot.settings.soundEnabled : true;
      this.actions.onUpdateSettings({ soundEnabled: !enabled });
    });
  }

  private returnFocusToTableIfPointer(event: Event): void {
    if (typeof document === 'undefined') return;
    if (event instanceof MouseEvent && event.detail > 0) {
      document.getElementById('stage-container')?.focus({ preventScroll: true });
    }
  }

  private requestModal(modal: ModalKind): void {
    this.onOpenModal?.(modal);
    this.onModalRequest?.(modal);
    this.dispatchCustomEvent('spider:open-modal', { modal });
  }

  private dispatchCustomEvent<T>(name: string, detail?: T): void {
    const event = new CustomEvent(name, { bubbles: true, detail });
    this.root.dispatchEvent(event);
    if (!this.root.isConnected && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  private displayToastElement(message: string): void {
    this.toastTextEl.innerHTML = escapeHtml(message);
    this.toastEl.classList.add('is-visible');
    this.toastEl.setAttribute('aria-hidden', 'false');
  }

  private hideToastElement(): void {
    this.toastEl.classList.remove('is-visible');
    this.toastEl.setAttribute('aria-hidden', 'true');
  }

  private clearToastTimer(): void {
    if (this.toastTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
  }

  private query<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector(selector);
    if (!el) {
      throw new Error(`HudView missing expected element: ${selector}`);
    }
    return el as T;
  }
}
