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
            A fast, cerebral, and intensely satisfying two-player game. Outmaneuver your opponent in a tight 3x3 arena.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Link href="/play" className="bg-primary text-primary-foreground h-12 px-8 rounded-lg flex items-center justify-center font-medium text-lg hover:bg-primary/90 transition-colors">
              Enter the Arena
            </Link>
            <Link href="/leaderboard" className="bg-secondary text-secondary-foreground h-12 px-8 rounded-lg flex items-center justify-center font-medium text-lg hover:bg-secondary/80 transition-colors">
              View Leaderboard
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
