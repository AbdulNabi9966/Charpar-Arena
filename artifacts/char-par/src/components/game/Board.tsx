import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/gameStore';
import { getValidMoves, BoardSize } from '../../lib/gameLogic';
import { soundSystem } from '../../lib/audio';

interface BoardProps {
  overrideBoard?: (1 | 2 | null)[];
  overrideSelected?: number | null;
  overrideValidMoves?: number[];
  overrideBoardSize?: BoardSize;
  onCellClick?: (index: number) => void;
}

// ── Visual config per board size ──────────────────────────────────────────────
const CONFIG: Record<BoardSize, {
  pieceSize: string;
  gloss: string;
  pingRing: string;
  targetDot: string;
}> = {
  3: { pieceSize: 'w-14 h-14 sm:w-16 sm:h-16', gloss: 'w-6 h-6',  pingRing: 'w-10 h-10', targetDot: 'w-5 h-5' },
  4: { pieceSize: 'w-9  h-9  sm:w-11 sm:h-11', gloss: 'w-4 h-4',  pingRing: 'w-8  h-8',  targetDot: 'w-4 h-4' },
  5: { pieceSize: 'w-7  h-7  sm:w-8  sm:h-8',  gloss: 'w-3 h-3',  pingRing: 'w-6  h-6',  targetDot: 'w-3 h-3' },
};

const GRID_COLS: Record<BoardSize, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
};

// SVG geometry — viewBox is always 420×420
const BOARD_PX = 420;
const PAD      = 12; // matches p-3 (0.75rem = 12px)
const GAP      = 12; // matches gap-3

function getCenters(size: BoardSize): number[] {
  const cellSize = (BOARD_PX - 2 * PAD - (size - 1) * GAP) / size;
  return Array.from({ length: size }, (_, i) => PAD + i * (cellSize + GAP) + cellSize / 2);
}

