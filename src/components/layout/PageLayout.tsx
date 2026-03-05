import { ReactNode, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { MobileNav } from './MobileNav';

interface PageLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  onLogout?: () => void;
}

export function PageLayout({ children, showNav = true, onLogout }: PageLayoutProps) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const PULL_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = containerRef.current;
    if (el && el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120));
    } else {
      isPulling.current = false;
      setPullDistance(0);
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD * 0.5);
      await queryClient.invalidateQueries();
      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, queryClient]);

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200"
        style={{ height: pullDistance > 0 ? pullDistance : 0 }}
      >
        <Loader2
          className={`h-6 w-6 text-primary transition-opacity ${
            isRefreshing ? 'animate-spin opacity-100' : pullDistance >= PULL_THRESHOLD ? 'opacity-100' : 'opacity-50'
          }`}
        />
      </div>

      <main className={showNav ? 'pb-20' : ''}>
        {children}
      </main>
      {showNav && <MobileNav onLogout={onLogout} />}
    </div>
  );
}
