import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BoardSize } from '../../lib/gameLogic';

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

const BOARD_TABS: { size: BoardSize; label: string }[] = [
  { size: 3, label: '3×3' },
  { size: 4, label: '4×4' },
  { size: 5, label: '5×5' },
];

const BOARD_INFO: Record<BoardSize, {
  pieces: number;
  winLength: number;
  totalLines: number;
  difficulty: string;
  duration: string;
  powerPositions: string;
  tip: string;
}> = {
  3: {
    pieces: 3,
    winLength: 3,
    totalLines: 8,
    difficulty: 'Easy',
    duration: '3–5 min',
    powerPositions: 'Center (pos 4) — 8 connections',
    tip: 'Control the center. It connects to every other cell.',
  },
  4: {
    pieces: 4,
    winLength: 4,
    totalLines: 10,
    difficulty: 'Medium',
    duration: '5–10 min',
    powerPositions: 'Inner ring (5, 6, 9, 10) — 6 connections each',
    tip: 'Own the inner ring. Position 5 or 10 gives you the most movement options.',
  },
  5: {
    pieces: 5,
    winLength: 5,
    totalLines: 12,
    difficulty: 'Hard',
    duration: '10–20 min',
    powerPositions: 'Center (pos 12) — 8 connections',
    tip: 'Plan 3–4 moves ahead. The center connects everything.',
  },
};

const WINNING_LINES: Record<BoardSize, { type: string; examples: string }[]> = {
  3: [
    { type: 'Horizontal', examples: '[0,1,2]  [3,4,5]  [6,7,8]' },
    { type: 'Vertical',   examples: '[0,3,6]  [1,4,7]  [2,5,8]' },
    { type: 'Diagonal',   examples: '[0,4,8]  [2,4,6]' },
  ],
  4: [
    { type: 'Horizontal', examples: '[0,1,2,3]  [4,5,6,7]  …' },
    { type: 'Vertical',   examples: '[0,4,8,12]  [1,5,9,13]  …' },
    { type: 'Diagonal',   examples: '[0,5,10,15]  [3,6,9,12]' },
  ],
  5: [
    { type: 'Horizontal', examples: '[0,1,2,3,4]  [5,6,7,8,9]  …' },
    { type: 'Vertical',   examples: '[0,5,10,15,20]  [1,6,11,16,21]  …' },
    { type: 'Diagonal',   examples: '[0,6,12,18,24]  [4,8,12,16,20]' },
  ],
};

