import { useEffect, useState } from 'react';
import { useOnlineStore } from '../../store/onlineStore';

export function Matchmaking() {
  const { status, leaveQueue } = useOnlineStore();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="relative flex items-center justify-center w-40 h-40 mb-8">
        <div className="absolute inset-0 rounded-full border-2 border-primary/15 animate-ping" style={{ animationDuration: '2.4s' }} />
        <div className="absolute inset-4 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '2.4s', animationDelay: '0.6s' }} />
        <div className="absolute inset-8 rounded-full border-2 border-primary/50 animate-ping" style={{ animationDuration: '2.4s', animationDelay: '1.2s' }} />
        <div className="absolute inset-12 rounded-full border border-primary/70" />
        <div className="relative w-5 h-5 rounded-full bg-primary shadow-[0_0_20px_rgba(var(--primary),0.8)]" />
      </div>

      <h3 className="text-xl font-semibold tracking-tight mb-1">
        {status === 'connecting' ? 'Connecting...' : 'Searching for opponent...'}
      </h3>

      {status === 'searching' && (
        <p className="text-muted-foreground text-sm mb-6">{formatTime(seconds)} elapsed</p>
      )}

      <p className="text-muted-foreground text-xs mb-8 max-w-xs text-center">
        You'll be matched automatically with an available player. No room codes needed.
      </p>

      {status === 'searching' && (
        <button
          onClick={leaveQueue}
          className="px-6 py-2 rounded-full border border-border text-sm font-medium hover:bg-muted transition-colors"
          data-testid="button-cancel-search"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
