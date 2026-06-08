import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Board, Cell, GamePhase, Player, BoardSize,
  checkWin, getValidMoves, createInitialBoard,
} from '../lib/gameLogic';

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
  boardSize: BoardSize;

  placePiece: (pos: number) => void;
  selectPiece: (pos: number) => void;
  movePiece: (to: number) => void;
  /** Atomic AI move — select + move in one state update */
  moveAIPiece: (from: number, to: number) => void;
  resetGame: (
    mode?: GameMode,
    difficulty?: 'easy' | 'medium' | 'hard' | 'expert',
    boardSize?: BoardSize,
  ) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      board: createInitialBoard(3),
      phase: 'placement',
      currentPlayer: 1,
      piecesPlaced: { 1: 0, 2: 0 },
      selectedPiece: null,
      winner: null,
      winLine: null,
      moveHistory: [],
      gameMode: 'local',
      aiDifficulty: 'medium',
      boardSize: 3,

      placePiece: (pos) => {
        const s = get();
        if (s.winner || s.phase !== 'placement') return;
        if (s.board[pos] !== null) return;
        if (s.piecesPlaced[s.currentPlayer] >= s.boardSize) return;

        const newBoard = [...s.board] as Board;
        newBoard[pos] = s.currentPlayer as Cell;

        const newPiecesPlaced = {
          ...s.piecesPlaced,
          [s.currentPlayer]: s.piecesPlaced[s.currentPlayer] + 1,
        };
        const { winner, line } = checkWin(newBoard, s.boardSize);
        const totalPlaced = newPiecesPlaced[1] + newPiecesPlaced[2];
        const newPhase: GamePhase = totalPlaced >= 2 * s.boardSize ? 'movement' : 'placement';

        set({
          board: newBoard,
          piecesPlaced: newPiecesPlaced,
          currentPlayer: s.currentPlayer === 1 ? 2 : 1,
          phase: newPhase,
          winner,
          winLine: line,
          selectedPiece: null,
          moveHistory: [...s.moveHistory, { player: s.currentPlayer, from: null, to: pos }],
        });
      },

      selectPiece: (pos) => {
        const s = get();
        if (s.winner || s.phase !== 'movement') return;
        if (s.board[pos] === s.currentPlayer) set({ selectedPiece: pos });
      },

      movePiece: (to) => {
        const s = get();
        if (s.winner || s.phase !== 'movement' || s.selectedPiece === null) return;

        const valid = getValidMoves(s.board, s.selectedPiece, s.boardSize);
        if (!valid.includes(to)) return;

        const newBoard = [...s.board] as Board;
        newBoard[s.selectedPiece] = null;
        newBoard[to] = s.currentPlayer as Cell;

        const { winner, line } = checkWin(newBoard, s.boardSize);
        set({
          board: newBoard,
          selectedPiece: null,
          currentPlayer: s.currentPlayer === 1 ? 2 : 1,
          winner,
          winLine: line,
          moveHistory: [...s.moveHistory, { player: s.currentPlayer, from: s.selectedPiece, to }],
        });
      },

      moveAIPiece: (from, to) => {
        const s = get();
        if (s.winner || s.phase !== 'movement') return;
        if (s.board[from] !== s.currentPlayer) return;

        const valid = getValidMoves(s.board, from, s.boardSize);
        if (!valid.includes(to)) return;

        const newBoard = [...s.board] as Board;
        newBoard[from] = null;
        newBoard[to] = s.currentPlayer as Cell;

        const { winner, line } = checkWin(newBoard, s.boardSize);
        set({
          board: newBoard,
          selectedPiece: null,
          currentPlayer: s.currentPlayer === 1 ? 2 : 1,
          winner,
          winLine: line,
          moveHistory: [...s.moveHistory, { player: s.currentPlayer, from, to }],
        });
      },

      resetGame: (mode?, difficulty?, boardSize?) => {
        const cur = get();
        const newSize = boardSize ?? cur.boardSize;
        set({
          board: createInitialBoard(newSize),
          phase: 'placement',
          currentPlayer: 1,
          piecesPlaced: { 1: 0, 2: 0 },
          selectedPiece: null,
          winner: null,
          winLine: null,
          moveHistory: [],
          gameMode: mode ?? cur.gameMode,
          aiDifficulty: difficulty ?? cur.aiDifficulty,
          boardSize: newSize,
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
        boardSize: s.boardSize,
      }),
    }
  )
);
