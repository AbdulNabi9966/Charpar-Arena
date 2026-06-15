import { useEffect, useRef, useState } from 'react';
import { useOnlineStore } from '../../store/onlineStore';

const TIMEOUT_SECS = 10;

interface MatchmakingProps {
  boardSize?: number;
}

export function Matchmaking({ boardSize = 3 }: MatchmakingProps) {
  const { status, leaveQueue, onlineCounts } = useOnlineStore();

  const [countdown, setCountdown] = useState(TIMEOUT_SECS);
  const [phase, setPhase] = useState<'searching' | 'no_players' | 'connecting_ai'>('searching');

  // Stable refs so interval closure never goes stale
  const boardSizeRef = useRef(boardSize);
  boardSizeRef.current = boardSize;
  const leaveQueueRef = useRef(leaveQueue);
  leaveQueueRef.current = leaveQueue;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // ── Single effect: countdown + AI fallback, runs once on mount ──────────
  useEffect(() => {
    let remaining = TIMEOUT_SECS;

    const tick = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(tick);

        // Guard: if already matched (phase changed externally), do nothing
        if (phaseRef.current !== 'searching') return;

        leaveQueueRef.current();
        setPhase('no_players');

        setTimeout(() => setPhase('connecting_ai'), 1400);

        setTimeout(() => {
          // window.location.href for a hard navigation — avoids any wouter
          // state timing issues that could swallow a soft setLocation() call
          const base = import.meta.env.BASE_URL.replace(/\/$/, '');
          window.location.href = `${base}/game?mode=ai&difficulty=expert&boardSize=${boardSizeRef.current}`;
        }, 3200);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, []); // runs exactly once on mount

  const total    = onlineCounts?.total ?? null;
  const playing  = onlineCounts?.playing  ?? {};
  const searching = onlineCounts?.searching ?? {};
  const sizes    = [3, 4, 5] as const;
  const isSearching = phase === 'searching';

  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] w-full max-w-sm mx-auto px-4">

      {/* Pulse ring */}
      <div className="relative flex items-center justify-center w-32 h-32 mb-7">
        {phase === 'searching' && (
          <>
            <div className="absolute inset-0 rounded-full border-2 border-primary/15 animate-ping" style={{ animationDuration: '2.4s' }} />
            <div className="absolute inset-4 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '2.4s', animationDelay: '0.6s' }} />
            <div className="absolute inset-8 rounded-full border-2 border-primary/50 animate-ping" style={{ animationDuration: '2.4s', animationDelay: '1.2s' }} />
          </>
        )}
        {phase === 'no_players' && (
          <div className="absolute inset-0 rounded-full border-2 border-yellow-500/40" />
        )}
        {phase === 'connecting_ai' && (
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/50 animate-ping" style={{ animationDuration: '1s' }} />
        )}
        <div className="absolute inset-12 rounded-full border border-primary/70" />
        <div className={[
          'relative w-5 h-5 rounded-full',
          phase === 'no_players'    ? 'bg-yellow-400  shadow-[0_0_16px_rgba(250,204,21,0.7)]'  :
          phase === 'connecting_ai' ? 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.7)]' :
                                      'bg-primary     shadow-[0_0_20px_rgba(var(--primary),0.8)]',
        ].join(' ')} />
      </div>

      {/* Status heading */}
      {phase === 'searching'    && <h3 className="text-xl font-semibold tracking-tight mb-2">{status === 'connecting' ? 'Connecting...' : 'Searching for opponent...'}</h3>}
      {phase === 'no_players'   && <h3 className="text-xl font-semibold tracking-tight text-yellow-400 mb-2">No players found.</h3>}
      {phase === 'connecting_ai'&& <h3 className="text-xl font-semibold tracking-tight text-emerald-400 mb-2">Connecting with AI Expert...</h3>}

      {/* Countdown bar */}
      {isSearching && (
        <div className="w-full mb-2">
          <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
            <span>Searching...</span>
            <span className="tabular-nums font-medium">{countdown}s remaining</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(countdown / TIMEOUT_SECS) * 100}%` }}
            />
          </div>
        </div>
      )}

      {phase === 'connecting_ai' && (
        <p className="text-muted-foreground text-sm mb-2 text-center">Get ready — the AI plays at expert level.</p>
      )}

      {isSearching && (
        <p className="text-muted-foreground text-xs mb-5 text-center">
          {countdown <= 3
            ? 'Almost done — connecting you to AI Expert if no one joins...'
            : 'Matched automatically. No room codes needed.'}
        </p>
      )}

      {/* Cancel */}
      {isSearching && (
        <button
          onClick={() => { leaveQueueRef.current(); window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/play`; }}
          className="px-6 py-2 rounded-full border border-border text-sm font-medium hover:bg-muted transition-colors mb-6"
        >
          Cancel
        </button>
      )}

      {/* Online counts panel */}
      <div className="w-full mt-auto pt-5 border-t border-border/60">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Players Online</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold tabular-nums">{total === null ? '—' : total}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {sizes.map(size => {
            const play = playing[size]   ?? 0;
            const wait = searching[size] ?? 0;
            return (
              <div key={size} className="bg-muted/40 rounded-lg px-3 py-2.5 text-center">
                <p className="text-xs text-muted-foreground font-medium mb-1.5">{size}×{size}</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Playing</span>
                    <span className="font-semibold tabular-nums">{play}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Waiting</span>
                    <span className={['font-semibold tabular-nums', wait > 0 ? 'text-emerald-400' : ''].join(' ')}>{wait}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
