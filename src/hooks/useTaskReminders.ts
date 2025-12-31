import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

interface CreateTaskReminderParams {
  task_id: string;
  send_at: Date;
  repeat_type?: string;
  repeat_days?: number[];
}

export function useCreateTaskReminder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateTaskReminderParams) => {
      // First, check if a reminder already exists for this task
      const { data: existing } = await supabase
        .from('reminder_schedules')
        .select('id')
        .eq('manual_item_id', data.task_id)
        .eq('status', 'scheduled')
        .maybeSingle();

      if (existing) {
        // Update existing reminder
        const { error } = await supabase
          .from('reminder_schedules')
          .update({
            send_at: data.send_at.toISOString(),
            repeat_type: data.repeat_type || 'one_time',
            repeat_days: data.repeat_days || null,
            next_send_at: data.send_at.toISOString(),
            original_send_at: data.send_at.toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Get the task to find the linked manual_item_id
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .select('manual_item_id')
          .eq('id', data.task_id)
          .maybeSingle();

        if (taskError) throw taskError;

        // Create new reminder schedule
        const { error } = await supabase
          .from('reminder_schedules')
          .insert({
            user_id: user!.id,
            manual_item_id: task?.manual_item_id || data.task_id, // Use manual_item_id if available
            send_at: data.send_at.toISOString(),
            repeat_type: data.repeat_type || 'one_time',
            repeat_days: data.repeat_days || null,
            next_send_at: data.send_at.toISOString(),
            original_send_at: data.send_at.toISOString(),
            channel: 'sms',
            status: 'scheduled',
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder_schedules'] });
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      toast({ 
        title: 'Text scheduled!', 
        description: 'You will receive a text message at the scheduled time.' 
      });
    },
    onError: (error: Error) => {
      console.error('Failed to schedule reminder:', error);
      toast({ 
        title: 'Scheduling failed', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}
