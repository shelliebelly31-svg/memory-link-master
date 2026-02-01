import { useState } from 'react';
import { Share2, Copy, Check, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useCreateSharedQuiz } from '@/hooks/useSharedQuiz';
import { QuizItem } from '@/types';

interface ShareQuizDialogProps {
  quizItems: QuizItem[];
  videoTitle: string;
}

export function ShareQuizDialog({ quizItems, videoTitle }: ShareQuizDialogProps) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { createSharedQuiz, isCreating } = useCreateSharedQuiz();
  const { toast } = useToast();

  const handleShare = async () => {
    const token = await createSharedQuiz(videoTitle, quizItems);
    if (token) {
      const url = `${window.location.origin}/quiz/${token}`;
      setShareUrl(url);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Share this link with others to let them take the quiz",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy failed",
        description: "Please copy the link manually",
        variant: "destructive",
      });
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setShareUrl(null);
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 className="h-4 w-4" />
          Share Quiz
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Quiz</DialogTitle>
          <DialogDescription>
            Create a shareable link so others can take this quiz. They won't need an account!
          </DialogDescription>
        </DialogHeader>
        
        {!shareUrl ? (
          <div className="space-y-4 pt-4">
            <p className="text-sm text-muted-foreground">
              This will create a public quiz with {quizItems.length} questions from "{videoTitle}".
            </p>
            <Button 
              onClick={handleShare} 
              disabled={isCreating}
              className="w-full"
              variant="glow"
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating link...
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Generate Share Link
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input 
                value={shareUrl} 
                readOnly 
                className="font-mono text-sm"
              />
              <Button 
                variant="outline" 
                size="icon"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-4 w-4 text-ai" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => window.open(shareUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
                Preview Quiz
              </Button>
              <Button 
                variant="glow" 
                className="flex-1"
                onClick={handleCopy}
              >
                <Copy className="h-4 w-4" />
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
