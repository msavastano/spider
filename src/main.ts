import { SoundEngine } from './audio/soundEngine';
import { generateDeal, requestWinningSeedAsync } from './engine/dealGenerator';
import { getMeaningfulHints } from './engine/hint';
import {
  canDealStock,
  dealFromSeed,
  dealFromStock,
  executeMove,
  getAutoCompleteStep,
  getMovableStartIndex,
  getValidDestinations,
  isAutoCompletable,
  isMovableRun,
  undoMove,
} from './engine/rules';
import {
  getModeKey,
  type Card,
  type GameConfig,
  type GameState,
  type HintMove,
  type TargetDestination,
  type UserSettings,
} from './engine/types';
import { VERIFIED_WINNING_SEEDS } from './engine/winningSeeds';
import { SpiderScene } from './render/spiderScene';
import { getAnimationSpeedMultiplier } from './render/themes';
import {
  DEFAULT_STATS,
  loadActiveGame,
  loadSavedSlots,
  loadSettings,
  loadStats,
  loadUsedWinningSeeds,
  markWinningSeedUsed,
  recordGameAbandoned,
  recordGameStarted,
  recordGameWon,
  saveActiveGame,
  saveSettings,
  saveSlot,
  saveStats,
  deleteSavedSlot,
} from './storage/persistence';
import { HudView } from './ui/hud';
import { ModalManager } from './ui/modals';
import type {
  AppActions,
  HudSnapshot,
  ModalKind,
  UIStateSnapshot,
} from './ui/uiTypes';

