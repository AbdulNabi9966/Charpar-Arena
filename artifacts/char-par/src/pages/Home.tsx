import { Link } from 'wouter';
import { Layout } from '../components/layout/Layout';

export default function Home() {
  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center container mx-auto px-4 py-12 text-center">
        <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-tight">
            Abstract Strategy. <br />
            <span className="text-muted-foreground">Perfected.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto">
            A fast, cerebral two-player game across 3×3, 4×4, and 5×5 boards.
            Place your pieces, then maneuver them into a winning line.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/play" className="bg-primary text-primary-foreground h-12 px-8 rounded-lg flex items-center justify-center font-medium text-lg hover:bg-primary/90 transition-colors">
              Enter the Arena
            </Link>
            <Link href="/leaderboard" className="bg-secondary text-secondary-foreground h-12 px-8 rounded-lg flex items-center justify-center font-medium text-lg hover:bg-secondary/80 transition-colors">
              View Leaderboard
            </Link>
          </div>

          {/* Board size overview */}
          <div className="grid grid-cols-3 gap-4 pt-2 text-left">
            {[
              { size: '3×3', label: 'Classic', desc: '8 lines · 3 pieces · Center rules', difficulty: 'Easy' },
              { size: '4×4', label: 'Tactical', desc: '10 lines · 4 pieces · Inner ring dominates', difficulty: 'Medium' },
              { size: '5×5', label: 'Strategic', desc: '12 lines · 5 pieces · Plan 4 moves ahead', difficulty: 'Hard' },
            ].map(b => (
              <div key={b.size} className="p-4 rounded-xl border border-border bg-card/50">
                <div className="text-2xl font-bold mb-1">{b.size}</div>
                <div className="text-xs font-semibold text-primary mb-1">{b.label}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{b.desc}</div>
                <div className="mt-2 text-xs text-muted-foreground/60">{b.difficulty}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
