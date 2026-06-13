export type Player = 1 | 2;
export type Cell = 1 | 2 | null;
export type Board = Cell[];
export type GamePhase = 'placement' | 'movement';
export type BoardSize = 3 | 4 | 5;

// ─── Hardcoded adjacency maps per the official Char Par rules ─────────────────
//
// 3×3: Only the center (pos 4) has diagonal connections.
//       Corner/edge cells connect only along straight lines + to center.
//
// 4×4: Inner ring (5,6,9,10) has diagonal connections; outer ring mostly straight.
//
// 5×5: Only certain positions have diagonals; center (12) has 8 connections.

const ADJACENCY_3x3: Record<number, number[]> = {
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

const ADJACENCY_4x4: Record<number, number[]> = {
  0:  [1, 4, 5],
  1:  [0, 2, 5],
  2:  [1, 3, 6],
  3:  [2, 6, 7],
  4:  [0, 5, 8],
  5:  [0, 1, 4, 6, 9, 10],
  6:  [2, 3, 5, 7, 9, 10],
  7:  [3, 6, 11],
  8:  [4, 9, 12],
  9:  [5, 6, 8, 10, 12, 13],
  10: [5, 6, 9, 11, 14, 15],
  11: [7, 10, 15],
  12: [8, 9, 13],
  13: [9, 12, 14],
  14: [10, 13, 15],
  15: [10, 11, 14],
};

const ADJACENCY_5x5: Record<number, number[]> = {
  0:  [1, 5, 6],
  1:  [0, 2, 6],
  2:  [1, 3, 7],
  3:  [2, 4, 8],
  4:  [3, 8, 9],
  5:  [0, 6, 10],
  6:  [0, 1, 5, 7, 11, 12],
  7:  [2, 6, 8, 12],
  8:  [3, 4, 7, 9, 12, 13],
  9:  [4, 8, 14],
  10: [5, 11, 15],
  11: [6, 10, 12, 16],
  12: [6, 7, 8, 11, 13, 16, 17, 18],
  13: [8, 12, 14, 18],
  14: [9, 13, 19],
  15: [10, 16, 20],
  16: [11, 12, 15, 17, 20, 21],
  17: [12, 16, 18, 22],
  18: [12, 13, 17, 19, 23, 24],
  19: [14, 18, 24],
  20: [15, 16, 21],
  21: [16, 20, 22],
  22: [17, 21, 23],
  23: [18, 22, 24],
  24: [18, 19, 23],
};

const ADJACENCY_MAP: Record<BoardSize, Record<number, number[]>> = {
  3: ADJACENCY_3x3,
  4: ADJACENCY_4x4,
  5: ADJACENCY_5x5,
};

// ─── Winning lines per the official rules ─────────────────────────────────────
//
// 3×3 : 8 lines  (3H + 3V + 2 diagonals through center)
// 4×4 : 10 lines (4H + 4V + 2 main diagonals)
// 5×5 : 12 lines (5H + 5V + 2 main diagonals)

const WIN_LINES_3x3: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],          // horizontal
  [0, 3, 6], [1, 4, 7], [2, 5, 8],          // vertical
  [0, 4, 8], [2, 4, 6],                      // diagonals
];

const WIN_LINES_4x4: number[][] = [
  [0,  1,  2,  3], [4,  5,  6,  7], [8,  9,  10, 11], [12, 13, 14, 15],  // horizontal
  [0,  4,  8,  12], [1, 5,  9,  13], [2,  6,  10, 14], [3,  7,  11, 15], // vertical
  [0,  5,  10, 15], [3,  6,  9,  12],                                     // diagonals
];

const WIN_LINES_5x5: number[][] = [
  [0,  1,  2,  3,  4],  [5,  6,  7,  8,  9],  [10, 11, 12, 13, 14],     // horizontal
  [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0,  5,  10, 15, 20], [1,  6,  11, 16, 21], [2,  7,  12, 17, 22],     // vertical
  [3,  8,  13, 18, 23], [4,  9,  14, 19, 24],
  [0,  6,  12, 18, 24], [4,  8,  12, 16, 20],                            // diagonals
];

const WIN_LINES_MAP: Record<BoardSize, number[][]> = {
  3: WIN_LINES_3x3,
  4: WIN_LINES_4x4,
  5: WIN_LINES_5x5,
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateWinLines(size: BoardSize): number[][] {
  return WIN_LINES_MAP[size];
}

export function generateAdjacency(size: BoardSize): Record<number, number[]> {
  return ADJACENCY_MAP[size];
}

// Backward-compat exports for any code still using the 3×3 constants
export const WINNING_LINES = WIN_LINES_3x3;
export const ADJACENCY_LIST = ADJACENCY_3x3;

// ─── Core game functions ──────────────────────────────────────────────────────

export function createInitialBoard(size: BoardSize): Board {
  return Array(size * size).fill(null);
}

export function checkWin(
  board: Board,
  size: BoardSize = 3,
): { winner: Player | null; line: number[] | null } {
  for (const line of generateWinLines(size)) {
    const first = board[line[0]];
    if (first === null) continue;
    if (line.every(i => board[i] === first)) {
      return { winner: first as Player, line };
    }
  }
  return { winner: null, line: null };
}

export function getValidMoves(
  board: Board,
  from: number,
  size: BoardSize = 3,
): number[] {
  const adj = generateAdjacency(size);
  return (adj[from] ?? []).filter(to => board[to] === null);
}
