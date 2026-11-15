import { SoundEngine } from './audio/soundEngine';
import { generateDeal, requestWinningSeedAsync } from './engine/dealGenerator';
import { getMeaningfulHints } from './engine/hint';
import {
  canDealStock,
  dealFromSeed,
  dealFromStock,
  executeMove,
  getAutoCompleteStep,
  getValidDestinations,
  isAutoCompletable,
  isMovableRun,
  undoMove,
} from './engine/rules';
import {
  getModeKey,
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

function initApp(): void {
  const stageContainer = document.getElementById('stage-container');
  const hudRoot = document.getElementById('hud-root');
  const modalRoot = document.getElementById('modal-root');

  if (!stageContainer || !hudRoot || !modalRoot) {
    throw new Error('Spider Solitaire mount containers missing from index.html');
  }

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
    scene.showSelectionTargets(null);
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

    saveActiveGame(state);
    scene.syncState(state, sceneAction);

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
    dealSoundIndex = 0;

    saveActiveGame(state);
    scene.syncState(state, 'deal-new');
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
      dealSoundIndex = 0;

      saveActiveGame(state);
      scene.syncState(state, 'deal-new');
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
      activeHintToast = `Hint ${hintCycleIndex + 1} of ${cachedHints.length}: ${hint.reason}`;
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

      saveActiveGame(state);
      scene.syncState(state, 'restore');
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

  // Keyboard shortcuts
  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      if (event.key === 'Escape' && uiState.activeModal !== 'none') {
        openModal('none');
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      actions.onUndo();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'escape') {
      if (uiState.activeModal !== 'none') {
        openModal('none');
      } else if (selectedCard || hintCycleIndex >= 0) {
        clearSelectionState(false);
        clearHintState(false);
        renderUi();
      }
      return;
    }

    if (uiState.activeModal !== 'none' && uiState.activeModal !== 'customize') {
      return;
    }

    switch (key) {
      case 'h':
        event.preventDefault();
        actions.onHint();
        break;
      case 'z':
        event.preventDefault();
        actions.onUndo();
        break;
      case 'd':
        event.preventDefault();
        actions.onDealStock();
        break;
      case 'n':
        event.preventDefault();
        openModal('new-game');
        break;
      case 'c':
        event.preventDefault();
        openModal(uiState.activeModal === 'customize' ? 'none' : 'customize');
        break;
      case 's':
        event.preventDefault();
        openModal('stats');
        break;
      case '?':
        event.preventDefault();
        openModal('help');
        break;
    }
  });
}

initApp();
