import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export interface RememberItemWithVideo {
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
  video_title: string;
  video_youtube_id: string;
}

export interface CombinedReminder {
  id: string;
  user_id: string;
  video_id: string | null;
  summary: string;
  key_points: string[];
  timestamp_seconds: number;
  created_at: string;
  video_title: string;
  video_youtube_id: string;
  is_manual: boolean;
  remember_item_id?: string; // For highlight-based reminders
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithVideo {
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
  video_title: string;
  video_youtube_id: string;
  source_type?: string;
  checklist_items?: ChecklistItem[] | null;
}

export interface QuizItemWithVideo {
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
  video_title: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  phone_number: string | null;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
}

// Get all remember items across all videos
export function useAllRememberItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all_remember_items', user?.id],
    queryFn: async () => {
      // Get remember items with video info
      const { data: rememberItems, error: rememberError } = await supabase
        .from('remember_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (rememberError) throw rememberError;

      // Get videos for titles
      const videoIds = [...new Set(rememberItems.map(r => r.video_id))];
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('id, title, youtube_id, status')
        .in('id', videoIds);

      if (videosError) throw videosError;

      const videoMap = new Map(videos.map(v => [v.id, v]));

      // Only return items from ready videos
      return rememberItems
        .filter(item => {
          const video = videoMap.get(item.video_id);
          return video && video.status === 'ready';
        })
        .map(item => {
          const video = videoMap.get(item.video_id)!;
          return {
            ...item,
            video_title: video.title,
            video_youtube_id: video.youtube_id,
          } as RememberItemWithVideo;
        });
    },
    enabled: !!user,
  });
}

// Get all reminders (highlight-based + manual) combined
export function useAllRemindersCombined() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all_reminders_combined', user?.id],
    queryFn: async () => {
      // Get remember items
      const { data: rememberItems, error: rememberError } = await supabase
        .from('remember_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (rememberError) throw rememberError;

      // Get manual reminder items
      const { data: manualItems, error: manualError } = await supabase
        .from('manual_items')
        .select('*')
        .eq('type', 'reminder')
        .order('created_at', { ascending: false });

      if (manualError) throw manualError;

      // Get all video IDs
      const videoIds = [
        ...new Set([
          ...rememberItems.map(r => r.video_id),
          ...manualItems.filter(m => m.video_id).map(m => m.video_id as string),
        ]),
      ];

      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('id, title, youtube_id, status')
        .in('id', videoIds);

      if (videosError) throw videosError;

      const videoMap = new Map(videos.map(v => [v.id, v]));

      // Convert remember items to combined format
      const rememberCombined: CombinedReminder[] = rememberItems
        .filter(item => {
          const video = videoMap.get(item.video_id);
          return video && video.status === 'ready';
        })
        .map(item => {
          const video = videoMap.get(item.video_id)!;
          return {
            id: item.id,
            user_id: item.user_id,
            video_id: item.video_id,
            summary: item.summary,
            key_points: item.key_points || [],
            timestamp_seconds: item.timestamp_seconds,
            created_at: item.created_at,
            video_title: video.title,
            video_youtube_id: video.youtube_id,
            is_manual: false,
            remember_item_id: item.id,
          };
        });

      // Convert manual items to combined format
      const manualCombined: CombinedReminder[] = manualItems.map(item => {
        const video = item.video_id ? videoMap.get(item.video_id) : null;
        return {
          id: item.id,
          user_id: item.user_id,
          video_id: item.video_id,
          summary: item.title,
          key_points: item.notes ? [item.notes] : [],
          timestamp_seconds: item.timestamp_seconds || 0,
          created_at: item.created_at,
          video_title: video?.title || 'Manual Reminder',
          video_youtube_id: video?.youtube_id || '',
          is_manual: true,
        };
      });

      return [...rememberCombined, ...manualCombined];
    },
    enabled: !!user,
  });
}

// Get all tasks across all videos
export function useAllTasks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all_tasks', user?.id],
    queryFn: async () => {
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .order('order_index', { ascending: true });

      if (tasksError) throw tasksError;

      const videoIds = [...new Set(tasks.map(t => t.video_id))];
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('id, title, youtube_id')
        .in('id', videoIds);

      if (videosError) throw videosError;

      const videoMap = new Map(videos.map(v => [v.id, v]));

      return tasks.map(task => {
        const video = videoMap.get(task.video_id);
        return {
          ...task,
          video_title: video?.title || 'Unknown Video',
          video_youtube_id: video?.youtube_id || '',
          checklist_items: task.checklist_items as unknown as ChecklistItem[] | null,
        } as TaskWithVideo;
      });
    },
    enabled: !!user,
  });
}

// Get all quiz items across all ready videos
export function useAllQuizItems() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['all_quiz_items', user?.id],
    queryFn: async () => {
      const { data: quizItems, error: quizError } = await supabase
        .from('quiz_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (quizError) throw quizError;

      const videoIds = [...new Set(quizItems.map(q => q.video_id))];
      const { data: videos, error: videosError } = await supabase
        .from('videos')
        .select('id, title, status')
        .in('id', videoIds);

      if (videosError) throw videosError;

      const videoMap = new Map(videos.map(v => [v.id, v]));

      // Only return items from ready videos with transcript
      return quizItems
        .filter(item => {
          const video = videoMap.get(item.video_id);
          return video && video.status === 'ready';
        })
        .map(item => {
          const video = videoMap.get(item.video_id)!;
          return {
            ...item,
            video_title: video.title,
          } as QuizItemWithVideo;
        });
    },
    enabled: !!user,
  });
}

// Get user profile
export function useUserProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user_profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (error) throw error;
      return data as UserProfile | null;
    },
    enabled: !!user,
  });
}

// Update or create user profile
export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { phone_number?: string }) => {
      // Check if profile exists
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_profiles')
          .update(data)
          .eq('user_id', user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_profiles')
          .insert({ user_id: user!.id, ...data });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_profile'] });
      toast({ title: 'Phone number saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete a video
export function useDeleteVideo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (videoId: string) => {
      const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['all_remember_items'] });
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all_quiz_items'] });
      toast({ title: 'Video deleted', description: 'All related data has been removed.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Update task status (for combined tasks)
export function useUpdateTaskStatusGlobal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: 'pending' | 'in_progress' | 'completed' }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', taskId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

// Save quiz attempt
export function useSaveQuizAttempt() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { 
      score: number; 
      total_questions: number; 
      video_id?: string; 
      topic?: string;
    }) => {
      const { error } = await supabase
        .from('quiz_attempts')
        .insert({
          user_id: user!.id,
          ...data,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz_attempts'] });
      toast({ title: 'Quiz saved!' });
    },
  });
}

// Create reminder schedule
export function useCreateReminderSchedule() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { 
      remember_item_id: string; 
      send_at: Date;
    }) => {
      const { error } = await supabase
        .from('reminder_schedules')
        .insert({
          user_id: user!.id,
          remember_item_id: data.remember_item_id,
          send_at: data.send_at.toISOString(),
          channel: 'sms',
          status: 'scheduled',
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder_schedules'] });
      toast({ title: 'Reminder scheduled!', description: 'You will receive a text message at the scheduled time.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
