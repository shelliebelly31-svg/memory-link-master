import { useState } from 'react';
import { CheckSquare, Calendar, GripVertical, ExternalLink, Plus, Sparkles, Pencil, Trash2 } from 'lucide-react';
import { Task, Highlight } from '@/types';
import { formatTimestamp } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EditTaskSheet } from './EditTaskSheet';
import { useUpdateTask, useDeleteTask, useUpdateTaskChecklist, ChecklistItem } from '@/hooks/useItemMutations';

interface TodoTabProps {
  tasks: Task[];
  aiSuggestedHighlights: Highlight[];
  onConvertToTask: (highlightId: string) => void;
  onToggleTaskStatus: (taskId: string) => void;
  onJumpToTimestamp: (seconds: number) => void;
}

export function TodoTab({
  tasks,
  aiSuggestedHighlights,
  onConvertToTask,
  onToggleTaskStatus,
  onJumpToTimestamp,
}: TodoTabProps) {
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const checklistMutation = useUpdateTaskChecklist();

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const handleSaveEdit = (id: string, data: { title: string; description: string | null; due_date: string | null; checklist_items: ChecklistItem[] }) => {
    updateMutation.mutate({ id, ...data }, {
      onSuccess: () => setEditTask(null),
    });
  };

  const handleChecklistToggle = (id: string, checklistItems: ChecklistItem[]) => {
    checklistMutation.mutate({ id, checklist_items: checklistItems });
  };

  const handleDelete = () => {
    if (deleteTaskId) {
      deleteMutation.mutate(deleteTaskId, {
        onSuccess: () => setDeleteTaskId(null),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Pending Tasks */}
      {pendingTasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-todo" />
            To Do ({pendingTasks.length})
          </h3>
          {pendingTasks.map((task) => (
            <div
              key={task.id}
              className="card-elevated p-4 border-l-4 border-todo"
            >
              <div className="flex items-center justify-end gap-1 mb-2">
                <Button variant="ghost" size="icon-sm" onClick={() => setEditTask(task)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTaskId(task.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 mt-0.5">
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                  <Checkbox
                    checked={task.status === 'completed'}
                    onCheckedChange={() => onToggleTaskStatus(task.id)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium">{task.title}</h4>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <button
                      onClick={() => onJumpToTimestamp(task.timestamp_seconds)}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {formatTimestamp(task.timestamp_seconds)}
                    </button>
                    {task.due_date && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(task.due_date).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Suggested to Convert */}
      {aiSuggestedHighlights.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ai" />
            Suggested Tasks
          </h3>
          {aiSuggestedHighlights.map((highlight) => (
            <div key={highlight.id} className="card-elevated p-4 border-l-4 border-ai">
              <p className="text-sm mb-3">{highlight.selected_text}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-ai border-ai/30">
                  {formatTimestamp(highlight.start_seconds)}
                </Badge>
                <Button
                  variant="todo"
                  size="sm"
                  onClick={() => onConvertToTask(highlight.id)}
                >
                  <Plus className="h-4 w-4" />
                  Create Task
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-muted-foreground flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Completed ({completedTasks.length})
          </h3>
          {completedTasks.map((task) => (
            <div
              key={task.id}
              className="card-elevated p-4 opacity-60"
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={true}
                  onCheckedChange={() => onToggleTaskStatus(task.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <h4 className="font-medium line-through">{task.title}</h4>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTaskId(task.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tasks.length === 0 && aiSuggestedHighlights.length === 0 && (
        <div className="text-center py-12">
          <CheckSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No tasks yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Highlight text in the transcript and tap "To Do"
          </p>
        </div>
      )}

      {/* Edit Sheet */}
      <EditTaskSheet
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
        task={editTask}
        onSave={handleSaveEdit}
        onChecklistToggle={handleChecklistToggle}
        isSaving={updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTaskId} onOpenChange={(open) => !open && setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this task everywhere. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
