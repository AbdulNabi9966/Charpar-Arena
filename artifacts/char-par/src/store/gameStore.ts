import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Board, Cell, GamePhase, Player, checkWin, getValidMoves } from '../lib/gameLogic';

type GameMode = 'local' | 'ai';

interface GameState {
  board: Board;
  phase: GamePhase;
  currentPlayer: Player;
  piecesPlaced: { 1: number; 2: number };
  selectedPiece: number | null;
  winner: Player | null;
  winLine: number[] | null;
  moveHistory: Array<{ player: Player; from: number | null; to: number }>;
  gameMode: GameMode;
  aiDifficulty: 'easy' | 'medium' | 'hard' | 'expert';

  placePiece: (pos: number) => void;
  selectPiece: (pos: number) => void;
  movePiece: (to: number) => void;
  /** Atomic AI move — combines select + move in one state update */
  moveAIPiece: (from: number, to: number) => void;
  resetGame: (mode?: GameMode, difficulty?: 'easy' | 'medium' | 'hard' | 'expert') => void;
}

const initialBoard: Board = [null, null, null, null, null, null, null, null, null];

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      board: [...initialBoard],
      phase: 'placement',
      currentPlayer: 1,
      piecesPlaced: { 1: 0, 2: 0 },
      selectedPiece: null,
      winner: null,
      winLine: null,
      moveHistory: [],
      gameMode: 'local',
      aiDifficulty: 'medium',

      placePiece: (pos) => {
        const state = get();
        if (state.winner || state.phase !== 'placement') return;
        if (state.board[pos] !== null) return;
        if (state.piecesPlaced[state.currentPlayer] >= 3) return;

        const newBoard = [...state.board] as Board;
        newBoard[pos] = state.currentPlayer as Cell;

        const newPiecesPlaced = {
          ...state.piecesPlaced,
          [state.currentPlayer]: state.piecesPlaced[state.currentPlayer] + 1,
        };
        const { winner, line } = checkWin(newBoard);
        const newPhase: GamePhase =
          newPiecesPlaced[1] === 3 && newPiecesPlaced[2] === 3 ? 'movement' : 'placement';

        set({
          board: newBoard,
          piecesPlaced: newPiecesPlaced,
          currentPlayer: state.currentPlayer === 1 ? 2 : 1,
          phase: newPhase,
          winner,
          winLine: line,
          selectedPiece: null,
          moveHistory: [...state.moveHistory, { player: state.currentPlayer, from: null, to: pos }],
        });
      },

      selectPiece: (pos) => {
        const state = get();
        if (state.winner || state.phase !== 'movement') return;
        if (state.board[pos] === state.currentPlayer) {
          set({ selectedPiece: pos });
        }
      },

      movePiece: (to) => {
        const state = get();
        if (state.winner || state.phase !== 'movement' || state.selectedPiece === null) return;

        const valid = getValidMoves(state.board, state.selectedPiece);
        if (!valid.includes(to)) return;

        const newBoard = [...state.board] as Board;
        newBoard[state.selectedPiece] = null;
        newBoard[to] = state.currentPlayer as Cell;

        const { winner, line } = checkWin(newBoard);
        set({
          board: newBoard,
          selectedPiece: null,
          currentPlayer: state.currentPlayer === 1 ? 2 : 1,
          winner,
          winLine: line,
          moveHistory: [...state.moveHistory, { player: state.currentPlayer, from: state.selectedPiece, to }],
        });
      },

      moveAIPiece: (from, to) => {
        const state = get();
        if (state.winner || state.phase !== 'movement') return;
        if (state.board[from] !== state.currentPlayer) return;

        const valid = getValidMoves(state.board, from);
        if (!valid.includes(to)) return;

        const newBoard = [...state.board] as Board;
        newBoard[from] = null;
        newBoard[to] = state.currentPlayer as Cell;

        const { winner, line } = checkWin(newBoard);
        set({
          board: newBoard,
          selectedPiece: null,
          currentPlayer: state.currentPlayer === 1 ? 2 : 1,
          winner,
          winLine: line,
          moveHistory: [...state.moveHistory, { player: state.currentPlayer, from, to }],
        });
      },

      resetGame: (mode?, difficulty?) => {
        set({
          board: [...initialBoard],
          phase: 'placement',
          currentPlayer: 1,
          piecesPlaced: { 1: 0, 2: 0 },
          selectedPiece: null,
          winner: null,
          winLine: null,
          moveHistory: [],
          gameMode: mode ?? get().gameMode,
          aiDifficulty: difficulty ?? get().aiDifficulty,
        });
      },
    }),
    {
      name: 'char-par-game',
      partialize: (s) => ({
        board: s.board,
        phase: s.phase,
        currentPlayer: s.currentPlayer,
        piecesPlaced: s.piecesPlaced,
        winner: s.winner,
        winLine: s.winLine,
        moveHistory: s.moveHistory,
        gameMode: s.gameMode,
        aiDifficulty: s.aiDifficulty,
      }),
    }
  )
);
