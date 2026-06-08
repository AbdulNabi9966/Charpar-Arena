import {
  Board, Cell, Player, BoardSize,
  checkWin, getValidMoves, generateWinLines, generateAdjacency,
} from './gameLogic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneBoard(board: Board): Board {
  return board.slice() as Board;
}

// ─── Heuristic evaluation ─────────────────────────────────────────────────────

function evaluate(board: Board, size: BoardSize): number {
  let score = 0;
  const lines = generateWinLines(size);

  for (const line of lines) {
    const cells  = line.map(i => board[i]);
    const ai     = cells.filter(x => x === 2).length;
    const human  = cells.filter(x => x === 1).length;
    const empty  = cells.filter(x => x === null).length;

    if (human === 0) {
      if (ai === size - 1 && empty === 1) score += 8;
      else if (ai === size - 2 && empty === 2) score += 2;
      else if (ai > 0) score += 0.5;
    }
    if (ai === 0) {
      if (human === size - 1 && empty === 1) score -= 8;
      else if (human === size - 2 && empty === 2) score -= 2;
      else if (human > 0) score -= 0.5;
    }
  }

  // Center cell(s) bonus
  const mid = Math.floor(size / 2);
  const centerPos = mid * size + mid;
  if (board[centerPos] === 2) score += 3;
  if (board[centerPos] === 1) score -= 3;

  // Corner bonus
  for (const pos of [0, size - 1, (size - 1) * size, size * size - 1]) {
    if (board[pos] === 2) score += 0.5;
    if (board[pos] === 1) score -= 0.5;
  }

  return score;
}

// ─── Minimax state ────────────────────────────────────────────────────────────

interface MMState {
  board: Board;
  currentPlayer: Player;
  p1Placed: number;
  p2Placed: number;
  size: BoardSize;
}

function minimax(s: MMState, depth: number, alpha: number, beta: number): number {
  const { winner } = checkWin(s.board, s.size);
  if (winner === 2) return 10_000 + depth;
  if (winner === 1) return -10_000 - depth;
  if (depth === 0) return evaluate(s.board, s.size);

  const isMax       = s.currentPlayer === 2;
  const isPlacement = s.p1Placed < s.size || s.p2Placed < s.size;
  const myPlaced    = s.currentPlayer === 2 ? s.p2Placed : s.p1Placed;

  // If this player has finished placing, skip their placement turn
  if (isPlacement && myPlaced >= s.size) {
    const opp: Player = s.currentPlayer === 1 ? 2 : 1;
    return minimax({ ...s, currentPlayer: opp }, depth, alpha, beta);
  }

  let best = isMax ? -Infinity : Infinity;

  if (isPlacement) {
    for (let i = 0; i < s.size * s.size; i++) {
      if (s.board[i] !== null) continue;
      const nb = cloneBoard(s.board);
      nb[i] = s.currentPlayer as Cell;
      const opp: Player = s.currentPlayer === 1 ? 2 : 1;
      const score = minimax(
        {
          board: nb, currentPlayer: opp, size: s.size,
          p1Placed: s.currentPlayer === 1 ? s.p1Placed + 1 : s.p1Placed,
          p2Placed: s.currentPlayer === 2 ? s.p2Placed + 1 : s.p2Placed,
        },
        depth - 1, alpha, beta,
      );
      if (isMax) { if (score > best) best = score; if (best > alpha) alpha = best; }
      else       { if (score < best) best = score; if (best < beta)  beta  = best; }
      if (beta <= alpha) break;
    }
  } else {
    let hasMoves = false;
    outer:
    for (let from = 0; from < s.size * s.size; from++) {
      if (s.board[from] !== s.currentPlayer) continue;
      for (const to of getValidMoves(s.board, from, s.size)) {
        hasMoves = true;
        const nb = cloneBoard(s.board);
        nb[from] = null; nb[to] = s.currentPlayer as Cell;
        const opp: Player = s.currentPlayer === 1 ? 2 : 1;
        const score = minimax({ ...s, board: nb, currentPlayer: opp }, depth - 1, alpha, beta);
        if (isMax) { if (score > best) best = score; if (best > alpha) alpha = best; }
        else       { if (score < best) best = score; if (best < beta)  beta  = best; }
        if (beta <= alpha) break outer;
      }
    }
    if (!hasMoves) return evaluate(s.board, s.size);
  }

  return best === Infinity || best === -Infinity ? evaluate(s.board, s.size) : best;
}

// ─── Immediate win / block ────────────────────────────────────────────────────

function findPlacementWinOrBlock(board: Board, player: Player, size: BoardSize): number {
  const opp: Player = player === 1 ? 2 : 1;
  for (const line of generateWinLines(size)) {
    const mine  = line.filter(i => board[i] === player).length;
    const empty = line.filter(i => board[i] === null);
    if (mine === size - 1 && empty.length === 1) return empty[0];
  }
  for (const line of generateWinLines(size)) {
    const theirs = line.filter(i => board[i] === opp).length;
    const empty  = line.filter(i => board[i] === null);
    if (theirs === size - 1 && empty.length === 1) return empty[0];
  }
  return -1;
}

