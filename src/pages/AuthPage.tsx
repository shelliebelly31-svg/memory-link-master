import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import memoryLinkIcon from '@/assets/memory-link-icon.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AuthPageProps {
  onAuth: (email: string, password: string, isSignUp: boolean) => Promise<void>;
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { toast } = useToast();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Email required', description: 'Enter your email address', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setResetSent(true);
    toast({ title: 'Check your email', description: 'We sent you a password reset link.' });
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Missing fields',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await onAuth(email, password, isSignUp);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Authentication failed',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero Section */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-sm space-y-8">
          {/* Logo & Branding */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-2">
              <img src={memoryLinkIcon} alt="Memory Link" className="w-16 h-16 object-contain" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Memory Link</h1>
            <p className="text-muted-foreground">
              Turn media into action, memory, and momentum
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={isForgot ? handleReset : handleSubmit} className="space-y-5">
            <div className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                />
              </div>
              {!isForgot && (
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              )}
            </div>

            {isForgot && resetSent && (
              <p className="text-sm text-muted-foreground text-center">
                If an account exists for that email, a reset link is on its way.
              </p>
            )}

            <Button
              type="submit"
              variant="glow"
              size="lg"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {isForgot ? 'Send reset link' : isSignUp ? 'Create Account' : 'Sign In'}
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle Auth Mode */}
          <div className="text-center space-y-2">
            {isForgot ? (
              <button
                type="button"
                onClick={() => { setIsForgot(false); setResetSent(false); }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Back to <span className="font-semibold text-primary">Sign in</span>
              </button>
            ) : (
              <>
                {!isSignUp && (
                  <div>
                    <button
                      type="button"
                      onClick={() => { setIsForgot(true); setResetSent(false); }}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                  <span className="font-semibold text-primary">
                    {isSignUp ? 'Sign in' : 'Sign up'}
                  </span>
                </button>
              </>
            )}
          </div>


          {/* Features Preview */}
          <div className="space-y-3 pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">What you'll be able to do:</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-lg bg-remember-muted">
                <p className="text-xs font-medium text-remember">Remember</p>
              </div>
              <div className="p-3 rounded-lg bg-todo-muted">
                <p className="text-xs font-medium text-todo">Tasks</p>
              </div>
              <div className="p-3 rounded-lg bg-ai-muted">
                <p className="text-xs font-medium text-ai">Quiz</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
