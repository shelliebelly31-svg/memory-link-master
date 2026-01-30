import { Link, useLocation } from 'react-router-dom';
import { Brain, Library, LogOut, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  isAuthenticated?: boolean;
  onLogout?: () => void;
}

export function MobileNav({ isAuthenticated = true, onLogout }: MobileNavProps) {
  const location = useLocation();
  
  if (!isAuthenticated) return null;

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 px-4 py-2 pb-safe select-none"
      style={{ 
        WebkitUserSelect: 'none', 
        userSelect: 'none',
      }}
      data-no-select
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        <Link to="/home">
          <Button 
            variant="ghost" 
            size="icon-lg" 
            className={cn(
              "flex flex-col gap-1 h-auto py-2",
              isActive('/home') && "text-primary"
            )}
          >
            <Brain className="h-5 w-5" />
            <span className="text-[10px] font-medium">Home</span>
          </Button>
        </Link>
        <Link to="/library">
          <Button 
            variant="ghost" 
            size="icon-lg" 
            className={cn(
              "flex flex-col gap-1 h-auto py-2",
              isActive('/library') && "text-primary"
            )}
          >
            <Library className="h-5 w-5" />
            <span className="text-[10px] font-medium">Library</span>
          </Button>
        </Link>
        <Link to="/todo">
          <Button 
            variant="ghost" 
            size="icon-lg" 
            className={cn(
              "flex flex-col gap-1 h-auto py-2",
              isActive('/todo') && "text-todo"
            )}
          >
            <CheckSquare className="h-5 w-5" />
            <span className="text-[10px] font-medium">To Do</span>
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
