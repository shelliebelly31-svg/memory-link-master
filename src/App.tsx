import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuthPage from "./pages/AuthPage";
import LibraryPage from "./pages/LibraryPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import NotFound from "./pages/NotFound";
import { useToast } from '@/hooks/use-toast';

const queryClient = new QueryClient();

function AppRoutes() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (email: string, password: string, isSignUp: boolean) => {
    // Simulate authentication
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsAuthenticated(true);
    toast({
      title: isSignUp ? 'Account created!' : 'Welcome back!',
      description: 'You are now signed in',
    });
    navigate('/library');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    toast({
      title: 'Signed out',
      description: 'See you next time!',
    });
    navigate('/');
  };

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/" element={<AuthPage onAuth={handleAuth} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/library" replace />} />
      <Route path="/library" element={<LibraryPage onLogout={handleLogout} />} />
      <Route path="/video/:id" element={<VideoDetailPage onLogout={handleLogout} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
