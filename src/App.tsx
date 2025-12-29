import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import AddTranscriptPage from "./pages/AddTranscriptPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, signIn, signUp, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleAuth = async (email: string, password: string, isSignUp: boolean) => {
    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) throw error;
    } else {
      const { error } = await signIn(email, password);
      if (error) throw error;
    }
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<AuthPage onAuth={handleAuth} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="/home" element={<HomePage onLogout={signOut} />} />
      <Route path="/library" element={<LibraryPage onLogout={signOut} />} />
      <Route path="/video/:id" element={<VideoDetailPage onLogout={signOut} />} />
      <Route path="/video/:id/add-transcript" element={<AddTranscriptPage onLogout={signOut} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