export function RulesModal({ open, onClose }: RulesModalProps) {
  const [tab, setTab] = useState<BoardSize>(3);
  const info = BOARD_INFO[tab];
  const lines = WINNING_LINES[tab];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <div
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-xl font-bold tracking-tight">How to Play Char Par</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Complete rules reference</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  aria-label="Close rules"
                >
                  ✕
                </button>
              </div>

              <div className="px-6 py-5 space-y-6">

                {/* Overview */}
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Game Overview</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Char Par is a two-player abstract strategy game. <span className="text-foreground font-medium">Red 🔴</span> vs <span className="text-blue-400 font-medium">Blue 🔵</span>.
                    The goal is to get all your pieces in a straight line — horizontal, vertical, or diagonal.
                    The game has two phases: <span className="text-amber-400 font-medium">Placement</span> then <span className="text-emerald-400 font-medium">Movement</span>.
                  </p>
                </section>

                {/* Phase 1 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Phase 1 — Placement</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {[
                      ['Players alternate placing pieces', 'true'],
                      ['Place on any empty cell', 'true'],
                      ['Place on an occupied cell', 'false'],
                      ['Each player places all pieces first', 'true'],
                    ].map(([rule, ok]) => (
                      <div key={rule} className="flex items-center gap-2 text-sm">
                        <span className={ok === 'true' ? 'text-emerald-400' : 'text-red-400'}>
                          {ok === 'true' ? '✓' : '✗'}
                        </span>
                        <span className={ok === 'true' ? 'text-foreground' : 'text-muted-foreground line-through'}>{rule}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Phase 2 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Phase 2 — Movement</h3>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {[
                      ['Click your piece to select it (golden ring)', 'true'],
                      ['Move to an adjacent empty cell', 'true'],
                      ['Move any of your pieces each turn', 'true'],
                      ['Jump over pieces', 'false'],
                      ['Capture opponent pieces', 'false'],
                      ['Move to an occupied cell', 'false'],
                      ['Skip your turn', 'false'],
                      ['Move the opponent\'s piece', 'false'],
                    ].map(([rule, ok]) => (
                      <div key={rule} className="flex items-center gap-2 text-sm">
                        <span className={ok === 'true' ? 'text-emerald-400' : 'text-red-400'}>
                          {ok === 'true' ? '✓' : '✗'}
                        </span>
                        <span className={ok === 'true' ? 'text-foreground' : 'text-muted-foreground line-through'}>{rule}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Board size tabs */}
                <section>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Board Sizes</h3>
                  <div className="flex gap-2 mb-4">
                    {BOARD_TABS.map(({ size, label }) => (
                      <button
                        key={size}
                        onClick={() => setTab(size)}
                        className={[
                          'flex-1 py-2 rounded-lg border text-sm font-semibold transition-all',
                          tab === size
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tab}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      {/* Stats row */}
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: 'Pieces', value: info.pieces },
                          { label: 'Win length', value: `${info.winLength} in a row` },
                          { label: 'Win lines', value: info.totalLines },
                          { label: 'Difficulty', value: info.difficulty },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-muted/40 rounded-lg px-3 py-2 text-center">
                            <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                            <div className="text-sm font-semibold">{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Winning lines */}
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Winning Lines</p>
                        <div className="space-y-1.5">
                          {lines.map(l => (
                            <div key={l.type} className="flex items-baseline gap-3 text-sm">
                              <span className="w-20 shrink-0 text-muted-foreground">{l.type}</span>
                              <span className="font-mono text-xs text-foreground/80">{l.examples}</span>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">Only 2 diagonals count — the main diagonal and anti-diagonal.</p>
                      </div>

                      {/* Power position */}
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Most Powerful Position</p>
                        <p className="text-sm">{info.powerPositions}</p>
                      </div>

                      {/* Strategy tip */}
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <p className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-1">💡 Strategy Tip</p>
                        <p className="text-sm">{info.tip}</p>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </section>

                {/* Adjacency note */}
                <section className="border-t border-border pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Adjacency (Movement Paths)</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                    Each piece can only move to directly connected neighbours. The faint lines on the board show every valid path.
                  </p>
                  <div className="grid sm:grid-cols-3 gap-3 text-sm">
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="font-semibold mb-1">3×3</p>
                      <p className="text-xs text-muted-foreground">Center connects to all 8 cells. Edges and corners connect along straight lines only.</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="font-semibold mb-1">4×4</p>
                      <p className="text-xs text-muted-foreground">Inner ring has diagonal links. Outer ring connects mainly along rows and columns.</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-3">
                      <p className="font-semibold mb-1">5×5</p>
                      <p className="text-xs text-muted-foreground">Center connects to 8 neighbours. Specific diagonal paths through the inner grid.</p>
                    </div>
                  </div>
                </section>

                {/* Quick reference */}
                <section className="border-t border-border pt-5 pb-1">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Reference</h3>
                  <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-400 shrink-0" />
                      <span>Amber dot = Placement phase</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-400 shrink-0" />
                      <span>Green dots = Valid moves</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-yellow-400 shrink-0" />
                      <span>Gold glow = Winning line</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                      <span>Red piece = Player 1</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                      <span>Blue piece = Player 2</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-white/30 shrink-0 ring-2 ring-white/60" />
                      <span>Ring glow = Selected piece</span>
                    </div>
                  </div>
                </section>

              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
