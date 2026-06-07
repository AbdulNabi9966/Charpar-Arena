import { create } from 'zustand';
import { Board, Cell, GamePhase, Player, checkWin, getValidMoves } from '../lib/gameLogic';

interface GameState {
  board: Board;
  phase: GamePhase;
  currentPlayer: Player;
  piecesPlaced: { 1: number; 2: number };
  selectedPiece: number | null;
  winner: Player | null;
  winLine: number[] | null;
  moveHistory: Array<{ player: Player; from: number | null; to: number }>;
  
  placePiece: (pos: number) => void;
  selectPiece: (pos: number) => void;
  movePiece: (to: number) => void;
  resetGame: () => void;
}

const initialBoard: Board = [null, null, null, null, null, null, null, null, null];

export const useGameStore = create<GameState>((set, get) => ({
  board: [...initialBoard],
  phase: 'placement',
  currentPlayer: 1,
  piecesPlaced: { 1: 0, 2: 0 },
  selectedPiece: null,
  winner: null,
  winLine: null,
  moveHistory: [],

  placePiece: (pos: number) => {
    const state = get();
    if (state.winner || state.phase !== 'placement' || state.board[pos] !== null) return;
    if (state.piecesPlaced[state.currentPlayer] >= 3) return;

    const newBoard = [...state.board] as Board;
    newBoard[pos] = state.currentPlayer as Cell;
    
    const newPiecesPlaced = { ...state.piecesPlaced, [state.currentPlayer]: state.piecesPlaced[state.currentPlayer] + 1 };
    
    const { winner, line } = checkWin(newBoard);
    
    const newPhase: 'placement' | 'movement' = (newPiecesPlaced[1] === 3 && newPiecesPlaced[2] === 3) ? 'movement' : 'placement';

    set({
      board: newBoard,
      piecesPlaced: newPiecesPlaced,
      currentPlayer: state.currentPlayer === 1 ? 2 : 1,
      phase: newPhase,
      winner,
      winLine: line,
      moveHistory: [...state.moveHistory, { player: state.currentPlayer, from: null, to: pos }]
    });
  },

  selectPiece: (pos: number) => {
    const state = get();
    if (state.winner || state.phase !== 'movement') return;
    if (state.board[pos] === state.currentPlayer) {
      set({ selectedPiece: pos });
    }
  },

  movePiece: (to: number) => {
    const state = get();
    if (state.winner || state.phase !== 'movement' || state.selectedPiece === null) return;
    
    const validMoves = getValidMoves(state.board, state.selectedPiece);
    if (!validMoves.includes(to)) return;

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
      moveHistory: [...state.moveHistory, { player: state.currentPlayer, from: state.selectedPiece, to }]
    });
  },

  resetGame: () => {
    set({
      board: [...initialBoard],
      phase: 'placement',
      currentPlayer: 1,
      piecesPlaced: { 1: 0, 2: 0 },
      selectedPiece: null,
      winner: null,
      winLine: null,
      moveHistory: []
    });
  }
}));
