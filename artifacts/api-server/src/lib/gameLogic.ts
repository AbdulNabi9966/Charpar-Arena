// Char Par game logic — server-side validation

export type Cell = 1 | 2 | null;
export type Board = [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell];
export type GamePhase = "placement" | "movement";
export type Player = 1 | 2;

export const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // horizontal
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // vertical
  [0, 4, 8], [2, 4, 6],             // diagonal
];

// Adjacency map for the Char Par board
// Position 4 (center) connects to all positions
// Edges connect horizontally and vertically, plus diagonals through center
export const ADJACENCY: Record<number, number[]> = {
  0: [1, 3, 4],
  1: [0, 2, 4],
  2: [1, 4, 5],
  3: [0, 4, 6],
  4: [0, 1, 2, 3, 5, 6, 7, 8],
  5: [2, 4, 8],
  6: [3, 4, 7],
  7: [4, 6, 8],
  8: [4, 5, 7],
};

export function checkWinner(board: Board): { winner: Player | null; winLine: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as Player, winLine: line };
    }
  }
  return { winner: null, winLine: null };
}

export function isAdjacent(from: number, to: number): boolean {
  return ADJACENCY[from]?.includes(to) ?? false;
}

export interface GameState {
  board: Board;
  phase: GamePhase;
  currentPlayer: Player;
  piecesPlaced: { 1: number; 2: number };
  winner: Player | null;
  winLine: number[] | null;
}

export function createInitialState(): GameState {
  return {
    board: [null, null, null, null, null, null, null, null, null],
    phase: "placement",
    currentPlayer: 1,
    piecesPlaced: { 1: 0, 2: 0 },
    winner: null,
    winLine: null,
  };
}

export interface MoveResult {
  valid: boolean;
  error?: string;
  newState?: GameState;
}

export function applyMove(
  state: GameState,
  player: Player,
  from: number | null,
  to: number
): MoveResult {
  if (state.winner) {
    return { valid: false, error: "Game is already over" };
  }

  if (state.currentPlayer !== player) {
    return { valid: false, error: "Not your turn" };
  }

  if (to < 0 || to > 8) {
    return { valid: false, error: "Invalid position" };
  }

  const newBoard = [...state.board] as Board;

  if (state.phase === "placement") {
    if (from !== null) {
      return { valid: false, error: "Cannot move pieces during placement phase" };
    }

    if (newBoard[to] !== null) {
      return { valid: false, error: "Position already occupied" };
    }

    if (state.piecesPlaced[player] >= 3) {
      return { valid: false, error: "All pieces already placed" };
    }

    newBoard[to] = player;

    const newPiecesPlaced = {
      1: state.piecesPlaced[1] + (player === 1 ? 1 : 0),
      2: state.piecesPlaced[2] + (player === 2 ? 1 : 0),
    };

    const { winner, winLine } = checkWinner(newBoard);
    const totalPlaced = newPiecesPlaced[1] + newPiecesPlaced[2];
    const newPhase: GamePhase = totalPlaced >= 6 ? "movement" : "placement";

    return {
      valid: true,
      newState: {
        board: newBoard,
        phase: newPhase,
        currentPlayer: player === 1 ? 2 : 1,
        piecesPlaced: newPiecesPlaced,
        winner,
        winLine,
      },
    };
  } else {
    // Movement phase
    if (from === null) {
      return { valid: false, error: "Must specify source position in movement phase" };
    }

    if (from < 0 || from > 8) {
      return { valid: false, error: "Invalid source position" };
    }

    if (newBoard[from] !== player) {
      return { valid: false, error: "No piece at source position belonging to you" };
    }

    if (newBoard[to] !== null) {
      return { valid: false, error: "Destination position is occupied" };
    }

    if (!isAdjacent(from, to)) {
      return { valid: false, error: "Positions are not adjacent" };
    }

    newBoard[from] = null;
    newBoard[to] = player;

    const { winner, winLine } = checkWinner(newBoard);

    return {
      valid: true,
      newState: {
        board: newBoard,
        phase: "movement",
        currentPlayer: player === 1 ? 2 : 1,
        piecesPlaced: state.piecesPlaced,
        winner,
        winLine,
      },
    };
  }
}
