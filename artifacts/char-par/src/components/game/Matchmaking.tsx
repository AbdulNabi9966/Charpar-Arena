import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useOnlineStore } from '../../store/onlineStore';

const TIMEOUT_SECS = 10;

interface MatchmakingProps {
  boardSize?: number;
}

export function Matchmaking({ boardSize = 3 }: MatchmakingProps) {
  const { status, leaveQueue, onlineCounts } = useOnlineStore();
  const [, setLocation] = useLocation();

  const [countdown, setCountdown] = useState(TIMEOUT_SECS);
  const [phase, setPhase] = useState<'searching' | 'no_players' | 'connecting_ai'>('searching');
  const searchStarted = useRef(false);

  // Start countdown only once status becomes 'searching'
  useEffect(() => {
    if (status !== 'searching') return;
    if (searchStarted.current) return;
    searchStarted.current = true;

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  // When countdown hits 0, leave queue and show fallback UI
  useEffect(() => {
    if (countdown === 0 && phase === 'searching') {
      leaveQueue();
      setPhase('no_players');

      const t = setTimeout(() => {
        setPhase('connecting_ai');
        setTimeout(() => {
          setLocation(`/game?mode=ai&difficulty=expert&boardSize=${boardSize}`);
        }, 1500);
      }, 1800);

      return () => clearTimeout(t);
    }
  }, [countdown, phase, leaveQueue, boardSize, setLocation]);

  const total = onlineCounts?.total ?? 0;
  const playing = onlineCounts?.playing ?? {};
  const searching = onlineCounts?.searching ?? {};

  const sizes = [3, 4, 5] as const;

  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] w-full max-w-sm mx-auto px-4">

      {/* Pulse animation */}
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
          <div className="absolute inset-0 rounded-full border-2 border-emerald-500/50 animate-ping" style={{ animationDuration: '1.2s' }} />
        )}
        <div className="absolute inset-12 rounded-full border border-primary/70" />
        <div className={[
          'relative w-5 h-5 rounded-full shadow-[0_0_20px_rgba(var(--primary),0.8)]',
          phase === 'no_players' ? 'bg-yellow-400' :
          phase === 'connecting_ai' ? 'bg-emerald-400' : 'bg-primary',
        ].join(' ')} />
      </div>

      {/* Status text */}
      {phase === 'searching' && (
        <>
          <h3 className="text-xl font-semibold tracking-tight mb-1">
            {status === 'connecting' ? 'Connecting...' : 'Searching for opponent...'}
          </h3>
          {status === 'searching' && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-muted-foreground text-sm tabular-nums">
                {countdown} second{countdown !== 1 ? 's' : ''} remaining
              </span>
              {/* Countdown bar */}
              <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000"
                  style={{ width: `${(countdown / TIMEOUT_SECS) * 100}%` }}
                />
              </div>
            </div>
          )}
          <p className="text-muted-foreground text-xs mb-6 text-center">
            Matched automatically — no room codes needed.
          </p>
        </>
      )}

      {phase === 'no_players' && (
        <>
          <h3 className="text-xl font-semibold tracking-tight text-yellow-400 mb-1">No players found.</h3>
          <p className="text-muted-foreground text-sm mb-6 text-center">Connecting you with AI Expert...</p>
        </>
      )}

      {phase === 'connecting_ai' && (
        <>
          <h3 className="text-xl font-semibold tracking-tight text-emerald-400 mb-1">Connecting you with AI Expert...</h3>
          <p className="text-muted-foreground text-sm mb-6 text-center">Get ready — the AI plays at expert level.</p>
        </>
      )}

      {/* Cancel button */}
      {phase === 'searching' && status === 'searching' && (
        <button
          onClick={() => { leaveQueue(); setLocation('/play'); }}
          className="px-6 py-2 rounded-full border border-border text-sm font-medium hover:bg-muted transition-colors mb-8"
        >
          Cancel
        </button>
      )}

      {/* Online counts */}
      <div className="w-full mt-auto pt-6 border-t border-border/60">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Players Online</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold tabular-nums">{total}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {sizes.map(size => {
            const play = playing[size] ?? 0;
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
                    <span className={[
                      'font-semibold tabular-nums',
                      wait > 0 ? 'text-emerald-400' : '',
                    ].join(' ')}>{wait}</span>
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
