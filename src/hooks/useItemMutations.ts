import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from '@/hooks/use-toast';

// Update a remember item
export function useUpdateRememberItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      id, 
      summary, 
      key_points 
    }: { 
      id: string; 
      summary: string; 
      key_points: string[];
    }) => {
      const { error } = await supabase
        .from('remember_items')
        .update({ summary, key_points })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remember_items'] });
      queryClient.invalidateQueries({ queryKey: ['all_remember_items'] });
      queryClient.invalidateQueries({ queryKey: ['all_reminders_combined'] });
      toast({ title: 'Saved', description: 'Memory item updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete a remember item (cascades to quiz items)
export function useDeleteRememberItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete quiz items first (no cascade in DB)
      await supabase
        .from('quiz_items')
        .delete()
        .eq('remember_item_id', id);

      // Delete reminder schedules
      await supabase
        .from('reminder_schedules')
        .delete()
        .eq('remember_item_id', id);

      // Delete the remember item
      const { error } = await supabase
        .from('remember_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remember_items'] });
      queryClient.invalidateQueries({ queryKey: ['all_remember_items'] });
      queryClient.invalidateQueries({ queryKey: ['all_reminders_combined'] });
      queryClient.invalidateQueries({ queryKey: ['quiz_items'] });
      queryClient.invalidateQueries({ queryKey: ['all_quiz_items'] });
      toast({ title: 'Deleted', description: 'Memory item and related quiz items removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Update a task
export function useUpdateTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      id, 
      title, 
      description,
      due_date,
    }: { 
      id: string; 
      title: string; 
      description: string | null;
      due_date: string | null;
    }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ title, description, due_date })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      toast({ title: 'Saved', description: 'Task updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Delete a task
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // Get the task to check if it has a manual_item_id
      const { data: task } = await supabase
        .from('tasks')
        .select('manual_item_id')
        .eq('id', id)
        .single();

      // Delete the task
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // If there was a linked manual item, delete it too
      if (task?.manual_item_id) {
        await supabase
          .from('manual_items')
          .delete()
          .eq('id', task.manual_item_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all_tasks'] });
      toast({ title: 'Deleted', description: 'Task removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });
}

// Trigger quiz generation for a video
export function useTriggerQuizGeneration() {
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
      queryClient.invalidateQueries({ queryKey: ['all_quiz_items'] });
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
