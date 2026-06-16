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
  const mode       = searchParams.get('mode') || 'local';
  const difficulty = (searchParams.get('difficulty') || 'medium') as 'easy' | 'medium' | 'hard' | 'expert';
  const qmode      = (searchParams.get('qmode') || 'casual') as 'casual' | 'ranked';
  const rawSize    = parseInt(searchParams.get('boardSize') || '3', 10);
  const boardSize  = ([3, 4, 5].includes(rawSize) ? rawSize : 3) as BoardSize;

  const {
    board, phase, currentPlayer, winner, winLine,
    resetGame, placePiece, selectPiece, movePiece, moveAIPiece,
    gameMode, aiDifficulty, piecesPlaced, boardSize: storedBoardSize,
  } = useGameStore();

  const { token, userId } = useAuthStore();
  const { data: me } = useGetMe({ query: { enabled: !!token, queryKey: ['auth', 'me'] } });
  const {
    status, connect, disconnect, makeMove, playerNum,
    gameState, opponent, leaveQueue, onlineSelected, setOnlineSelected, winReason,
    requestRematch, declineRematch, isWaitingForRematch,
  } = useOnlineStore();

  const [rulesOpen, setRulesOpen] = useState(false);
  const [rematchOffer, setRematchOffer] = useState<{ from: string } | null>(null);

  const aiPending   = useRef(false);
  const initialized = useRef(false);

  // ── Rematch event listener ──────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'online') return;

    const handleRematchOffer = (event: CustomEvent<{ by: string }>) => {
      const from = event.detail?.by || 'Opponent';
      setRematchOffer({ from });
    };

    const handleRematchStarted = () => {
      setRematchOffer(null);
    };

    window.addEventListener('rematch-offered', handleRematchOffer as EventListener);
    window.addEventListener('rematch-started', handleRematchStarted as EventListener);

    return () => {
      window.removeEventListener('rematch-offered', handleRematchOffer as EventListener);
      window.removeEventListener('rematch-started', handleRematchStarted as EventListener);
    };
  }, [mode]);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Local / AI: initialize once; userId not needed
    if (mode === 'local' || mode === 'ai') {
      if (initialized.current) return;
      initialized.current = true;
      const shouldRestore =
        storedBoardSize === boardSize &&
        ((mode === 'local' && gameMode === 'local') ||
         (mode === 'ai' && gameMode === 'ai' && aiDifficulty === difficulty));
      if (!shouldRestore) {
        resetGame(mode as 'local' | 'ai', difficulty, boardSize);
      }
      return;
    }

    // Online: wait for userId (guest login is async); only initialize once
    if (mode === 'online') {
      if (initialized.current) return;
      if (!userId) return; // userId not ready yet — effect will re-run when it arrives

      initialized.current = true;

      const { status: cur, gameState: curGs } = useOnlineStore.getState();
      if (cur === 'in_game' && curGs) return; // already in an active game

      const username = me?.username ?? 'Player';
      connect(userId, username, token ?? '');

      // After socket connects, allow 350 ms for 'reconnected' to arrive before
      // joining the queue so a page-refresh mid-game reconnects cleanly.
      let joinScheduled = false;
      const scheduleJoin = (): boolean => {
        const { socket } = useOnlineStore.getState();
        if (!socket?.connected || joinScheduled) return !!joinScheduled;
        joinScheduled = true;
        setTimeout(() => {
          const { status: s } = useOnlineStore.getState();
          if (s !== 'in_game') {
            console.log('🎯 Joining queue with boardSize:', boardSize);
            socket.emit('join_queue', { mode: qmode, userId, username, boardSize });
            useOnlineStore.setState({ status: 'searching' });
          }
        }, 350);
        return true;
      };

      if (!scheduleJoin()) {
        const iv = setInterval(() => { if (scheduleJoin()) clearInterval(iv); }, 100);
        setTimeout(() => clearInterval(iv), 10_000);
      }
    }

    return () => {
      if (mode === 'online') {
        const { status: s } = useOnlineStore.getState();
        if (s === 'searching') leaveQueue();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // re-run when userId arrives so online mode connects immediately

  // ── Save online session ──────────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'online' && status === 'in_game' && playerNum && opponent && userId) {
      const { gameId } = useOnlineStore.getState();
      if (gameId) {
        saveOnlineSession({ gameId, playerNum, opponent, qmode, userId,
          username: opponent.username, boardSize: gameState?.boardSize ?? boardSize });
      }
    }
  }, [mode, status, playerNum, opponent, userId, qmode, boardSize, gameState?.boardSize]);

  // ── Clear session on game end ────────────────────────────────────────────
  useEffect(() => {
    if (mode === 'online' && gameState?.winner) {
      // Don't clear immediately - allow rematch
      // clearOnlineSession();
    }
  }, [mode, gameState?.winner]);

  // ── AI turn ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'ai') return;
    if (currentPlayer !== 2 || winner) return;
    if (aiPending.current) return;

    aiPending.current = true;
    const thinkMs = 350 + Math.random() * 400;

    const timerId = setTimeout(() => {
      const fresh = useGameStore.getState();
      if (fresh.currentPlayer !== 2 || fresh.winner) { aiPending.current = false; return; }

      const move = getAIMove(
        fresh.board, difficulty, fresh.phase, fresh.piecesPlaced, fresh.boardSize,
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
  const currentPhase    = mode === 'online' ? gameState?.phase   : phase;
  const onlineBoardSize = gameState?.boardSize ?? boardSize;
  const isMyTurn        = mode === 'online' ? gameState?.currentPlayer === playerNum : true;

  const displayBoard = mode === 'online' && gameState
    ? (gameState.board as (1 | 2 | null)[])
    : undefined;

  const onlineValidMoves =
    mode === 'online' && onlineSelected !== null && gameState?.phase === 'movement'
      ? getValidMoves(gameState.board as (1 | 2 | null)[], onlineSelected, onlineBoardSize)
      : [];

  // ── Online click handler ─────────────────────────────────────────────────
  const handleOnlineCellClick = (pos: number) => {
    if (!gameState || gameState.currentPlayer !== playerNum || gameState.winner) return;

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

  // ── Labels ───────────────────────────────────────────────────────────────
  const turnLabel =
    mode === 'ai'
      ? currentPlayer === 1 ? 'Your Turn' : 'AI thinking…'
      : mode === 'online'
      ? gameState?.currentPlayer === playerNum
        ? 'Your Turn'
        : `${opponent?.username ?? 'Opponent'}'s Turn`
      : `Player ${currentPlayer}'s Turn`;

  const activeBoardSize = mode === 'online' ? onlineBoardSize : storedBoardSize;

  // ── Matchmaking screen ────────────────────────────────────────────────────
  if (mode === 'online' && status !== 'in_game') {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <Matchmaking boardSize={boardSize} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {effectiveWinner && <Confetti />}

      <div className="flex-1 flex flex-col items-center py-8 px-4">

        {/* Online opponent banner */}
        {mode === 'online' && opponent && (
          <div className="mb-5 flex items-center gap-4 text-sm">
            <span className={`font-semibold ${playerNum === 1 ? 'text-red-400' : 'text-muted-foreground'}`
