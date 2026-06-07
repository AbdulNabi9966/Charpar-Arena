import { Board, Player, checkWin, getValidMoves } from './gameLogic';

// Minimax with alpha-beta pruning
function minimax(board: Board, depth: number, isMaximizing: boolean, alpha: number, beta: number): number {
  const { winner } = checkWin(board);
  
  if (winner === 2) return 10 + depth; // AI wins
  if (winner === 1) return -10 - depth; // Player wins
  if (depth === 0) return 0; // Evaluate board heuristically if needed (for simplicity, returning 0)

  // Determine pieces placed to know if we are in placement or movement phase
  let aiPieces = 0;
  let playerPieces = 0;
  for (const cell of board) {
    if (cell === 2) aiPieces++;
    if (cell === 1) playerPieces++;
  }

  const isPlacement = aiPieces < 3 || playerPieces < 3;
  const currentPlayer = isMaximizing ? 2 : 1;

  if (isPlacement) {
    let bestScore = isMaximizing ? -Infinity : Infinity;
    
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = currentPlayer;
        const score = minimax(board, depth - 1, !isMaximizing, alpha, beta);
        board[i] = null;
        
        if (isMaximizing) {
          bestScore = Math.max(score, bestScore);
          alpha = Math.max(alpha, bestScore);
        } else {
          bestScore = Math.min(score, bestScore);
          beta = Math.min(beta, bestScore);
        }
        
        if (beta <= alpha) break;
      }
    }
    return bestScore;
  } else {
    // Movement phase
    let bestScore = isMaximizing ? -Infinity : Infinity;
    
    for (let from = 0; from < 9; from++) {
      if (board[from] === currentPlayer) {
        const moves = getValidMoves(board, from);
        for (const to of moves) {
          board[from] = null;
          board[to] = currentPlayer;
          
          const score = minimax(board, depth - 1, !isMaximizing, alpha, beta);
          
          board[to] = null;
          board[from] = currentPlayer;
          
          if (isMaximizing) {
            bestScore = Math.max(score, bestScore);
            alpha = Math.max(alpha, bestScore);
          } else {
            bestScore = Math.min(score, bestScore);
            beta = Math.min(beta, bestScore);
          }
          
          if (beta <= alpha) break;
        }
      }
    }
    
    // If no moves available (should not happen in char par usually, but just in case)
    if (bestScore === -Infinity || bestScore === Infinity) return 0;
    
    return bestScore;
  }
}

export function getAIMove(
  board: Board, 
  difficulty: 'easy' | 'medium' | 'hard' | 'expert',
  phase: 'placement' | 'movement'
): { from?: number, to: number } | null {
  
  if (phase === 'placement') {
    const emptyCells = board.map((c, i) => c === null ? i : -1).filter(i => i !== -1);
    if (emptyCells.length === 0) return null;
    
    if (difficulty === 'easy' || difficulty === 'medium') {
      if (difficulty === 'medium' && board[4] === null) {
        return { to: 4 }; // Center preference
      }
      return { to: emptyCells[Math.floor(Math.random() * emptyCells.length)] };
    }
    
    // Hard/Expert: minimax
    let bestScore = -Infinity;
    let bestMove = -1;
    
    const maxDepth = difficulty === 'hard' ? 2 : 5;
    
    for (const i of emptyCells) {
      board[i] = 2; // AI is player 2
      const score = minimax([...board] as Board, maxDepth, false, -Infinity, Infinity);
      board[i] = null;
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = i;
      }
    }
    
    if (bestMove === -1) bestMove = emptyCells[0];
    return { to: bestMove };
    
  } else {
    // Movement phase
    const myPieces = board.map((c, i) => c === 2 ? i : -1).filter(i => i !== -1);
    
    if (difficulty === 'easy') {
      const allMoves: {from: number, to: number}[] = [];
      for (const p of myPieces) {
        const moves = getValidMoves(board, p);
        for (const m of moves) allMoves.push({ from: p, to: m });
      }
      if (allMoves.length === 0) return null;
      return allMoves[Math.floor(Math.random() * allMoves.length)];
    }
    
    // Hard/Expert/Medium (medium defaults to minimax depth 1)
    let bestScore = -Infinity;
    let bestMove: { from: number, to: number } | null = null;
    
    let maxDepth = 1;
    if (difficulty === 'hard') maxDepth = 3;
    if (difficulty === 'expert') maxDepth = 6;
    
    for (const from of myPieces) {
      const moves = getValidMoves(board, from);
      for (const to of moves) {
        board[from] = null;
        board[to] = 2;
        
        const score = minimax([...board] as Board, maxDepth, false, -Infinity, Infinity);
        
        board[to] = null;
        board[from] = 2;
        
        if (score > bestScore || bestMove === null) {
          bestScore = score;
          bestMove = { from, to };
        }
      }
    }
    
    return bestMove;
  }
}
