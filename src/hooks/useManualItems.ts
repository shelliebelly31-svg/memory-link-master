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

// Create a manual reminder
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
      schedule_at?: Date;
      repeat_type?: RepeatType;
      repeat_days?: number[];
      repeat_dates?: Date[];
    }) => {
      // Create manual item
      const { data: item, error: itemError } = await supabase
        .from('manual_items')
        .insert({
          user_id: user!.id,
          type: 'reminder',
          title: data.title,
          notes: data.notes || null,
          video_id: data.video_id || null,
          timestamp_seconds: data.timestamp_seconds || null,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Create reminder schedule if date provided
      if (data.schedule_at) {
        const { error: scheduleError } = await supabase
          .from('reminder_schedules')
          .insert({
            user_id: user!.id,
            manual_item_id: item.id,
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

      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manual_reminders'] });
      queryClient.invalidateQueries({ queryKey: ['all_reminders_combined'] });
      toast({ title: 'Saved', description: 'Reminder created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Create a manual task
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
      due_date?: string;
    }) => {
      // First create manual item
      const { data: manualItem, error: itemError } = await supabase
        .from('manual_items')
        .insert({
          user_id: user!.id,
          type: 'todo',
          title: data.title,
          notes: data.description || null,
          video_id: data.video_id || null,
          timestamp_seconds: data.timestamp_seconds || null,
        })
        .select()
        .single();

      if (itemError) throw itemError;

      // Then create task linked to manual item
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          user_id: user!.id,
          title: data.title,
          description: data.description || null,
          video_id: data.video_id || null,
          timestamp_seconds: data.timestamp_seconds || 0,
          due_date: data.due_date || null,
          source_type: 'manual',
          manual_item_id: manualItem.id,
          status: 'pending',
        })
        .select()
        .single();

      if (taskError) throw taskError;

      return task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast({ title: 'Saved', description: 'Task created successfully' });
    },
    onError: (error: Error) => {
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
