import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { GamePhase, BoardSize } from '../lib/gameLogic';

type OnlineStatus = 'disconnected' | 'connecting' | 'searching' | 'in_game';

export type OnlineGameState = {
  board: (1 | 2 | null)[];
  phase: GamePhase;
  currentPlayer: 1 | 2;
  piecesPlaced: { 1: number; 2: number };
  winner: 1 | 2 | null;
  winLine: number[] | null;
  boardSize: BoardSize;
};

// Saved to sessionStorage so a page refresh can reconnect
type PersistedSession = {
  gameId: string;
  playerNum: 1 | 2;
  opponent: { id: string; username: string };
  qmode: 'casual' | 'ranked';
  userId: string;
  username: string;
  boardSize: BoardSize;
};

const SESSION_KEY = 'char-par-online-session';

export function saveOnlineSession(s: PersistedSession) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function loadOnlineSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

export function clearOnlineSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export type OnlineCounts = {
  total: number;
  playing: Record<number, number>;
  searching: Record<number, number>;
};

type OnlineState = {
  socket: Socket | null;
  status: OnlineStatus;
  gameId: string | null;
  playerNum: 1 | 2 | null;
  opponent: { id: string; username: string } | null;
  gameState: OnlineGameState | null;
  error: string | null;
  winReason: string | null;
  onlineCounts: OnlineCounts | null;
  // local UI selection for online board
  onlineSelected: number | null;
  isWaitingForRematch: boolean;

  connect: (userId: string, username: string, token: string) => void;
  joinQueue: (mode: 'casual' | 'ranked', userId: string, username: string, boardSize?: BoardSize) => void;
  leaveQueue: () => void;
  makeMove: (from: number | null, to: number) => void;
  resign: () => void;
  disconnect: () => void;
  setOnlineSelected: (pos: number | null) => void;
  requestRematch: () => void;
  declineRematch: () => void;
  clearRematch: () => void;
};

