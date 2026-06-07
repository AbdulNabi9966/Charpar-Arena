import { motion } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { getValidMoves } from '../../lib/gameLogic';
import { soundSystem } from '../../lib/audio';

interface BoardProps {
  overrideBoard?: (1 | 2 | null)[];
  onCellClick?: (index: number) => void;
}

export function Board({ overrideBoard, onCellClick }: BoardProps) {
  const {
    board: localBoard, phase, currentPlayer, selectedPiece, winner, winLine,
    placePiece, selectPiece, movePiece
  } = useGameStore();

  const board = overrideBoard ?? localBoard;
  const isOnlineMode = !!overrideBoard;

  const validMoves = !isOnlineMode && phase === 'movement' && selectedPiece !== null
    ? getValidMoves(localBoard, selectedPiece)
    : [];

  const handleCellClick = (index: number) => {
    if (onCellClick) {
      onCellClick(index);
      return;
    }

    if (winner) return;

    if (phase === 'placement') {
      if (localBoard[index] === null) {
        soundSystem.playPlace();
        placePiece(index);
      }
    } else if (phase === 'movement') {
      if (localBoard[index] === currentPlayer) {
        soundSystem.playPlace();
        selectPiece(index);
      } else if (selectedPiece !== null && validMoves.includes(index)) {
        soundSystem.playMove();
        movePiece(index);

        const state = useGameStore.getState();
        if (state.winner) {
          soundSystem.playWin();
        }
      }
    }
  };

  return (
    <div className="relative w-full max-w-[420px] aspect-square mx-auto select-none">
      {/* SVG connection lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 420 420"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Horizontal lines */}
        <line x1="70" y1="70" x2="350" y2="70" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        <line x1="70" y1="210" x2="350" y2="210" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        <line x1="70" y1="350" x2="350" y2="350" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        {/* Vertical lines */}
        <line x1="70" y1="70" x2="70" y2="350" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        <line x1="210" y1="70" x2="210" y2="350" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        <line x1="350" y1="70" x2="350" y2="350" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        {/* Diagonal lines through center */}
        <line x1="70" y1="70" x2="350" y2="350" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
        <line x1="350" y1="70" x2="70" y2="350" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
      </svg>

      {/* Cells */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-3 p-3">
        {board.map((cell, index) => {
          const isWinningCell = winLine?.includes(index);
          const isValidMove = validMoves.includes(index);
          const isSelected = !isOnlineMode && selectedPiece === index;

          return (
            <div
              key={index}
              data-testid={`cell-${index}`}
              onClick={() => handleCellClick(index)}
              className={`
                relative flex items-center justify-center rounded-xl cursor-pointer
                transition-all duration-200 border
                ${cell === null ? 'hover:bg-white/5' : ''}
                ${isValidMove ? 'border-primary/40 bg-primary/10' : 'border-white/5'}
                ${isWinningCell ? 'border-white/30 bg-white/5' : ''}
              `}
            >
              {/* Position dot */}
              <div className={`absolute w-3 h-3 rounded-full transition-colors duration-300 ${
                isValidMove ? 'bg-primary/60' : 'bg-white/15'
              }`} />

              {/* Valid move pulse */}
              {isValidMove && cell === null && (
                <div className="absolute w-3 h-3 rounded-full bg-primary/40 animate-ping" />
              )}

              {/* Piece */}
              {cell !== null && (
                <motion.div
                  key={`piece-${cell}-${index}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: isSelected ? 1.15 : 1,
                    opacity: 1,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className={`
                    w-14 h-14 sm:w-16 sm:h-16 rounded-full z-10 flex items-center justify-center
                    ${cell === 1
                      ? 'bg-gradient-to-br from-red-400 to-red-600 shadow-[0_0_20px_rgba(239,68,68,0.6)]'
                      : 'bg-gradient-to-br from-blue-400 to-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.6)]'
                    }
                    ${isSelected ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent' : ''}
                    ${isWinningCell ? 'shadow-[0_0_35px_rgba(255,255,255,0.5)] animate-pulse' : ''}
                  `}
                >
                  <div className="w-6 h-6 rounded-full bg-white/25 blur-[2px]" />
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
