import { Board, Cell, Player, checkWin, getValidMoves, WINNING_LINES } from './gameLogic';

// ─────────────────────────────────────────────
// Pure helpers — never mutate the input board
// ─────────────────────────────────────────────

function cloneBoard(board: Board): Board {
  return board.slice() as Board;
}

function countPieces(board: Board) {
  let p1 = 0, p2 = 0;
  for (const c of board) {
    if (c === 1) p1++;
    else if (c === 2) p2++;
  }
  return { p1, p2 };
}

// ─────────────────────────────────────────────
// Heuristic: score board from AI (player 2) perspective
// ─────────────────────────────────────────────

function evaluate(board: Board): number {
  let score = 0;

  for (const [a, b, c] of WINNING_LINES) {
    const line = [board[a], board[b], board[c]];
    const ai     = line.filter(x => x === 2).length;
    const human  = line.filter(x => x === 1).length;
    const empty  = line.filter(x => x === null).length;

    // Only lines that aren't blocked by the opponent matter
    if (human === 0) {
      if (ai === 2 && empty === 1) score += 8;   // one move from winning
      if (ai === 1 && empty === 2) score += 1;
    }
    if (ai === 0) {
      if (human === 2 && empty === 1) score -= 8;  // must block
      if (human === 1 && empty === 2) score -= 1;
    }
  }

  // Center control is extremely valuable
  if (board[4] === 2) score += 3;
  if (board[4] === 1) score -= 3;

  // Corners give access to more lines
  const corners = [0, 2, 6, 8];
  for (const c of corners) {
    if (board[c] === 2) score += 0.5;
    if (board[c] === 1) score -= 0.5;
  }

  return score;
}

// ─────────────────────────────────────────────
// Minimax state — fully explicit, no inference
// ─────────────────────────────────────────────

interface MMState {
  board: Board;
  currentPlayer: Player;
  p1Placed: number;
  p2Placed: number;
}

/**
 * Minimax with alpha-beta pruning.
 * AI = player 2 = maximiser.
 * Returns score from AI's perspective.
 */
function minimax(
  s: MMState,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const { winner } = checkWin(s.board);
  // Prefer faster wins / slower losses
  if (winner === 2) return 10_000 + depth;
  if (winner === 1) return -10_000 - depth;
  if (depth === 0) return evaluate(s.board);

  const isMaximising = s.currentPlayer === 2;
  const isPlacement = s.p1Placed < 3 || s.p2Placed < 3;
  const myPlaced = s.currentPlayer === 2 ? s.p2Placed : s.p1Placed;

  // Sanity: if somehow this player is already done placing, skip their "turn"
  // (shouldn't happen in normal alternating play)
  if (isPlacement && myPlaced >= 3) {
    const opp: Player = s.currentPlayer === 1 ? 2 : 1;
    return minimax({ ...s, currentPlayer: opp }, depth, alpha, beta);
  }

  let best = isMaximising ? -Infinity : Infinity;

  if (isPlacement) {
    // ── Placement phase ──
    for (let i = 0; i < 9; i++) {
      if (s.board[i] !== null) continue;

      const nb = cloneBoard(s.board);
      nb[i] = s.currentPlayer as Cell;
      const opp: Player = s.currentPlayer === 1 ? 2 : 1;
      const next: MMState = {
        board: nb,
        currentPlayer: opp,
        p1Placed: s.currentPlayer === 1 ? s.p1Placed + 1 : s.p1Placed,
        p2Placed: s.currentPlayer === 2 ? s.p2Placed + 1 : s.p2Placed,
      };

      const score = minimax(next, depth - 1, alpha, beta);

      if (isMaximising) {
        if (score > best) best = score;
        if (best > alpha) alpha = best;
      } else {
        if (score < best) best = score;
        if (best < beta) beta = best;
      }
      if (beta <= alpha) break;
    }
  } else {
    // ── Movement phase ──
    let hasMoves = false;
    outer:
    for (let from = 0; from < 9; from++) {
      if (s.board[from] !== s.currentPlayer) continue;
      const moves = getValidMoves(s.board, from);
      for (const to of moves) {
        hasMoves = true;
        const nb = cloneBoard(s.board);
        nb[from] = null;
        nb[to] = s.currentPlayer as Cell;
        const opp: Player = s.currentPlayer === 1 ? 2 : 1;
        const next: MMState = { ...s, board: nb, currentPlayer: opp };

        const score = minimax(next, depth - 1, alpha, beta);

        if (isMaximising) {
          if (score > best) best = score;
          if (best > alpha) alpha = best;
        } else {
          if (score < best) best = score;
          if (best < beta) beta = best;
        }
        if (beta <= alpha) break outer;
      }
    }
    if (!hasMoves) return evaluate(s.board); // stalemate
  }

  return best === Infinity || best === -Infinity ? evaluate(s.board) : best;
}

// ─────────────────────────────────────────────
// Check for an immediate win or block
// Returns the target cell index or -1 if none
// ─────────────────────────────────────────────

