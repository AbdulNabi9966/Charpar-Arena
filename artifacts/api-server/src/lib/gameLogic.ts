// Char Par game logic — server-side validation

export type Cell = 1 | 2 | null;
export type Board = Cell[];
export type GamePhase = "placement" | "movement";
export type Player = 1 | 2;
export type BoardSize = 3 | 4 | 5;

// ─── Cached generators ────────────────────────────────────────────────────────

const _winLinesCache = new Map<BoardSize, number[][]>();
const _adjacencyCache = new Map<BoardSize, Record<number, number[]>>();

export function generateWinLines(size: BoardSize): number[][] {
  if (_winLinesCache.has(size)) return _winLinesCache.get(size)!;
  const lines: number[][] = [];
  for (let r = 0; r < size; r++) {
    lines.push(Array.from({ length: size }, (_, c) => r * size + c));
  }
  for (let c = 0; c < size; c++) {
    lines.push(Array.from({ length: size }, (_, r) => r * size + c));
  }
  lines.push(Array.from({ length: size }, (_, i) => i * size + i));
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

// ─── Game state ────────────────────────────────────────────────────────────────

export interface GameState {
  board: Board;
  phase: GamePhase;
  currentPlayer: Player;
  piecesPlaced: { 1: number; 2: number };
  winner: Player | null;
  winLine: number[] | null;
  boardSize: BoardSize;
}

export function createInitialState(boardSize: BoardSize = 3): GameState {
  return {
    board: Array(boardSize * boardSize).fill(null),
    phase: "placement",
    currentPlayer: 1,
    piecesPlaced: { 1: 0, 2: 0 },
    winner: null,
    winLine: null,
    boardSize,
  };
}

// ─── Win check ────────────────────────────────────────────────────────────────

export function checkWinner(
  board: Board,
  size: BoardSize,
): { winner: Player | null; winLine: number[] | null } {
  for (const line of generateWinLines(size)) {
    const first = board[line[0]];
    if (first === null) continue;
    if (line.every(i => board[i] === first)) {
      return { winner: first as Player, winLine: line };
    }
  }
  return { winner: null, winLine: null };
}

// ─── Move application ─────────────────────────────────────────────────────────

export interface MoveResult {
  valid: boolean;
  error?: string;
  newState?: GameState;
}

export function applyMove(
  state: GameState,
  player: Player,
  from: number | null,
  to: number,
): MoveResult {
  const { boardSize } = state;
  const totalCells = boardSize * boardSize;

  if (state.winner) return { valid: false, error: "Game is already over" };
  if (state.currentPlayer !== player) return { valid: false, error: "Not your turn" };
  if (to < 0 || to >= totalCells) return { valid: false, error: "Invalid position" };

  const newBoard = [...state.board] as Board;

  if (state.phase === "placement") {
    if (from !== null) return { valid: false, error: "Cannot move pieces during placement phase" };
    if (newBoard[to] !== null) return { valid: false, error: "Position already occupied" };
    if (state.piecesPlaced[player] >= boardSize) return { valid: false, error: "All pieces already placed" };

    newBoard[to] = player;
    const newPiecesPlaced = {
      1: state.piecesPlaced[1] + (player === 1 ? 1 : 0),
      2: state.piecesPlaced[2] + (player === 2 ? 1 : 0),
    };

    const { winner, winLine } = checkWinner(newBoard, boardSize);
    const totalPlaced = newPiecesPlaced[1] + newPiecesPlaced[2];
    const newPhase: GamePhase = totalPlaced >= 2 * boardSize ? "movement" : "placement";

    return {
      valid: true,
      newState: {
        board: newBoard,
        phase: newPhase,
        currentPlayer: player === 1 ? 2 : 1,
        piecesPlaced: newPiecesPlaced,
        winner,
        winLine,
        boardSize,
      },
    };

  } else {
    // Movement phase
    if (from === null) return { valid: false, error: "Must specify source position" };
    if (from < 0 || from >= totalCells) return { valid: false, error: "Invalid source position" };
    if (newBoard[from] !== player) return { valid: false, error: "No piece at source belonging to you" };
    if (newBoard[to] !== null) return { valid: false, error: "Destination is occupied" };

    const adj = generateAdjacency(boardSize);
    if (!adj[from]?.includes(to)) return { valid: false, error: "Positions are not adjacent" };

    newBoard[from] = null;
    newBoard[to] = player;

    const { winner, winLine } = checkWinner(newBoard, boardSize);

    return {
      valid: true,
      newState: {
        board: newBoard,
        phase: "movement",
        currentPlayer: player === 1 ? 2 : 1,
        piecesPlaced: state.piecesPlaced,
        winner,
        winLine,
        boardSize,
      },
    };
  }
}
