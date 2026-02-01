import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Trophy, RotateCcw, Play, Loader2, ArrowLeft, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useSharedQuiz, useSubmitQuizAttempt } from '@/hooks/useSharedQuiz';
import { shuffleQuizOptions } from '@/lib/quizUtils';
import { useToast } from '@/hooks/use-toast';
import memoryLinkIcon from '@/assets/memory-link-icon.png';

export default function SharedQuizPage() {
  const { token } = useParams<{ token: string }>();
  const { quiz, loading, error, fetchQuiz } = useSharedQuiz(token);
  const { submitAttempt } = useSubmitQuizAttempt();
  const { toast } = useToast();

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [isQuizStarted, setIsQuizStarted] = useState(false);
  const [isQuizComplete, setIsQuizComplete] = useState(false);
  const [answers, setAnswers] = useState<{ questionIndex: number; selectedOption: number; correct: boolean }[]>([]);

  useEffect(() => {
    fetchQuiz();
  }, [token]);

  // Memoize shuffled options for all questions
  const shuffledQuestions = useMemo(() => {
    if (!quiz) return [];
    return quiz.questions.map((q, index) => {
      const { shuffledOptions, correctOptionId } = shuffleQuizOptions(
        q.options,
        q.correct_answer,
        q.shuffle_seed
      );
      return {
        questionIndex: index,
        shuffledOptions,
        correctOptionId,
        question: q.question,
        explanation: q.explanation,
      };
    });
  }, [quiz]);

  const currentQuestion = quiz?.questions[currentQuestionIndex];
  const currentShuffled = shuffledQuestions[currentQuestionIndex];
  const progress = quiz ? ((currentQuestionIndex + 1) / quiz.questions.length) * 100 : 0;

  const handleAnswerSelect = (optionId: string) => {
    if (showResult) return;
    setSelectedOptionId(optionId);
  };

  const handleSubmit = () => {
    if (selectedOptionId === null || !currentShuffled) return;
    setShowResult(true);
    
    const isCorrect = selectedOptionId === currentShuffled.correctOptionId;
    const selectedIndex = currentShuffled.shuffledOptions.findIndex(o => o.id === selectedOptionId);
    
    if (isCorrect) {
      setScore(score + 1);
    }

    setAnswers(prev => [...prev, {
      questionIndex: currentQuestionIndex,
      selectedOption: selectedIndex,
      correct: isCorrect,
    }]);
  };

  const handleNext = async () => {
    if (!quiz) return;
    
    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedOptionId(null);
      setShowResult(false);
    } else {
      // Quiz complete - submit attempt (ephemeral)
      await submitAttempt(quiz.id, score + (selectedOptionId === currentShuffled?.correctOptionId ? 1 : 0), quiz.questions.length, answers);
      setIsQuizComplete(true);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setSelectedOptionId(null);
    setShowResult(false);
    setScore(0);
    setIsQuizComplete(false);
    setAnswers([]);
    setIsQuizStarted(false);
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "Share this quiz with others",
      });
    } catch {
      toast({
        title: "Share this quiz",
        description: url,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <Trophy className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Quiz Not Found</h1>
          <p className="text-muted-foreground mb-6">{error || 'This quiz may have been removed or the link is invalid.'}</p>
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Quiz complete screen
  if (isQuizComplete) {
    const finalScore = score;
    const percentage = Math.round((finalScore / quiz.questions.length) * 100);
    
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <img src={memoryLinkIcon} alt="MemoryLink" className="h-8 w-8" />
            <span className="font-semibold text-lg">MemoryLink Quiz</span>
          </div>
        </header>
        
        <main className="max-w-2xl mx-auto p-4 pt-8">
          <div className="card-elevated p-6 text-center">
            <div className={cn(
              "w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center",
              percentage >= 70 ? "bg-ai/20" : percentage >= 50 ? "bg-todo/20" : "bg-destructive/20"
            )}>
              <Trophy className={cn(
                "h-10 w-10",
                percentage >= 70 ? "text-ai" : percentage >= 50 ? "text-todo" : "text-destructive"
              )} />
            </div>
            <h3 className="text-2xl font-bold mb-2">Quiz Complete!</h3>
            <p className="text-4xl font-bold text-primary mb-2">
              {finalScore}/{quiz.questions.length}
            </p>
            <p className="text-muted-foreground mb-6">
              {percentage >= 70 ? "Great job!" : percentage >= 50 ? "Good effort!" : "Keep practicing!"}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="glow" onClick={handleRestart}>
                <RotateCcw className="h-4 w-4" />
                Try Again
              </Button>
              <Button variant="outline" onClick={handleShare}>
                <Share2 className="h-4 w-4" />
                Share Quiz
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Quiz start screen
  if (!isQuizStarted) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <img src={memoryLinkIcon} alt="MemoryLink" className="h-8 w-8" />
            <span className="font-semibold text-lg">MemoryLink Quiz</span>
          </div>
        </header>
        
        <main className="max-w-2xl mx-auto p-4 pt-8">
          <div className="card-elevated p-6 text-center">
            <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">{quiz.title}</h1>
            <p className="text-muted-foreground mb-6">
              {quiz.questions.length} questions to test your knowledge
            </p>
            <Button variant="glow" size="lg" onClick={() => setIsQuizStarted(true)}>
              <Play className="h-5 w-5" />
              Start Quiz
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // Active quiz
  if (!currentShuffled || !currentQuestion) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={memoryLinkIcon} alt="MemoryLink" className="h-8 w-8" />
            <span className="font-semibold text-lg truncate">{quiz.title}</span>
          </div>
          <span className="text-sm font-medium text-muted-foreground">Score: {score}</span>
        </div>
      </header>
      
      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Question {currentQuestionIndex + 1} of {quiz.questions.length}
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Question Card */}
        <div className="card-elevated p-5 space-y-5">
          <p className="font-medium text-lg leading-relaxed">{currentQuestion.question}</p>
          
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
                    "w-full p-4 rounded-lg border text-left transition-all duration-200",
                    isSelected && !showResult && "border-primary bg-primary/10",
                    showResult && isCorrect && "border-ai bg-ai/10",
                    showResult && isSelected && !isCorrect && "border-destructive bg-destructive/10",
                    !showResult && !isSelected && "border-border hover:border-primary/50 hover:bg-muted/50"
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
              selectedOptionId === currentShuffled.correctOptionId ? "bg-ai/10 border border-ai/30" : "bg-destructive/10 border border-destructive/30"
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
              {currentQuestionIndex < quiz.questions.length - 1 ? 'Next Question' : 'See Results'}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
