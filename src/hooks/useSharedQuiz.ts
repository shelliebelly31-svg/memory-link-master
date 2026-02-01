import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { QuizItem } from '@/types';

interface SharedQuizQuestion {
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string | null;
  shuffle_seed: number;
}

export function useCreateSharedQuiz() {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const createSharedQuiz = async (title: string, quizItems: QuizItem[]): Promise<string | null> => {
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to share a quiz",
          variant: "destructive",
        });
        return null;
      }

      // Generate unique share token
      const shareToken = crypto.randomUUID().split('-')[0] + Date.now().toString(36);

      // Convert quiz items to shareable format
      const questions: SharedQuizQuestion[] = quizItems.map(item => ({
        question: item.question,
        options: item.options,
        correct_answer: item.correct_answer,
        explanation: item.explanation,
        shuffle_seed: item.shuffle_seed ?? Math.floor(Math.random() * 2147483647),
      }));

      const { data, error } = await supabase
        .from('shared_quizzes')
        .insert([{
          creator_user_id: user.id,
          share_token: shareToken,
          title,
          questions: JSON.parse(JSON.stringify(questions)),
        }])
        .select('share_token')
        .single();

      if (error) throw error;

      return data?.share_token ?? null;
    } catch (error) {
      console.error('Error creating shared quiz:', error);
      toast({
        title: "Error",
        description: "Failed to create shareable quiz",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  return { createSharedQuiz, isCreating };
}

export function useSharedQuiz(shareToken: string | undefined) {
  const [quiz, setQuiz] = useState<{
    id: string;
    title: string;
    questions: SharedQuizQuestion[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuiz = async () => {
    if (!shareToken) {
      setError('Invalid quiz link');
      setLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('shared_quizzes')
        .select('id, title, questions')
        .eq('share_token', shareToken)
        .eq('is_active', true)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      if (!data) {
        setError('Quiz not found or no longer available');
        setLoading(false);
        return;
      }

      setQuiz({
        id: data.id,
        title: data.title,
        questions: data.questions as unknown as SharedQuizQuestion[],
      });
    } catch (err) {
      console.error('Error fetching shared quiz:', err);
      setError('Failed to load quiz');
    } finally {
      setLoading(false);
    }
  };

  return { quiz, loading, error, fetchQuiz };
}

export function useSubmitQuizAttempt() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitAttempt = async (
    sharedQuizId: string,
    score: number,
    totalQuestions: number,
    answers: { questionIndex: number; selectedOption: number; correct: boolean }[]
  ): Promise<string | null> => {
    setIsSubmitting(true);
    try {
      // Generate a session ID for this anonymous user
      const sessionId = crypto.randomUUID();

      const { data, error } = await supabase
        .from('shared_quiz_attempts')
        .insert({
          shared_quiz_id: sharedQuizId,
          session_id: sessionId,
          score,
          total_questions: totalQuestions,
          answers,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Immediately delete the attempt after recording (user requested ephemeral results)
      await supabase
        .from('shared_quiz_attempts')
        .delete()
        .eq('id', data.id);

      return sessionId;
    } catch (error) {
      console.error('Error submitting quiz attempt:', error);
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitAttempt, isSubmitting };
}
