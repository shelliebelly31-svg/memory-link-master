import { useState, useMemo, useCallback } from 'react';
import { Trophy, CheckCircle2, XCircle, RotateCcw, Play, ChevronLeft, Sparkles, Share2, Copy, Check, Loader2, ExternalLink } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { QuizItemWithVideo, useSaveQuizAttempt } from '@/hooks/useHomeData';
import { shuffleQuizOptions, shuffleWithSeed, trackCorrectAnswerPosition, ShuffledOption } from '@/lib/quizUtils';
import { useToast } from '@/hooks/use-toast';
import { useCreateSharedQuiz } from '@/hooks/useSharedQuiz';

interface DailyQuizSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questions: QuizItemWithVideo[];
  allVideos: { id: string; title: string }[];
  selectedVideos: string[];
  onSelectVideos: (videos: string[]) => void;
  quizItems: QuizItemWithVideo[];
  todaySeed: number;
}

type QuizMode = 'start' | 'pick_videos' | 'quiz' | 'complete';

interface ShuffledQuestionData {
  questionId: string;
  shuffledOptions: ShuffledOption[];
  correctOptionId: string;
}

export function DailyQuizSheet({ 
  open, 
  onOpenChange, 
  questions,
  allVideos,
  selectedVideos,
  onSelectVideos,
  quizItems,
  todaySeed,
}: DailyQuizSheetProps) {
  const [mode, setMode] = useState<QuizMode>('start');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(10);
  const [attemptSeed, setAttemptSeed] = useState(todaySeed);
  const [lastAttemptQuestionIds, setLastAttemptQuestionIds] = useState<Set<string>>(new Set());
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const saveAttempt = useSaveQuizAttempt();
  const { toast } = useToast();
  const { createSharedQuiz, isCreating: isCreatingShare } = useCreateSharedQuiz();

  // Get questions based on selection, prioritizing unused questions, then shuffle
  const activeQuestions = useMemo(() => {
    const filtered = selectedVideos.length > 0
      ? quizItems.filter(q => selectedVideos.includes(q.video_id))
      : quizItems;
    
    // If we have last attempt's questions, try to prioritize different ones
    if (lastAttemptQuestionIds.size > 0) {
      const unusedQuestions = filtered.filter(q => !lastAttemptQuestionIds.has(q.id));
      const usedQuestions = filtered.filter(q => lastAttemptQuestionIds.has(q.id));
      
      // Shuffle both pools separately
      const shuffledUnused = shuffleWithSeed(unusedQuestions, attemptSeed);
      const shuffledUsed = shuffleWithSeed(usedQuestions, attemptSeed + 1);
      
      // Prefer unused, fill with used if needed
      const combined = [...shuffledUnused, ...shuffledUsed];
      return combined.slice(0, questionCount);
    }
    
    return shuffleWithSeed(filtered, attemptSeed).slice(0, questionCount);
  }, [quizItems, selectedVideos, attemptSeed, questionCount, lastAttemptQuestionIds]);

  // Memoize shuffled options for all active questions
  const shuffledQuestionsData = useMemo((): ShuffledQuestionData[] => {
    return activeQuestions.map(q => {
      // Use a combination of attemptSeed and question's shuffle_seed for variety
      const optionSeed = (q.shuffle_seed ?? 0) ^ attemptSeed;
      const { shuffledOptions, correctOptionId } = shuffleQuizOptions(
        q.options,
        q.correct_answer,
        optionSeed
      );
      
      // Track position in dev mode
      const correctPosition = shuffledOptions.findIndex(opt => opt.id === correctOptionId);
      trackCorrectAnswerPosition(correctPosition);
      
      return {
        questionId: q.id,
        shuffledOptions,
        correctOptionId,
      };
    });
  }, [activeQuestions, attemptSeed]);

  const currentQuestion = activeQuestions[currentIndex];
  const currentShuffled = shuffledQuestionsData[currentIndex];
  const progress = activeQuestions.length > 0 ? ((currentIndex + 1) / activeQuestions.length) * 100 : 0;

  const handleVideoToggle = (videoId: string) => {
    if (selectedVideos.includes(videoId)) {
      onSelectVideos(selectedVideos.filter(v => v !== videoId));
    } else {
      onSelectVideos([...selectedVideos, videoId]);
    }
  };

  const handleRegenerate = useCallback(() => {
    // Store current questions as "last attempt" to avoid
    const currentQuestionIds = new Set(activeQuestions.map(q => q.id));
    setLastAttemptQuestionIds(currentQuestionIds);
    
    // Generate new random seed
    const newSeed = Math.floor(Math.random() * 2147483647);
    setAttemptSeed(newSeed);
    
    toast({
      title: "New quiz generated!",
      description: "Questions have been reshuffled",
    });
  }, [activeQuestions, toast]);

  const handleStartQuiz = () => {
    if (activeQuestions.length === 0) return;
    setMode('quiz');
    setCurrentIndex(0);
    setScore(0);
    setSelectedOptionId(null);
    setShowResult(false);
  };

  const handleAnswerSelect = (optionId: string) => {
    if (showResult) return;
    setSelectedOptionId(optionId);
  };

  const handleSubmit = () => {
    if (selectedOptionId === null || !currentShuffled) return;
    setShowResult(true);
    if (selectedOptionId === currentShuffled.correctOptionId) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < activeQuestions.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedOptionId(null);
      setShowResult(false);
    } else {
      // Save attempt
      saveAttempt.mutate({
        score,
        total_questions: activeQuestions.length,
        video_id: selectedVideos.length === 1 ? selectedVideos[0] : undefined,
      });
      setMode('complete');
    }
  };

  const handleReset = () => {
    // Store current questions as last attempt before resetting
    const currentQuestionIds = new Set(activeQuestions.map(q => q.id));
    setLastAttemptQuestionIds(currentQuestionIds);
    
    setMode('start');
    onSelectVideos([]);
    setCurrentIndex(0);
    setScore(0);
    setSelectedOptionId(null);
    setShowResult(false);
    // Reset share state
    setShareDialogOpen(false);
    setShareUrl(null);
    setCopied(false);
  };

  const handleShareQuiz = async () => {
    // Create a title based on video selection
    const title = selectedVideos.length === 1 
      ? allVideos.find(v => v.id === selectedVideos[0])?.title || 'Daily Quiz'
      : `Daily Quiz (${activeQuestions.length} questions)`;
    
    // Convert active questions to QuizItem format for sharing
    const quizItemsToShare = activeQuestions.map(q => ({
      id: q.id,
      remember_item_id: q.remember_item_id,
      user_id: q.user_id,
      question: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      shuffle_seed: q.shuffle_seed,
      explanation: q.explanation || '',
      times_answered: q.times_answered,
      times_correct: q.times_correct,
      video_id: q.video_id,
      video_title: q.video_title,
      topic: q.topic || '',
      created_at: q.created_at,
    }));
    
    const token = await createSharedQuiz(title, quizItemsToShare);
    if (token) {
      const url = `${window.location.origin}/quiz/${token}`;
      setShareUrl(url);
    }
  };

  const handleCopyLink = async () => {
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

  const handleNativeShare = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Take my quiz!',
          text: `Challenge yourself with this quiz I created!`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed, fall back to copy
        if ((err as Error).name !== 'AbortError') {
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  const handleShareDialogChange = (open: boolean) => {
    setShareDialogOpen(open);
    if (!open) {
      setShareUrl(null);
      setCopied(false);
    }
  };

  const handleClose = () => {
    handleReset();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[90vh]">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Daily Quiz
          </SheetTitle>
          {mode === 'start' && (
            <SheetDescription>
              Test your knowledge with questions from your videos
            </SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(90vh-120px)]">
          {/* Start Screen */}
          {mode === 'start' && (
            <div className="space-y-6 p-4">
              <div className="text-center py-6">
                <Trophy className="h-16 w-16 text-primary mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Ready to Quiz?</h3>
                <p className="text-muted-foreground">
                  {quizItems.length} questions from {allVideos.length} videos
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button 
                    variant="glow" 
                    className="flex-1"
                    onClick={handleStartQuiz}
                    disabled={quizItems.length === 0}
                  >
                    <Play className="h-4 w-4" />
                    Start Daily Quiz
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={() => setMode('pick_videos')}
                    disabled={allVideos.length === 0}
                  >
                    Pick Videos
                  </Button>
                </div>
                <Button 
                  variant="ghost" 
                  onClick={handleRegenerate}
                  disabled={quizItems.length === 0}
                  className="w-full"
                >
                  <Sparkles className="h-4 w-4" />
                  Regenerate Quiz
                </Button>
              </div>
            </div>
          )}

          {/* Pick Videos Screen */}
          {mode === 'pick_videos' && (
            <div className="space-y-4 p-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon-sm" onClick={() => setMode('start')}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="font-semibold">Select Videos</h3>
              </div>

              {/* Question count */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Questions:</span>
                {[5, 10, 20].map(count => (
                  <Button
                    key={count}
                    variant={questionCount === count ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setQuestionCount(count)}
                  >
                    {count}
                  </Button>
                ))}
              </div>

              {/* Video list */}
              <div className="space-y-2">
                {allVideos.map(video => {
                  const videoQuestions = quizItems.filter(q => q.video_id === video.id).length;
                  return (
                    <div
                      key={video.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedVideos.includes(video.id) ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}
                      onClick={() => handleVideoToggle(video.id)}
                    >
                      <Checkbox 
                        checked={selectedVideos.includes(video.id)}
                        onCheckedChange={() => handleVideoToggle(video.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium line-clamp-1">{video.title}</p>
                        <p className="text-xs text-muted-foreground">{videoQuestions} questions</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  className="w-full" 
                  onClick={handleStartQuiz}
                  disabled={selectedVideos.length > 0 && activeQuestions.length === 0}
                >
                  <Play className="h-4 w-4" />
                  Start Quiz ({selectedVideos.length > 0 ? activeQuestions.length : quizItems.length} questions)
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={handleRegenerate}
                  disabled={(selectedVideos.length > 0 ? activeQuestions.length : quizItems.length) === 0}
                  className="w-full"
                >
                  <Sparkles className="h-4 w-4" />
                  Regenerate Quiz
                </Button>
              </div>
            </div>
          )}

          {/* Quiz Screen */}
          {mode === 'quiz' && currentQuestion && currentShuffled && (
            <div className="space-y-6 p-4">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Question {currentIndex + 1} of {activeQuestions.length}
                  </span>
                  <span className="font-medium">Score: {score}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Question */}
              <div className="card-elevated p-5 space-y-5">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{currentQuestion.video_title}</p>
                  <p className="font-medium text-lg">{currentQuestion.question}</p>
                </div>
                
                <div className="space-y-3">
                  {currentShuffled.shuffledOptions.map((option) => {
                    const isCorrect = option.id === currentShuffled.correctOptionId;
                    const isSelected = selectedOptionId === option.id;
                    
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleAnswerSelect(option.id)}
                        disabled={showResult}
                        className={cn(
                          "w-full p-4 rounded-lg border text-left transition-all",
                          isSelected && !showResult && "border-primary bg-primary/10",
                          showResult && isCorrect && "border-ai bg-ai/10",
                          showResult && isSelected && !isCorrect && "border-destructive bg-destructive/10",
                          !showResult && !isSelected && "border-border hover:border-primary/50"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0",
                            isSelected && !showResult && "border-primary",
                            showResult && isCorrect && "border-ai bg-ai",
                            showResult && isSelected && !isCorrect && "border-destructive bg-destructive",
                          )}>
                            {showResult && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 text-ai-foreground" />
                            )}
                            {showResult && isSelected && !isCorrect && (
                              <XCircle className="h-4 w-4 text-destructive-foreground" />
                            )}
                          </div>
                          <span>{option.text}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {showResult && currentQuestion.explanation && (
                  <div className={cn(
                    "p-4 rounded-lg",
                    selectedOptionId === currentShuffled.correctOptionId 
                      ? "bg-ai/10 border border-ai/30" 
                      : "bg-destructive/10 border border-destructive/30"
                  )}>
                    <p className="text-sm">{currentQuestion.explanation}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                {!showResult ? (
                  <Button
                    className="flex-1"
                    disabled={selectedOptionId === null}
                    onClick={handleSubmit}
                  >
                    Submit Answer
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={handleNext}>
                    {currentIndex < activeQuestions.length - 1 ? 'Next Question' : 'See Results'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Complete Screen */}
          {mode === 'complete' && (
            <div className="p-4">
              <div className="card-elevated p-6 text-center">
                <div className={cn(
                  "w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center",
                  (score / activeQuestions.length) >= 0.7 ? "bg-ai/20" : 
                  (score / activeQuestions.length) >= 0.5 ? "bg-todo/20" : "bg-destructive/20"
                )}>
                  <Trophy className={cn(
                    "h-10 w-10",
                    (score / activeQuestions.length) >= 0.7 ? "text-ai" : 
                    (score / activeQuestions.length) >= 0.5 ? "text-todo" : "text-destructive"
                  )} />
                </div>
                <h3 className="text-2xl font-bold mb-2">Quiz Complete!</h3>
                <p className="text-4xl font-bold text-primary mb-2">
                  {score}/{activeQuestions.length}
                </p>
                <p className="text-muted-foreground mb-6">
                  {(score / activeQuestions.length) >= 0.7 ? "Great job! 🎉" : 
                   (score / activeQuestions.length) >= 0.5 ? "Good effort! 💪" : "Keep practicing! 📚"}
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={handleReset}>
                      <RotateCcw className="h-4 w-4" />
                      New Quiz
                    </Button>
                    <Button className="flex-1" onClick={handleClose}>
                      Done
                    </Button>
                  </div>
                  <Button 
                    variant="ghost" 
                    onClick={() => {
                      handleRegenerate();
                      handleReset();
                    }}
                    className="w-full"
                  >
                    <Sparkles className="h-4 w-4" />
                    Regenerate & Try Again
                  </Button>
                  
                  {/* Share Quiz Dialog */}
                  <Dialog open={shareDialogOpen} onOpenChange={handleShareDialogChange}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full">
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
                            This will create a public quiz with {activeQuestions.length} questions that anyone can take.
                          </p>
                          <Button 
                            onClick={handleShareQuiz} 
                            disabled={isCreatingShare}
                            className="w-full"
                            variant="glow"
                          >
                            {isCreatingShare ? (
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
                              onClick={handleCopyLink}
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
                              Preview
                            </Button>
                            <Button 
                              variant="glow" 
                              className="flex-1"
                              onClick={handleNativeShare}
                            >
                              <Share2 className="h-4 w-4" />
                              Share
                            </Button>
                          </div>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
