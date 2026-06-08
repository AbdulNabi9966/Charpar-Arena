import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Layout } from '../components/layout/Layout';
import { useOnlineStore } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
import { useGetMe } from '@workspace/api-client-react';
import type { BoardSize } from '../lib/gameLogic';

const AI_DIFFICULTIES = [
  { value: 'easy',   label: 'Easy',   desc: 'Random moves. Perfect for beginners.' },
  { value: 'medium', label: 'Medium', desc: 'Center preference and simple tactics.' },
  { value: 'hard',   label: 'Hard',   desc: 'Actively tries to win and block you.' },
  { value: 'expert', label: 'Expert', desc: 'Minimax alpha-beta pruning. Unforgiving.' },
];

const BOARD_SIZES: { value: BoardSize; label: string; sub: string }[] = [
  { value: 3, label: '3×3', sub: '3 in a row — classic' },
  { value: 4, label: '4×4', sub: '4 in a row — tactical' },
  { value: 5, label: '5×5', sub: '5 in a row — strategic' },
];

export default function Play() {
  const [, setLocation] = useLocation();
  const [aiDifficulty, setAiDifficulty] = useState<string>('medium');
  const [showAI, setShowAI] = useState(false);
  const [boardSize, setBoardSize] = useState<BoardSize>(3);

  const { token, userId } = useAuthStore();
  const { connect } = useOnlineStore();
  const { data: me } = useGetMe({ query: { enabled: !!token, queryKey: ['auth', 'me'] } });

  const handleOnlinePlay = (mode: 'casual' | 'ranked') => {
    const currentUserId = userId ?? me?.id;
    const username = me?.username ?? 'Guest';
    if (!currentUserId) return;

    connect(currentUserId, username, token ?? '');

    const waitAndJoin = () => {
      const { socket } = useOnlineStore.getState();
      if (socket?.connected) {
        socket.emit('join_queue', { mode, userId: currentUserId, username, boardSize });
        useOnlineStore.setState({ status: 'searching' });
      } else if (socket) {
        socket.once('connect', () => {
          socket.emit('join_queue', { mode, userId: currentUserId, username, boardSize });
          useOnlineStore.setState({ status: 'searching' });
        });
      }
    };

    setTimeout(waitAndJoin, 100);
    setLocation(`/game?mode=online&qmode=${mode}&boardSize=${boardSize}`);
  };

  return (
    <Layout>
      <div className="flex-1 container mx-auto px-4 py-12 max-w-4xl">

        {/* Header */}
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Choose Game Mode</h1>
          <p className="text-muted-foreground">Select how you want to play Char Par.</p>
        </div>

        {/* Board Size Selector */}
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-5 duration-600">
          <p className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Board Size</p>
          <div className="flex gap-3">
            {BOARD_SIZES.map(bs => (
              <button
                key={bs.value}
                onClick={() => setBoardSize(bs.value)}
                className={[
                  'flex-1 py-3 px-4 rounded-xl border text-center transition-all duration-200',
                  boardSize === bs.value
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                ].join(' ')}
              >
                <div className="text-lg font-bold">{bs.label}</div>
                <div className="text-xs mt-0.5 opacity-70">{bs.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Game Mode Cards */}
        <div className="grid md:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-6 duration-700">

          {/* Online Casual */}
          <button onClick={() => handleOnlinePlay('casual')} className="text-left block group w-full">
            <div className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-500 uppercase tracking-wider">Live</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">Online Casual</h2>
              <p className="text-muted-foreground text-sm">Instant matchmaking. No pressure.</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground">
                <span>{boardSize}×{boardSize} board</span>
              </div>
            </div>
          </button>

          {/* Online Ranked */}
          <button onClick={() => handleOnlinePlay('ranked')} className="text-left block group w-full">
            <div className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-xs font-medium text-yellow-500 uppercase tracking-wider">Ranked</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">Online Ranked</h2>
              <p className="text-muted-foreground text-sm">Climb the Elo ladder. Prove your skill.</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground">
                <span>{boardSize}×{boardSize} board</span>
              </div>
            </div>
          </button>

          {/* vs AI */}
          <div className="group">
            <div
              className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300 cursor-pointer"
              onClick={() => setShowAI(v => !v)}
            >
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">vs AI</h2>
              <p className="text-muted-foreground text-sm mb-4">Train against our AI. Choose your level.</p>

              {showAI && (
                <div className="space-y-2 mt-4" onClick={e => e.stopPropagation()}>
                  {AI_DIFFICULTIES.map(d => (
                    <label
                      key={d.value}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio" name="difficulty" value={d.value}
                        checked={aiDifficulty === d.value}
                        onChange={() => setAiDifficulty(d.value)}
                        className="accent-primary"
                      />
                      <div>
                        <div className="font-medium text-sm">{d.label}</div>
                        <div className="text-xs text-muted-foreground">{d.desc}</div>
                      </div>
                    </label>
                  ))}
                  <Link
                    href={`/game?mode=ai&difficulty=${aiDifficulty}&boardSize=${boardSize}`}
                    className="mt-2 w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    Start {boardSize}×{boardSize} Game
                  </Link>
                </div>
              )}

              {!showAI && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Click to choose difficulty</span>
                  <span className="text-xs text-primary">· {boardSize}×{boardSize}</span>
                </div>
              )}
            </div>
          </div>

          {/* Local Multiplayer */}
          <Link href={`/game?mode=local&boardSize=${boardSize}`} className="block group">
            <div className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300">
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">Local Multiplayer</h2>
              <p className="text-muted-foreground text-sm">Two players, one device. Pass and play.</p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs text-secondary-foreground">
                <span>{boardSize}×{boardSize} board</span>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
