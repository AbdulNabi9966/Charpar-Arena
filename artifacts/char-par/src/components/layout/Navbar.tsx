import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useLoginAsGuest, useGetMe, useLogout } from '@workspace/api-client-react';
import { Link } from 'wouter';

export function Navbar() {
  const { token, setAuth, clearAuth } = useAuthStore();
  const { data: user, refetch } = useGetMe({ query: { enabled: !!token, queryKey: ['auth', 'me'] } });
  const loginAsGuest = useLoginAsGuest();
  const logoutMutation = useLogout();
  
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (!token && !isLoggingIn && !loginAsGuest.isPending) {
      setIsLoggingIn(true);
      loginAsGuest.mutate(
        { data: { username: `Guest_${Math.floor(Math.random() * 10000)}` } },
        {
          onSuccess: (data) => {
            setAuth(data.token, data.user.id);
            refetch();
          },
          onSettled: () => setIsLoggingIn(false)
        }
      );
    }
  }, [token, isLoggingIn, loginAsGuest, setAuth, refetch]);

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        clearAuth();
      }
    });
  };

  return (
    <nav className="w-full border-b border-border bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/50 z-50 sticky top-0">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="font-bold text-xl tracking-tighter hover:opacity-80 transition-opacity">
          CHAR PAR
        </Link>
        <div className="flex gap-4 items-center">
          <Link href="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Leaderboard
          </Link>
          <Link href="/play" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
            Play Now
          </Link>
          
          <div className="ml-4 pl-4 border-l border-border flex items-center gap-3">
            {user ? (
              <>
                <Link href={`/profile/${user.id}`} className="text-sm font-medium hover:underline flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  {user.username}
                  {user.isGuest && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">GUEST</span>}
                </Link>
              </>
            ) : (
              <div className="w-20 h-6 bg-muted animate-pulse rounded" />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
