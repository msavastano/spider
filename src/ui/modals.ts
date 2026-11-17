import {
  getDeckLayoutSpec,
  getModeKey,
  type AnimationSpeed,
  type CameraPreset,
  type CardBackTheme,
  type CardFaceTheme,
  type DeckCount,
  type FeltTheme,
  type GameConfig,
  type SuitCount,
} from '../engine/types';
import type { AppActions, HudSnapshot, ModalKind, UIStateSnapshot } from './uiTypes';

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

function formatTimestamp(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CLOSE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const TROPHY_ICON = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>`;
const FLAME_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2c1.2 3.2 4.5 5.1 4.5 9.2A4.5 4.5 0 0 1 12 15.7a4.5 4.5 0 0 1-4.5-4.5c0-1.9.7-3.4 1.8-4.7 0 1.8.9 2.9 2.2 3.2-.4-2.1-.3-4.6.5-7.7z"/><path d="M7.5 14.5A5.5 5.5 0 0 0 12 22a5.5 5.5 0 0 0 4.5-7.5"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

const FELT_SWATCHES: Array<{ id: FeltTheme; label: string; color: string; trim: string }> = [
  { id: 'emerald', label: 'Emerald', color: '#166341', trim: '#c7a45c' },
  { id: 'sapphire', label: 'Sapphire', color: '#164173', trim: '#c9b489' },
  { id: 'burgundy', label: 'Burgundy', color: '#69192B', trim: '#d4af6a' },
  { id: 'obsidian', label: 'Obsidian', color: '#29303D', trim: '#a68c5a' },
  { id: 'mahogany', label: 'Mahogany', color: '#5B2B18', trim: '#d9b571' },
];

const CARD_FACE_SWATCHES: Array<{
  id: CardFaceTheme;
  label: string;
  hint: string;
  previewBg: string;
  previewFg: string;
}> = [
  { id: 'classic', label: 'Classic', hint: 'Ivory serif', previewBg: '#FFFDF8', previewFg: '#171923' },
  { id: 'jumbo', label: 'Jumbo', hint: 'Bold index', previewBg: '#FFFFFF', previewFg: '#0F172A' },
  { id: 'modern', label: 'Modern', hint: 'Clean stripe', previewBg: '#FCFDFE', previewFg: '#182030' },
  { id: 'midnight', label: 'Midnight', hint: 'Low-glare dark', previewBg: '#1A2030', previewFg: '#F2F5FA' },
];

const CARD_BACK_SWATCHES: Array<{
  id: CardBackTheme;
  label: string;
  primary: string;
  accent: string;
}> = [
  { id: 'spider-web', label: 'Spider Web', primary: '#151B2E', accent: '#C99B3B' },
  { id: 'royal-crimson', label: 'Crimson', primary: '#8A1526', accent: '#D4A84E' },
  { id: 'emerald-guild', label: 'Guild', primary: '#0F5B40', accent: '#D1AA58' },
  { id: 'celestial-gold', label: 'Celestial', primary: '#19244D', accent: '#E2B652' },
  { id: 'minimal-slate', label: 'Slate', primary: '#333C4D', accent: '#94A3B8' },
];

const CAMERA_PRESETS: Array<{ id: CameraPreset; label: string; defaultTilt?: number }> = [
  { id: 'overhead', label: 'Overhead', defaultTilt: 2 },
  { id: 'classic-3d', label: 'Classic 3D', defaultTilt: 18 },
  { id: 'custom', label: 'Custom' },
];

const ANIMATION_SPEEDS: Array<{ id: AnimationSpeed; label: string }> = [
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'normal', label: 'Normal' },
  { id: 'snappy', label: 'Snappy' },
];

export class ModalManager {
  public onModalRequest: ((modal: ModalKind) => void) | null = null;

  private readonly root: HTMLElement;
  private readonly actions: AppActions;
  private readonly onModalChange?: (modal: ModalKind) => void;

  private currentModal: ModalKind = 'none';
  private lastHud: HudSnapshot | null = null;
  private lastUi: UIStateSnapshot | null = null;

  // Draft state for New Game modal so 1s timer ticks don't reset selections
  private draftDecks: DeckCount = 2;
  private draftSuits: SuitCount = 2;
  private draftWinningDealOnly = true;
  private draftRelaxedStockDeal = false;
  private draftSeed = '';

  // Two-step confirmation for resetting stats
  private confirmResetStats = false;
  // Track saves snapshot signature to preserve save-name input text
  private lastSlotsSignature = '';
  private lastStatsSignature = '';
  private previousFocusEl: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    actions: AppActions,
    onModalChange?: (modal: ModalKind) => void,
  ) {
    this.root = root;
    this.actions = actions;
    this.onModalChange = onModalChange;
    this.bindRootEvents();
  }

  render(hud: HudSnapshot, ui: UIStateSnapshot): void {
    const prevModal = this.currentModal;
    const nextModal = ui.activeModal;
    const modalChanged = prevModal !== nextModal;

    this.lastHud = hud;
    this.lastUi = ui;
    this.currentModal = nextModal;

    if (nextModal === 'none') {
      if (modalChanged || this.root.childElementCount > 0) {
        this.root.innerHTML = '';
        this.root.className = 'modal-root';
        this.confirmResetStats = false;
        this.lastSlotsSignature = '';
      }
      if (modalChanged && prevModal !== 'none') {
        this.restoreFocusFromModal();
      }
      return;
    }

    if (modalChanged) {
      if (prevModal === 'none' && typeof document !== 'undefined') {
        this.previousFocusEl =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      this.confirmResetStats = false;
      if (nextModal === 'new-game') {
        this.draftDecks = hud.state.config.decks;
        this.draftSuits = hud.state.config.suits;
        this.draftWinningDealOnly = hud.state.config.winningDealOnly;
        this.draftRelaxedStockDeal = hud.state.config.relaxedStockDeal;
        this.draftSeed = '';
      }
    }

    switch (nextModal) {
      case 'new-game':
        if (modalChanged) {
          this.renderNewGameModal(hud);
        }
        break;
      case 'customize':
        if (modalChanged) {
          this.renderCustomizeDrawer(hud);
        } else {
          this.syncCustomizeDrawer(hud);
        }
        break;
      case 'stats': {
        const statsSig = `${hud.stats.totalGamesPlayed}:${hud.stats.totalGamesWon}:${hud.stats.currentWinStreak}:${hud.stats.bestWinStreak}:${Object.keys(hud.stats.byMode).length}`;
        if (modalChanged || statsSig !== this.lastStatsSignature) {
          this.lastStatsSignature = statsSig;
          this.renderStatsModal(hud);
        }
        break;
      }
      case 'saves': {
        const sig = ui.savedSlots.map((s) => `${s.id}:${s.savedAt}`).join('|');
        if (modalChanged) {
          this.lastSlotsSignature = sig;
          this.renderSavesModal(hud, ui);
        } else if (sig !== this.lastSlotsSignature) {
          this.lastSlotsSignature = sig;
          this.syncSavesList(ui);
        }
        break;
      }
      case 'abandon-confirm':
        if (modalChanged) {
          this.renderAbandonConfirmModal(ui);
        }
        break;
      case 'victory':
        if (modalChanged) {
          this.renderVictoryModal(hud);
        }
        break;
      case 'help':
        if (modalChanged) {
          this.renderHelpModal();
        }
        break;
    }

    if (modalChanged) {
      this.focusInitialModalElement(nextModal, hud);
    }
  }

  private bindRootEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (target.dataset.closeBackdrop === 'true') {
        this.requestModal('none');
        return;
      }

      const btn = target.closest<HTMLElement>('[data-action], button');
      if (!btn) {
        return;
      }

      const hud = this.lastHud;
      const ui = this.lastUi;

      if (
        btn.id === 'btn-modal-close' ||
        btn.id === 'btn-new-game-cancel' ||
        btn.id === 'btn-customize-close' ||
        btn.id === 'btn-stats-close' ||
        btn.id === 'btn-saves-close' ||
        btn.id === 'btn-help-close' ||
        btn.id === 'btn-victory-close' ||
        btn.id === 'btn-abandon-cancel'
      ) {
        this.requestModal('none');
        return;
      }

      // New Game modal controls
      if (btn.dataset.decks) {
        const d = Number(btn.dataset.decks) as DeckCount;
        if (d === 2 || d === 3 || d === 4) {
          this.draftDecks = d;
          this.updateNewGameDraftDom();
        }
        return;
      }

      if (btn.dataset.suits) {
        const s = Number(btn.dataset.suits) as SuitCount;
        if (s === 1 || s === 2 || s === 3 || s === 4) {
          this.draftSuits = s;
          this.updateNewGameDraftDom();
        }
        return;
      }

      if (btn.id === 'btn-replay-deal') {
        this.requestModal('none');
        this.actions.onReplayDeal();
        return;
      }

      if (btn.id === 'btn-start-deal') {
        const parsedSeed = this.parseDraftSeed();
        const config: GameConfig = {
          decks: this.draftDecks,
          suits: this.draftSuits,
          winningDealOnly: this.draftWinningDealOnly,
          relaxedStockDeal: this.draftRelaxedStockDeal,
          ...(parsedSeed !== undefined ? { seed: parsedSeed } : {}),
        };
        this.requestModal('none');
        this.actions.onNewGame(config);
        return;
      }

      // Customize drawer swatches & segmented controls
      if (btn.dataset.feltTheme) {
        this.actions.onUpdateSettings({ feltTheme: btn.dataset.feltTheme as FeltTheme });
        return;
      }

      if (btn.dataset.faceTheme) {
        this.actions.onUpdateSettings({
          cardFaceTheme: btn.dataset.faceTheme as CardFaceTheme,
        });
        return;
      }

      if (btn.dataset.backTheme) {
        this.actions.onUpdateSettings({
          cardBackTheme: btn.dataset.backTheme as CardBackTheme,
        });
        return;
      }

      if (btn.dataset.cameraPreset) {
        const preset = btn.dataset.cameraPreset as CameraPreset;
        const spec = CAMERA_PRESETS.find((p) => p.id === preset);
        if (spec && spec.defaultTilt !== undefined) {
          this.actions.onUpdateSettings({
            cameraPreset: preset,
            cameraTiltDeg: spec.defaultTilt,
          });
        } else {
          this.actions.onUpdateSettings({ cameraPreset: preset });
        }
        return;
      }

      if (btn.dataset.animationSpeed) {
        this.actions.onUpdateSettings({
          animationSpeed: btn.dataset.animationSpeed as AnimationSpeed,
        });
        return;
      }

      // Stats modal
      if (btn.id === 'btn-reset-stats') {
        this.confirmResetStats = true;
        if (hud) {
          this.renderStatsModal(hud);
          this.root.querySelector<HTMLElement>('#btn-reset-stats-cancel')?.focus({
            preventScroll: true,
          });
        }
        return;
      }

      if (btn.id === 'btn-reset-stats-cancel') {
        this.confirmResetStats = false;
        if (hud) {
          this.renderStatsModal(hud);
          this.root.querySelector<HTMLElement>('#btn-reset-stats')?.focus({
            preventScroll: true,
          });
        }
        return;
      }

      if (btn.id === 'btn-reset-stats-confirm') {
        const beforeHud = this.lastHud;
        this.confirmResetStats = false;
        this.actions.onResetStats();
        if (this.currentModal === 'stats') {
          if (this.lastHud === beforeHud && beforeHud) {
            this.renderStatsModal(beforeHud);
          }
          this.root.querySelector<HTMLElement>('#btn-stats-close')?.focus({
            preventScroll: true,
          });
        }
        return;
      }

      // Saved games modal (#btn-save-slot submits #form-save-slot below)
      if (btn.id === 'btn-save-slot') {
        return;
      }

      if (btn.dataset.loadSlotId) {
        const id = btn.dataset.loadSlotId;
        this.requestModal('none');
        this.actions.onLoadSlot(id);
        return;
      }

      if (btn.dataset.deleteSlotId) {
        const id = btn.dataset.deleteSlotId;
        this.actions.onDeleteSlot(id);
        return;
      }

      // Abandon streak confirmation modal
      if (btn.id === 'btn-abandon-start-new' && ui?.pendingAbandon) {
        const pendingCfg = ui.pendingAbandon.config;
        this.requestModal('none');
        this.actions.onNewGame(pendingCfg, true);
        return;
      }

      if (btn.id === 'btn-abandon-replay') {
        this.requestModal('none');
        this.actions.onReplayDeal();
        return;
      }

      // Victory modal
      if (btn.id === 'btn-victory-next-hand' && hud) {
        const nextConfig: GameConfig = {
          decks: hud.state.config.decks,
          suits: hud.state.config.suits,
          winningDealOnly: hud.state.config.winningDealOnly,
          relaxedStockDeal: hud.state.config.relaxedStockDeal,
        };
        this.requestModal('none');
        this.actions.onNewGame(nextConfig);
        return;
      }

      if (btn.id === 'btn-victory-stats') {
        this.requestModal('stats');
        return;
      }
    });

    this.root.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) {
        return;
      }

      if (target.id === 'input-seed') {
        this.draftSeed = target.value;
        return;
      }

      if (target.id === 'slider-camera-tilt') {
        const deg = Math.min(28, Math.max(0, Math.round(Number(target.value))));
        const label = this.root.querySelector('#customize-tilt-value');
        if (label) {
          label.textContent = `${deg}°`;
        }
        this.actions.onUpdateSettings({
          cameraPreset: 'custom',
          cameraTiltDeg: deg,
        });
        return;
      }

      if (target.id === 'slider-sound-volume') {
        const pct = Math.min(100, Math.max(0, Math.round(Number(target.value))));
        const label = this.root.querySelector('#customize-volume-value');
        if (label) {
          label.textContent = `${pct}%`;
        }
        this.actions.onUpdateSettings({
          soundVolume: pct / 100,
          soundEnabled: pct > 0 ? true : this.lastHud?.settings.soundEnabled ?? true,
        });
      }
    });

    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.type !== 'checkbox') {
        return;
      }

      switch (target.id) {
        case 'toggle-winning-deal':
          this.draftWinningDealOnly = target.checked;
          break;
        case 'toggle-relaxed-stock':
          this.draftRelaxedStockDeal = target.checked;
          break;
        case 'toggle-four-color':
          this.actions.onUpdateSettings({ fourColorDeck: target.checked });
          break;
        case 'toggle-dim-locked':
          this.actions.onUpdateSettings({ dimLockedCards: target.checked });
          break;
        case 'toggle-sound-enabled':
          this.actions.onUpdateSettings({ soundEnabled: target.checked });
          break;
        case 'toggle-double-click-move':
          this.actions.onUpdateSettings({ doubleClickAutoMove: target.checked });
          break;
        case 'toggle-auto-complete-prompt':
          this.actions.onUpdateSettings({ autoCompletePrompt: target.checked });
          break;
        case 'toggle-left-handed':
          this.actions.onUpdateSettings({ leftHanded: target.checked });
          break;
      }
    });

    this.root.addEventListener('submit', (event) => {
      const form = event.target as HTMLFormElement | null;
      if (!form) {
        return;
      }
      if (form.id === 'form-save-slot') {
        event.preventDefault();
        const input = this.root.querySelector<HTMLInputElement>('#input-save-name');
        const name = input ? input.value.trim() : '';
        this.actions.onSaveSlot(name);
        if (input) {
          input.value = '';
        }
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (event) => {
        if (this.currentModal === 'none' || !this.root.isConnected) {
          return;
        }
        if (event.key !== 'Tab') {
          return;
        }

        const focusables = this.getFocusableElements();
        if (focusables.length === 0) {
          return;
        }

        const active = document.activeElement as HTMLElement | null;
        const activeIdx = active ? focusables.indexOf(active) : -1;

        event.preventDefault();
        if (event.shiftKey) {
          const prevIdx = activeIdx <= 0 ? focusables.length - 1 : activeIdx - 1;
          focusables[prevIdx]?.focus({ preventScroll: true });
        } else {
          const nextIdx =
            activeIdx < 0 || activeIdx >= focusables.length - 1 ? 0 : activeIdx + 1;
          focusables[nextIdx]?.focus({ preventScroll: true });
        }
      });
    }
  }

  private renderNewGameModal(hud: HudSnapshot): void {
    const spec = getDeckLayoutSpec(this.draftDecks);
    const currentSeed = hud.state.config.seed;

    this.root.className = 'modal-root is-open';
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop="true">
        <div
          id="modal-new-game"
          class="modal-panel modal-panel--medium"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-new-game-title"
        >
          <div class="modal-header">
            <div>
              <h2 id="modal-new-game-title" class="modal-title">New Deal</h2>
              <p class="modal-subtitle">Configure deck scale, suit complexity, and deal rules</p>
            </div>
            <button type="button" id="btn-modal-close" class="modal-close-btn" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="modal-body">
            <div class="field-group">
              <div class="field-label-row">
                <span class="field-label">Deck Count</span>
                <span id="new-game-spec-summary" class="field-meta">
                  ${spec.columns} Columns · ${spec.stockDeals} Stock Waves · ${spec.foundationSlots} Suits · ${spec.totalCards} Cards
                </span>
              </div>
              <div class="segmented-grid segmented-grid--3">
                <button type="button" id="btn-decks-2" data-decks="2" class="choice-card ${this.draftDecks === 2 ? 'is-selected' : ''}">
                  <span class="choice-card-title">2 Decks</span>
                  <span class="choice-card-desc">Classic · 104 Cards</span>
                </button>
                <button type="button" id="btn-decks-3" data-decks="3" class="choice-card ${this.draftDecks === 3 ? 'is-selected' : ''}">
                  <span class="choice-card-title">3 Decks</span>
                  <span class="choice-card-desc">Grand · 156 Cards</span>
                </button>
                <button type="button" id="btn-decks-4" data-decks="4" class="choice-card ${this.draftDecks === 4 ? 'is-selected' : ''}">
                  <span class="choice-card-title">4 Decks</span>
                  <span class="choice-card-desc">Imperial · 208 Cards</span>
                </button>
              </div>
            </div>

            <div class="field-group">
              <div class="field-label-row">
                <span class="field-label">Suit Difficulty</span>
              </div>
              <div class="segmented-grid segmented-grid--4">
                <button type="button" id="btn-suits-1" data-suits="1" class="choice-card ${this.draftSuits === 1 ? 'is-selected' : ''}">
                  <span class="choice-card-title">1 Suit</span>
                  <span class="choice-card-desc">♠ Relaxed</span>
                </button>
                <button type="button" id="btn-suits-2" data-suits="2" class="choice-card ${this.draftSuits === 2 ? 'is-selected' : ''}">
                  <span class="choice-card-title">2 Suits</span>
                  <span class="choice-card-desc">♠♥ Classic</span>
                </button>
                <button type="button" id="btn-suits-3" data-suits="3" class="choice-card ${this.draftSuits === 3 ? 'is-selected' : ''}">
                  <span class="choice-card-title">3 Suits</span>
                  <span class="choice-card-desc">♠♥♦ Tactical</span>
                </button>
                <button type="button" id="btn-suits-4" data-suits="4" class="choice-card ${this.draftSuits === 4 ? 'is-selected' : ''}">
                  <span class="choice-card-title">4 Suits</span>
                  <span class="choice-card-desc">♠♥♦♣ Master</span>
                </button>
              </div>
            </div>

            <div class="field-group">
              <div class="toggle-list">
                <label class="toggle-row" for="toggle-winning-deal">
                  <div class="toggle-copy">
                    <span class="toggle-title">Winning Deals Only</span>
                    <span class="toggle-desc">Verify solvability before dealing so every hand has a winning path</span>
                  </div>
                  <input
                    id="toggle-winning-deal"
                    type="checkbox"
                    class="switch-input"
                    ${this.draftWinningDealOnly ? 'checked' : ''}
                  />
                </label>

                <label class="toggle-row" for="toggle-relaxed-stock">
                  <div class="toggle-copy">
                    <span class="toggle-title">Relaxed Stock Deal</span>
                    <span class="toggle-desc">Permit dealing from the stock pile even when empty columns exist</span>
                  </div>
                  <input
                    id="toggle-relaxed-stock"
                    type="checkbox"
                    class="switch-input"
                    ${this.draftRelaxedStockDeal ? 'checked' : ''}
                  />
                </label>
              </div>
            </div>

            <div class="field-group">
              <div class="field-label-row">
                <label class="field-label" for="input-seed">Deal Seed (Optional)</label>
                <span class="field-meta">Active Seed #${currentSeed}</span>
              </div>
              <input
                id="input-seed"
                type="text"
                inputmode="numeric"
                class="text-input text-input--mono"
                placeholder="Random (or enter numeric seed)"
                value="${escapeHtml(this.draftSeed)}"
              />
            </div>
          </div>

          <div class="modal-footer modal-footer--split">
            <button type="button" id="btn-replay-deal" class="btn btn--secondary">
              Replay Current Deal
            </button>
            <div class="modal-footer-actions">
              <button type="button" id="btn-new-game-cancel" class="btn btn--ghost">
                Cancel
              </button>
              <button type="button" id="btn-start-deal" class="btn btn--primary">
                Deal New Hand
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private updateNewGameDraftDom(): void {
    const spec = getDeckLayoutSpec(this.draftDecks);
    const summary = this.root.querySelector('#new-game-spec-summary');
    if (summary) {
      summary.textContent = `${spec.columns} Columns · ${spec.stockDeals} Stock Waves · ${spec.foundationSlots} Suits · ${spec.totalCards} Cards`;
    }

    for (const d of [2, 3, 4] as const) {
      const btn = this.root.querySelector(`#btn-decks-${d}`);
      btn?.classList.toggle('is-selected', this.draftDecks === d);
    }
    for (const s of [1, 2, 3, 4] as const) {
      const btn = this.root.querySelector(`#btn-suits-${s}`);
      btn?.classList.toggle('is-selected', this.draftSuits === s);
    }
  }

  private renderCustomizeDrawer(hud: HudSnapshot): void {
    const s = hud.settings;

    this.root.className = 'modal-root is-open is-drawer';
    this.root.innerHTML = `
      <div class="drawer-backdrop" data-close-backdrop="true">
        <aside
          id="customize-drawer"
          class="drawer-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="drawer-customize-title"
        >
          <div class="drawer-header">
            <div>
              <h2 id="drawer-customize-title" class="modal-title">Cardroom Atelier</h2>
              <p class="modal-subtitle">Changes apply live to the 3D table</p>
            </div>
            <button type="button" id="btn-customize-close" class="modal-close-btn" aria-label="Close Customization">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="drawer-body">
            <section class="drawer-section">
              <h3 class="drawer-section-title">Table Felt & Trim</h3>
              <div class="swatch-grid swatch-grid--5">
                ${FELT_SWATCHES.map(
                  (f) => `
                  <button
                    type="button"
                    id="swatch-felt-${f.id}"
                    data-felt-theme="${f.id}"
                    class="felt-swatch ${s.feltTheme === f.id ? 'is-selected' : ''}"
                    title="${f.label}"
                  >
                    <span class="felt-swatch-circle" style="background: radial-gradient(circle at 35% 30%, ${f.color}, #08100c); border-color: ${f.trim};"></span>
                    <span class="swatch-label">${f.label}</span>
                  </button>
                `,
                ).join('')}
              </div>
            </section>

            <section class="drawer-section">
              <h3 class="drawer-section-title">Card Faces</h3>
              <div class="swatch-grid swatch-grid--2">
                ${CARD_FACE_SWATCHES.map(
                  (f) => `
                  <button
                    type="button"
                    id="swatch-face-${f.id}"
                    data-face-theme="${f.id}"
                    class="face-swatch ${s.cardFaceTheme === f.id ? 'is-selected' : ''}"
                  >
                    <span class="face-swatch-pip" style="background:${f.previewBg}; color:${f.previewFg};">A♠</span>
                    <span class="face-swatch-text">
                      <span class="face-swatch-name">${f.label}</span>
                      <span class="face-swatch-hint">${f.hint}</span>
                    </span>
                  </button>
                `,
                ).join('')}
              </div>

              <div class="toggle-list toggle-list--compact">
                <label class="toggle-row" for="toggle-four-color">
                  <div class="toggle-copy">
                    <span class="toggle-title">Four-Color Suits</span>
                    <span class="toggle-desc">♠ Black · ♥ Red · ♦ Blue · ♣ Green</span>
                  </div>
                  <input id="toggle-four-color" type="checkbox" class="switch-input" ${s.fourColorDeck ? 'checked' : ''} />
                </label>

                <label class="toggle-row" for="toggle-dim-locked">
                  <div class="toggle-copy">
                    <span class="toggle-title">Dim Locked Cards</span>
                    <span class="toggle-desc">Subtly shade cards blocked beneath mismatched suits</span>
                  </div>
                  <input id="toggle-dim-locked" type="checkbox" class="switch-input" ${s.dimLockedCards ? 'checked' : ''} />
                </label>
              </div>
            </section>

            <section class="drawer-section">
              <h3 class="drawer-section-title">Card Backs</h3>
              <div class="swatch-grid swatch-grid--5">
                ${CARD_BACK_SWATCHES.map(
                  (b) => `
                  <button
                    type="button"
                    id="swatch-back-${b.id}"
                    data-back-theme="${b.id}"
                    class="back-swatch ${s.cardBackTheme === b.id ? 'is-selected' : ''}"
                    title="${b.label}"
                  >
                    <span class="back-swatch-card" style="background: linear-gradient(145deg, ${b.primary}, #0c1013); border-color: ${b.accent};">
                      <span class="back-swatch-emblem" style="border-color: ${b.accent};"></span>
                    </span>
                    <span class="swatch-label">${b.label}</span>
                  </button>
                `,
                ).join('')}
              </div>
            </section>

            <section class="drawer-section">
              <h3 class="drawer-section-title">Camera & Motion</h3>
              <div class="segmented-row">
                ${CAMERA_PRESETS.map(
                  (p) => `
                  <button
                    type="button"
                    id="btn-camera-${p.id}"
                    data-camera-preset="${p.id}"
                    class="seg-btn ${s.cameraPreset === p.id ? 'is-selected' : ''}"
                  >
                    ${p.label}
                  </button>
                `,
                ).join('')}
              </div>

              <div class="slider-field">
                <div class="slider-header">
                  <label class="slider-label" for="slider-camera-tilt">Camera Tilt</label>
                  <span id="customize-tilt-value" class="slider-value">${s.cameraTiltDeg}°</span>
                </div>
                <input
                  id="slider-camera-tilt"
                  type="range"
                  min="0"
                  max="28"
                  step="1"
                  value="${s.cameraTiltDeg}"
                  class="range-slider"
                />
              </div>

              <div class="field-label-row">
                <span class="slider-label">Animation Pace</span>
              </div>
              <div class="segmented-row">
                ${ANIMATION_SPEEDS.map(
                  (sp) => `
                  <button
                    type="button"
                    id="btn-speed-${sp.id}"
                    data-animation-speed="${sp.id}"
                    class="seg-btn ${s.animationSpeed === sp.id ? 'is-selected' : ''}"
                  >
                    ${sp.label}
                  </button>
                `,
                ).join('')}
              </div>
            </section>

            <section class="drawer-section">
              <h3 class="drawer-section-title">Audio & Playability</h3>

              <div class="toggle-list toggle-list--compact">
                <label class="toggle-row" for="toggle-sound-enabled">
                  <div class="toggle-copy">
                    <span class="toggle-title">Cardroom Audio</span>
                    <span class="toggle-desc">Procedural felt & card Foley cues</span>
                  </div>
                  <input id="toggle-sound-enabled" type="checkbox" class="switch-input" ${s.soundEnabled ? 'checked' : ''} />
                </label>
              </div>

              <div class="slider-field">
                <div class="slider-header">
                  <label class="slider-label" for="slider-sound-volume">Master Volume</label>
                  <span id="customize-volume-value" class="slider-value">${Math.round(s.soundVolume * 100)}%</span>
                </div>
                <input
                  id="slider-sound-volume"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value="${Math.round(s.soundVolume * 100)}"
                  class="range-slider"
                />
              </div>

              <div class="toggle-list toggle-list--compact">
                <label class="toggle-row" for="toggle-double-click-move">
                  <div class="toggle-copy">
                    <span class="toggle-title">Double-Click Auto-Move</span>
                    <span class="toggle-desc">Send selected sequence to its best destination</span>
                  </div>
                  <input id="toggle-double-click-move" type="checkbox" class="switch-input" ${s.doubleClickAutoMove ? 'checked' : ''} />
                </label>

                <label class="toggle-row" for="toggle-auto-complete-prompt">
                  <div class="toggle-copy">
                    <span class="toggle-title">Auto-Complete Prompt</span>
                    <span class="toggle-desc">Highlight Auto-Complete once all cards are revealed</span>
                  </div>
                  <input id="toggle-auto-complete-prompt" type="checkbox" class="switch-input" ${s.autoCompletePrompt ? 'checked' : ''} />
                </label>

                <label class="toggle-row" for="toggle-left-handed">
                  <div class="toggle-copy">
                    <span class="toggle-title">Left-Handed Layout</span>
                    <span class="toggle-desc">Mirror stock pile and foundation wells</span>
                  </div>
                  <input id="toggle-left-handed" type="checkbox" class="switch-input" ${s.leftHanded ? 'checked' : ''} />
                </label>
              </div>
            </section>
          </div>
        </aside>
      </div>
    `;
  }

  private syncCustomizeDrawer(hud: HudSnapshot): void {
    const s = hud.settings;

    for (const f of FELT_SWATCHES) {
      this.root
        .querySelector(`#swatch-felt-${f.id}`)
        ?.classList.toggle('is-selected', s.feltTheme === f.id);
    }
    for (const f of CARD_FACE_SWATCHES) {
      this.root
        .querySelector(`#swatch-face-${f.id}`)
        ?.classList.toggle('is-selected', s.cardFaceTheme === f.id);
    }
    for (const b of CARD_BACK_SWATCHES) {
      this.root
        .querySelector(`#swatch-back-${b.id}`)
        ?.classList.toggle('is-selected', s.cardBackTheme === b.id);
    }
    for (const p of CAMERA_PRESETS) {
      this.root
        .querySelector(`#btn-camera-${p.id}`)
        ?.classList.toggle('is-selected', s.cameraPreset === p.id);
    }
    for (const sp of ANIMATION_SPEEDS) {
      this.root
        .querySelector(`#btn-speed-${sp.id}`)
        ?.classList.toggle('is-selected', s.animationSpeed === sp.id);
    }

    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;

    const tiltSlider = this.root.querySelector<HTMLInputElement>('#slider-camera-tilt');
    if (tiltSlider && activeEl !== tiltSlider) {
      tiltSlider.value = String(s.cameraTiltDeg);
    }
    const tiltVal = this.root.querySelector('#customize-tilt-value');
    if (tiltVal) {
      tiltVal.textContent = `${s.cameraTiltDeg}°`;
    }

    const volSlider = this.root.querySelector<HTMLInputElement>('#slider-sound-volume');
    const volPct = Math.round(s.soundVolume * 100);
    if (volSlider && activeEl !== volSlider) {
      volSlider.value = String(volPct);
    }
    const volVal = this.root.querySelector('#customize-volume-value');
    if (volVal) {
      volVal.textContent = `${volPct}%`;
    }

    const setCheck = (id: string, val: boolean) => {
      const el = this.root.querySelector<HTMLInputElement>(id);
      if (el) {
        el.checked = val;
      }
    };

    setCheck('#toggle-four-color', s.fourColorDeck);
    setCheck('#toggle-dim-locked', s.dimLockedCards);
    setCheck('#toggle-sound-enabled', s.soundEnabled);
    setCheck('#toggle-double-click-move', s.doubleClickAutoMove);
    setCheck('#toggle-auto-complete-prompt', s.autoCompletePrompt);
    setCheck('#toggle-left-handed', s.leftHanded);
  }

  private renderStatsModal(hud: HudSnapshot): void {
    const { stats, state } = hud;
    const activeModeKey = getModeKey(state.config.decks, state.config.suits);
    const overallWinPct =
      stats.totalGamesPlayed > 0
        ? Math.round((stats.totalGamesWon / stats.totalGamesPlayed) * 100)
        : 0;

    const rows: string[] = [];
    for (const decks of [2, 3, 4] as const) {
      for (const suits of [1, 2, 3, 4] as const) {
        const key = getModeKey(decks, suits);
        const m = stats.byMode[key];
        const played = m?.gamesPlayed ?? 0;
        const won = m?.gamesWon ?? 0;
        const pct = played > 0 ? `${Math.round((won / played) * 100)}%` : '—';
        const bestTime =
          m?.bestTimeSec !== null && m?.bestTimeSec !== undefined
            ? formatTime(m.bestTimeSec)
            : '—';
        const fewestMoves =
          m?.fewestMoves !== null && m?.fewestMoves !== undefined
            ? String(m.fewestMoves)
            : '—';
        const highScore =
          m?.highScore !== null && m?.highScore !== undefined ? String(m.highScore) : '—';
        const isCurrent = key === activeModeKey;

        rows.push(`
          <tr class="${isCurrent ? 'is-current-mode' : ''} ${played === 0 ? 'is-unplayed' : ''}">
            <td class="stats-mode-cell">
              <span>${decks}D · ${suits}S</span>
              ${isCurrent ? '<span class="mode-tag">Active</span>' : ''}
            </td>
            <td class="mono-cell">${played}</td>
            <td class="mono-cell">${won}</td>
            <td class="mono-cell">${pct}</td>
            <td class="mono-cell">${bestTime}</td>
            <td class="mono-cell">${fewestMoves}</td>
            <td class="mono-cell">${highScore}</td>
          </tr>
        `);
      }
    }

    this.root.className = 'modal-root is-open';
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop="true">
        <div
          id="modal-stats"
          class="modal-panel modal-panel--wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-stats-title"
        >
          <div class="modal-header">
            <div>
              <h2 id="modal-stats-title" class="modal-title">Cardroom Ledger</h2>
              <p class="modal-subtitle">Win streaks & performance across 2, 3, and 4 deck modes</p>
            </div>
            <button type="button" id="btn-modal-close" class="modal-close-btn" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="modal-body">
            <div class="streak-hero-row">
              <div class="streak-hero-card ${stats.currentWinStreak > 0 ? 'is-lit' : ''}">
                <div class="streak-hero-icon">${FLAME_ICON}</div>
                <div>
                  <div class="streak-hero-label">Current Win Streak</div>
                  <div id="stats-current-streak" class="streak-hero-value">${stats.currentWinStreak}</div>
                </div>
              </div>

              <div class="streak-hero-card">
                <div class="streak-hero-icon">${TROPHY_ICON}</div>
                <div>
                  <div class="streak-hero-label">Best Win Streak</div>
                  <div id="stats-best-streak" class="streak-hero-value">${stats.bestWinStreak}</div>
                </div>
              </div>
            </div>

            <div class="summary-strip">
              <div class="summary-stat">
                <span class="summary-stat-label">Hands Played</span>
                <span id="stats-total-played" class="summary-stat-value">${stats.totalGamesPlayed}</span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-label">Hands Won</span>
                <span id="stats-total-won" class="summary-stat-value">${stats.totalGamesWon}</span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-label">Win Rate</span>
                <span id="stats-win-rate" class="summary-stat-value">${overallWinPct}%</span>
              </div>
            </div>

            <div class="stats-table-wrap">
              <table class="stats-table">
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Played</th>
                    <th>Won</th>
                    <th>Win %</th>
                    <th>Best Time</th>
                    <th>Best Moves</th>
                    <th>High Score</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="modal-footer modal-footer--split">
            <div class="reset-stats-zone">
              ${
                this.confirmResetStats
                  ? `
                    <span class="reset-confirm-label">Clear all streaks & records?</span>
                    <button type="button" id="btn-reset-stats-confirm" class="btn btn--danger">
                      Confirm Reset
                    </button>
                    <button type="button" id="btn-reset-stats-cancel" class="btn btn--ghost">
                      Keep
                    </button>
                  `
                  : `
                    <button type="button" id="btn-reset-stats" class="btn btn--ghost btn--danger-text">
                      Reset Statistics
                    </button>
                  `
              }
            </div>
            <button type="button" id="btn-stats-close" class="btn btn--primary">
              Done
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderSavesModal(hud: HudSnapshot, ui: UIStateSnapshot): void {
    const defaultPlaceholder = `${hud.state.config.decks}D · ${hud.state.config.suits}S (Move ${hud.state.moves})`;

    this.root.className = 'modal-root is-open';
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop="true">
        <div
          id="modal-saves"
          class="modal-panel modal-panel--medium"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-saves-title"
        >
          <div class="modal-header">
            <div>
              <h2 id="modal-saves-title" class="modal-title">Saved Hands</h2>
              <p class="modal-subtitle">Bookmark board positions to revisit later in browser storage</p>
            </div>
            <button type="button" id="btn-modal-close" class="modal-close-btn" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="modal-body">
            <form id="form-save-slot" class="save-form">
              <input
                id="input-save-name"
                type="text"
                maxlength="60"
                class="text-input"
                placeholder="${escapeHtml(defaultPlaceholder)}"
              />
              <button type="submit" id="btn-save-slot" class="btn btn--primary">
                Save Current Hand
              </button>
            </form>

            <div id="saved-slots-list" class="saved-slots-list">
              ${this.buildSavedSlotsHtml(ui)}
            </div>
          </div>

          <div class="modal-footer modal-footer--end">
            <button type="button" id="btn-saves-close" class="btn btn--ghost">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private syncSavesList(ui: UIStateSnapshot): void {
    const listEl = this.root.querySelector('#saved-slots-list');
    if (listEl) {
      listEl.innerHTML = this.buildSavedSlotsHtml(ui);
    }
  }

  private buildSavedSlotsHtml(ui: UIStateSnapshot): string {
    if (ui.savedSlots.length === 0) {
      return `
        <div class="empty-slots-state">
          No saved hands yet. Save any active position above to resume it later.
        </div>
      `;
    }

    return ui.savedSlots
      .map((slot) => {
        const { config, elapsedSeconds, moves, score } = slot.state;
        const suitWord = config.suits === 1 ? 'Suit' : 'Suits';
        return `
          <div class="saved-slot-item" data-slot-id="${escapeHtml(slot.id)}">
            <div class="saved-slot-info">
              <div class="saved-slot-name">${escapeHtml(slot.name)}</div>
              <div class="saved-slot-meta">
                <span>${config.decks} Decks · ${config.suits} ${suitWord}</span>
                <span>·</span>
                <span class="mono-inline">${formatTime(elapsedSeconds)}</span>
                <span>·</span>
                <span class="mono-inline">${moves} moves</span>
                <span>·</span>
                <span class="mono-inline">${score} pts</span>
              </div>
              <div class="saved-slot-date">${escapeHtml(formatTimestamp(slot.savedAt))}</div>
            </div>
            <div class="saved-slot-actions">
              <button
                type="button"
                id="btn-load-slot-${escapeHtml(slot.id)}"
                data-load-slot-id="${escapeHtml(slot.id)}"
                class="btn btn--secondary btn--sm"
              >
                Load
              </button>
              <button
                type="button"
                id="btn-delete-slot-${escapeHtml(slot.id)}"
                data-delete-slot-id="${escapeHtml(slot.id)}"
                class="btn btn--icon-danger"
                title="Delete saved hand"
                aria-label="Delete ${escapeHtml(slot.name)}"
              >
                ${TRASH_ICON}
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  private renderAbandonConfirmModal(ui: UIStateSnapshot): void {
    const streak = ui.pendingAbandon?.currentStreak ?? 0;

    this.root.className = 'modal-root is-open';
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop="true">
        <div
          id="modal-abandon-confirm"
          class="modal-panel modal-panel--compact"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="modal-abandon-title"
        >
          <div class="modal-header">
            <div>
              <h2 id="modal-abandon-title" class="modal-title">End Current Win Streak?</h2>
              <p class="modal-subtitle">You have an active streak of ${streak} consecutive ${streak === 1 ? 'win' : 'wins'}</p>
            </div>
            <button type="button" id="btn-modal-close" class="modal-close-btn" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="modal-body">
            <div class="warning-callout">
              <span class="warning-callout-icon">${FLAME_ICON}</span>
              <p>
                Dealing a new hand now will abandon your current game and reset your
                <strong>Win Streak (${streak})</strong> back to 0.
              </p>
            </div>
          </div>

          <div class="modal-footer modal-footer--stack">
            <button type="button" id="btn-abandon-start-new" class="btn btn--danger">
              Start New Deal (Resets Streak)
            </button>
            <button type="button" id="btn-abandon-replay" class="btn btn--secondary">
              Replay Current Deal
            </button>
            <button type="button" id="btn-abandon-cancel" class="btn btn--ghost">
              Keep Playing
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderVictoryModal(hud: HudSnapshot): void {
    const { state, stats } = hud;
    const modeKey = getModeKey(state.config.decks, state.config.suits);
    const modeStats = stats.byMode[modeKey];
    const suitWord = state.config.suits === 1 ? 'Suit' : 'Suits';
    const dealType = state.config.winningDealOnly ? 'Winning Deal' : 'Open Deal';

    const isBestStreak =
      stats.currentWinStreak > 0 && stats.currentWinStreak >= stats.bestWinStreak;
    const isBestTime =
      modeStats?.bestTimeSec !== null &&
      modeStats?.bestTimeSec !== undefined &&
      state.elapsedSeconds <= modeStats.bestTimeSec;
    const isFewestMoves =
      modeStats?.fewestMoves !== null &&
      modeStats?.fewestMoves !== undefined &&
      state.moves <= modeStats.fewestMoves;
    const isHighScore =
      modeStats?.highScore !== null &&
      modeStats?.highScore !== undefined &&
      state.score >= modeStats.highScore;

    this.root.className = 'modal-root is-open';
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop="true">
        <div
          id="modal-victory"
          class="modal-panel modal-panel--medium modal-panel--victory"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-victory-title"
        >
          <div class="modal-header modal-header--centered">
            <div class="victory-crest">${TROPHY_ICON}</div>
            <h2 id="modal-victory-title" class="modal-title victory-title">Hand Complete</h2>
            <p class="modal-subtitle">
              ${state.config.decks} Decks · ${state.config.suits} ${suitWord} · ${dealType}
            </p>
            <button type="button" id="btn-modal-close" class="modal-close-btn modal-close-btn--corner" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="modal-body">
            <div class="victory-metrics">
              <div class="victory-metric-box">
                <span class="victory-metric-label">Time</span>
                <span id="victory-time" class="victory-metric-value">${formatTime(state.elapsedSeconds)}</span>
                ${isBestTime ? '<span class="best-badge">New Best</span>' : ''}
              </div>
              <div class="victory-metric-box">
                <span class="victory-metric-label">Moves</span>
                <span id="victory-moves" class="victory-metric-value">${state.moves}</span>
                ${isFewestMoves ? '<span class="best-badge">Fewest</span>' : ''}
              </div>
              <div class="victory-metric-box">
                <span class="victory-metric-label">Score</span>
                <span id="victory-score" class="victory-metric-value">${state.score}</span>
                ${isHighScore ? '<span class="best-badge">High Score</span>' : ''}
              </div>
            </div>

            <div class="victory-streak-banner">
              <div class="victory-streak-left">
                <span class="victory-streak-icon">${FLAME_ICON}</span>
                <div>
                  <div class="victory-streak-title">
                    Win Streak: <strong id="victory-streak">${stats.currentWinStreak}</strong>
                  </div>
                  <div class="victory-streak-sub">
                    All-Time Best Streak: ${stats.bestWinStreak}
                  </div>
                </div>
              </div>
              ${isBestStreak ? '<span class="best-badge best-badge--gold">Best Streak</span>' : ''}
            </div>
          </div>

          <div class="modal-footer modal-footer--split">
            <button type="button" id="btn-victory-stats" class="btn btn--secondary">
              View Stats
            </button>
            <div class="modal-footer-actions">
              <button type="button" id="btn-victory-close" class="btn btn--ghost">
                Inspect Table
              </button>
              <button type="button" id="btn-victory-next-hand" class="btn btn--primary">
                Deal Next Hand
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderHelpModal(): void {
    this.root.className = 'modal-root is-open';
    this.root.innerHTML = `
      <div class="modal-backdrop" data-close-backdrop="true">
        <div
          id="modal-help"
          class="modal-panel modal-panel--wide"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-help-title"
        >
          <div class="modal-header">
            <div>
              <h2 id="modal-help-title" class="modal-title">Cardroom Rules & Shortcuts</h2>
              <p class="modal-subtitle">Master Spider Solitaire across 2, 3, and 4 deck tables</p>
            </div>
            <button type="button" id="btn-modal-close" class="modal-close-btn" aria-label="Close">
              ${CLOSE_ICON}
            </button>
          </div>

          <div class="modal-body help-body">
            <div class="help-grid">
              <section class="help-section">
                <h3>Core Rules</h3>
                <ul class="help-list">
                  <li><strong>Tableau Building:</strong> Place any card onto a card one rank higher, regardless of suit (e.g., 7♥ onto 8♠).</li>
                  <li><strong>Moving Stacks:</strong> Only descending sequences of the <em>same suit</em> can be picked up and moved together.</li>
                  <li><strong>Completing a Suit:</strong> Build an unbroken K→A sequence of one suit to send it automatically to a foundation well.</li>
                  <li><strong>Empty Columns:</strong> Any single card or valid same-suit run may fill an open column—use them to untangle buried cards.</li>
                </ul>
              </section>

              <section class="help-section">
                <h3>Multi-Deck & Deal Modes</h3>
                <ul class="help-list">
                  <li><strong>2 Decks (104):</strong> 10 columns, 5 stock waves, 8 suits to clear.</li>
                  <li><strong>3 Decks (156):</strong> 12 columns, 7 stock waves, 12 suits to clear.</li>
                  <li><strong>4 Decks (208):</strong> 16 columns, 7 stock waves, 16 suits to clear.</li>
                  <li><strong>Winning Deals Only:</strong> Uses verified solvable layouts so skillful play is always rewarded.</li>
                  <li><strong>Relaxed Stock:</strong> Lets you deal from the stock pile even while columns are empty.</li>
                </ul>
              </section>
            </div>

            <section class="help-section">
              <h3>Smart Controls &amp; Hints</h3>
              <p class="help-paragraph">
                Play by mouse, touch, or <strong>100% by keyboard</strong>. Use <strong>Arrow keys</strong>
                or direct column keys <strong>1–0</strong> (plus <strong>Shift+1–6</strong> or <strong>- / =</strong>
                on 3–4 deck tables) to step across columns and stacked runs, <strong>Space / Enter</strong> to pick up
                or place cards, and <strong>Tab</strong> to cycle multiple targets. Pressing <strong>Hint (H)</strong>
                animates top plays—press <strong>Enter</strong> to execute the shown hint immediately.
              </p>
            </section>

            <section class="help-section">
              <h3>Keyboard Shortcuts</h3>
              <div class="shortcuts-grid">
                <div class="shortcut-item"><kbd>← → ↑ ↓</kbd><span>Navigate Columns &amp; Stacks</span></div>
                <div class="shortcut-item"><kbd>1–0</kbd><span>Column Jump / Target (⇧1–6 extra)</span></div>
                <div class="shortcut-item"><kbd>Space / Enter</kbd><span>Select / Place Card</span></div>
                <div class="shortcut-item"><kbd>Tab</kbd><span>Cycle Multiple Targets</span></div>
                <div class="shortcut-item"><kbd>H · Enter</kbd><span>Cycle Hint · Play Active Hint</span></div>
                <div class="shortcut-item"><kbd>A</kbd><span>Auto-Complete Suit Run</span></div>
                <div class="shortcut-item"><kbd>Z</kbd><span>Undo Last Move</span></div>
                <div class="shortcut-item"><kbd>D</kbd><span>Deal Stock Wave</span></div>
                <div class="shortcut-item"><kbd>N</kbd><span>New Deal Menu</span></div>
                <div class="shortcut-item"><kbd>B</kbd><span>Saved Hands</span></div>
                <div class="shortcut-item"><kbd>S</kbd><span>Stats &amp; Win Streak</span></div>
                <div class="shortcut-item"><kbd>C</kbd><span>Customize Table</span></div>
                <div class="shortcut-item"><kbd>M</kbd><span>Mute / Unmute Audio</span></div>
                <div class="shortcut-item"><kbd>Esc</kbd><span>Cancel Selection / Close</span></div>
                <div class="shortcut-item"><kbd>?</kbd><span>Rules &amp; Shortcuts</span></div>
              </div>
            </section>
          </div>

          <div class="modal-footer modal-footer--end">
            <button type="button" id="btn-help-close" class="btn btn--primary">
              Back to Table
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private getFocusableElements(): HTMLElement[] {
    const candidates = Array.from(
      this.root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    return candidates.filter(
      (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
    );
  }

  private focusInitialModalElement(modal: ModalKind, hud: HudSnapshot): void {
    let selector = '';
    switch (modal) {
      case 'new-game':
        selector = `#btn-decks-${this.draftDecks}`;
        break;
      case 'customize':
        selector = `#swatch-felt-${hud.settings.feltTheme}`;
        break;
      case 'stats':
        selector = '#btn-stats-close';
        break;
      case 'saves':
        selector = '#input-save-name';
        break;
      case 'abandon-confirm':
        selector = '#btn-abandon-cancel';
        break;
      case 'victory':
        selector = '#btn-victory-next-hand';
        break;
      case 'help':
        selector = '#btn-help-close';
        break;
    }

    const target =
      (selector ? this.root.querySelector<HTMLElement>(selector) : null) ??
      this.getFocusableElements()[0] ??
      null;
    target?.focus({ preventScroll: true });
  }

  private restoreFocusFromModal(): void {
    const prev = this.previousFocusEl;
    this.previousFocusEl = null;

    if (typeof document !== 'undefined') {
      const stage = document.getElementById('stage-container');
      if (stage && prev?.closest('#hud-root')) {
        stage.focus({ preventScroll: true });
        return;
      }
      if (prev && prev.isConnected) {
        prev.focus({ preventScroll: true });
        return;
      }
      stage?.focus({ preventScroll: true });
    }
  }

  private parseDraftSeed(): number | undefined {
    const trimmed = this.draftSeed.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return undefined;
    }
    return Math.abs(Math.floor(parsed));
  }

  private requestModal(modal: ModalKind): void {
    this.onModalChange?.(modal);
    this.onModalRequest?.(modal);

    if (modal === 'none') {
      this.dispatchCustomEvent('spider:close-modal');
    }
    this.dispatchCustomEvent('spider:open-modal', { modal });
  }

  private dispatchCustomEvent<T>(name: string, detail?: T): void {
    const event = new CustomEvent(name, { bubbles: true, detail });
    this.root.dispatchEvent(event);
    if (!this.root.isConnected && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }
}