function findMovementWinOrBlock(
  board: Board, player: Player, size: BoardSize,
): { from: number; to: number } | null {
  const opp: Player = player === 1 ? 2 : 1;
  for (let from = 0; from < size * size; from++) {
    if (board[from] !== player) continue;
    for (const to of getValidMoves(board, from, size)) {
      const nb = cloneBoard(board);
      nb[from] = null; nb[to] = player as Cell;
      if (checkWin(nb, size).winner === player) return { from, to };
    }
  }
  for (let from = 0; from < size * size; from++) {
    if (board[from] !== opp) continue;
    for (const to of getValidMoves(board, from, size)) {
      const nb = cloneBoard(board);
      nb[from] = null; nb[to] = opp as Cell;
      if (checkWin(nb, size).winner === opp) {
        for (let af = 0; af < size * size; af++) {
          if (board[af] !== player) continue;
          if (getValidMoves(board, af, size).includes(to)) return { from: af, to };
        }
      }
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AIMove {
  from: number | null;
  to: number;
}

// Depth: larger boards need shallower search to stay fast
const DEPTH: Record<BoardSize, { hard: number; hardMove: number; expert: number; expertMove: number }> = {
  3: { hard: 3, hardMove: 4, expert: 7, expertMove: 7 },
  4: { hard: 2, hardMove: 3, expert: 4, expertMove: 5 },
  5: { hard: 2, hardMove: 2, expert: 3, expertMove: 3 },
};

export function getAIMove(
  board: Board,
  difficulty: 'easy' | 'medium' | 'hard' | 'expert',
  phase: 'placement' | 'movement',
  piecesPlaced: { 1: number; 2: number },
  boardSize: BoardSize = 3,
): AIMove | null {
  const b  = cloneBoard(board);
  const d  = DEPTH[boardSize];
  const n  = boardSize * boardSize;
  const mid = Math.floor(boardSize / 2);
  const center = mid * boardSize + mid;

  if (phase === 'placement') {
    const empties = b.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), []);
    if (empties.length === 0) return null;

    if (difficulty === 'easy') {
      return { from: null, to: empties[Math.floor(Math.random() * empties.length)] };
    }

    if (difficulty === 'medium') {
      const urgent = findPlacementWinOrBlock(b, 2, boardSize);
      if (urgent !== -1 && b[urgent] === null) return { from: null, to: urgent };
      if (b[center] === null) return { from: null, to: center };
      const corners = [0, boardSize - 1, (boardSize - 1) * boardSize, n - 1].filter(i => b[i] === null);
      const pool = corners.length > 0 ? corners : empties;
      return { from: null, to: pool[Math.floor(Math.random() * pool.length)] };
    }

    // Hard / Expert: minimax
    const depth = difficulty === 'hard' ? d.hard : d.expert;
    let bestScore = -Infinity, bestMove = empties[0];
    for (const i of empties) {
      const nb = cloneBoard(b);
      nb[i] = 2 as Cell;
      const score = minimax(
        { board: nb, currentPlayer: 1, size: boardSize,
          p1Placed: piecesPlaced[1], p2Placed: piecesPlaced[2] + 1 },
        depth, -Infinity, Infinity,
      );
      if (score > bestScore) { bestScore = score; bestMove = i; }
    }
    return { from: null, to: bestMove };

  } else {
    // Movement phase
    const allMoves: AIMove[] = [];
    for (let from = 0; from < n; from++) {
      if (b[from] !== 2) continue;
      for (const to of getValidMoves(b, from, boardSize)) {
        allMoves.push({ from, to });
      }
    }
    if (allMoves.length === 0) return null;

    if (difficulty === 'easy') {
      return allMoves[Math.floor(Math.random() * allMoves.length)];
    }

    if (difficulty === 'medium') {
      const urgent = findMovementWinOrBlock(b, 2, boardSize);
      if (urgent) return urgent;
      let best = -Infinity, bestMv = allMoves[0];
      for (const mv of allMoves) {
        const nb = cloneBoard(b);
        nb[mv.from!] = null; nb[mv.to] = 2 as Cell;
        const s = evaluate(nb, boardSize);
        if (s > best) { best = s; bestMv = mv; }
      }
      return bestMv;
    }

    // Hard / Expert: minimax
    const depth = difficulty === 'hard' ? d.hardMove : d.expertMove;
    let bestScore = -Infinity, bestMv = allMoves[0];
    for (const mv of allMoves) {
      const nb = cloneBoard(b);
      nb[mv.from!] = null; nb[mv.to] = 2 as Cell;
      const score = minimax(
        { board: nb, currentPlayer: 1, size: boardSize,
          p1Placed: boardSize, p2Placed: boardSize },
        depth, -Infinity, Infinity,
      );
      if (score > bestScore) { bestScore = score; bestMv = mv; }
    }
    return bestMv;
  }
}
