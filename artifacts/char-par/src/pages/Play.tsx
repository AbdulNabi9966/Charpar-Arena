import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Layout } from '../components/layout/Layout';
import { useOnlineStore } from '../store/onlineStore';
import { useAuthStore } from '../store/authStore';
import { useGetMe } from '@workspace/api-client-react';

const AI_DIFFICULTIES = [
  { value: 'easy', label: 'Easy', desc: 'Random moves. Perfect for beginners.' },
  { value: 'medium', label: 'Medium', desc: 'Center preference and simple tactics.' },
  { value: 'hard', label: 'Hard', desc: 'Actively tries to win and block you.' },
  { value: 'expert', label: 'Expert', desc: 'Minimax with alpha-beta pruning. Unforgiving.' },
];

export default function Play() {
  const [, setLocation] = useLocation();
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [showAI, setShowAI] = useState(false);

  const { token, userId } = useAuthStore();
  const { connect } = useOnlineStore();
  const { data: me } = useGetMe({ query: { enabled: !!token, queryKey: ['auth', 'me'] } });

  const handleOnlinePlay = (mode: 'casual' | 'ranked') => {
    const currentUserId = userId ?? me?.id;
    const username = me?.username ?? 'Guest';

    if (!currentUserId) return;

    connect(currentUserId, username, token ?? '');

    // Wait for socket to connect, then join queue
    const waitAndJoin = () => {
      const { socket } = useOnlineStore.getState();
      if (socket?.connected) {
        socket.emit('join_queue', { mode, userId: currentUserId, username });
        useOnlineStore.setState({ status: 'searching' });
      } else if (socket) {
        socket.once('connect', () => {
          socket.emit('join_queue', { mode, userId: currentUserId, username });
          useOnlineStore.setState({ status: 'searching' });
        });
      }
    };

    // Give the socket a tick to initialize
    setTimeout(waitAndJoin, 100);
    setLocation('/game?mode=online&qmode=' + mode);
  };

  return (
    <Layout>
      <div className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Choose Game Mode</h1>
          <p className="text-muted-foreground">Select how you want to play Char Par today.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-6 duration-700">
          {/* Online Casual */}
          <button
            onClick={() => handleOnlinePlay('casual')}
            className="text-left block group w-full"
          >
            <div className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300 cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-500 uppercase tracking-wider">Live</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">Online Casual</h2>
              <p className="text-muted-foreground text-sm">Instant matchmaking. No pressure. Play and learn.</p>
            </div>
          </button>

          {/* Online Ranked */}
          <button
            onClick={() => handleOnlinePlay('ranked')}
            className="text-left block group w-full"
          >
            <div className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300 cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-xs font-medium text-yellow-500 uppercase tracking-wider">Ranked</span>
              </div>
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">Online Ranked</h2>
              <p className="text-muted-foreground text-sm">Climb the Elo ladder. Earn your rank. Prove your skill.</p>
            </div>
          </button>

          {/* vs AI */}
          <div className="group">
            <div
              className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300 cursor-pointer"
              onClick={() => setShowAI(!showAI)}
            >
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">vs AI</h2>
              <p className="text-muted-foreground text-sm mb-4">Train against our AI. Choose your challenge level.</p>

              {showAI && (
                <div className="space-y-2 mt-4" onClick={e => e.stopPropagation()}>
                  {AI_DIFFICULTIES.map(d => (
                    <label
                      key={d.value}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/40 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="difficulty"
                        value={d.value}
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
                    href={`/game?mode=ai&difficulty=${aiDifficulty}`}
                    className="mt-2 w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center justify-center"
                  >
                    Start Game
                  </Link>
                </div>
              )}

              {!showAI && (
                <div className="text-xs text-muted-foreground">Click to choose difficulty</div>
              )}
            </div>
          </div>

          {/* Local Multiplayer */}
          <Link href="/game?mode=local" className="block group">
            <div className="h-full p-6 rounded-xl border border-border bg-card hover:border-primary/60 hover:bg-accent/50 transition-all duration-300">
              <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">Local Multiplayer</h2>
              <p className="text-muted-foreground text-sm">Two players, one device. Pass and play with a friend.</p>
            </div>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
