import { useRoute } from 'wouter';
import { useGetUser, useGetUserStats, useListMatchHistory, getGetUserQueryKey, getGetUserStatsQueryKey, getListMatchHistoryQueryKey } from '@workspace/api-client-react';
import { Layout } from '../components/layout/Layout';
import { useAuthStore } from '../store/authStore';

export default function Profile() {
  const [, params] = useRoute('/profile/:userId');
  const userId = params?.userId;
  const { userId: myId } = useAuthStore();

  const isMe = userId === myId || userId === 'me';
  const targetId = isMe ? myId : userId;

  const { data: user, isLoading: isLoadingUser } = useGetUser(targetId || '', { 
    query: { enabled: !!targetId, queryKey: getGetUserQueryKey(targetId || '') } 
  });
  
  const { data: stats, isLoading: isLoadingStats } = useGetUserStats(targetId || '', { 
    query: { enabled: !!targetId, queryKey: getGetUserStatsQueryKey(targetId || '') } 
  });
  
  const { data: history, isLoading: isLoadingHistory } = useListMatchHistory(targetId || '', { 
    query: { enabled: !!targetId, queryKey: getListMatchHistoryQueryKey(targetId || '') } 
  });

  if (!targetId) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Not logged in or profile not found.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        
        {isLoadingUser ? (
          <div className="animate-pulse flex items-center gap-6 mb-12">
            <div className="w-24 h-24 rounded-full bg-muted" />
            <div className="space-y-3">
              <div className="h-8 w-48 bg-muted rounded" />
              <div className="h-4 w-24 bg-muted rounded" />
            </div>
          </div>
        ) : user ? (
          <div className="flex items-center gap-6 mb-12">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-4xl text-primary font-bold shadow-lg shadow-primary/20">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                {user.username}
                {user.isGuest && <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground font-medium">GUEST</span>}
              </h1>
              <p className="text-muted-foreground mt-1">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
              {isMe && user.isGuest && (
                <button className="mt-3 text-sm bg-primary/10 text-primary px-3 py-1.5 rounded hover:bg-primary/20 transition-colors">
                  Upgrade to Permanent Account
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatCard title="Rating" value={stats?.rankedGames ? (user?.eloRating ?? '-') : '-'} loading={isLoadingStats || isLoadingUser} primary />
          <StatCard title="Win Rate" value={stats ? `${Math.round(stats.winRate * 100)}%` : '-'} loading={isLoadingStats} />
          <StatCard title="Total Games" value={stats?.totalGames ?? '-'} loading={isLoadingStats} />
          <StatCard title="Current Streak" value={stats?.currentStreak ?? '-'} loading={isLoadingStats} />
        </div>

        <h2 className="text-2xl font-bold mb-6">Match History</h2>
        
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {isLoadingHistory ? (
             <div className="p-8 flex justify-center"><div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>
          ) : history && history.length > 0 ? (
            <div className="divide-y divide-border/50">
              {history.map((match) => (
                <div key={match.id} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-12 rounded-full ${match.result === 'win' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <div className="font-semibold">{match.result === 'win' ? 'Victory' : 'Defeat'} vs {match.opponentUsername}</div>
                      <div className="text-sm text-muted-foreground flex gap-2 items-center">
                        <span className="capitalize">{match.mode}</span>
                        <span>•</span>
                        <span>{new Date(match.playedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {match.eloDelta && (
                    <div className={`font-bold ${match.eloDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {match.eloDelta > 0 ? '+' : ''}{match.eloDelta}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-muted-foreground">
              No matches played yet.
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}

function StatCard({ title, value, loading, primary }: { title: string, value: string | number, loading: boolean, primary?: boolean }) {
  return (
    <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center justify-center text-center">
      <span className="text-sm text-muted-foreground mb-2">{title}</span>
      {loading ? (
        <div className="h-8 w-16 bg-muted rounded animate-pulse" />
      ) : (
        <span className={`text-3xl font-bold ${primary ? 'text-primary' : ''}`}>{value}</span>
      )}
    </div>
  );
}
