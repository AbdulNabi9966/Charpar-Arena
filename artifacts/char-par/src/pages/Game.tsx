import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '../components/layout/Layout';
import { Board } from '../components/game/Board';
import { Matchmaking } from '../components/game/Matchmaking';
import { Confetti } from '../components/game/Confetti';
import { RulesModal } from '../components/game/RulesModal';
import { RematchModal } from '../components/game/RematchModal';
import { useGameStore } from '../store/gameStore';
import { useOnlineStore, saveOnlineSession, loadOnlineSession, clearOnlineSession } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
import { useGetMe } from '@workspace/api-client-react';
import { getAIMove } from '../lib/ai';
import { getValidMoves, BoardSize } from '../lib/gameLogic';
import { soundSystem } from '../lib/audio';

export default function Game() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode') || 'local';
  const difficulty = (searchParams.get('difficulty') || 'medium') as 'easy' | 'medium' | 'hard' | 'expert';
  const qmode = (searchParams.get('qmode') || 'casual') as 'casual' | 'ranked';
  const rawSize = parseInt(searchParams.get('boardSize') || '3', 10);
  const boardSize = ([3, 4, 5].includes(rawSize) ? rawSize : 3) as BoardSize;

  const {
    board,
    phase,
    currentPlayer,
    winner,
    winLine,
    resetGame,
    placePiece,
    selectPiece,
    movePiece,
    moveAIPiece,
    gameMode,
    aiDifficulty,
    piecesPlaced,
    boardSize: storedBoardSize,
  } = useGameStore();

  const { token, userId } = useAuthStore();
  const { data: me } = useGetMe({ query: { enabled: !!token, queryKey: ['auth', 'me'] } });
  const {
    status,
    connect,
    disconnect,
    makeMove,
    playerNum,
    gameState,
    opponent,
    leaveQueue,
    onlineSelected,
    setOnlineSelected,
    winReason,
    requestRematch,
    declineRematch,
    isWaitingForRematch,
    socket,
    joinQueue,
    gameId: onlineGameId,
  } = useOnlineStore();

  const [rematchOffer, setRematchOffer] = useState<{ from: string } | null>(null);
  const [isWaitingForRematchResponse, setIsWaitingForRematchResponse] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [joinAttempted, setJoinAttempted] = useState(false);

  const aiPending = useRef(false);
  const initialized = useRef(false);
  const isUnmounting = useRef(false);
  const gameIdRef = useRef<string | null>(null);
  const reconnectionAttempted = useRef(false);
  const hasReconnected = useRef(false);
  const joinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const onlineStoreSet = useOnlineStore.setState;

  // ── FORCE RESET ────────────────────────────────────────────────────────────
  const forceResetOnlineState = () => {
    console.log('🔥 forceResetOnlineState called');
    setIsCleaningUp(true);
    
    clearOnlineSession();

    const { socket: s } = useOnlineStore.getState();
    if (s?.connected) {
      s.removeAllListeners();
      s.disconnect();
    }

    onlineStoreSet({
      status: 'disconnected',
      gameId: null,
      playerNum: null,
      opponent: null,
      gameState: null,
      onlineSelected: null,
      winReason: null,
      error: null,
      isWaitingForRematch: false,
    });

    resetGame('local', 'medium', 3);

    gameIdRef.current = null;
    reconnectionAttempted.current = false;
    hasReconnected.current = false;
    setJoinAttempted(false);

    if (joinTimeoutRef.current) {
      clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    setTimeout(() => {
      setIsCleaningUp(false);
    }, 200);
  };

  // ── Complete cleanup ──────────────────────────────────────────────────────
  const fullCleanup = () => {
    if (isUnmounting.current || isCleaningUp) return;
    isUnmounting.current = true;

    forceResetOnlineState();

    setRematchOffer(null);
    setIsWaitingForRematchResponse(false);
    setShowResignConfirm(false);
    setShowExitConfirm(false);
    aiPending.current = false;
    initialized.current = false;

    setTimeout(() => {
      isUnmounting.current = false;
    }, 200);
  };

  // ── Navigate with cleanup ────────────────────────────────────────────────
  const navigateWithCleanup = (path: string) => {
    fullCleanup();
    setTimeout(() => {
      window.location.href = path;
    }, 200);
  };

  // ── Resign handler ────────────────────────────────────────────────────────
  const handleResign = () => {
    if (mode === 'online') {
      const currentGameId = useOnlineStore.getState().gameId;
      if (currentGameId && socket?.connected) {
        socket.emit('resign', { gameId: currentGameId, playerNumber: playerNum });
        setTimeout(() => {
          navigateWithCleanup('/play');
        }, 500);
        setShowResignConfirm(false);
        return;
      }
    }
    
    setShowResignConfirm(false);
    navigateWithCleanup('/play');
  };

  // ── Attempt reconnection ──────────────────────────────────────────────────
  const attemptReconnection = (userId: string, username: string) => {
    if (reconnectionAttempted.current || hasReconnected.current) {
      console.log('⏭️ Reconnection already handled, skipping');
      return;
    }

    const { gameState: currentGameState, status: currentStatus } = useOnlineStore.getState();
    if (currentStatus === 'in_game' && currentGameState) {
      console.log('✅ Already in a game');
      hasReconnected.current = true;
      return;
    }

    const saved = loadOnlineSession();
    if (saved && saved.userId === userId && saved.gameId) {
      console.log('🔄 Found saved game, attempting to reconnect:', saved.gameId);
      setIsReconnecting(true);
      reconnectionAttempted.current = true;
      
      const { socket: s } = useOnlineStore.getState();
      if (s?.connected) {
        s.emit('rejoin_game', { 
          gameId: saved.gameId, 
          userId: saved.userId, 
          username: saved.username 
        });
        
        onlineStoreSet({
          status: 'connecting',
          gameId: saved.gameId,
          playerNum: saved.playerNum,
          opponent: saved.opponent,
        });
        
        reconnectTimerRef.current = setTimeout(() => {
          setIsReconnecting(false);
          const { status: st, gameId: currentGameId } = useOnlineStore.getState();
          if (st !== 'in_game' && !currentGameId) {
            console.log('⏰ Reconnection timeout, joining queue');
            reconnectionAttempted.current = false;
            attemptJoinQueue(userId, username);
          }
        }, 5000);
      } else {
        setIsReconnecting(false);
        reconnectionAttempted.current = false;
        attemptJoinQueue(userId, username);
      }
    } else {
      console.log('ℹ️ No saved session, joining queue');
      attemptJoinQueue(userId, username);
    }
  };

  // ── Join queue ────────────────────────────────────────────────────────────
  const attemptJoinQueue = (userId: string, username: string) => {
    if (joinAttempted) {
      console.log('⏭️ Join already attempted, skipping');
      return;
    }

    const { socket: s, status: st, gameId: currentGameId } = useOnlineStore.getState();
    
    if (!s?.connected) {
      if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = setTimeout(() => {
        attemptJoinQueue(userId, username);
      }, 1000);
      return;
    }

    if (st === 'in_game' || currentGameId) {
      console.log('⏭️ Already in game, skipping join');
      return;
    }

    console.log('🎯 Joining queue');
    setJoinAttempted(true);
    joinQueue(qmode, userId, username, boardSize);
  };

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'online') {
      if (initialized.current) return;
      if (!userId) return;

      console.log('🎮 Initializing online mode');
      initialized.current = true;

      forceResetOnlineState();

      const username = me?.username ?? 'Player';
      connect(userId, username, token ?? '');

      // Wait for connection then attempt reconnection
      setTimeout(() => {
        if (!joinAttempted && status !== 'in_game' && !onlineGameId) {
          attemptReconnection(userId, username);
        }
      }, 1500);

      // Fallback join
      const fallbackTimer = setTimeout(() => {
        const { status: st, gameId: currentGameId } = useOnlineStore.getState();
        if (st !== 'in_game' && !currentGameId && !joinAttempted && !hasReconnected.current) {
          console.log('⏰ Fallback: joining queue');
          attemptJoinQueue(userId, username);
        }
      }, 5000);

      return () => {
        clearTimeout(fallbackTimer);
        if (joinTimeoutRef.current) clearTimeout(joinTimeoutRef.current);
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        if (mode === 'online') {
          const { status: s } = useOnlineStore.getState();
          if (s === 'searching') leaveQueue();
        }
        fullCleanup();
      };
    }
  }, [userId]);

  // ── Monitor socket connection ───────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online') return;
    if (!userId) return;
    if (status === 'in_game' || onlineGameId || hasReconnected.current) return;

    const username = me?.username ?? 'Player';
    
    if (socket?.connected && status === 'disconnected' && !joinAttempted) {
      console.log('🔌 Socket connected, joining queue');
      attemptJoinQueue(userId, username);
    }
  }, [socket?.connected, status, userId, mode, onlineGameId, joinAttempted]);

  // ── Listen for reconnected event ─────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online') return;

    const handleReconnected = (event: CustomEvent) => {
      console.log('✅ Reconnection successful');
      hasReconnected.current = true;
      setIsReconnecting(false);
      reconnectionAttempted.current = false;
    };

    window.addEventListener('reconnected', handleReconnected as EventListener);

    return () => {
      window.removeEventListener('reconnected', handleReconnected as EventListener);
    };
  }, [mode]);

  // ── Save session ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'online' && status === 'in_game' && playerNum && opponent && userId) {
      const currentGameId = useOnlineStore.getState().gameId;
      if (currentGameId && !isCleaningUp && !isReconnecting) {
        saveOnlineSession({
          gameId: currentGameId,
          playerNum,
          opponent,
          qmode,
          userId,
          username: opponent.username,
          boardSize: gameState?.boardSize ?? boardSize,
        });
      }
    }
  }, [mode, status, playerNum, opponent, userId, qmode, boardSize, gameState?.boardSize]);

  // ── AI turn ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'ai') return;
    if (currentPlayer !== 2 || winner) return;
    if (aiPending.current || isUnmounting.current || isCleaningUp) return;

    aiPending.current = true;
    const thinkMs = 350 + Math.random() * 400;

    const timerId = setTimeout(() => {
      if (isUnmounting.current || isCleaningUp) {
        aiPending.current = false;
        return;
      }

      const fresh = useGameStore.getState();
      if (fresh.currentPlayer !== 2 || fresh.winner) {
        aiPending.current = false;
        return;
      }

      const move = getAIMove(
        fresh.board,
        difficulty,
        fresh.phase,
        fresh.piecesPlaced,
        fresh.boardSize,
      );

      if (!move) { aiPending.current = false; return; }

      if (fresh.phase === 'placement') {
        if (fresh.board[move.to] !== null) { aiPending.current = false; return; }
        soundSystem.playPlace();
        fresh.placePiece(move.to);
      } else {
        if (move.from === null || fresh.board[move.from] !== 2) { aiPending.current = false; return; }
        const valid = getValidMoves(fresh.board, move.from, fresh.boardSize);
        if (!valid.includes(move.to)) { aiPending.current = false; return; }
        soundSystem.playMove();
        fresh.moveAIPiece(move.from, move.to);
      }

      if (useGameStore.getState().winner) soundSystem.playWin();
      aiPending.current = false;
    }, thinkMs);

    return () => { clearTimeout(timerId); aiPending.current = false; };
  }, [currentPlayer, phase, winner, mode, difficulty]);

  // ── Derived values ────────────────────────────────────────────────────────
  const effectiveWinner = mode === 'online' ? (gameState?.winner ?? null) : winner;
  const currentPhase = mode === 'online' ? gameState?.phase : phase;
  const onlineBoardSize = gameState?.boardSize ?? boardSize;
  const isMyTurn = mode === 'online' ? gameState?.currentPlayer === playerNum : true;

  const displayBoard = mode === 'online' && gameState
    ? (gameState.board as (1 | 2 | null)[])
    : undefined;

  const onlineValidMoves =
    mode === 'online' && onlineSelected !== null && gameState?.phase === 'movement'
      ? getValidMoves(gameState.board as (1 | 2 | null)[], onlineSelected, onlineBoardSize)
      : [];

  const handleOnlineCellClick = (pos: number) => {
    if (!gameState || gameState.currentPlayer !== playerNum || gameState.winner) return;
    if (isUnmounting.current || isCleaningUp || isReconnecting) return;

    if (gameState.phase === 'placement') {
      if (gameState.board[pos] === null) makeMove(null, pos);
    } else {
      if (gameState.board[pos] === playerNum) {
        setOnlineSelected(pos);
      } else if (onlineSelected !== null) {
        const valid = getValidMoves(gameState.board as (1 | 2 | null)[], onlineSelected, onlineBoardSize);
        if (valid.includes(pos)) {
          makeMove(onlineSelected, pos);
          setOnlineSelected(null);
        } else {
          setOnlineSelected(null);
        }
      }
    }
  };

  const turnLabel =
    mode === 'ai'
      ? currentPlayer === 1 ? 'Your Turn' : 'AI thinking…'
      : mode === 'online'
      ? gameState?.currentPlayer === playerNum ? 'Your Turn' : `${opponent?.username ?? 'Opponent'}'s Turn`
      : `Player ${currentPlayer}'s Turn`;

  const activeBoardSize = mode === 'online' ? onlineBoardSize : storedBoardSize;

  // ── Rematch event listener ──────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online') return;

    const handleRematchOffer = (event: CustomEvent<{ by: string }>) => {
      if (isUnmounting.current || isCleaningUp) return;
      setRematchOffer({ from: event.detail?.by || 'Opponent' });
    };

    const handleRematchStarted = () => {
      setRematchOffer(null);
      setIsWaitingForRematchResponse(false);
    };

    window.addEventListener('rematch-offered', handleRematchOffer as EventListener);
    window.addEventListener('rematch-started', handleRematchStarted as EventListener);

    return () => {
      window.removeEventListener('rematch-offered', handleRematchOffer as EventListener);
      window.removeEventListener('rematch-started', handleRematchStarted as EventListener);
    };
  }, [mode]);

  // ── Matchmaking screen ────────────────────────────────────────────────────
  if (mode === 'online' && status !== 'in_game' && !isCleaningUp && !isReconnecting) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Matchmaking boardSize={boardSize} />
        </div>
      </Layout>
    );
  }

  if (isReconnecting) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 relative">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-primary animate-spin" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Reconnecting...</h3>
            <p className="text-sm text-muted-foreground">Restoring your game...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Layout>
      {effectiveWinner && <Confetti />}

      <div className="flex-1 flex flex-col items-center py-8 px-4">
        {mode === 'online' && opponent && (
          <div className="mb-5 flex items-center gap-4 text-sm">
            <span className={`font-semibold ${playerNum === 1 ? 'text-red-400' : 'text-muted-foreground'}`}>
              You ({playerNum === 1 ? '🔴' : '🔵'})
            </span>
            <span className="text-muted-foreground text-xs uppercase tracking-widest">vs</span>
            <span className={`font-semibold ${playerNum === 2 ? 'text-red-400' : 'text-blue-400'}`}>
              {opponent.username} ({playerNum === 2 ? '🔴' : '🔵'})
            </span>
            <span className="text-xs text-muted-foreground">· {onlineBoardSize}×{onlineBoardSize}</span>
          </div>
        )}

        {mode === 'ai' && (
          <div className="mb-5 flex items-center gap-4 text-sm">
            <span className="font-semibold text-red-400">You (🔴)</span>
            <span className="text-muted-foreground text-xs uppercase tracking-widest">vs</span>
            <span className="font-semibold text-blue-400">AI ({difficulty})</span>
            <span className="text-xs text-muted-foreground">· {storedBoardSize}×{storedBoardSize}</span>
          </div>
        )}

        {mode === 'online' && useOnlineStore.getState().error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
            {useOnlineStore.getState().error}
          </div>
        )}

        <div className="mb-6 text-center space-y-1.5 relative z-10">
          <div className="flex items-center justify-center gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${currentPhase === 'placement' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {currentPhase === 'placement' ? 'Placement' : 'Movement'}
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/60 text-secondary-foreground/70 text-xs">
              {activeBoardSize}×{activeBoardSize}
            </div>
            <button
              onClick={() => setRulesOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-secondary/60 text-secondary-foreground/70 text-xs hover:bg-secondary hover:text-secondary-foreground transition-colors"
            >
              📖
            </button>
          </div>

          <h2 className="text-2xl font-bold tracking-tight h-8">
            {effectiveWinner ? (
              <span className="text-primary">
                {mode === 'online'
                  ? effectiveWinner === playerNum ? '🎉 You Win!' : 'You Lose'
                  : `Player ${effectiveWinner} Wins!`}
              </span>
            ) : (
              <span className={!isMyTurn ? 'text-muted-foreground' : ''}>{turnLabel}</span>
            )}
          </h2>

          {effectiveWinner && mode === 'online' && winReason === 'resign' && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mt-1 bg-muted text-muted-foreground border border-border">
              <span>🏳️</span>
              {effectiveWinner === playerNum ? `${opponent?.username ?? 'Opponent'} resigned` : 'You resigned'}
            </div>
          )}

          {!effectiveWinner && currentPhase === 'movement' && isMyTurn && (
            <p className="text-xs text-muted-foreground">
              {(mode === 'online' ? onlineSelected : useGameStore.getState().selectedPiece) !== null
                ? 'Tap a glowing spot to move there'
                : 'Tap one of your pieces to select it'}
            </p>
          )}
          {!effectiveWinner && currentPhase === 'placement' && mode !== 'online' && (
            <p className="text-xs text-muted-foreground">
              {piecesPlaced[currentPlayer]}/{storedBoardSize} pieces placed
            </p>
          )}
        </div>

        <div className="relative z-10 w-full max-w-[420px] mx-auto">
          <Board
            overrideBoard={displayBoard}
            overrideSelected={mode === 'online' ? onlineSelected : undefined}
            overrideValidMoves={mode === 'online' ? onlineValidMoves : undefined}
            overrideBoardSize={mode === 'online' ? onlineBoardSize : undefined}
            onCellClick={mode === 'online' ? handleOnlineCellClick : undefined}
          />
        </div>

        {!effectiveWinner && currentPhase === 'placement' && mode !== 'online' && (
          <div className="mt-5 flex gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              P1 {piecesPlaced[1]}/{storedBoardSize}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              {mode === 'ai' ? 'AI' : 'P2'} {piecesPlaced[2]}/{storedBoardSize}
            </span>
          </div>
        )}

        {effectiveWinner && (
          <div className="mt-10 flex gap-4 animate-in fade-in slide-in-from-bottom-4 relative z-10 flex-wrap justify-center">
            {mode === 'online' && (
              <button
                onClick={() => {
                  setIsWaitingForRematchResponse(true);
                  requestRematch();
                }}
                disabled={isWaitingForRematch || isWaitingForRematchResponse}
                className="bg-emerald-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {isWaitingForRematch || isWaitingForRematchResponse ? 'Waiting for opponent...' : 'Request Rematch'}
              </button>
            )}
            <button
              onClick={() => navigateWithCleanup('/play')}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              {mode === 'online' ? 'Find New Match' : 'Play Again'}
            </button>
            <button
              onClick={() => navigateWithCleanup('/')}
              className="bg-secondary text-secondary-foreground px-8 py-3 rounded-lg font-medium hover:bg-secondary/80 transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {!effectiveWinner && (
          <div className="mt-8 flex gap-4 relative z-10">
            {mode !== 'local' && (
              <button
                onClick={() => setShowResignConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors underline underline-offset-2"
              >
                Resign
              </button>
            )}
            <button
              onClick={() => setShowExitConfirm(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Exit Game
            </button>
          </div>
        )}
      </div>

      {showResignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-xl font-bold mb-2">Resign Game?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {mode === 'online'
                ? 'Are you sure you want to resign? This will count as a loss.'
                : 'Are you sure you want to resign? The AI will win this game.'}
            </p>
            <div className="flex gap-3">
              <button onClick={handleResign} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-lg transition-colors">Yes, Resign</button>
              <button onClick={() => setShowResignConfirm(false)} className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-3 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-xl font-bold mb-2">Exit Game?</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {mode === 'online' ? 'Are you sure you want to exit? This will count as a loss.' : 'Are you sure you want to exit the game?'}
            </p>
            <div className="flex gap-3">
              <button onClick={() => navigateWithCleanup('/')} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-lg transition-colors">Yes, Exit</button>
              <button onClick={() => setShowExitConfirm(false)} className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold py-3 rounded-lg transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <RematchModal
        open={!!rematchOffer}
        opponentName={rematchOffer?.from || 'Opponent'}
        isWaiting={isWaitingForRematch}
        onAccept={() => {
          requestRematch();
          setRematchOffer(null);
        }}
        onDecline={() => {
          declineRematch();
          setRematchOffer(null);
          setIsWaitingForRematchResponse(false);
          navigateWithCleanup('/play');
        }}
      />
    </Layout>
  );
}
