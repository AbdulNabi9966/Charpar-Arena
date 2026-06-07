import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { getValidMoves } from '../../lib/gameLogic';
import { soundSystem } from '../../lib/audio';

interface BoardProps {
  overrideBoard?: (1 | 2 | null)[];
  overrideSelected?: number | null;
  overrideValidMoves?: number[];
  onCellClick?: (index: number) => void;
}

export function Board({ overrideBoard, overrideSelected, overrideValidMoves, onCellClick }: BoardProps) {
  const {
    board: localBoard, phase, currentPlayer, selectedPiece: localSelected,
    winner, winLine, placePiece, selectPiece, movePiece
  } = useGameStore();

  const board = overrideBoard ?? localBoard;
  const selectedPiece = overrideSelected !== undefined ? overrideSelected : localSelected;
  const isOnlineMode = !!overrideBoard;

  const validMoves = overrideValidMoves ??
    (!isOnlineMode && phase === 'movement' && selectedPiece !== null
      ? getValidMoves(localBoard, selectedPiece)
      : []);

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
        if (state.winner) soundSystem.playWin();
      } else if (localBoard[index] === null && selectedPiece !== null) {
        // clicked an empty non-adjacent cell — deselect
        useGameStore.setState({ selectedPiece: null });
      }
    }
  };

  return (
    <div className="relative w-full max-w-[420px] aspect-square mx-auto select-none">
      {/* SVG grid lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        viewBox="0 0 420 420"
        xmlns="http://www.w3.org/2000/svg"
      >
        <line x1="70" y1="70" x2="350" y2="70" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <line x1="70" y1="210" x2="350" y2="210" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <line x1="70" y1="350" x2="350" y2="350" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <line x1="70" y1="70" x2="70" y2="350" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <line x1="210" y1="70" x2="210" y2="350" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <line x1="350" y1="70" x2="350" y2="350" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5" />
        <line x1="70" y1="70" x2="350" y2="350" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
        <line x1="350" y1="70" x2="70" y2="350" stroke="rgba(255,255,255,0.07)" strokeWidth="1.5" />
      </svg>

      {/* Cells */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-3 p-3 z-10">
        {board.map((cell, index) => {
          const isWinningCell = winLine?.includes(index);
          const isValidMove = validMoves.includes(index);
          const isSelected = selectedPiece === index;
          const isMovable = !isOnlineMode && phase === 'movement' && cell === currentPlayer;

          return (
            <div
              key={index}
              data-testid={`cell-${index}`}
              onClick={() => handleCellClick(index)}
              className={`
                relative flex items-center justify-center rounded-xl cursor-pointer
                transition-all duration-150
                ${isSelected
                  ? 'bg-white/10 ring-2 ring-white/40'
                  : isValidMove
                  ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50'
                  : isWinningCell
                  ? 'bg-yellow-500/10 ring-1 ring-yellow-400/40'
                  : cell === null
                  ? 'hover:bg-white/5'
                  : isMovable
                  ? 'hover:bg-white/5'
                  : ''
                }
              `}
            >
              {/* Center position dot */}
              <div className={`absolute w-2.5 h-2.5 rounded-full transition-all duration-200 z-0 ${
                isSelected ? 'bg-white/50 scale-150' :
                isValidMove ? 'bg-emerald-400/70' :
                'bg-white/12'
              }`} />

              {/* Valid-move target indicator */}
              <AnimatePresence>
                {isValidMove && cell === null && (
                  <motion.div
                    key="target"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    {/* Outer ring pulse */}
                    <div className="absolute w-10 h-10 rounded-full border-2 border-emerald-400/60 animate-ping" style={{ animationDuration: '1.2s' }} />
                    {/* Static outer ring */}
                    <div className="absolute w-10 h-10 rounded-full border-2 border-emerald-400/40" />
                    {/* Inner filled dot */}
                    <div className="w-4 h-4 rounded-full bg-emerald-400/80 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Valid-move capture indicator (when a destination has an enemy piece — not standard here, but guards against it) */}
              {isValidMove && cell !== null && (
                <div className="absolute inset-0 rounded-xl ring-2 ring-emerald-400/60 pointer-events-none" />
              )}

              {/* Selected-piece outer glow ring */}
              {isSelected && (
                <div className="absolute inset-1 rounded-lg ring-2 ring-white/50 pointer-events-none animate-pulse" />
              )}

              {/* Piece */}
              <AnimatePresence mode="popLayout">
                {cell !== null && (
                  <motion.div
                    key={`piece-${index}`}
                    layoutId={`piece-pos-${index}`}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: isSelected ? 1.18 : 1,
                      opacity: 1,
                      y: isSelected ? -3 : 0,
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                    className={`
                      w-14 h-14 sm:w-16 sm:h-16 rounded-full z-10 flex items-center justify-center
                      transition-shadow duration-200
                      ${cell === 1
                        ? 'bg-gradient-to-br from-red-400 to-red-600'
                        : 'bg-gradient-to-br from-blue-400 to-blue-600'
                      }
                      ${isSelected
                        ? cell === 1
                          ? 'shadow-[0_0_0_3px_rgba(255,255,255,0.7),0_0_30px_rgba(239,68,68,0.9),0_6px_20px_rgba(0,0,0,0.4)]'
                          : 'shadow-[0_0_0_3px_rgba(255,255,255,0.7),0_0_30px_rgba(59,130,246,0.9),0_6px_20px_rgba(0,0,0,0.4)]'
                        : isWinningCell
                        ? 'shadow-[0_0_40px_rgba(255,220,50,0.7)]'
                        : cell === 1
                        ? 'shadow-[0_0_18px_rgba(239,68,68,0.5)]'
                        : 'shadow-[0_0_18px_rgba(59,130,246,0.5)]'
                      }
                      ${isMovable && !isSelected ? 'cursor-pointer hover:scale-105' : ''}
                      ${isWinningCell ? 'animate-[pulse_0.8s_ease-in-out_infinite]' : ''}
                    `}
                  >
                    {/* Gloss highlight */}
                    <div className="w-6 h-6 rounded-full bg-white/30 blur-[2px]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
