import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export type VideoStatus = 'queued' | 'transcribing' | 'ready' | 'failed' | 'needs_attention';

export interface Video {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  status: VideoStatus;
  error_message: string | null;
  failed_step: string | null;
  captions_missing: boolean;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  video_id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface Highlight {
  id: string;
  video_id: string;
  user_id: string;
  type: 'remember' | 'todo' | 'ai_suggested';
  start_seconds: number;
  end_seconds: number;
  selected_text: string;
  created_at: string;
}

export interface RememberItem {
  id: string;
  highlight_id: string;
  user_id: string;
  video_id: string;
  summary: string;
  key_points: string[];
  timestamp_seconds: number;
  review_schedule: 'daily' | 'weekly' | 'monthly' | null;
  last_reviewed_at: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  highlight_id: string;
  user_id: string;
  video_id: string;
  title: string;
  description: string | null;
  timestamp_seconds: number;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  order_index: number;
  created_at: string;
}

export interface QuizItem {
  id: string;
  remember_item_id: string;
  user_id: string;
  video_id: string;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string | null;
  topic: string | null;
  times_answered: number;
  times_correct: number;
  created_at: string;
}

export function useVideos() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['videos', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Video[];
    },
    enabled: !!user,
  });
}

export function useVideo(id: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['video', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (error) throw error;
      return data as Video | null;
    },
    enabled: !!user && !!id,
    refetchInterval: (query) => {
      // Refetch every 3 seconds if video is still processing
      const video = query.state.data;
      if (video?.status === 'queued' || video?.status === 'transcribing') {
        return 3000;
      }
      return false;
    },
  });
}

export function useTranscriptSegments(videoId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['transcript_segments', videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transcript_segments')
        .select('*')
        .eq('video_id', videoId)
        .order('start_seconds', { ascending: true });
      
      if (error) throw error;
      return data as TranscriptSegment[];
    },
    enabled: !!user && !!videoId,
  });
}

export function useHighlights(videoId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['highlights', videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as Highlight[];
    },
    enabled: !!user && !!videoId,
  });
}

export function useRememberItems(videoId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['remember_items', videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remember_items')
        .select('*')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as RememberItem[];
    },
    enabled: !!user && !!videoId,
  });
}

export function useTasks(videoId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['tasks', videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('video_id', videoId)
        .order('order_index', { ascending: true });
      
      if (error) throw error;
      return data as Task[];
    },
    enabled: !!user && !!videoId,
  });
}

export function useQuizItems(videoId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['quiz_items', videoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quiz_items')
        .select('*')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as QuizItem[];
    },
    enabled: !!user && !!videoId,
  });
}