const SUIT_GLYPHS: Record<Card['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const RANK_GLYPHS = [
  '',
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

function formatCardLabel(card: Card): string {
  return `${RANK_GLYPHS[card.rank]}${SUIT_GLYPHS[card.suit]}`;
}

function formatColLabel(col: number): string {
  if (col === 9) return 'Col 10 (0)';
  if (col >= 10) return `Col ${col + 1} (⇧${col - 9})`;
  return `Col ${col + 1}`;
}

function parseColumnKey(event: KeyboardEvent, numCols: number): number | null {
  let col: number | null = null;
  if (!event.shiftKey) {
    if (event.key >= '1' && event.key <= '9') {
      col = Number(event.key) - 1;
    } else if (event.key === '0') {
      col = 9;
    } else if (event.key === '-') {
      col = 10;
    } else if (event.key === '=') {
      col = 11;
    }
  } else {
    if (event.code === 'Digit1' || event.key === '!') col = 10;
    else if (event.code === 'Digit2' || event.key === '@') col = 11;
    else if (event.code === 'Digit3' || event.key === '#') col = 12;
    else if (event.code === 'Digit4' || event.key === '$') col = 13;
    else if (event.code === 'Digit5' || event.key === '%') col = 14;
    else if (event.code === 'Digit6' || event.key === '^') col = 15;
  }

  return col !== null && col >= 0 && col < numCols ? col : null;
}

function initApp(): void {
  const stageContainer = document.getElementById('stage-container');
  const hudRoot = document.getElementById('hud-root');
  const modalRoot = document.getElementById('modal-root');

  if (!stageContainer || !hudRoot || !modalRoot) {
    throw new Error('Spider Solitaire mount containers missing from index.html');
  }

  stageContainer.tabIndex = -1;

  let settings: UserSettings = loadSettings();
  let stats = loadStats();
  let savedSlots = loadSavedSlots();

  const sound = new SoundEngine();
  sound.applySettings(settings);

  const unlockAudio = () => {
    sound.unlock();
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });

  const createInitialGame = (): GameState => {
    const restored = loadActiveGame();
    if (restored && !restored.isWon) {
      return restored;
    }

    const baseConfig: GameConfig = restored
      ? {
          decks: restored.config.decks,
          suits: restored.config.suits,
          winningDealOnly: restored.config.winningDealOnly,
          relaxedStockDeal: restored.config.relaxedStockDeal,
        }
      : {
          decks: 2,
          suits: 2,
          winningDealOnly: true,
          relaxedStockDeal: false,
        };

    const modeKey = getModeKey(baseConfig.decks, baseConfig.suits);
    const used = new Set(loadUsedWinningSeeds(modeKey));
    const fresh = generateDeal(baseConfig, used);
    if (fresh.config.winningDealOnly) {
      markWinningSeedUsed(modeKey, fresh.config.seed);
    }
    saveActiveGame(fresh);
    return fresh;
  };

  let state: GameState = createInitialGame();

  const uiState: UIStateSnapshot = {
    activeModal: 'none',
    pendingAbandon: null,
    savedSlots,
    toastMessage: null,
  };

  let cachedHints: HintMove[] | null = null;
  let hintCycleIndex = -1;
  let countedHintForCurrentPosition = false;
  let activeHintToast: string | null = null;

  let selectedCard: {
    col: number;
    index: number;
    destinations: TargetDestination[];
  } | null = null;

  let keyboardCursorVisible = false;
  let keyboardCursorCol = 0;
  let keyboardCursorIndex: number | null = null;
  let focusedDestCol: number | null = null;

  let findingWinningDeal = false;
  let dealRequestSerial = 0;
  let lastMovedStackSize = 1;
  let dealSoundIndex = 0;
  let isPaused = false;
  let autoCompleteTimer: number | null = null;
  let victoryModalTimer: number | null = null;
  let timerSaveCounter = 0;

  const stopAutoComplete = () => {
    if (autoCompleteTimer !== null) {
      window.clearTimeout(autoCompleteTimer);
      autoCompleteTimer = null;
    }
  };

  const clearVictoryTimer = () => {
    if (victoryModalTimer !== null) {
      window.clearTimeout(victoryModalTimer);
      victoryModalTimer = null;
    }
  };

  const buildHudSnapshot = (): HudSnapshot => {
    const hintCounter =
      cachedHints && cachedHints.length > 0 && hintCycleIndex >= 0
        ? {
            index: hintCycleIndex + 1,
            total: cachedHints.length,
            label: `${hintCycleIndex + 1}/${cachedHints.length}`,
          }
        : null;

    return {
      state,
      stats,
      settings,
      canUndo: state.undoStack.length > 0 && autoCompleteTimer === null,
      canDealStock: canDealStock(state) && autoCompleteTimer === null,
      canAutoComplete:
        settings.autoCompletePrompt &&
        isAutoCompletable(state) &&
        autoCompleteTimer === null,
      hintCounter,
      findingWinningDeal,
    };
  };

  let hud!: HudView;
  let modals!: ModalManager;
  let scene!: SpiderScene;

  const getMovableCursorDefaultIndex = (colIdx: number): number | null => {
    const col = state.columns[colIdx];
    if (!col || col.length === 0) return null;
    return getMovableStartIndex(col);
  };

  const syncKeyboardCursor = () => {
    if (state.columns.length === 0) {
      keyboardCursorVisible = false;
      keyboardCursorCol = 0;
      keyboardCursorIndex = null;
      scene.setKeyboardCursor(null);
      return;
    }

    if (keyboardCursorCol < 0 || keyboardCursorCol >= state.columns.length) {
      keyboardCursorCol = Math.max(
        0,
        Math.min(state.columns.length - 1, keyboardCursorCol),
      );
      keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
    }

    const col = state.columns[keyboardCursorCol];
    if (!col || col.length === 0) {
      keyboardCursorIndex = null;
    } else {
      const movableStart = getMovableStartIndex(col);
      if (
        keyboardCursorIndex === null ||
        keyboardCursorIndex < movableStart ||
        keyboardCursorIndex >= col.length
      ) {
        keyboardCursorIndex = movableStart;
      }
    }

    if (!keyboardCursorVisible) {
      scene.setKeyboardCursor(null);
      return;
    }

    scene.setKeyboardCursor({
      col: keyboardCursorCol,
      index: keyboardCursorIndex,
    });
  };

  const renderUi = () => {
    const hudSnap = buildHudSnapshot();
    hud.render(hudSnap, activeHintToast);
    modals.render(hudSnap, uiState);
  };

  const clearHintState = (render = true) => {
    cachedHints = null;
    hintCycleIndex = -1;
    activeHintToast = null;
    scene.clearHint();
    if (render) {
      renderUi();
    }
  };

  const clearSelectionState = (render = true) => {
    selectedCard = null;
    focusedDestCol = null;
    scene.showSelectionTargets(null);
    syncKeyboardCursor();
    if (render) {
      renderUi();
    }
  };

  const openModal = (kind: ModalKind) => {
    if (kind !== 'abandon-confirm') {
      uiState.pendingAbandon = null;
    }
    uiState.activeModal = kind;
    renderUi();
  };

  const handleModalChange = (kind: ModalKind) => {
    uiState.activeModal = kind;
    if (kind === 'none') {
      uiState.pendingAbandon = null;
    }
    renderUi();
  };

  const handleVictoryReached = (wonState: GameState) => {
    stopAutoComplete();
    clearVictoryTimer();
    keyboardCursorVisible = false;
    keyboardCursorIndex = null;
    focusedDestCol = null;
    scene.setKeyboardCursor(null);
    stats = recordGameWon(stats, wonState);
    saveActiveGame(wonState);
    sound.playVictory();
    scene.startWinCelebration(wonState);
    renderUi();

    victoryModalTimer = window.setTimeout(() => {
      victoryModalTimer = null;
      if (state.isWon) {
        openModal('victory');
      }
    }, 900);
  };

  const commitStateTransition = (
    prevState: GameState,
    nextState: GameState,
    sceneAction: Parameters<SpiderScene['syncState']>[1],
    stackSize = 1,
  ) => {
    if (!prevState.hasStarted && nextState.hasStarted) {
      stats = recordGameStarted(stats, nextState.config);
    }

    state = nextState;
    lastMovedStackSize = stackSize;
    cachedHints = null;
    hintCycleIndex = -1;
    countedHintForCurrentPosition = false;
    activeHintToast = null;
    selectedCard = null;
    focusedDestCol = null;
    scene.clearHint();
    scene.showSelectionTargets(null);

    saveActiveGame(state);
    scene.syncState(state, sceneAction);
    keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
    syncKeyboardCursor();

    if (!prevState.isWon && state.isWon) {
      handleVictoryReached(state);
      return;
    }

    renderUi();
  };

  const performMove = (fromCol: number, fromIndex: number, toCol: number): boolean => {
    if (autoCompleteTimer !== null) return false;
    const prevState = state;
    const result = executeMove(state, fromCol, fromIndex, toCol);
    if (!result) {
      scene.pulseLockedCard(fromCol, fromIndex);
      return false;
    }

    const stackSize = result.action.type === 'move' ? result.action.cardIds.length : 1;
    commitStateTransition(prevState, result.nextState, result.action, stackSize);
    return true;
  };

  const performAutoCompleteMove = (
    fromCol: number,
    fromIndex: number,
    toCol: number,
  ): boolean => {
    const prevState = state;
    const result = executeMove(state, fromCol, fromIndex, toCol);
    if (!result) return false;

    const stackSize = result.action.type === 'move' ? result.action.cardIds.length : 1;
    commitStateTransition(prevState, result.nextState, result.action, stackSize);
    return true;
  };

  const startDealFromConfig = async (
    config: GameConfig,
    forceAbandonStreak = false,
  ): Promise<void> => {
    if (
      !forceAbandonStreak &&
      stats.currentWinStreak > 0 &&
      state.moves > 0 &&
      !state.isWon
    ) {
      uiState.pendingAbandon = {
        config: { ...config },
        currentStreak: stats.currentWinStreak,
      };
      openModal('abandon-confirm');
      return;
    }

    if (forceAbandonStreak && stats.currentWinStreak > 0 && state.moves > 0 && !state.isWon) {
      stats = recordGameAbandoned(stats);
    }

    stopAutoComplete();
    clearVictoryTimer();
    scene.stopWinCelebration();
    clearHintState(false);
    clearSelectionState(false);

    const requestId = ++dealRequestSerial;
    const modeKey = getModeKey(config.decks, config.suits);
    const usedList = loadUsedWinningSeeds(modeKey);
    const usedSet = new Set(usedList);
    const bank = VERIFIED_WINNING_SEEDS[modeKey] ?? [];
    const hasUnusedBankSeed = bank.some((seed) => !usedSet.has(seed));

    let nextDeal: GameState;
    if (config.winningDealOnly && config.seed === undefined && !hasUnusedBankSeed) {
      findingWinningDeal = true;
      renderUi();
      const freshSeed = await requestWinningSeedAsync(
        config.decks,
        config.suits,
        usedList,
      );
      if (requestId !== dealRequestSerial) {
        return;
      }
      findingWinningDeal = false;
      nextDeal = dealFromSeed({
        decks: config.decks,
        suits: config.suits,
        winningDealOnly: config.winningDealOnly,
        relaxedStockDeal: config.relaxedStockDeal,
        seed: freshSeed,
      });
    } else {
      nextDeal = generateDeal(config, usedSet);
    }

    if (nextDeal.config.winningDealOnly) {
      markWinningSeedUsed(modeKey, nextDeal.config.seed);
    }

    state = nextDeal;
    cachedHints = null;
    hintCycleIndex = -1;
    countedHintForCurrentPosition = false;
    activeHintToast = null;
    selectedCard = null;
    focusedDestCol = null;
    dealSoundIndex = 0;

    saveActiveGame(state);
    scene.syncState(state, 'deal-new');
    keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
    syncKeyboardCursor();
    renderUi();

    const suitWord = state.config.suits === 1 ? 'Suit' : 'Suits';
    const dealTag = state.config.winningDealOnly ? 'Winning Deal' : 'Open Deal';
    hud.showToast(
      `Dealt ${state.config.decks} Decks · ${state.config.suits} ${suitWord} (${dealTag})`,
      2600,
    );
  };

  const actions: AppActions = {
    onNewGame: (config, forceAbandonStreak) => {
      void startDealFromConfig(config, forceAbandonStreak);
    },

    onReplayDeal: () => {
      stopAutoComplete();
      clearVictoryTimer();
      scene.stopWinCelebration();
      clearHintState(false);
      clearSelectionState(false);

      state = dealFromSeed({ ...state.config });
      cachedHints = null;
      hintCycleIndex = -1;
      countedHintForCurrentPosition = false;
      activeHintToast = null;
      selectedCard = null;
      focusedDestCol = null;
      dealSoundIndex = 0;

      saveActiveGame(state);
      scene.syncState(state, 'deal-new');
      keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
      syncKeyboardCursor();
      renderUi();
      hud.showToast(`Replaying Deal #${state.config.seed}`, 2400);
    },

    onUndo: () => {
      if (autoCompleteTimer !== null || state.isWon) return;
      const prevState = state;
      const result = undoMove(state);
      if (!result) {
        sound.playBlocked();
        return;
      }
      commitStateTransition(prevState, result.nextState, 'undo', 1);
    },

    onHint: () => {
      if (autoCompleteTimer !== null || state.isWon) return;

      if (selectedCard) {
        clearSelectionState(false);
      }

      if (cachedHints === null) {
        cachedHints = getMeaningfulHints(state);
        hintCycleIndex = -1;
      }

      if (cachedHints.length === 0) {
        sound.playBlocked();
        scene.clearHint();
        activeHintToast = null;
        renderUi();
        hud.showToast(
          'No productive moves remaining — try Undo or Deal New Hand',
          3600,
        );
        return;
      }

      hintCycleIndex = (hintCycleIndex + 1) % cachedHints.length;
      if (!countedHintForCurrentPosition) {
        countedHintForCurrentPosition = true;
        state = {
          ...state,
          hintsUsed: state.hintsUsed + 1,
        };
        saveActiveGame(state);
      }

      const hint = cachedHints[hintCycleIndex];
      scene.showHint(hint, hintCycleIndex, cachedHints.length);
      sound.playHint();
      activeHintToast = `Hint ${hintCycleIndex + 1} of ${cachedHints.length}: ${hint.reason} · Enter to play`;
      renderUi();
    },

    onDealStock: () => {
      if (autoCompleteTimer !== null || state.isWon) return;
      if (state.stock.length === 0) {
        sound.playBlocked();
        hud.showToast('No stock waves remaining', 2200);
        return;
      }
      if (!canDealStock(state)) {
        sound.playBlocked();
        hud.showToast(
          'Fill all empty columns before dealing from stock (or enable Relaxed Stock)',
          3200,
        );
        return;
      }

      const prevState = state;
      const result = dealFromStock(state);
      if (!result) return;
      dealSoundIndex = 0;
      commitStateTransition(prevState, result.nextState, result.action, 1);
    },

    onAutoComplete: () => {
      if (autoCompleteTimer !== null || !isAutoCompletable(state)) return;

      clearHintState(false);
      clearSelectionState(false);

      const stepLoop = () => {
        if (state.isWon) {
          stopAutoComplete();
          renderUi();
          return;
        }
        const step = getAutoCompleteStep(state);
        if (!step) {
          stopAutoComplete();
          renderUi();
          return;
        }
        const moved = performAutoCompleteMove(step.fromCol, step.fromIndex, step.toCol);
        if (!moved || state.isWon) {
          stopAutoComplete();
          renderUi();
          return;
        }

        const speedMult = getAnimationSpeedMultiplier(settings.animationSpeed);
        const delayMs = Math.max(95, Math.round(175 / speedMult));
        autoCompleteTimer = window.setTimeout(stepLoop, delayMs);
      };

      renderUi();
      stepLoop();
    },

    onUpdateSettings: (partial) => {
      settings = {
        ...settings,
        ...partial,
      };
      saveSettings(settings);
      sound.applySettings(settings);
      scene.applySettings(settings);
      renderUi();
    },

    onResetStats: () => {
      stats = {
        ...DEFAULT_STATS,
        byMode: {},
      };
      saveStats(stats);
      renderUi();
      hud.showToast('Cardroom statistics cleared', 2400);
    },

    onSaveSlot: (name) => {
      savedSlots = saveSlot(name, state);
      uiState.savedSlots = savedSlots;
      renderUi();
      hud.showToast('Hand saved to browser cache', 2400);
    },

    onLoadSlot: (id) => {
      const slot = savedSlots.find((s) => s.id === id);
      if (!slot) return;

      stopAutoComplete();
      clearVictoryTimer();
      scene.stopWinCelebration();

      state = structuredClone(slot.state);
      cachedHints = null;
      hintCycleIndex = -1;
      countedHintForCurrentPosition = false;
      activeHintToast = null;
      selectedCard = null;
      focusedDestCol = null;
      scene.clearHint();
      scene.showSelectionTargets(null);

      saveActiveGame(state);
      scene.syncState(state, 'restore');
      keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
      syncKeyboardCursor();
      renderUi();
      hud.showToast(`Resumed "${slot.name}"`, 2500);
    },

    onDeleteSlot: (id) => {
      savedSlots = deleteSavedSlot(id);
      uiState.savedSlots = savedSlots;
      renderUi();
    },

    onPauseToggle: (paused) => {
      isPaused = paused;
    },
  };

  hud = new HudView(hudRoot, actions, openModal);
  modals = new ModalManager(modalRoot, actions, handleModalChange);

  scene = new SpiderScene(
    {
      onCardClick: (col, index) => {
        if (autoCompleteTimer !== null || state.isWon) return;

        clearHintState(false);

        if (selectedCard && selectedCard.col === col && selectedCard.index === index) {
          clearSelectionState(true);
          return;
        }

        const column = state.columns[col];
        if (!column || !isMovableRun(column, index)) {
          clearSelectionState(false);
          scene.pulseLockedCard(col, index);
          const clickedCard = column?.[index];
          if (clickedCard?.faceUp) {
            hud.showToast(
              'Locked above a suit break — move the lower sequence first',
              2500,
            );
          }
          renderUi();
          return;
        }

        const destinations = getValidDestinations(state, col, index);
        if (destinations.length === 0) {
          clearSelectionState(false);
          scene.pulseLockedCard(col, index);
          hud.showToast('No valid destination columns for this card', 2200);
          renderUi();
          return;
        }

        selectedCard = { col, index, destinations };
        scene.showSelectionTargets({
          fromCol: col,
          fromIndex: index,
          destinations,
        });
        hud.showToast(
          `${destinations.length} valid destination${destinations.length === 1 ? '' : 's'} — click any highlighted target to move`,
          2800,
        );
        renderUi();
      },

      onCardDoubleClick: (col, index) => {
        if (autoCompleteTimer !== null || state.isWon) return;
        if (!settings.doubleClickAutoMove) {
          return;
        }

        const column = state.columns[col];
        if (!column || !isMovableRun(column, index)) {
          scene.pulseLockedCard(col, index);
          return;
        }

        const destinations = getValidDestinations(state, col, index);
        if (destinations.length === 0) {
          scene.pulseLockedCard(col, index);
          hud.showToast('No valid destination columns for this card', 2200);
          return;
        }

        performMove(col, index, destinations[0].toCol);
      },

      onAttemptMove: (fromCol, fromIndex, toCol) => {
        performMove(fromCol, fromIndex, toCol);
      },

      onDestinationClick: (toCol) => {
        if (!selectedCard) return;
        performMove(selectedCard.col, selectedCard.index, toCol);
      },

      onEmptySpaceClick: () => {
        let changed = false;
        if (selectedCard) {
          clearSelectionState(false);
          changed = true;
        }
        if (activeHintToast !== null || hintCycleIndex >= 0) {
          clearHintState(false);
          changed = true;
        }
        if (changed) {
          renderUi();
        }
      },

      onStockClick: () => {
        actions.onDealStock();
      },

      onPointerInteract: () => {
        if (keyboardCursorVisible || focusedDestCol !== null) {
          keyboardCursorVisible = false;
          keyboardCursorIndex = null;
          focusedDestCol = null;
          scene.setFocusedDestinationCol(null);
          scene.setKeyboardCursor(null);
        }
      },

      onAnimationEvent: (event) => {
        switch (event) {
          case 'pickup':
            sound.playPickup();
            break;
          case 'place':
            sound.playPlace(lastMovedStackSize);
            break;
          case 'flip':
            sound.playFlip();
            break;
          case 'deal':
            sound.playDealCard(dealSoundIndex++);
            break;
          case 'complete-suit':
            sound.playCompleteSuit();
            break;
          case 'blocked':
            sound.playBlocked();
            break;
          case 'undo':
            sound.playUndo();
            break;
        }
      },
    },
    settings,
  );

  hudRoot.addEventListener('spider:clear-hint', () => {
    clearHintState(true);
  });

  // Mount WebGL scene & sync initial state
  scene.mount(stageContainer);
  scene.syncState(state, state.moves === 0 && !state.hasStarted ? 'deal-new' : 'restore');
  renderUi();

  // Active play timer (ticks every second during live play)
  window.setInterval(() => {
    const blockingModalOpen =
      uiState.activeModal !== 'none' && uiState.activeModal !== 'customize';
    if (
      state.hasStarted &&
      !state.isWon &&
      !isPaused &&
      !blockingModalOpen &&
      !document.hidden
    ) {
      state = {
        ...state,
        elapsedSeconds: state.elapsedSeconds + 1,
      };
      timerSaveCounter++;
      if (timerSaveCounter >= 5) {
        timerSaveCounter = 0;
        saveActiveGame(state);
      }
      hud.render(buildHudSnapshot(), activeHintToast);
    }
  }, 1000);

  const persistSnapshotNow = () => {
    saveActiveGame(state);
  };
  window.addEventListener('beforeunload', persistSnapshotNow);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persistSnapshotNow();
    }
  });

  // Keyboard navigation & table shortcuts
  const returnFocusToStageFromHud = () => {
    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.closest('#hud-root')
    ) {
      stageContainer.focus({ preventScroll: true });
    }
  };

  const revealCursorAtCol = (targetCol: number) => {
    const numCols = state.columns.length;
    if (numCols === 0) return;
    const normalized = ((targetCol % numCols) + numCols) % numCols;
    keyboardCursorVisible = true;
    keyboardCursorCol = normalized;
    keyboardCursorIndex = getMovableCursorDefaultIndex(normalized);
    syncKeyboardCursor();
  };

  const moveCursorHorizontal = (delta: number) => {
    const numCols = state.columns.length;
    if (numCols === 0) return;

    const hadHint = hintCycleIndex >= 0 || activeHintToast !== null;
    if (hadHint) {
      clearHintState(false);
    }

    if (!keyboardCursorVisible) {
      keyboardCursorVisible = true;
      keyboardCursorCol = delta >= 0 ? 0 : numCols - 1;
    } else {
      keyboardCursorCol = (keyboardCursorCol + delta + numCols) % numCols;
    }
    keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
    syncKeyboardCursor();
    if (hadHint) {
      renderUi();
    }
  };

  const moveCursorVertical = (delta: number) => {
    const numCols = state.columns.length;
    if (numCols === 0) return;

    const hadHint = hintCycleIndex >= 0 || activeHintToast !== null;
    if (hadHint) {
      clearHintState(false);
    }

    if (!keyboardCursorVisible) {
      keyboardCursorVisible = true;
      if (keyboardCursorCol < 0 || keyboardCursorCol >= numCols) {
        keyboardCursorCol = 0;
      }
      keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
    }

    const col = keyboardCursorCol;
    const colCards = state.columns[col];
    if (!colCards || colCards.length === 0) {
      keyboardCursorIndex = null;
      syncKeyboardCursor();
      if (hadHint) renderUi();
      return;
    }

    const movableStart = getMovableStartIndex(colCards);
    if (movableStart >= colCards.length) {
      keyboardCursorIndex = null;
      syncKeyboardCursor();
      if (hadHint) renderUi();
      return;
    }

    const currentIdx = Math.max(
      movableStart,
      Math.min(colCards.length - 1, keyboardCursorIndex ?? movableStart),
    );
    const nextIdx = Math.max(
      movableStart,
      Math.min(colCards.length - 1, currentIdx + delta),
    );

    keyboardCursorIndex = nextIdx;

    if (selectedCard && selectedCard.col === col) {
      if (nextIdx !== selectedCard.index) {
        const destinations = getValidDestinations(state, col, nextIdx);
        if (destinations.length > 0) {
          focusedDestCol = destinations[0].toCol;
          selectedCard = { col, index: nextIdx, destinations };
          scene.showSelectionTargets({
            fromCol: col,
            fromIndex: nextIdx,
            destinations,
            focusedDestCol,
          });
          const count = colCards.length - nextIdx;
          hud.showToast(
            `Selected ${formatCardLabel(colCards[nextIdx])} (${count} card${count === 1 ? '' : 's'}) · ${destinations.length} target${destinations.length === 1 ? '' : 's'}`,
            2400,
          );
        } else {
          selectedCard = null;
          focusedDestCol = null;
          scene.showSelectionTargets(null);
          hud.showToast(
            `${formatCardLabel(colCards[nextIdx])} has no valid targets`,
            2000,
          );
        }
      }
      syncKeyboardCursor();
      renderUi();
      return;
    }

    if (colCards.length - 1 > movableStart) {
      const count = colCards.length - nextIdx;
      hud.showToast(
        `${formatColLabel(col)}: ${formatCardLabel(colCards[nextIdx])} (${count} card${count === 1 ? '' : 's'})`,
        1800,
      );
    }

    syncKeyboardCursor();
    if (hadHint) {
      renderUi();
    }
  };

  const cycleFocusedDestination = (delta: number) => {
    if (!selectedCard || selectedCard.destinations.length === 0) return;

    keyboardCursorVisible = true;
    keyboardCursorCol = selectedCard.col;
    keyboardCursorIndex = selectedCard.index;
    syncKeyboardCursor();

    const sorted = [...selectedCard.destinations].sort((a, b) => a.toCol - b.toCol);
    if (sorted.length === 1) {
      focusedDestCol = sorted[0].toCol;
      scene.setFocusedDestinationCol(focusedDestCol);
      hud.showToast(
        `Only target: ${formatColLabel(focusedDestCol)} — Enter/Space to move · Esc to cancel`,
        2200,
      );
      return;
    }

    const curIdx = sorted.findIndex((d) => d.toCol === focusedDestCol);
    const nextIdx =
      curIdx < 0
        ? delta >= 0
          ? 0
          : sorted.length - 1
        : (curIdx + delta + sorted.length) % sorted.length;
    focusedDestCol = sorted[nextIdx].toCol;
    scene.setFocusedDestinationCol(focusedDestCol);
    hud.showToast(
      `Target ${nextIdx + 1}/${sorted.length}: ${formatColLabel(focusedDestCol)} — Enter/Space to move`,
      2400,
    );
  };

  const jumpToColumn = (targetCol: number) => {
    const hadHint = hintCycleIndex >= 0 || activeHintToast !== null;
    if (hadHint) {
      clearHintState(false);
    }

    if (selectedCard) {
      if (targetCol === selectedCard.col) {
        selectedCard = null;
        focusedDestCol = null;
        scene.showSelectionTargets(null);
        keyboardCursorVisible = true;
        keyboardCursorCol = targetCol;
        keyboardCursorIndex = getMovableCursorDefaultIndex(targetCol);
        syncKeyboardCursor();
        hud.showToast('', 0);
        renderUi();
        return;
      }

      if (selectedCard.destinations.some((d) => d.toCol === targetCol)) {
        performMove(selectedCard.col, selectedCard.index, targetCol);
        return;
      }

      sound.playBlocked();
      hud.showToast(
        `${formatColLabel(targetCol)} is not a valid target (Esc to cancel)`,
        2200,
      );
      if (hadHint) renderUi();
      return;
    }

    revealCursorAtCol(targetCol);
    if (hadHint) {
      renderUi();
    }
  };

  const selectAtCursor = () => {
    const numCols = state.columns.length;
    if (numCols === 0) return;

    const hadHint = hintCycleIndex >= 0 || activeHintToast !== null;
    if (hadHint) {
      clearHintState(false);
    }

    if (!keyboardCursorVisible) {
      keyboardCursorVisible = true;
      if (
        keyboardCursorCol < 0 ||
        keyboardCursorCol >= numCols ||
        (state.columns[keyboardCursorCol]?.length ?? 0) === 0
      ) {
        const firstNonEmpty = state.columns.findIndex((c) => c.length > 0);
        keyboardCursorCol = firstNonEmpty >= 0 ? firstNonEmpty : 0;
      }
      keyboardCursorIndex = getMovableCursorDefaultIndex(keyboardCursorCol);
    }

    const col = keyboardCursorCol;
    const colCards = state.columns[col];
    if (!colCards || colCards.length === 0) {
      syncKeyboardCursor();
      sound.playBlocked();
      hud.showToast(`${formatColLabel(col)} is empty`, 2000);
      if (hadHint) renderUi();
      return;
    }

    const movableStart = getMovableStartIndex(colCards);
    const idx =
      keyboardCursorIndex !== null &&
      keyboardCursorIndex >= movableStart &&
      keyboardCursorIndex < colCards.length
        ? keyboardCursorIndex
        : movableStart;

    keyboardCursorIndex = idx;

    if (!isMovableRun(colCards, idx)) {
      syncKeyboardCursor();
      scene.pulseLockedCard(col, idx);
      hud.showToast(
        'Locked above a suit break — move the lower sequence first',
        2400,
      );
      if (hadHint) renderUi();
      return;
    }

    const destinations = getValidDestinations(state, col, idx);
    if (destinations.length === 0) {
      syncKeyboardCursor();
      scene.pulseLockedCard(col, idx);
      const canSplitDeeper = colCards.length - 1 > idx;
      hud.showToast(
        canSplitDeeper
          ? `No valid targets for ${formatCardLabel(colCards[idx])} (try ↓ for sub-run)`
          : `No valid destination columns for ${formatCardLabel(colCards[idx])}`,
        2400,
      );
      if (hadHint) renderUi();
      return;
    }

    const bestDest = destinations[0].toCol;
    focusedDestCol = bestDest;
    selectedCard = { col, index: idx, destinations };
    scene.showSelectionTargets({
      fromCol: col,
      fromIndex: idx,
      destinations,
      focusedDestCol: bestDest,
    });
    syncKeyboardCursor();

    if (destinations.length === 1) {
      hud.showToast(
        `Selected ${formatCardLabel(colCards[idx])} → ${formatColLabel(bestDest)} (Enter/Space to move)`,
        2600,
      );
    } else {
      hud.showToast(
        `${destinations.length} targets for ${formatCardLabel(colCards[idx])} (focused: ${formatColLabel(bestDest)} · Tab/←/→ cycle · Enter move)`,
        3000,
      );
    }
    renderUi();
  };

  const confirmSelectionMove = () => {
    if (!selectedCard) return;
    const targetCol =
      focusedDestCol !== null &&
      selectedCard.destinations.some((d) => d.toCol === focusedDestCol)
        ? focusedDestCol
        : selectedCard.destinations[0]?.toCol;
    if (targetCol === undefined) {
      clearSelectionState(true);
      return;
    }
    performMove(selectedCard.col, selectedCard.index, targetCol);
  };

  const executeActiveHint = (): boolean => {
    if (!cachedHints || hintCycleIndex < 0 || hintCycleIndex >= cachedHints.length) {
      return false;
    }
    const hint = cachedHints[hintCycleIndex];
    if (hint.kind === 'deal') {
      actions.onDealStock();
      return true;
    }
    return performMove(hint.fromCol, hint.fromIndex, hint.toCol);
  };

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      if (event.key === 'Escape' && uiState.activeModal !== 'none') {
        event.preventDefault();
        openModal('none');
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (uiState.activeModal === 'none') {
        event.preventDefault();
        actions.onUndo();
      }
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'escape') {
      event.preventDefault();
      if (uiState.activeModal !== 'none') {
        openModal('none');
      } else if (selectedCard || hintCycleIndex >= 0 || activeHintToast !== null) {
        clearHintState(false);
        clearSelectionState(false);
        hud.showToast('', 0);
        renderUi();
      } else if (keyboardCursorVisible) {
        keyboardCursorVisible = false;
        keyboardCursorIndex = null;
        scene.setKeyboardCursor(null);
      }
      return;
    }

    if (uiState.activeModal === 'customize') {
      if (key === 'c') {
        event.preventDefault();
        openModal('none');
      }
      return;
    }

    if (uiState.activeModal !== 'none') {
      return;
    }

    const isInteractiveControl = Boolean(
      target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'A' ||
          target.tagName === 'LABEL'),
    );
    if (isInteractiveControl && (key === 'enter' || event.key === ' ')) {
      return;
    }

    switch (key) {
      case 'n':
        event.preventDefault();
        openModal('new-game');
        return;
      case 'c':
        event.preventDefault();
        openModal('customize');
        return;
      case 's':
        event.preventDefault();
        openModal('stats');
        return;
      case 'b':
        event.preventDefault();
        openModal('saves');
        return;
      case 'm': {
        event.preventDefault();
        const nextEnabled = !settings.soundEnabled;
        actions.onUpdateSettings({ soundEnabled: nextEnabled });
        hud.showToast(
          nextEnabled ? 'Cardroom audio unmuted' : 'Cardroom audio muted',
          1800,
        );
        return;
      }
      case '?':
        event.preventDefault();
        openModal('help');
        return;
    }

    if (autoCompleteTimer !== null || state.isWon) {
      return;
    }

    switch (key) {
      case 'h':
        event.preventDefault();
        returnFocusToStageFromHud();
        actions.onHint();
        return;
      case 'z':
        event.preventDefault();
        returnFocusToStageFromHud();
        actions.onUndo();
        return;
      case 'd':
        event.preventDefault();
        returnFocusToStageFromHud();
        actions.onDealStock();
        return;
      case 'a':
        event.preventDefault();
        returnFocusToStageFromHud();
        if (isAutoCompletable(state)) {
          actions.onAutoComplete();
        } else {
          sound.playBlocked();
          hud.showToast('Auto-Complete unlocks once all cards are face-up', 2400);
        }
        return;
      case 'arrowleft':
        event.preventDefault();
        returnFocusToStageFromHud();
        if (selectedCard) {
          cycleFocusedDestination(-1);
        } else {
          moveCursorHorizontal(-1);
        }
        return;
      case 'arrowright':
        event.preventDefault();
        returnFocusToStageFromHud();
        if (selectedCard) {
          cycleFocusedDestination(1);
        } else {
          moveCursorHorizontal(1);
        }
        return;
      case 'arrowup':
        event.preventDefault();
        returnFocusToStageFromHud();
        moveCursorVertical(-1);
        return;
      case 'arrowdown':
        event.preventDefault();
        returnFocusToStageFromHud();
        moveCursorVertical(1);
        return;
      case 'tab':
        if (selectedCard) {
          event.preventDefault();
          returnFocusToStageFromHud();
          cycleFocusedDestination(event.shiftKey ? -1 : 1);
        }
        return;
      case 'enter':
        event.preventDefault();
        if (hintCycleIndex >= 0 && cachedHints) {
          executeActiveHint();
        } else if (selectedCard) {
          confirmSelectionMove();
        } else {
          selectAtCursor();
        }
        return;
      case ' ':
        event.preventDefault();
        if (selectedCard) {
          confirmSelectionMove();
        } else {
          selectAtCursor();
        }
        return;
    }

    const colJump = parseColumnKey(event, state.columns.length);
    if (colJump !== null) {
      event.preventDefault();
      returnFocusToStageFromHud();
      jumpToColumn(colJump);
    }
  });
}

initApp();