export function Board({
  overrideBoard, overrideSelected, overrideValidMoves, overrideBoardSize, onCellClick,
}: BoardProps) {
  const {
    board: localBoard, phase, currentPlayer,
    selectedPiece: localSelected, winner, winLine, boardSize: localBoardSize,
    placePiece, selectPiece, movePiece,
  } = useGameStore();

  const board      = overrideBoard     ?? localBoard;
  const selected   = overrideSelected  !== undefined ? overrideSelected : localSelected;
  const boardSize  = overrideBoardSize ?? localBoardSize;
  const isOnline   = !!overrideBoard;
  const cfg        = CONFIG[boardSize];
  const centers    = getCenters(boardSize);

  const validMoves = overrideValidMoves ??
    (!isOnline && phase === 'movement' && selected !== null
      ? getValidMoves(localBoard, selected, localBoardSize)
      : []);

  const handleCellClick = (index: number) => {
    if (onCellClick) { onCellClick(index); return; }
    if (winner) return;

    if (phase === 'placement') {
      if (localBoard[index] === null) {
        soundSystem.playPlace();
        placePiece(index);
      }
    } else {
      if (localBoard[index] === currentPlayer) {
        soundSystem.playPlace();
        selectPiece(index);
      } else if (selected !== null && validMoves.includes(index)) {
        soundSystem.playMove();
        movePiece(index);
        if (useGameStore.getState().winner) soundSystem.playWin();
      } else if (localBoard[index] === null && selected !== null) {
        useGameStore.setState({ selectedPiece: null }); // deselect
      }
    }
  };

  const lineOpacity = '0.10';
  const diagOpacity = '0.07';

  return (
    <div className="relative w-full max-w-[420px] aspect-square mx-auto select-none">
      {/* SVG connection lines */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Horizontal lines */}
        {centers.map((cy, r) => (
          <line key={`h${r}`}
            x1={centers[0]} y1={cy} x2={centers[boardSize - 1]} y2={cy}
            stroke={`rgba(255,255,255,${lineOpacity})`} strokeWidth="1.5"
          />
        ))}
        {/* Vertical lines */}
        {centers.map((cx, c) => (
          <line key={`v${c}`}
            x1={cx} y1={centers[0]} x2={cx} y2={centers[boardSize - 1]}
            stroke={`rgba(255,255,255,${lineOpacity})`} strokeWidth="1.5"
          />
        ))}
        {/* Main diagonal */}
        <line
          x1={centers[0]} y1={centers[0]}
          x2={centers[boardSize - 1]} y2={centers[boardSize - 1]}
          stroke={`rgba(255,255,255,${diagOpacity})`} strokeWidth="1.5"
        />
        {/* Anti-diagonal */}
        <line
          x1={centers[boardSize - 1]} y1={centers[0]}
          x2={centers[0]} y2={centers[boardSize - 1]}
          stroke={`rgba(255,255,255,${diagOpacity})`} strokeWidth="1.5"
        />
      </svg>

      {/* Cell grid */}
      <div className={`absolute inset-0 grid ${GRID_COLS[boardSize]} gap-3 p-3 z-10`}
        style={{ gridTemplateRows: `repeat(${boardSize}, 1fr)` }}
      >
        {board.map((cell, index) => {
          const isWin      = winLine?.includes(index);
          const isValid    = validMoves.includes(index);
          const isSel      = selected === index;
          const isMovable  = !isOnline && phase === 'movement' && cell === currentPlayer;

          return (
            <div
              key={index}
              onClick={() => handleCellClick(index)}
              className={[
                'relative flex items-center justify-center rounded-xl cursor-pointer transition-all duration-150',
                isSel   ? 'bg-white/10 ring-2 ring-white/40'        : '',
                isValid ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : '',
                isWin   ? 'bg-yellow-400/8'                          : '',
                !isSel && !isValid && !isWin && cell === null ? 'hover:bg-white/5' : '',
                !isSel && !isValid && !isWin && isMovable ? 'hover:bg-white/5' : '',
              ].join(' ')}
            >
              {/* Center position dot */}
              <div className={[
                'absolute w-2 h-2 rounded-full transition-all duration-200 z-0',
                isSel   ? 'bg-white/50 scale-150' :
                isValid ? 'bg-emerald-400/60'     : 'bg-white/10',
              ].join(' ')} />

              {/* Selected glow ring */}
              {isSel && (
                <div className="absolute inset-1 rounded-lg ring-2 ring-white/40 pointer-events-none animate-pulse" />
              )}

              {/* Valid-move target (empty cell) */}
              <AnimatePresence>
                {isValid && cell === null && (
                  <motion.div
                    key="target"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className={`absolute ${cfg.pingRing} rounded-full border-2 border-emerald-400/50 animate-ping`}
                      style={{ animationDuration: '1.2s' }} />
                    <div className={`absolute ${cfg.pingRing} rounded-full border-2 border-emerald-400/30`} />
                    <div className={`${cfg.targetDot} rounded-full bg-emerald-400/80 shadow-[0_0_10px_rgba(52,211,153,0.8)]`} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Piece */}
              <AnimatePresence mode="popLayout">
                {cell !== null && (
                  <motion.div
                    key={`piece-${index}`}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: isSel ? 1.18 : 1, opacity: 1, y: isSel ? -3 : 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                    className={[
                      cfg.pieceSize,
                      'rounded-full z-10 flex items-center justify-center transition-shadow duration-200',
                      cell === 1
                        ? 'bg-gradient-to-br from-red-400 to-red-600'
                        : 'bg-gradient-to-br from-blue-400 to-blue-600',
                      isSel
                        ? cell === 1
                          ? 'shadow-[0_0_0_3px_rgba(255,255,255,0.7),0_0_28px_rgba(239,68,68,0.9),0_5px_18px_rgba(0,0,0,0.4)]'
                          : 'shadow-[0_0_0_3px_rgba(255,255,255,0.7),0_0_28px_rgba(59,130,246,0.9),0_5px_18px_rgba(0,0,0,0.4)]'
                        : isWin
                        ? 'shadow-[0_0_36px_rgba(255,220,50,0.75)] animate-[pulse_0.8s_ease-in-out_infinite]'
                        : cell === 1
                        ? 'shadow-[0_0_16px_rgba(239,68,68,0.5)]'
                        : 'shadow-[0_0_16px_rgba(59,130,246,0.5)]',
                      isMovable && !isSel ? 'cursor-pointer hover:scale-105' : '',
                    ].join(' ')}
                  >
                    <div className={`${cfg.gloss} rounded-full bg-white/30 blur-[2px]`} />
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
