import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

export type RepeatType = 'one_time' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom_days' | 'multiple_dates';

export interface ManualItem {
  id: string;
  user_id: string;
  type: 'reminder' | 'todo';
  title: string;
  notes: string | null;
  video_id: string | null;
  timestamp_seconds: number | null;
  created_at: string;
  video_title?: string;
}

// Fetch all manual reminder items
export function useManualReminders() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['manual_reminders', user?.id],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from('manual_items')
        .select('*')
        .eq('type', 'reminder')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get video titles for linked videos
      const videoIds = items.filter(i => i.video_id).map(i => i.video_id as string);
      let videoMap = new Map<string, string>();

      if (videoIds.length > 0) {
        const { data: videos } = await supabase
          .from('videos')
          .select('id, title')
          .in('id', videoIds);

        if (videos) {
          videoMap = new Map(videos.map(v => [v.id, v.title]));
        }
      }

      return items.map(item => ({
        ...item,
        video_title: item.video_id ? videoMap.get(item.video_id) : undefined,
      })) as ManualItem[];
    },
    enabled: !!user,
  });
}

// Create a manual reminder - creates highlight + remember_item so it shows in Memory Items tab
export function useCreateManualReminder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      notes?: string;
      video_id?: string;
      timestamp_seconds?: number;
      end_timestamp_seconds?: number;
      schedule_at?: Date;
      repeat_type?: RepeatType;
      repeat_days?: number[];
      repeat_dates?: Date[];
    }) => {
      const timestampSeconds = data.timestamp_seconds ?? 0;
      const endTimestampSeconds = data.end_timestamp_seconds ?? timestampSeconds + 1;

      // 1. Create highlight record
      const { data: highlight, error: highlightError } = await supabase
        .from('highlights')
        .insert({
          video_id: data.video_id!,
          user_id: user!.id,
          type: 'remember' as const,
          start_seconds: timestampSeconds,
          end_seconds: endTimestampSeconds,
          selected_text: data.title,
        })
        .select()
        .single();

      if (highlightError) throw highlightError;

      // 2. Create remember_item record (this shows in Memory Items tab)
      const { data: rememberItem, error: rememberError } = await supabase
        .from('remember_items')
        .insert({
          highlight_id: highlight.id,
          user_id: user!.id,
          video_id: data.video_id!,
          summary: data.title,
          key_points: data.notes ? [data.notes] : [],
          timestamp_seconds: timestampSeconds,
        })
        .select()
        .single();

      if (rememberError) throw rememberError;

      // 3. Create manual item for tracking
      const { data: item, error: itemError } = await supabase
        .from('manual_items')
        .insert({
          user_id: user!.id,
          type: 'reminder',
          title: data.title,
          notes: data.notes || null,
          video_id: data.video_id || null,
          timestamp_seconds: timestampSeconds,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // 4. Create reminder schedule if date provided
      if (data.schedule_at) {
        const { error: scheduleError } = await supabase
          .from('reminder_schedules')
          .insert({
            user_id: user!.id,
            manual_item_id: item.id,
            remember_item_id: rememberItem.id,
            send_at: data.schedule_at.toISOString(),
            channel: 'sms' as const,
            status: 'scheduled' as const,
            repeat_type: data.repeat_type || 'one_time',
            original_send_at: data.schedule_at.toISOString(),
            next_send_at: data.schedule_at.toISOString(),
            repeat_days: data.repeat_type === 'custom_days' ? data.repeat_days : null,
            repeat_dates: data.repeat_type === 'multiple_dates' && data.repeat_dates 
              ? data.repeat_dates.map(d => d.toISOString()) 
              : null,
          });

        if (scheduleError) throw scheduleError;
      }

      console.log('Created reminder:', { 
        rememberItemId: rememberItem.id, 
        videoId: data.video_id, 
        userId: user!.id 
      });

      return { item, rememberItem, highlight };
    },
    onSuccess: (_, variables) => {
      // Invalidate remember_items for this specific video so it appears immediately
      if (variables.video_id) {
        queryClient.invalidateQueries({ queryKey: ['remember_items', variables.video_id] });
        queryClient.invalidateQueries({ queryKey: ['highlights', variables.video_id] });
      }
      queryClient.invalidateQueries({ queryKey: ['manual_reminders'] });
      queryClient.invalidateQueries({ queryKey: ['all_reminders_combined'] });
      toast({ title: 'Saved', description: 'Reminder created successfully' });
    },
    onError: (error: Error) => {
      console.error('Error creating reminder:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Create a manual task - creates task (and optionally highlight if video linked)
export function useCreateManualTask() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      video_id?: string;
      timestamp_seconds?: number;
      end_timestamp_seconds?: number;
      due_date?: string;
    }) => {
      const timestampSeconds = data.timestamp_seconds ?? 0;
      const endTimestampSeconds = data.end_timestamp_seconds ?? timestampSeconds + 1;
      let highlightId: string | null = null;

      // 1. Create highlight record only if video is provided
      if (data.video_id) {
        const { data: highlight, error: highlightError } = await supabase
          .from('highlights')
          .insert({
            video_id: data.video_id,
            user_id: user!.id,
            type: 'todo' as const,
            start_seconds: timestampSeconds,
            end_seconds: endTimestampSeconds,
            selected_text: data.title,
          })
          .select()
          .single();

        if (highlightError) throw highlightError;
        highlightId = highlight.id;
      }

      // 2. Create manual item first (used for tracking and linking to task)
      const { data: manualItem, error: itemError } = await supabase
        .from('manual_items')
        .insert({
          user_id: user!.id,
          type: 'todo',
          title: data.title,
          notes: data.description || null,
          video_id: data.video_id || null,
          timestamp_seconds: timestampSeconds,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // 3. Create task record - video_id is required in schema, need to handle this
      // For standalone tasks without video, we need to use a dummy/default approach
      // Check if video_id is nullable in schema - if not, this needs DB migration
      if (data.video_id) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .insert({
            user_id: user!.id,
            highlight_id: highlightId,
            video_id: data.video_id,
            title: data.title,
            description: data.description || null,
            timestamp_seconds: timestampSeconds,
            due_date: data.due_date || null,
            source_type: 'manual',
            status: 'pending',
            manual_item_id: manualItem.id,
          })
          .select()
          .single();

        if (taskError) throw taskError;

        console.log('Created task with video:', { 
          taskId: task.id, 
          videoId: data.video_id, 
          userId: user!.id 
        });

        return { task, highlight: { id: highlightId }, manualItem };
      } else {
        // Task without video - just use manual item
        console.log('Created standalone task:', { 
          manualItemId: manualItem.id, 
          userId: user!.id 
        });

        return { task: null, highlight: null, manualItem };
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate tasks for this specific video so it appears immediately
      if (variables.video_id) {
        queryClient.invalidateQueries({ queryKey: ['tasks', variables.video_id] });
        queryClient.invalidateQueries({ queryKey: ['highlights', variables.video_id] });
      }
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Saved', description: 'Task created successfully' });
    },
    onError: (error: Error) => {
      console.error('Error creating task:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete a manual item
export function useDeleteManualItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('manual_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual_reminders'] });
      queryClient.invalidateQueries({ queryKey: ['all_reminders_combined'] });
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      toast({ title: 'Deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}
