import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Layout } from '../components/layout/Layout';
import { Board } from '../components/game/Board';
import { Matchmaking } from '../components/game/Matchmaking';
import { Confetti } from '../components/game/Confetti';
import { useGameStore } from '../store/gameStore';
import { useOnlineStore } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
import { getAIMove } from '../lib/ai';

export default function Game() {
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get('mode') || 'local';
  const difficulty = (searchParams.get('difficulty') || 'medium') as 'easy' | 'medium' | 'hard' | 'expert';
  const qmode = (searchParams.get('qmode') || 'casual') as 'casual' | 'ranked';

  const { board, phase, currentPlayer, winner, resetGame, placePiece, selectPiece, movePiece, winLine } = useGameStore();
  const { token, userId } = useAuthStore();
  const { status, connect, disconnect, makeMove, playerNum, gameState, opponent, leaveQueue } = useOnlineStore();

  const [aiThinking, setAiThinking] = useState(false);

  useEffect(() => {
    if (mode !== 'online') {
      resetGame();
    }

    if (mode === 'online') {
      const { socket } = useOnlineStore.getState();
      if (!socket?.connected && userId) {
        const username = 'Player'; // Will be overridden by stored auth
        connect(userId, username, token || '');
        setTimeout(() => {
          const freshSocket = useOnlineStore.getState().socket;
          if (freshSocket?.connected) {
            freshSocket.emit('join_queue', { mode: qmode, userId, username });
            useOnlineStore.setState({ status: 'searching' });
          } else {
            // Socket not connected yet, emit after connect
            freshSocket?.once('connect', () => {
              freshSocket.emit('join_queue', { mode: qmode, userId, username });
              useOnlineStore.setState({ status: 'searching' });
            });
          }
        }, 300);
      }
    }

    return () => {
      if (mode === 'online') {
        leaveQueue();
      }
    };
  }, []);

  // AI Logic
  useEffect(() => {
    if (mode !== 'ai') return;
    if (currentPlayer !== 2 || winner || aiThinking) return;

    setAiThinking(true);
    const thinkTime = Math.random() * 500 + 300;

    const timer = setTimeout(() => {
      const move = getAIMove(board, difficulty, phase);
      if (move) {
        if (phase === 'placement') {
          placePiece(move.to);
        } else {
          selectPiece(move.from!);
          movePiece(move.to);
        }
      }
      setAiThinking(false);
    }, thinkTime);

    return () => clearTimeout(timer);
  }, [currentPlayer, phase, winner, mode, difficulty, board, placePiece, selectPiece, movePiece, aiThinking]);

  // Online mode: use server game state
  const onlineWinner = gameState?.winner ?? null;
  const effectiveWinner = mode === 'online' ? onlineWinner : winner;

  // If online and not yet matched
  if (mode === 'online' && status !== 'in_game') {
    return (
      <Layout>
        <div className="flex-1 flex flex-col items-center justify-center">
          <Matchmaking />
        </div>
      </Layout>
    );
  }

  const handleCellClick = (pos: number) => {
    if (mode === 'online') {
      // Online mode: delegate to socket
      if (!gameState || gameState.currentPlayer !== playerNum) return;
      if (gameState.phase === 'placement') {
        makeMove(null, pos);
      } else {
        // Movement phase: select then move
        const gs = gameState;
        if (gs.board[pos] === playerNum) {
          useGameStore.setState({ selectedPiece: pos });
        } else {
          const { selectedPiece } = useGameStore.getState();
          if (selectedPiece !== null) {
            makeMove(selectedPiece, pos);
            useGameStore.setState({ selectedPiece: null });
          }
        }
      }
    }
    // For local/AI, Board component handles clicks internally
  };

  const isMyTurn = mode === 'online'
    ? (gameState?.currentPlayer === playerNum)
    : true;

  const displayBoard = mode === 'online' && gameState
    ? (gameState.board as (1 | 2 | null)[])
    : undefined;

  const playerLabel = mode === 'ai'
    ? (currentPlayer === 1 ? 'Your Turn' : aiThinking ? 'AI is thinking...' : 'AI is thinking...')
    : mode === 'online'
    ? (gameState?.currentPlayer === playerNum ? 'Your Turn' : `${opponent?.username}'s Turn`)
    : `Player ${currentPlayer}'s Turn`;

  return (
    <Layout>
      {effectiveWinner && <Confetti />}
      <div className="flex-1 flex flex-col items-center py-8 px-4">

        {mode === 'online' && opponent && (
          <div className="mb-6 flex items-center gap-4 text-sm text-muted-foreground">
            <span className={playerNum === 1 ? 'text-red-400 font-semibold' : ''}>
              You ({playerNum === 1 ? 'Red' : 'Blue'})
            </span>
            <span>vs</span>
            <span className={playerNum === 2 ? 'text-blue-400 font-semibold' : 'text-blue-400'}>
              {opponent.username}
            </span>
          </div>
        )}

        <div className="mb-6 text-center space-y-2 relative z-10">
          <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm font-medium">
            {(mode === 'online' ? gameState?.phase : phase) === 'placement' ? 'Placement Phase' : 'Movement Phase'}
          </div>
          <h2 className="text-2xl font-bold tracking-tight h-8">
            {effectiveWinner ? (
              <span className="text-primary animate-pulse">
                {mode === 'online'
                  ? (effectiveWinner === playerNum ? 'You Win!' : 'You Lose')
                  : `Player ${effectiveWinner} Wins!`}
              </span>
            ) : (
              <span className={!isMyTurn ? 'text-muted-foreground' : ''}>{playerLabel}</span>
            )}
          </h2>
        </div>

        <div className={`relative z-10 w-full max-w-[420px] mx-auto ${!isMyTurn && !effectiveWinner ? 'pointer-events-none opacity-90' : ''}`}>
          <Board
            overrideBoard={displayBoard}
            onCellClick={mode === 'online' ? handleCellClick : undefined}
          />
        </div>

        {effectiveWinner && (
          <div className="mt-10 flex gap-4 animate-in fade-in slide-in-from-bottom-4 relative z-10">
            <button
              onClick={() => {
                if (mode === 'online') {
                  disconnect();
                  setLocation('/play');
                } else {
                  resetGame();
                }
              }}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
              data-testid="button-play-again"
            >
              {mode === 'online' ? 'Find New Match' : 'Play Again'}
            </button>
            <button
              onClick={() => setLocation('/play')}
              className="bg-secondary text-secondary-foreground px-8 py-3 rounded-lg font-medium hover:bg-secondary/80 transition-colors"
              data-testid="button-exit-game"
            >
              Exit
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
