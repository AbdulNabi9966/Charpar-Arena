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

// Prevent duplicate join attempts
let joinInProgress = false;

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
  rejoinGame: (gameId: string, userId: string, username: string) => void;
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
      console.log('🔌 Socket connected');
      socket.emit('register', { userId, username });

      const saved = loadOnlineSession();
      if (saved && saved.userId === userId) {
        console.log('🔄 Found saved session, rejoining game:', saved.gameId);
        socket.emit('rejoin_game', { gameId: saved.gameId, userId, username });
      }

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
      console.log('🎮 Matched! Game:', data.gameId);
      
      joinInProgress = false;
      
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
      console.log('🔄 Reconnected to game:', data.gameId);
      
      joinInProgress = false;
      
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
        error: null,
      });
      
      window.dispatchEvent(new CustomEvent('reconnected', { detail: data }));
    });

    socket.on('move_made', (data: {
      gameId: string;
      from: number | null;
      to: number;
      playerNumber: 1 | 2;
      state: OnlineGameState;
    }) => {
      console.log('♟️ Move made:', data.from, '->', data.to);
      set({ gameState: data.state, onlineSelected: null });
    });

    socket.on('move_error', (data: { error: string }) => {
      console.log('❌ Move error:', data.error);
      set({ error: data.error });
      setTimeout(() => set({ error: null }), 3000);
    });

    socket.on('queued', (data: { position?: number; mode?: string; boardSize?: number }) => {
      console.log('⏳ Queued:', data);
      set({ status: 'searching' });
    });

    socket.on('queue_left', () => {
      console.log('🚪 Left queue');
      joinInProgress = false;
      set({ status: 'disconnected' });
    });

    socket.on('opponent_disconnected', () => {
      console.log('⚠️ Opponent disconnected');
      set({ error: 'Opponent disconnected. Waiting for them to reconnect...' });
    });

    socket.on('opponent_reconnected', () => {
      console.log('✅ Opponent reconnected');
      set({ error: null });
    });

    socket.on('game_over', (data: { gameId: string; winnerPlayerNumber: 1 | 2; reason: string }) => {
      console.log('🏁 Game over:', data);
      const { gameState } = get();
      if (gameState) {
        set({
          gameState: { ...gameState, winner: data.winnerPlayerNumber },
          winReason: data.reason ?? null,
          isWaitingForRematch: false,
        });
      }
    });

    socket.on('game_completed', (data: { gameId: string; winnerId: string; winnerUsername: string }) => {
      console.log('✅ Game completed:', data);
    });

    socket.on('rematch_offered', (data: { by: string }) => {
      console.log('💬 Rematch offered by:', data.by);
      set({ error: null });
      window.dispatchEvent(new CustomEvent('rematch-offered', { detail: data }));
    });

    socket.on('rematch_declined', () => {
      console.log('❌ Rematch declined');
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
      console.log('❌ Rematch error:', data.error);
      set({ error: data.error, isWaitingForRematch: false });
    });

    socket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      const { status } = get();
      if (status !== 'in_game') {
        set({ status: 'disconnected' });
      }
    });

    socket.on('connect_error', (err) => {
      console.log('❌ Connection error:', err.message);
      set({ error: `Connection error: ${err.message}` });
    });

    socket.on('online_counts', (data: OnlineCounts) => {
      set({ onlineCounts: data });
    });

    set({ socket });
  },

  joinQueue: (mode: 'casual' | 'ranked', userId: string, username: string, boardSize: BoardSize = 3) => {
    if (joinInProgress) {
      console.log('⏭️ Join already in progress, skipping');
      return;
    }
    
    const { socket, status, gameId } = get();
    if (!socket?.connected) {
      set({ error: 'Not connected to server' });
      return;
    }
    
    if (status === 'in_game' || gameId) {
      console.log('⏭️ Already in game, not joining queue');
      return;
    }
    
    console.log('🎯 Joining queue with boardSize:', boardSize);
    console.log('🎯 Full join data:', { mode, userId, username, boardSize });
    
    joinInProgress = true;
    set({ status: 'searching', error: null });
    socket.emit('join_queue', { mode, userId, username, boardSize });
    
    setTimeout(() => {
      joinInProgress = false;
    }, 3000);
  },

  leaveQueue: () => {
    const { socket } = get();
    if (!socket?.connected) return;
    console.log('🚪 Leaving queue');
    joinInProgress = false;
    socket.emit('leave_queue');
    set({ status: 'disconnected' });
  },

  makeMove: (from: number | null, to: number) => {
    const { socket, gameId, playerNum, gameState } = get();
    if (!socket?.connected || !gameId || !playerNum || !gameState) {
      console.log('❌ Cannot make move: missing required state');
      return;
    }

    console.log('♟️ Making move:', { from, to, gameId, playerNum });

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
    console.log('🏳️ Resigning from game:', gameId);
    socket.emit('resign', { gameId, playerNumber: playerNum });
    joinInProgress = false;
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
    console.log('🔌 Disconnecting socket');
    joinInProgress = false;
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
    console.log('🔄 Requesting rematch for game:', gameId);
    set({ isWaitingForRematch: true, error: null });
    socket.emit('request_rematch', { gameId });
  },

  declineRematch: () => {
    const { socket, gameId } = get();
    if (!socket?.connected || !gameId) return;
    console.log('❌ Declining rematch for game:', gameId);
    set({ isWaitingForRematch: false });
    socket.emit('decline_rematch', { gameId });
    joinInProgress = false;
    clearOnlineSession();
    set({ status: 'disconnected', gameId: null });
  },

  clearRematch: () => {
    set({ isWaitingForRematch: false });
  },

  rejoinGame: (gameId: string, userId: string, username: string) => {
    const { socket } = get();
    if (!socket?.connected) {
      set({ error: 'Not connected to server' });
      return;
    }
    console.log('🔄 Rejoining game:', gameId);
    socket.emit('rejoin_game', { gameId, userId, username });
  },
}));
