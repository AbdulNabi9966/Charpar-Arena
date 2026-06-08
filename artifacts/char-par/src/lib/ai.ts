import {
  Board, Cell, Player, BoardSize,
  checkWin, getValidMoves, generateWinLines,
} from './gameLogic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneBoard(b: Board): Board { return b.slice() as Board; }

// ─── Transposition table ──────────────────────────────────────────────────────
// Stores exact / lower-bound / upper-bound scores keyed by position hash.
// Cleared at the start of every top-level getAIMove call so stale data
// can't leak across turns.

type TTFlag = 'exact' | 'lower' | 'upper';
interface TTEntry { score: number; depth: number; flag: TTFlag; }

let TT = new Map<string, TTEntry>();

function boardKey(board: Board, player: Player, p1: number, p2: number): string {
  // Compact string: each cell as '0'/'1'/'2' + player + placed counts
  let k = '';
  for (const c of board) k += c ?? '0';
  return k + player + p1 + p2;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────
// Returns a score from AI (player 2) perspective.
//
// Key additions over the naive version:
//   • Exponential line weights  — 2-in-a-row is worth far more than 1-in-a-row
//   • Fork bonus               — 2+ simultaneous threats are unstoppable
//   • Centrality               — pieces closer to center have more mobility
//   • Mobility (movement phase) — more possible moves = better

function evaluate(board: Board, size: BoardSize): number {
  const lines = generateWinLines(size);
  let score      = 0;
  let aiThreats  = 0;  // lines with (size-1) AI pieces and 1 empty
  let oppThreats = 0;

  for (const line of lines) {
    let ai = 0, opp = 0, empty = 0;
    for (const i of line) {
      const c = board[i];
      if (c === 2) ai++;
      else if (c === 1) opp++;
      else empty++;
    }

    // Only pure (un-blocked) lines contribute
    if (opp === 0 && ai > 0) {
      if      (ai === size - 1) { score += 50;  aiThreats++; }
      else if (ai === size - 2) score += 8;
      else if (ai === size - 3) score += 2;
      else                      score += 0.4;
    }
    if (ai === 0 && opp > 0) {
      if      (opp === size - 1) { score -= 50;  oppThreats++; }
      else if (opp === size - 2) score -= 8;
      else if (opp === size - 3) score -= 2;
      else                       score -= 0.4;
    }
  }

  // Fork: 2+ simultaneous winning threats — opponent can block at most 1
  if (aiThreats  >= 2) score += aiThreats  * 200;
  if (oppThreats >= 2) score -= oppThreats * 200;

  // Centrality of every piece
  const mid = Math.floor(size / 2);
  const maxDist = mid; // max Chebyshev distance from center
  for (let pos = 0; pos < size * size; pos++) {
    const cell = board[pos];
    if (cell === null) continue;
    const r = Math.floor(pos / size), c = pos % size;
    const dist = Math.max(Math.abs(r - mid), Math.abs(c - mid));
    const bonus = (maxDist - dist + 1) * 1.2; // center = (maxDist+1)*1.2
    if (cell === 2) score += bonus;
    else            score -= bonus;
  }

  // Mobility: in the movement phase, more legal moves = more options
  let aiMobility = 0, oppMobility = 0;
  for (let pos = 0; pos < size * size; pos++) {
    const cell = board[pos];
    if (cell === null) continue;
    const moves = getValidMoves(board, pos, size).length;
    if (cell === 2) aiMobility  += moves;
    else            oppMobility += moves;
  }
  score += (aiMobility - oppMobility) * 0.15;

  return score;
}

// ─── Move ordering helpers ────────────────────────────────────────────────────
// Good ordering is critical for alpha-beta: checking the best moves first
// causes far more cutoffs, effectively doubling search depth for the same cost.

function placementOrderScore(
  pos: number, board: Board, player: Player, size: BoardSize,
): number {
  const opp: Player = player === 1 ? 2 : 1;
  const nb = cloneBoard(board);
  nb[pos] = player as Cell;
  if (checkWin(nb, size).winner === player) return 1_000_000;
  nb[pos] = opp as Cell;
  if (checkWin(nb, size).winner === opp) return 900_000;
  // Centrality (cheap — no board cloning)
  const mid = Math.floor(size / 2);
  const r = Math.floor(pos / size), c = pos % size;
  const dist = Math.max(Math.abs(r - mid), Math.abs(c - mid));
  return (size - dist) * 20;
}

function movementOrderScore(
  from: number, to: number, board: Board, player: Player, size: BoardSize,
): number {
  // One clone, two checks — no nested loops over opponent pieces
  const nb = cloneBoard(board); nb[from] = null; nb[to] = player as Cell;
  if (checkWin(nb, size).winner === player) return 1_000_000;
  return evaluate(nb, size);
}

// ─── Minimax with alpha-beta + transposition table ────────────────────────────

interface MMState {
  board: Board;
  currentPlayer: Player;
  p1Placed: number;
  p2Placed: number;
  size: BoardSize;
}

function minimax(
  s: MMState, depth: number, alpha: number, beta: number,
): number {
  // Terminal checks
  const { winner } = checkWin(s.board, s.size);
  if (winner === 2) return 10_000 + depth;
  if (winner === 1) return -(10_000 + depth);
  if (depth === 0) return evaluate(s.board, s.size);

  // Transposition table lookup
  const key = boardKey(s.board, s.currentPlayer, s.p1Placed, s.p2Placed);
  const cached = TT.get(key);
  if (cached && cached.depth >= depth) {
    if (cached.flag === 'exact') return cached.score;
    if (cached.flag === 'lower') alpha = Math.max(alpha, cached.score);
    if (cached.flag === 'upper') beta  = Math.min(beta,  cached.score);
    if (alpha >= beta) return cached.score;
  }

  const isMax       = s.currentPlayer === 2;
  const isPlacement = s.p1Placed < s.size || s.p2Placed < s.size;
  const myPlaced    = s.currentPlayer === 2 ? s.p2Placed : s.p1Placed;

  if (isPlacement && myPlaced >= s.size) {
    // This player has finished placing; skip to opponent
    return minimax({ ...s, currentPlayer: s.currentPlayer === 1 ? 2 : 1 }, depth, alpha, beta);
  }

  const origAlpha = alpha;
  let best = isMax ? -Infinity : Infinity;

  if (isPlacement) {
    // Collect empty positions and sort by promise
    const empties: number[] = [];
    for (let i = 0; i < s.size * s.size; i++) {
      if (s.board[i] === null) empties.push(i);
    }
    empties.sort((a, b) =>
      placementOrderScore(b, s.board, s.currentPlayer, s.size) -
      placementOrderScore(a, s.board, s.currentPlayer, s.size)
    );

    const opp: Player = s.currentPlayer === 1 ? 2 : 1;
    for (const i of empties) {
      const nb = cloneBoard(s.board);
      nb[i] = s.currentPlayer as Cell;
      const score = minimax(
        { board: nb, currentPlayer: opp, size: s.size,
          p1Placed: s.currentPlayer === 1 ? s.p1Placed + 1 : s.p1Placed,
          p2Placed: s.currentPlayer === 2 ? s.p2Placed + 1 : s.p2Placed },
        depth - 1, alpha, beta,
      );
      if (isMax) { if (score > best) best = score; if (best > alpha) alpha = best; }
      else       { if (score < best) best = score; if (best < beta)  beta  = best; }
      if (beta <= alpha) break;
    }
  } else {
    // Collect all from→to pairs
    const moves: [number, number][] = [];
    for (let from = 0; from < s.size * s.size; from++) {
      if (s.board[from] !== s.currentPlayer) continue;
      for (const to of getValidMoves(s.board, from, s.size)) {
        moves.push([from, to]);
      }
    }
    if (moves.length === 0) return evaluate(s.board, s.size);

    // Sort by promise (winning moves first, then blocking, then heuristic)
    moves.sort(([fa, ta], [fb, tb]) =>
      movementOrderScore(fb, tb, s.board, s.currentPlayer, s.size) -
      movementOrderScore(fa, ta, s.board, s.currentPlayer, s.size)
    );

    const opp: Player = s.currentPlayer === 1 ? 2 : 1;
    for (const [from, to] of moves) {
      const nb = cloneBoard(s.board);
      nb[from] = null; nb[to] = s.currentPlayer as Cell;
      const score = minimax({ ...s, board: nb, currentPlayer: opp }, depth - 1, alpha, beta);
      if (isMax) { if (score > best) best = score; if (best > alpha) alpha = best; }
      else       { if (score < best) best = score; if (best < beta)  beta  = best; }
      if (beta <= alpha) break;
    }
  }

  if (best === Infinity || best === -Infinity) return evaluate(s.board, s.size);

  // Store result in TT with the appropriate flag
  const flag: TTFlag =
    best <= origAlpha ? 'upper' :
    best >= beta      ? 'lower' : 'exact';
  TT.set(key, { score: best, depth, flag });

  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface AIMove {
  from: number | null; // null = placement
  to: number;
}

// Depths are kept conservative so turns stay under ~400ms on average.
// TT + move ordering give effective strength comparable to ~2× the raw depth.
const DEPTH: Record<BoardSize, { medium: number; hard: number; expert: number }> = {
  3: { medium: 2, hard: 4, expert: 6 },
  4: { medium: 2, hard: 3, expert: 4 },
  5: { medium: 2, hard: 2, expert: 3 },
};

export function getAIMove(
  board: Board,
  difficulty: 'easy' | 'medium' | 'hard' | 'expert',
  phase: 'placement' | 'movement',
  piecesPlaced: { 1: number; 2: number },
  boardSize: BoardSize = 3,
): AIMove | null {

  // Fresh TT for every top-level call — prevents stale cross-turn pollution
  TT = new Map();

  const b   = cloneBoard(board);
  const n   = boardSize * boardSize;
  const mid = Math.floor(boardSize / 2);
  const center  = mid * boardSize + mid;
  const corners = [0, boardSize - 1, (boardSize - 1) * boardSize, n - 1];
  const d   = DEPTH[boardSize];

  // ── PLACEMENT PHASE ────────────────────────────────────────────────────────
  if (phase === 'placement') {
    const empties = b.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), []);
    if (empties.length === 0) return null;

    if (difficulty === 'easy') {
      // 80% random, 20% opportunistic win
      if (Math.random() < 0.2) {
        for (const i of empties) {
          const nb = cloneBoard(b); nb[i] = 2 as Cell;
          if (checkWin(nb, boardSize).winner === 2) return { from: null, to: i };
        }
      }
      return { from: null, to: empties[Math.floor(Math.random() * empties.length)] };
    }

    // Order candidates for all non-easy difficulties
    const ordered = [...empties].sort((a, b2) =>
      placementOrderScore(b2, b, 2, boardSize) -
      placementOrderScore(a,  b, 2, boardSize)
    );

    if (difficulty === 'medium') {
      // Depth-3 minimax — sees 1.5 full rounds ahead, much stronger than heuristic-only
      const depth = d.medium;
      let bestScore = -Infinity, bestMove = ordered[0];
      for (const i of ordered) {
        const nb = cloneBoard(b); nb[i] = 2 as Cell;
        const score = minimax(
          { board: nb, currentPlayer: 1, size: boardSize,
            p1Placed: piecesPlaced[1], p2Placed: piecesPlaced[2] + 1 },
          depth, -Infinity, Infinity,
        );
        if (score > bestScore) { bestScore = score; bestMove = i; }
      }
      return { from: null, to: bestMove };
    }

    // Hard / Expert
    const depth = difficulty === 'hard' ? d.hard : d.expert;
    let bestScore = -Infinity, bestMove = ordered[0];
    for (const i of ordered) {
      const nb = cloneBoard(b); nb[i] = 2 as Cell;
      const score = minimax(
        { board: nb, currentPlayer: 1, size: boardSize,
          p1Placed: piecesPlaced[1], p2Placed: piecesPlaced[2] + 1 },
        depth, -Infinity, Infinity,
      );
      if (score > bestScore) { bestScore = score; bestMove = i; }
    }
    return { from: null, to: bestMove };
  }

  // ── MOVEMENT PHASE ─────────────────────────────────────────────────────────
  const allMoves: [number, number][] = [];
  for (let from = 0; from < n; from++) {
    if (b[from] !== 2) continue;
    for (const to of getValidMoves(b, from, boardSize)) {
      allMoves.push([from, to]);
    }
  }
  if (allMoves.length === 0) return null;

  if (difficulty === 'easy') {
    // 85% random, 15% opportunistic win
    if (Math.random() < 0.15) {
      for (const [from, to] of allMoves) {
        const nb = cloneBoard(b); nb[from] = null; nb[to] = 2 as Cell;
        if (checkWin(nb, boardSize).winner === 2) return { from, to };
      }
    }
    const [from, to] = allMoves[Math.floor(Math.random() * allMoves.length)];
    return { from, to };
  }

  // Order moves for all non-easy
  const ordered = [...allMoves].sort(([fa, ta], [fb, tb]) =>
    movementOrderScore(fb, tb, b, 2, boardSize) -
    movementOrderScore(fa, ta, b, 2, boardSize)
  );

  if (difficulty === 'medium') {
    // Depth-3 minimax in movement phase — finds forks, blocks threats 2 moves ahead
    const depth = d.medium;
    let bestScore = -Infinity;
    let [bestFrom, bestTo] = ordered[0];
    for (const [from, to] of ordered) {
      const nb = cloneBoard(b); nb[from] = null; nb[to] = 2 as Cell;
      const score = minimax(
        { board: nb, currentPlayer: 1, size: boardSize,
          p1Placed: boardSize, p2Placed: boardSize },
        depth, -Infinity, Infinity,
      );
      if (score > bestScore) { bestScore = score; bestFrom = from; bestTo = to; }
    }
    return { from: bestFrom, to: bestTo };
  }

  // Hard / Expert
  const depth = difficulty === 'hard' ? d.hard : d.expert;
  let bestScore = -Infinity;
  let [bestFrom, bestTo] = ordered[0];
  for (const [from, to] of ordered) {
    const nb = cloneBoard(b); nb[from] = null; nb[to] = 2 as Cell;
    const score = minimax(
      { board: nb, currentPlayer: 1, size: boardSize,
        p1Placed: boardSize, p2Placed: boardSize },
      depth, -Infinity, Infinity,
    );
    if (score > bestScore) { bestScore = score; bestFrom = from; bestTo = to; }
  }
  return { from: bestFrom, to: bestTo };
}
