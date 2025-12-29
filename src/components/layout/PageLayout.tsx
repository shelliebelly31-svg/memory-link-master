import { ReactNode } from 'react';
import { MobileNav } from './MobileNav';

interface PageLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  onLogout?: () => void;
}

export function PageLayout({ children, showNav = true, onLogout }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <main className={showNav ? 'pb-20' : ''}>
        {children}
      </main>
      {showNav && <MobileNav onLogout={onLogout} />}
    </div>
  );
}