function findWinOrBlock(board: Board, player: Player): number {
  // First check if we can win
  for (const [a, b, c] of WINNING_LINES) {
    const cells = [board[a], board[b], board[c]];
    const targets = [a, b, c];
    const myCount   = cells.filter(x => x === player).length;
    const emptyIdxs = targets.filter(i => board[i] === null);
    if (myCount === 2 && emptyIdxs.length === 1) return emptyIdxs[0];
  }
  // Then check if we need to block opponent
  const opp: Player = player === 1 ? 2 : 1;
  for (const [a, b, c] of WINNING_LINES) {
    const cells = [board[a], board[b], board[c]];
    const targets = [a, b, c];
    const oppCount  = cells.filter(x => x === opp).length;
    const emptyIdxs = targets.filter(i => board[i] === null);
    if (oppCount === 2 && emptyIdxs.length === 1) return emptyIdxs[0];
  }
  return -1;
}

// ─────────────────────────────────────────────
// Exported move generator
// IMPORTANT: never mutates the board passed in
// ─────────────────────────────────────────────

export interface AIMove {
  from: number | null; // null during placement
  to: number;
}

export function getAIMove(
  board: Board,
  difficulty: 'easy' | 'medium' | 'hard' | 'expert',
  phase: 'placement' | 'movement',
  piecesPlaced: { 1: number; 2: number },
): AIMove | null {
  // Work on a copy — NEVER mutate the original
  const b = cloneBoard(board);

  if (phase === 'placement') {
    const empties = b.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), []);
    if (empties.length === 0) return null;

    // ── Easy: pure random ──
    if (difficulty === 'easy') {
      return { from: null, to: empties[Math.floor(Math.random() * empties.length)] };
    }

    // ── Medium: win/block first, then center, then random ──
    if (difficulty === 'medium') {
      const urgent = findWinOrBlock(b, 2);
      if (urgent !== -1 && b[urgent] === null) return { from: null, to: urgent };
      if (b[4] === null) return { from: null, to: 4 };
      // Prefer corners over edges
      const corners = empties.filter(i => [0, 2, 6, 8].includes(i));
      const pool = corners.length > 0 ? corners : empties;
      return { from: null, to: pool[Math.floor(Math.random() * pool.length)] };
    }

    // ── Hard / Expert: minimax ──
    const depth = difficulty === 'hard' ? 3 : 7;
    let bestScore = -Infinity;
    let bestMove = empties[0];

    for (const i of empties) {
      const nb = cloneBoard(b);
      nb[i] = 2 as Cell;
      const score = minimax(
        {
          board: nb,
          currentPlayer: 1, // after AI places it's human's turn
          p1Placed: piecesPlaced[1],
          p2Placed: piecesPlaced[2] + 1,
        },
        depth,
        -Infinity,
        Infinity,
      );
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }

    return { from: null, to: bestMove };

  } else {
    // ── Movement phase ──
    const myPieces = b.reduce<number[]>((acc, c, i) => (c === 2 ? [...acc, i] : acc), []);
    if (myPieces.length === 0) return null;

    // Collect all legal moves
    const allMoves: AIMove[] = [];
    for (const from of myPieces) {
      for (const to of getValidMoves(b, from)) {
        allMoves.push({ from, to });
      }
    }
    if (allMoves.length === 0) return null;

    // ── Easy: random legal move ──
    if (difficulty === 'easy') {
      return allMoves[Math.floor(Math.random() * allMoves.length)];
    }

    // ── Medium: win/block immediately, otherwise pick by heuristic ──
    if (difficulty === 'medium') {
      // Check for immediate win
      for (const mv of allMoves) {
        const nb = cloneBoard(b);
        nb[mv.from!] = null;
        nb[mv.to] = 2 as Cell;
        if (checkWin(nb).winner === 2) return mv;
      }
      // Check for immediate block
      for (const mv of allMoves) {
        const nb = cloneBoard(b);
        nb[mv.from!] = null;
        nb[mv.to] = 2 as Cell;
        // Would opponent win without this block?
        const tempHuman = cloneBoard(b);
        // Give human the destination and check
        const humanMoves: number[] = [];
        for (let from = 0; from < 9; from++) {
          if (b[from] !== 1) continue;
          for (const to of getValidMoves(b, from)) {
            const test = cloneBoard(b);
            test[from] = null;
            test[to] = 1 as Cell;
            if (checkWin(test).winner === 1) humanMoves.push(to);
          }
        }
        // If moving to this cell blocks a human winning square
        if (humanMoves.includes(mv.to)) return mv;
      }
      // Heuristic: prefer center access
      let best = -Infinity;
      let bestMv = allMoves[0];
      for (const mv of allMoves) {
        const nb = cloneBoard(b);
        nb[mv.from!] = null;
        nb[mv.to] = 2 as Cell;
        const s = evaluate(nb);
        if (s > best) { best = s; bestMv = mv; }
      }
      return bestMv;
    }

    // ── Hard / Expert: minimax ──
    const depth = difficulty === 'hard' ? 4 : 7;
    let bestScore = -Infinity;
    let bestMv = allMoves[0];

    for (const mv of allMoves) {
      const nb = cloneBoard(b);
      nb[mv.from!] = null;
      nb[mv.to] = 2 as Cell;
      const score = minimax(
        {
          board: nb,
          currentPlayer: 1, // after AI moves it's human's turn
          p1Placed: 3,
          p2Placed: 3,
        },
        depth,
        -Infinity,
        Infinity,
      );
      if (score > bestScore) {
        bestScore = score;
        bestMv = mv;
      }
    }

    return bestMv;
  }
}
