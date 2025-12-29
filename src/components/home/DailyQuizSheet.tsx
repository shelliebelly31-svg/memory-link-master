import { useState, useMemo } from 'react';
import { Trophy, CheckCircle2, XCircle, RotateCcw, Play, ChevronLeft, Check } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { QuizItemWithVideo, useSaveQuizAttempt } from '@/hooks/useHomeData';

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

// Seeded shuffle
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type QuizMode = 'start' | 'pick_videos' | 'quiz' | 'complete';

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
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(10);
  
  const saveAttempt = useSaveQuizAttempt();

  // Get questions based on selection
  const activeQuestions = useMemo(() => {
    const filtered = selectedVideos.length > 0
      ? quizItems.filter(q => selectedVideos.includes(q.video_id))
      : quizItems;
    return shuffleWithSeed(filtered, todaySeed).slice(0, questionCount);
  }, [quizItems, selectedVideos, todaySeed, questionCount]);

  const currentQuestion = activeQuestions[currentIndex];
  const progress = ((currentIndex + 1) / activeQuestions.length) * 100;

  const handleVideoToggle = (videoId: string) => {
    if (selectedVideos.includes(videoId)) {
      onSelectVideos(selectedVideos.filter(v => v !== videoId));
    } else {
      onSelectVideos([...selectedVideos, videoId]);
    }
  };

  const handleStartQuiz = () => {
    if (activeQuestions.length === 0) return;
    setMode('quiz');
    setCurrentIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowResult(false);
  };

  const handleAnswerSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null) return;
    setShowResult(true);
    if (selectedAnswer === currentQuestion.correct_answer) {
      setScore(s => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < activeQuestions.length - 1) {
      setCurrentIndex(i => i + 1);
      setSelectedAnswer(null);
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
    setMode('start');
    onSelectVideos([]);
    setCurrentIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowResult(false);
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

              <Button 
                className="w-full" 
                onClick={handleStartQuiz}
                disabled={selectedVideos.length > 0 && activeQuestions.length === 0}
              >
                <Play className="h-4 w-4" />
                Start Quiz ({selectedVideos.length > 0 ? activeQuestions.length : quizItems.length} questions)
              </Button>
            </div>
          )}

          {/* Quiz Screen */}
          {mode === 'quiz' && currentQuestion && (
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
                  {currentQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={showResult}
                      className={cn(
                        "w-full p-4 rounded-lg border text-left transition-all",
                        selectedAnswer === index && !showResult && "border-primary bg-primary/10",
                        showResult && index === currentQuestion.correct_answer && "border-ai bg-ai/10",
                        showResult && selectedAnswer === index && index !== currentQuestion.correct_answer && "border-destructive bg-destructive/10",
                        !showResult && selectedAnswer !== index && "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0",
                          selectedAnswer === index && !showResult && "border-primary",
                          showResult && index === currentQuestion.correct_answer && "border-ai bg-ai",
                          showResult && selectedAnswer === index && index !== currentQuestion.correct_answer && "border-destructive bg-destructive",
                        )}>
                          {showResult && index === currentQuestion.correct_answer && (
                            <CheckCircle2 className="h-4 w-4 text-ai-foreground" />
                          )}
                          {showResult && selectedAnswer === index && index !== currentQuestion.correct_answer && (
                            <XCircle className="h-4 w-4 text-destructive-foreground" />
                          )}
                        </div>
                        <span>{option}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {showResult && currentQuestion.explanation && (
                  <div className={cn(
                    "p-4 rounded-lg",
                    selectedAnswer === currentQuestion.correct_answer 
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
                    disabled={selectedAnswer === null}
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
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4" />
                    New Quiz
                  </Button>
                  <Button className="flex-1" onClick={handleClose}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
