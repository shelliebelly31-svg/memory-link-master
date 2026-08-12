import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import splashLogo from "@/assets/splash-logo.jpg";
import AuthPage from "./pages/AuthPage";
import HomePage from "./pages/HomePage";
import LibraryPage from "./pages/LibraryPage";
import TodoPage from "./pages/TodoPage";
import VideoDetailPage from "./pages/VideoDetailPage";
import AddTranscriptPage from "./pages/AddTranscriptPage";
import SharedQuizPage from "./pages/SharedQuizPage";
import OAuthConsent from "./pages/OAuthConsent";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Preview-only: skip the login screen while developing. Never active in the
// published build, so real auth still applies for published apps.
const BYPASS_AUTH = import.meta.env.DEV;


function isSafeRelativePath(path: string | null): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

function PostLoginRedirect() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (isSafeRelativePath(next)) {
    window.location.replace(next);
    return null;
  }
  return <Navigate to="/home" replace />;
}

function AppRoutes() {
  const { user, loading, signIn, signUp, signOut } = useAuth();

  if (loading) return null;

  const handleAuth = async (email: string, password: string, isSignUp: boolean) => {
    if (isSignUp) {
      const { error } = await signUp(email, password);
      if (error) throw error;
    } else {
      const { error } = await signIn(email, password);
      if (error) throw error;
    }
  };

  if (!user && !BYPASS_AUTH) {
    return (
      <Routes>
        <Route path="/" element={<AuthPage onAuth={handleAuth} />} />
        <Route path="/quiz/:token" element={<SharedQuizPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<PostLoginRedirect />} />
      <Route path="/home" element={<HomePage onLogout={signOut} />} />
      <Route path="/library" element={<LibraryPage onLogout={signOut} />} />
      <Route path="/todo" element={<TodoPage onLogout={signOut} />} />
      <Route path="/video/:id" element={<VideoDetailPage onLogout={signOut} />} />
      <Route path="/video/:id/add-transcript" element={<AddTranscriptPage onLogout={signOut} />} />
      <Route path="/quiz/:token" element={<SharedQuizPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}


function SplashGate({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(() => {
    // Skip splash if we already have a session in storage (returning user)
    const hasSession = !!localStorage.getItem('sb-trmcgpjsweacadqoadlh-auth-token');
    return !hasSession;
  });

  useEffect(() => {
    if (!showSplash) return;
    const timer = setTimeout(() => setShowSplash(false), 3500);
    return () => clearTimeout(timer);
  }, [showSplash]);

  if (showSplash) {
    return (
      <>
        <style>{`
          @keyframes splashSequence {
            0% { opacity: 0; }
            29% { opacity: 1; }
            57% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
        <div
          className="min-h-screen"
          style={{
            backgroundImage: `url(${splashLogo})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: '#0b0e1a',
            animation: 'splashSequence 3.5s ease-in-out forwards',
          }}
        />
      </>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SplashGate>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </TooltipProvider>
        </SplashGate>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
