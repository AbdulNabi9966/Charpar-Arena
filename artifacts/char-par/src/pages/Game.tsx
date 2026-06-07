import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '../components/layout/Layout';
import { Board } from '../components/game/Board';
import { Matchmaking } from '../components/game/Matchmaking';
import { Confetti } from '../components/game/Confetti';
import { useGameStore } from '../store/gameStore';
import { useOnlineStore, saveOnlineSession, loadOnlineSession, clearOnlineSession } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
import { getAIMove } from '../lib/ai';
import { getValidMoves } from '../lib/gameLogic';
import { soundSystem } from '../lib/audio';

export default function Game() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode') || 'local';
  const difficulty = (searchParams.get('difficulty') || 'medium') as 'easy' | 'medium' | 'hard' | 'expert';
  const qmode = (searchParams.get('qmode') || 'casual') as 'casual' | 'ranked';

  const {
    board, phase, currentPlayer, winner, winLine,
    resetGame, placePiece, selectPiece, movePiece, moveAIPiece,
    gameMode, aiDifficulty, piecesPlaced,
  } = useGameStore();

  const { token, userId } = useAuthStore();
  const {
    status, connect, disconnect, makeMove, playerNum, gameState,
    opponent, leaveQueue, onlineSelected, setOnlineSelected,
  } = useOnlineStore();

  // Track whether the AI is currently computing to prevent re-entrant calls
  const aiPending = useRef(false);
  const initialized = useRef(false);

  // ── Init: restore or reset game ──────────────────────────────────────────
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (mode === 'local' || mode === 'ai') {
      const shouldRestore =
        (mode === 'local' && gameMode === 'local') ||
        (mode === 'ai' && gameMode === 'ai' && aiDifficulty === difficulty);
      if (!shouldRestore) {
        resetGame(mode as 'local' | 'ai', difficulty);
      }
      return;
    }

    if (mode === 'online') {
      const { status: curStatus, gameState: curGs } = useOnlineStore.getState();
      if (curStatus === 'in_game' && curGs) return; // already in a game

      const saved = loadOnlineSession();
      const currentUserId = userId;
      if (!currentUserId) return;

      const username = saved?.username ?? 'Player';
      connect(currentUserId, username, token ?? '');

      // After socket connects, join queue (server reconnect happens via 'register')
      const tryJoin = () => {
        const { socket } = useOnlineStore.getState();
        if (!socket?.connected) return false;

        if (saved?.userId === currentUserId) {
          // Server will reconnect via the 'register' handler
          useOnlineStore.setState({ status: 'searching' });
        } else {
          socket.emit('join_queue', { mode: qmode, userId: currentUserId, username });
          useOnlineStore.setState({ status: 'searching' });
        }
        return true;
      };

      if (!tryJoin()) {
        const iv = setInterval(() => { if (tryJoin()) clearInterval(iv); }, 100);
        setTimeout(() => clearInterval(iv), 6000);
      }
    }

    return () => {
      if (mode === 'online') {
        const { status: s } = useOnlineStore.getState();
        if (s === 'searching') leaveQueue();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist online session when matched ──────────────────────────────────
  useEffect(() => {
    if (mode === 'online' && status === 'in_game' && playerNum && opponent && userId) {
      const { gameId } = useOnlineStore.getState();
      if (gameId) {
        saveOnlineSession({ gameId, playerNum, opponent, qmode, userId, username: opponent.username });
      }
    }
  }, [mode, status, playerNum, opponent, userId, qmode]);

  // ── Clear session when online game ends ──────────────────────────────────
  useEffect(() => {
    if (mode === 'online' && gameState?.winner) clearOnlineSession();
  }, [mode, gameState?.winner]);

  // ── AI turn ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'ai') return;
    if (currentPlayer !== 2 || winner) return;   // not AI's turn or game over
    if (aiPending.current) return;               // already computing

    aiPending.current = true;

    const thinkMs = 400 + Math.random() * 400;

    const timerId = setTimeout(() => {
      // Read FRESH state at execution time — avoids stale closure bugs
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
      );

      if (!move) {
        aiPending.current = false;
        return;
      }

      if (fresh.phase === 'placement') {
        // Validate: cell must be empty
        if (fresh.board[move.to] !== null) {
          aiPending.current = false;
          return;
        }
        soundSystem.playPlace();
        fresh.placePiece(move.to);
      } else {
        // Validate: from must be AI's piece, to must be a valid move
        if (move.from === null || fresh.board[move.from] !== 2) {
          aiPending.current = false;
          return;
        }
        const valid = getValidMoves(fresh.board, move.from);
        if (!valid.includes(move.to)) {
          aiPending.current = false;
          return;
        }
        soundSystem.playMove();
        fresh.moveAIPiece(move.from, move.to);
      }

      // Check win after move
      const after = useGameStore.getState();
      if (after.winner) soundSystem.playWin();

      aiPending.current = false;
    }, thinkMs);

    return () => {
      clearTimeout(timerId);
      aiPending.current = false;
    };
  }, [currentPlayer, phase, winner, mode, difficulty]);
  // NOTE: deliberately NOT including `board` or `piecesPlaced` — we read
  // them fresh inside the timeout. Including them would re-trigger on every
  // AI move, causing a double-fire.

  // ── Derived values ───────────────────────────────────────────────────────
  const effectiveWinner = mode === 'online' ? (gameState?.winner ?? null) : winner;
  const currentPhase    = mode === 'online' ? gameState?.phase : phase;
  const isMyTurn = mode === 'online' ? gameState?.currentPlayer === playerNum : true;

  // Online board + selection state
  const displayBoard = mode === 'online' && gameState
    ? (gameState.board as (1 | 2 | null)[])
    : undefined;

  const onlineValidMoves =
    mode === 'online' && onlineSelected !== null && gameState?.phase === 'movement'
      ? getValidMoves(gameState.board as any, onlineSelected)
      : [];

  // ── Online cell click handler ────────────────────────────────────────────
  const handleOnlineCellClick = (pos: number) => {
    if (!gameState || gameState.currentPlayer !== playerNum || gameState.winner) return;

    if (gameState.phase === 'placement') {
      if (gameState.board[pos] === null) makeMove(null, pos);
    } else {
      if (gameState.board[pos] === playerNum) {
        setOnlineSelected(pos);
      } else if (onlineSelected !== null) {
        const valid = getValidMoves(gameState.board as any, onlineSelected);
        if (valid.includes(pos)) {
          makeMove(onlineSelected, pos);
          setOnlineSelected(null);
        } else {
          setOnlineSelected(null); // tap-to-deselect on invalid
        }
      }
    }
  };

  // ── Turn label ───────────────────────────────────────────────────────────
  const turnLabel =
    mode === 'ai'
      ? currentPlayer === 1
        ? 'Your Turn'
        : 'AI thinking…'
      : mode === 'online'
      ? gameState?.currentPlayer === playerNum
        ? 'Your Turn'
        : `${opponent?.username ?? 'Opponent'}'s Turn`
      : `Player ${currentPlayer}'s Turn`;

  // ── Matchmaking screen ───────────────────────────────────────────────────
  if (mode === 'online' && status !== 'in_game') {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Matchmaking />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {effectiveWinner && <Confetti />}

      <div className="flex-1 flex flex-col items-center py-8 px-4">

        {/* Online: opponent banner */}
        {mode === 'online' && opponent && (
          <div className="mb-5 flex items-center gap-4 text-sm">
            <span className={`font-semibold ${playerNum === 1 ? 'text-red-400' : 'text-muted-foreground'}`}>
              You ({playerNum === 1 ? '🔴' : '🔵'})
            </span>
            <span className="text-muted-foreground text-xs uppercase tracking-widest">vs</span>
            <span className={`font-semibold ${playerNum === 2 ? 'text-red-400' : 'text-blue-400'}`}>
              {opponent.username} ({playerNum === 2 ? '🔴' : '🔵'})
            </span>
          </div>
        )}

        {/* Opponent disconnected warning */}
        {mode === 'online' && useOnlineStore.getState().error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
            {useOnlineStore.getState().error}
          </div>
        )}

        {/* Phase badge + turn label */}
        <div className="mb-6 text-center space-y-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
            <span className={`w-1.5 h-1.5 rounded-full ${currentPhase === 'placement' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            {currentPhase === 'placement' ? 'Placement Phase' : 'Movement Phase'}
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

          {/* Context hints */}
          {!effectiveWinner && currentPhase === 'movement' && isMyTurn && (
            <p className="text-xs text-muted-foreground animate-in fade-in duration-300">
              {(mode === 'online' ? onlineSelected : useGameStore.getState().selectedPiece) !== null
                ? 'Tap a glowing spot to move there'
                : 'Tap one of your pieces to select it'}
            </p>
          )}
          {!effectiveWinner && currentPhase === 'placement' && mode !== 'online' && (
            <p className="text-xs text-muted-foreground">
              {piecesPlaced[currentPlayer]}/3 pieces placed
            </p>
          )}
        </div>

        {/* Board */}
        <div className={`relative z-10 w-full max-w-[420px] mx-auto
          ${(!isMyTurn || (mode === 'ai' && currentPlayer === 2)) && !effectiveWinner
            ? 'pointer-events-none' : ''}`}
        >
          <Board
            overrideBoard={displayBoard}
            overrideSelected={mode === 'online' ? onlineSelected : undefined}
            overrideValidMoves={mode === 'online' ? onlineValidMoves : undefined}
            onCellClick={mode === 'online' ? handleOnlineCellClick : undefined}
          />
        </div>

        {/* Piece counter (local/AI placement phase) */}
        {!effectiveWinner && currentPhase === 'placement' && mode !== 'online' && (
          <div className="mt-5 flex gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              P1 {piecesPlaced[1]}/3
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              {mode === 'ai' ? 'AI' : 'P2'} {piecesPlaced[2]}/3
            </span>
          </div>
        )}

        {/* End-game actions */}
        {effectiveWinner && (
          <div className="mt-10 flex gap-4 animate-in fade-in slide-in-from-bottom-4 relative z-10">
            <button
              onClick={() => {
                if (mode === 'online') {
                  disconnect();
                  setLocation('/play');
                } else {
                  resetGame(mode as 'local' | 'ai', difficulty);
                }
              }}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              {mode === 'online' ? 'Find New Match' : 'Play Again'}
            </button>
            <button
              onClick={() => setLocation('/play')}
              className="bg-secondary text-secondary-foreground px-8 py-3 rounded-lg font-medium hover:bg-secondary/80 transition-colors"
            >
              Exit
            </button>
          </div>
        )}

        {/* Online resign */}
        {mode === 'online' && !effectiveWinner && status === 'in_game' && (
          <button
            onClick={() => { useOnlineStore.getState().resign(); setLocation('/play'); }}
            className="mt-8 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
          >
            Resign
          </button>
        )}
      </div>
    </Layout>
  );
}
