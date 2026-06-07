import { Layout } from '../components/layout/Layout';
import { useGetLeaderboard, useGetLeaderboardSummary } from '@workspace/api-client-react';

export default function Leaderboard() {
  const { data: leaderboard, isLoading: isLoadingBoard } = useGetLeaderboard();
  const { data: summary, isLoading: isLoadingSummary } = useGetLeaderboardSummary();

  return (
    <Layout>
      <div className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        <h1 className="text-3xl font-bold mb-8 text-center md:text-left">Global Leaderboard</h1>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground mb-2">Total Players</span>
            <span className="text-3xl font-bold">
              {isLoadingSummary ? <span className="animate-pulse bg-muted h-8 w-16 rounded block" /> : summary?.totalPlayers ?? 0}
            </span>
          </div>
          <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground mb-2">Games Played</span>
            <span className="text-3xl font-bold">
              {isLoadingSummary ? <span className="animate-pulse bg-muted h-8 w-16 rounded block" /> : summary?.totalGamesPlayed ?? 0}
            </span>
          </div>
          <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground mb-2">Top Elo</span>
            <span className="text-3xl font-bold text-primary">
              {isLoadingSummary ? <span className="animate-pulse bg-muted h-8 w-16 rounded block" /> : summary?.topElo ?? 0}
            </span>
          </div>
          <div className="bg-card p-6 rounded-xl border border-border flex flex-col items-center justify-center">
            <span className="text-sm text-muted-foreground mb-2">Avg Elo</span>
            <span className="text-3xl font-bold">
              {isLoadingSummary ? <span className="animate-pulse bg-muted h-8 w-16 rounded block" /> : summary?.averageElo ?? 0}
            </span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                <tr>
                  <th className="px-6 py-4 font-medium">Rank</th>
                  <th className="px-6 py-4 font-medium">Player</th>
                  <th className="px-6 py-4 font-medium text-right">Rating</th>
                  <th className="px-6 py-4 font-medium text-right">Win Rate</th>
                  <th className="px-6 py-4 font-medium text-right">Streak</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingBoard ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-6 py-4"><div className="h-4 w-4 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-12 bg-muted rounded animate-pulse ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-12 bg-muted rounded animate-pulse ml-auto" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-8 bg-muted rounded animate-pulse ml-auto" /></td>
                    </tr>
                  ))
                ) : leaderboard && leaderboard.length > 0 ? (
                  leaderboard.map((entry, idx) => (
                    <tr key={entry.userId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-bold">
                        {idx === 0 ? <span className="text-yellow-500">1</span> : 
                         idx === 1 ? <span className="text-slate-300">2</span> : 
                         idx === 2 ? <span className="text-amber-600">3</span> : entry.rank}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {entry.username.charAt(0).toUpperCase()}
                          </div>
                          {entry.username}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-primary">{entry.eloRating}</td>
                      <td className="px-6 py-4 text-right">{Math.round(entry.winRate * 100)}%</td>
                      <td className="px-6 py-4 text-right">
                        {entry.currentStreak > 0 ? (
                          <span className="text-green-500 font-medium">+{entry.currentStreak}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No ranked players yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