export const useOnlineStore = create<OnlineState>((set, get) => ({
  socket: null,
  status: 'disconnected',
  gameId: null,
  playerNum: null,
  opponent: null,
  gameState: null,
  error: null,
  winReason: null,
  onlineCounts: null,
  onlineSelected: null,
  isWaitingForRematch: false,

  connect: (userId: string, username: string, _token: string) => {
    const existing = get().socket;
    if (existing?.connected) {
      existing.emit('register', { userId, username });
      return;
    }

    set({ status: 'connecting', error: null });

    const socket = io(import.meta.env.VITE_API_URL || 'https://charpar-arena.onrender.com', {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('register', { userId, username });

      // If we have a saved session, try to rejoin that game first
      const saved = loadOnlineSession();
      if (saved && saved.userId === userId) {
        socket.emit('rejoin_game', { gameId: saved.gameId, userId, username });
      }

      // Only reset to disconnected if we weren't already in_game
      const { status } = get();
      if (status !== 'in_game') {
        set({ status: 'disconnected' });
      }
    });

    socket.on('matched', (data: {
      gameId: string;
      playerNumber: 1 | 2;
      opponent: { id: string; username: string };
      state: OnlineGameState;
      isRematch?: boolean;
    }) => {
      // Save session for reconnection
      saveOnlineSession({
        gameId: data.gameId,
        playerNum: data.playerNumber,
        opponent: data.opponent,
        qmode: 'casual',
        userId,
        username,
        boardSize: data.state.boardSize,
      });
      
      set({
        status: 'in_game',
        gameId: data.gameId,
        playerNum: data.playerNumber,
        opponent: data.opponent,
        gameState: data.state,
        onlineSelected: null,
        isWaitingForRematch: false,
        error: null,
      });
      
      // If this is a rematch, notify UI
      if (data.isRematch) {
        window.dispatchEvent(new CustomEvent('rematch-started', { detail: data }));
      }
    });

    socket.on('reconnected', (data: {
      gameId: string;
      playerNumber: 1 | 2;
      opponent: { id: string; username: string };
      state: OnlineGameState;
    }) => {
      set({
        status: 'in_game',
        gameId: data.gameId,
        playerNum: data.playerNumber,
        opponent: data.opponent,
        gameState: data.state,
        onlineSelected: null,
        error: null,
      });
      // Update persisted session with fresh state
      const saved = loadOnlineSession();
      if (saved) {
        saveOnlineSession({ ...saved, gameId: data.gameId });
      }
    });

    socket.on('move_made', (data: {
      gameId: string;
      from: number | null;
      to: number;
      playerNumber: 1 | 2;
      state: OnlineGameState;
    }) => {
      set({ gameState: data.state, onlineSelected: null });
    });

    socket.on('move_error', (data: { error: string }) => {
      set({ error: data.error });
      // Clear error after 3 seconds
      setTimeout(() => set({ error: null }), 3000);
    });

    socket.on('queued', (data: { position?: number; mode?: string; boardSize?: number }) => {
      set({ status: 'searching' });
    });

    socket.on('queue_left', () => {
      set({ status: 'disconnected' });
    });

    socket.on('opponent_disconnected', () => {
      set({ error: 'Opponent disconnected. Waiting for them to reconnect...' });
    });

    socket.on('opponent_reconnected', () => {
      set({ error: null });
    });

    socket.on('game_over', (data: { gameId: string; winnerPlayerNumber: 1 | 2; reason: string }) => {
      const { gameState } = get();
      if (gameState) {
        set({
          gameState: { ...gameState, winner: data.winnerPlayerNumber },
          winReason: data.reason ?? null,
          isWaitingForRematch: false,
        });
      }
      // Don't clear session immediately - allow rematch
      // clearOnlineSession();
    });

    socket.on('game_completed', (data: { gameId: string; winnerId: string; winnerUsername: string }) => {
      // Game is fully finalized, ready for rematch
      console.log('Game completed:', data);
    });

    // Rematch event handlers
    socket.on('rematch_offered', (data: { by: string }) => {
      set({ error: null });
      // Emit a custom event that your UI can listen for
      window.dispatchEvent(new CustomEvent('rematch-offered', { detail: data }));
    });

    socket.on('rematch_declined', () => {
      set({ 
        error: 'Opponent declined the rematch',
        isWaitingForRematch: false,
      });
      clearOnlineSession();
      setTimeout(() => {
        set({ status: 'disconnected', gameId: null, error: null });
      }, 3000);
    });

    socket.on('rematch_error', (data: { error: string }) => {
      set({ error: data.error, isWaitingForRematch: false });
    });

    socket.on('disconnect', () => {
      // Keep in_game status — socket.io will auto-reconnect
      const { status } = get();
      if (status !== 'in_game') {
        set({ status: 'disconnected' });
      }
    });

    socket.on('connect_error', (err) => {
      set({ error: `Connection error: ${err.message}` });
    });

    socket.on('online_counts', (data: OnlineCounts) => {
      set({ onlineCounts: data });
    });

    set({ socket });
  },

  joinQueue: (mode: 'casual' | 'ranked', userId: string, username: string, boardSize: BoardSize = 3) => {
    const { socket } = get();
    if (!socket?.connected) {
      set({ error: 'Not connected to server' });
      return;
    }
    set({ status: 'searching', error: null });
    socket.emit('join_queue', { mode, userId, username, boardSize });
  },

  leaveQueue: () => {
    const { socket } = get();
    if (!socket?.connected) return;
    socket.emit('leave_queue');
    set({ status: 'disconnected' });
  },

  makeMove: (from: number | null, to: number) => {
    const { socket, gameId, playerNum, gameState } = get();
    if (!socket?.connected || !gameId || !playerNum || !gameState) return;

    // Optimistic update: apply the move locally for instant visual feedback.
    const newBoard = [...gameState.board] as (1 | 2 | null)[];
    newBoard[to] = playerNum;
    if (from !== null) newBoard[from] = null;

    const newPiecesPlaced = from === null
      ? { ...gameState.piecesPlaced, [playerNum]: gameState.piecesPlaced[playerNum] + 1 }
      : { ...gameState.piecesPlaced };

    const nextPlayer = (playerNum === 1 ? 2 : 1) as 1 | 2;
    const bsz = gameState.boardSize;
    const allPlaced = newPiecesPlaced[1] >= bsz && newPiecesPlaced[2] >= bsz;
    const newPhase = gameState.phase === 'placement' && allPlaced ? 'movement' : gameState.phase;

    set({
      gameState: { 
        ...gameState, 
        board: newBoard, 
        piecesPlaced: newPiecesPlaced, 
        currentPlayer: nextPlayer, 
        phase: newPhase 
      },
      onlineSelected: null,
    });

    socket.emit('make_move', { gameId, playerNumber: playerNum, from, to });
  },

  resign: () => {
    const { socket, gameId, playerNum } = get();
    if (!socket?.connected || !gameId || !playerNum) return;
    socket.emit('resign', { gameId, playerNumber: playerNum });
    clearOnlineSession();
    set({ 
      status: 'disconnected', 
      gameId: null, 
      winReason: null,
      isWaitingForRematch: false,
    });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) socket.disconnect();
    clearOnlineSession();
    set({
      socket: null, 
      status: 'disconnected', 
      gameId: null,
      opponent: null, 
      playerNum: null, 
      gameState: null,
      onlineSelected: null, 
      winReason: null,
      isWaitingForRematch: false,
      error: null,
    });
  },

  setOnlineSelected: (pos) => set({ onlineSelected: pos }),

  requestRematch: () => {
    const { socket, gameId, isWaitingForRematch } = get();
    if (!socket?.connected || !gameId) {
      set({ error: 'Cannot request rematch: not connected' });
      return;
    }
    if (isWaitingForRematch) {
      set({ error: 'Already waiting for rematch response' });
      return;
    }
    set({ isWaitingForRematch: true, error: null });
    socket.emit('request_rematch', { gameId });
  },

  declineRematch: () => {
    const { socket, gameId } = get();
    if (!socket?.connected || !gameId) return;
    set({ isWaitingForRematch: false });
    socket.emit('decline_rematch', { gameId });
    clearOnlineSession();
    set({ status: 'disconnected', gameId: null });
  },

  clearRematch: () => {
    set({ isWaitingForRematch: false });
  },
}));
