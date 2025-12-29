import { Link } from 'react-router-dom';
import { Brain, Library, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileNavProps {
  isAuthenticated?: boolean;
  onLogout?: () => void;
}

export function MobileNav({ isAuthenticated = true, onLogout }: MobileNavProps) {
  if (!isAuthenticated) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 px-4 py-2 pb-safe">
      <div className="flex items-center justify-around max-w-md mx-auto">
        <Link to="/library">
          <Button variant="ghost" size="icon-lg" className="flex flex-col gap-1 h-auto py-2">
            <Library className="h-5 w-5" />
            <span className="text-[10px] font-medium">Library</span>
          </Button>
        </Link>
        <Link to="/">
          <Button variant="ghost" size="icon-lg" className="flex flex-col gap-1 h-auto py-2">
            <Brain className="h-5 w-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Button>
        </Link>
        <Button 
          variant="ghost" 
          size="icon-lg" 
          className="flex flex-col gap-1 h-auto py-2"
          onClick={onLogout}
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] font-medium">Logout</span>
        </Button>
      </div>
    </nav>
  );
}
