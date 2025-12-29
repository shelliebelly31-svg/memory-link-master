import { useState } from 'react';
import { CheckCircle2, XCircle, Trophy, RotateCcw, AlertTriangle, Play } from 'lucide-react';
import { QuizItem } from '@/types';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface QuizTabProps {
  quizItems: QuizItem[];
  onRegenerateQuestion: (questionId: string) => void;
}

export function QuizTab({ quizItems, onRegenerateQuestion }: QuizTabProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [isQuizStarted, setIsQuizStarted] = useState(false);
  const [isQuizComplete, setIsQuizComplete] = useState(false);

  const currentQuestion = quizItems[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quizItems.length) * 100;

  const weakQuestions = quizItems.filter(q => 
    q.times_answered > 0 && (q.times_correct / q.times_answered) < 0.5
  );

  const handleAnswerSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
  };

  const handleSubmit = () => {
    if (selectedAnswer === null) return;
    setShowResult(true);
    if (selectedAnswer === currentQuestion.correct_answer) {
      setScore(score + 1);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < quizItems.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setIsQuizComplete(true);
    }
  };

  const handleRestart = () => {
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setIsQuizComplete(false);
  };

  if (quizItems.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">No quiz questions yet</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Add some "Remember" items to generate quiz questions
        </p>
      </div>
    );
  }

  if (!isQuizStarted) {
    return (
      <div className="space-y-6">
        <div className="card-elevated p-6 text-center">
          <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2">Ready to Test Yourself?</h3>
          <p className="text-muted-foreground mb-6">
            {quizItems.length} questions based on your highlights
          </p>
          <Button variant="glow" size="lg" onClick={() => setIsQuizStarted(true)}>
            <Play className="h-5 w-5" />
            Start Quiz
          </Button>
        </div>

        {weakQuestions.length > 0 && (
          <div className="card-elevated p-4 border-l-4 border-todo">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-todo" />
              <h4 className="font-semibold">Needs Practice</h4>
            </div>
            <div className="space-y-2">
              {weakQuestions.map(q => (
                <div key={q.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground line-clamp-1 flex-1">
                    {q.question}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRegenerateQuestion(q.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isQuizComplete) {
    const percentage = Math.round((score / quizItems.length) * 100);
    return (
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
          {score}/{quizItems.length}
        </p>
        <p className="text-muted-foreground mb-6">
          {percentage >= 70 ? "Great job! 🎉" : percentage >= 50 ? "Good effort! 💪" : "Keep practicing! 📚"}
        </p>
        <Button variant="glow" onClick={handleRestart}>
          <RotateCcw className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            Question {currentQuestionIndex + 1} of {quizItems.length}
          </span>
          <span className="font-medium">Score: {score}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Question Card */}
      <div className="card-elevated p-5 space-y-5">
        <p className="font-medium text-lg leading-relaxed">{currentQuestion.question}</p>
        
        <div className="space-y-3">
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              disabled={showResult}
              className={cn(
                "w-full p-4 rounded-lg border text-left transition-all duration-200",
                selectedAnswer === index && !showResult && "border-primary bg-primary/10",
                showResult && index === currentQuestion.correct_answer && "border-ai bg-ai/10",
                showResult && selectedAnswer === index && index !== currentQuestion.correct_answer && "border-destructive bg-destructive/10",
                !showResult && selectedAnswer !== index && "border-border hover:border-primary/50 hover:bg-muted/50"
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

        {showResult && (
          <div className={cn(
            "p-4 rounded-lg",
            selectedAnswer === currentQuestion.correct_answer ? "bg-ai/10 border border-ai/30" : "bg-destructive/10 border border-destructive/30"
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
            {currentQuestionIndex < quizItems.length - 1 ? 'Next Question' : 'See Results'}
          </Button>
        )}
      </div>
    </div>
  );
}
