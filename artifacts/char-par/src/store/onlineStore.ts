import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { GamePhase } from '../lib/gameLogic';

type OnlineStatus = 'disconnected' | 'connecting' | 'searching' | 'in_game';

type GameState = {
  board: (1 | 2 | null)[];
  phase: GamePhase;
  currentPlayer: 1 | 2;
  piecesPlaced: { 1: number; 2: number };
  winner: 1 | 2 | null;
  winLine: number[] | null;
};

type OnlineState = {
  socket: Socket | null;
  status: OnlineStatus;
  gameId: string | null;
  playerNum: 1 | 2 | null;
  opponent: { id: string; username: string } | null;
  gameState: GameState | null;
  error: string | null;

  connect: (userId: string, username: string, token: string) => void;
  joinQueue: (mode: 'casual' | 'ranked') => void;
  leaveQueue: () => void;
  makeMove: (from: number | null, to: number) => void;
  resign: () => void;
  disconnect: () => void;
};

export const useOnlineStore = create<OnlineState>((set, get) => ({
  socket: null,
  status: 'disconnected',
  gameId: null,
  playerNum: null,
  opponent: null,
  gameState: null,
  error: null,

  connect: (userId: string, username: string, _token: string) => {
    const existing = get().socket;
    if (existing?.connected) {
      // Try to reconnect to existing game
      existing.emit('register', { userId, username });
      return;
    }

    set({ status: 'connecting', error: null });

    const socket = io('/', {
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      socket.emit('register', { userId, username });
      set({ status: 'disconnected' });
    });

    socket.on('matched', (data: {
      gameId: string;
      playerNumber: 1 | 2;
      opponent: { id: string; username: string };
      state: GameState;
    }) => {
      set({
        status: 'in_game',
        gameId: data.gameId,
        playerNum: data.playerNumber,
        opponent: data.opponent,
        gameState: data.state,
      });
    });

    socket.on('reconnected', (data: {
      gameId: string;
      playerNumber: 1 | 2;
      opponent: { id: string; username: string };
      state: GameState;
    }) => {
      set({
        status: 'in_game',
        gameId: data.gameId,
        playerNum: data.playerNumber,
        opponent: data.opponent,
        gameState: data.state,
      });
    });

    socket.on('move_made', (data: {
      gameId: string;
      from: number | null;
      to: number;
      playerNumber: 1 | 2;
      state: GameState;
    }) => {
      set({ gameState: data.state });
    });

    socket.on('move_error', (data: { error: string }) => {
      set({ error: data.error });
    });

    socket.on('queued', () => {
      set({ status: 'searching' });
    });

    socket.on('queue_left', () => {
      set({ status: 'disconnected' });
    });

    socket.on('opponent_disconnected', () => {
      set({ error: 'Opponent disconnected. Waiting for reconnect...' });
    });

    socket.on('opponent_reconnected', () => {
      set({ error: null });
    });

    socket.on('game_over', (data: { gameId: string; winnerPlayerNumber: 1 | 2; reason: string }) => {
      const { gameState } = get();
      if (gameState) {
        set({
          gameState: { ...gameState, winner: data.winnerPlayerNumber },
          status: 'disconnected',
          gameId: null,
        });
      }
    });

    socket.on('disconnect', () => {
      const { status } = get();
      if (status === 'in_game') {
        // Stay in in_game state — socket.io will try to reconnect
      } else {
        set({ status: 'disconnected' });
      }
    });

    socket.on('connect_error', (err) => {
      set({ error: `Connection error: ${err.message}`, status: 'disconnected' });
    });

    set({ socket });
  },

  joinQueue: (mode: 'casual' | 'ranked') => {
    const { socket } = get();
    if (!socket?.connected) return;
    set({ status: 'searching' });
    socket.emit('join_queue', {
      mode,
      userId: '', // Will be populated by the socket after register
      username: '',
    });
  },

  leaveQueue: () => {
    const { socket } = get();
    if (!socket?.connected) return;
    socket.emit('leave_queue');
    set({ status: 'disconnected' });
  },

  makeMove: (from: number | null, to: number) => {
    const { socket, gameId, playerNum } = get();
    if (!socket?.connected || !gameId || !playerNum) return;
    socket.emit('make_move', { gameId, playerNumber: playerNum, from, to });
  },

  resign: () => {
    const { socket, gameId, playerNum } = get();
    if (!socket?.connected || !gameId || !playerNum) return;
    socket.emit('resign', { gameId, playerNumber: playerNum });
    set({ status: 'disconnected', gameId: null });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({ socket: null, status: 'disconnected', gameId: null, opponent: null, playerNum: null, gameState: null });
  },
}));