export function useAddVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async (youtubeUrl: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ youtube_url: youtubeUrl }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add video');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      toast({
        title: 'Video added!',
        description: 'Your video is being processed. This may take a moment.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useRetryVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { session } = useAuth();

  return useMutation({
    mutationFn: async ({ videoId, fromStep }: { videoId: string; fromStep?: string }) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-video`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ 
            retry_video_id: videoId,
            retry_from_step: fromStep
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      toast({
        title: 'Retrying...',
        description: 'Processing will begin shortly.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Retry failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useAddHighlight() {
  const queryClient = useQueryClient();
  const { user, session } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      videoId,
      type,
      startSeconds,
      endSeconds,
      selectedText,
    }: {
      videoId: string;
      type: 'remember' | 'todo' | 'ai_suggested';
      startSeconds: number;
      endSeconds: number;
      selectedText: string;
    }) => {
      // Create highlight
      const { data: highlight, error: highlightError } = await supabase
        .from('highlights')
        .insert({
          video_id: videoId,
          user_id: user!.id,
          type,
          start_seconds: startSeconds,
          end_seconds: endSeconds,
          selected_text: selectedText,
        })
        .select()
        .single();

      if (highlightError) throw highlightError;

      // If remember type, generate summary with AI
      if (type === 'remember') {
        try {
          const aiResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                action: 'generate-summary',
                selected_text: selectedText,
              }),
            }
          );

          let summary = selectedText.slice(0, 100) + '...';
          let keyPoints = ['Key insight from this section'];

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            summary = aiData.summary || summary;
            keyPoints = aiData.key_points || keyPoints;
          }

          const { error: rememberError } = await supabase
            .from('remember_items')
            .insert({
              highlight_id: highlight.id,
              user_id: user!.id,
              video_id: videoId,
              summary,
              key_points: keyPoints,
              timestamp_seconds: startSeconds,
            });

          if (rememberError) throw rememberError;
        } catch (e) {
          console.error('Error creating remember item:', e);
        }
      }

      // If todo type, generate task with AI
      if (type === 'todo') {
        try {
          const aiResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                action: 'generate-task',
                selected_text: selectedText,
              }),
            }
          );

          let title = selectedText.slice(0, 60);
          let description = '';

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            title = aiData.title || title;
            description = aiData.description || description;
          }

          const { error: taskError } = await supabase
            .from('tasks')
            .insert({
              highlight_id: highlight.id,
              user_id: user!.id,
              video_id: videoId,
              title,
              description,
              timestamp_seconds: startSeconds,
            });

          if (taskError) throw taskError;
        } catch (e) {
          console.error('Error creating task:', e);
        }
      }

      return highlight;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['highlights', variables.videoId] });
      queryClient.invalidateQueries({ queryKey: ['remember_items', variables.videoId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.videoId] });
      
      const typeLabel = variables.type === 'remember' ? 'Remember' : variables.type === 'todo' ? 'To Do' : 'AI Suggested';
      toast({
        title: `Added to ${typeLabel}`,
        description: variables.selectedText.slice(0, 50) + '...',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateRememberSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      itemId,
      schedule,
      videoId,
    }: {
      itemId: string;
      schedule: 'daily' | 'weekly' | 'monthly' | null;
      videoId: string;
    }) => {
      const { error } = await supabase
        .from('remember_items')
        .update({ review_schedule: schedule })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['remember_items', variables.videoId] });
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      status,
      videoId,
    }: {
      taskId: string;
      status: 'pending' | 'in_progress' | 'completed';
      videoId: string;
    }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', taskId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.videoId] });
    },
  });
}

export function useGenerateQuiz() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (videoId: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'generate-quiz',
            video_id: videoId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate quiz');
      }

      return response.json();
    },
    onSuccess: (data, videoId) => {
      queryClient.invalidateQueries({ queryKey: ['quiz_items', videoId] });
      toast({
        title: 'Quiz generated!',
        description: `${data.questions_created} questions created`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateQuizAnswer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      quizItemId,
      correct,
      videoId,
    }: {
      quizItemId: string;
      correct: boolean;
      videoId: string;
    }) => {
      // Get current values
      const { data: current } = await supabase
        .from('quiz_items')
        .select('times_answered, times_correct')
        .eq('id', quizItemId)
        .single();

      const { error } = await supabase
        .from('quiz_items')
        .update({
          times_answered: (current?.times_answered || 0) + 1,
          times_correct: (current?.times_correct || 0) + (correct ? 1 : 0),
        })
        .eq('id', quizItemId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['quiz_items', variables.videoId] });
    },
  });
}

export function useConvertHighlight() {
  const queryClient = useQueryClient();
  const { user, session } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      highlightId,
      toType,
      videoId,
    }: {
      highlightId: string;
      toType: 'remember' | 'todo';
      videoId: string;
    }) => {
      // Get the highlight
      const { data: highlight } = await supabase
        .from('highlights')
        .select('*')
        .eq('id', highlightId)
        .single();

      if (!highlight) throw new Error('Highlight not found');

      // Update highlight type
      await supabase
        .from('highlights')
        .update({ type: toType })
        .eq('id', highlightId);

      if (toType === 'remember') {
        const aiResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              action: 'generate-summary',
              selected_text: highlight.selected_text,
            }),
          }
        );

        let summary = highlight.selected_text.slice(0, 100) + '...';
        let keyPoints = ['Key insight from this section'];

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          summary = aiData.summary || summary;
          keyPoints = aiData.key_points || keyPoints;
        }

        await supabase
          .from('remember_items')
          .insert({
            highlight_id: highlightId,
            user_id: user!.id,
            video_id: videoId,
            summary,
            key_points: keyPoints,
            timestamp_seconds: highlight.start_seconds,
          });
      }

      if (toType === 'todo') {
        const aiResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-process`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              action: 'generate-task',
              selected_text: highlight.selected_text,
            }),
          }
        );

        let title = highlight.selected_text.slice(0, 60);
        let description = '';

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          title = aiData.title || title;
          description = aiData.description || description;
        }

        await supabase
          .from('tasks')
          .insert({
            highlight_id: highlightId,
            user_id: user!.id,
            video_id: videoId,
            title,
            description,
            timestamp_seconds: highlight.start_seconds,
          });
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['highlights', variables.videoId] });
      queryClient.invalidateQueries({ queryKey: ['remember_items', variables.videoId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.videoId] });
      
      toast({
        title: `Converted to ${variables.toType === 'remember' ? 'Remember' : 'Task'}`,
        description: 'Item has been converted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
