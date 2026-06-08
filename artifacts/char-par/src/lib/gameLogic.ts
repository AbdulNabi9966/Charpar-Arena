export type Player = 1 | 2;
export type Cell = 1 | 2 | null;
export type Board = Cell[];
export type GamePhase = 'placement' | 'movement';
export type BoardSize = 3 | 4 | 5;

// ─── Cached generators ────────────────────────────────────────────────────────

const _winLinesCache = new Map<BoardSize, number[][]>();
const _adjacencyCache = new Map<BoardSize, Record<number, number[]>>();

export function generateWinLines(size: BoardSize): number[][] {
  if (_winLinesCache.has(size)) return _winLinesCache.get(size)!;

  const lines: number[][] = [];

  // Horizontal
  for (let r = 0; r < size; r++) {
    lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  }
  // Vertical
  for (let c = 0; c < size; c++) {
    lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  }
  // Main diagonal (top-left → bottom-right)
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
  // Anti-diagonal (top-right → bottom-left)
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)));

  _winLinesCache.set(size, lines);
  return lines;
}

export function generateAdjacency(size: BoardSize): Record<number, number[]> {
  if (_adjacencyCache.has(size)) return _adjacencyCache.get(size)!;

  const adj: Record<number, number[]> = {};
  for (let pos = 0; pos < size * size; pos++) {
    const row = Math.floor(pos / size);
    const col = pos % size;
    const neighbors: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          neighbors.push(nr * size + nc);
        }
      }
    }
    adj[pos] = neighbors;
  }
  _adjacencyCache.set(size, adj);
  return adj;
}

// Backward-compat exports for any code still using the 3×3 constants
export const WINNING_LINES = generateWinLines(3);
export const ADJACENCY_LIST = generateAdjacency(3);

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
