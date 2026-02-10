import { useState } from 'react';
import { CheckSquare, Circle, CheckCircle2, Calendar, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { MilestoneDialog } from '@/components/todo/MilestoneDialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { TaskWithVideo, useUpdateTaskStatusGlobal } from '@/hooks/useHomeData';
import { useUpdateTask, useDeleteTask } from '@/hooks/useItemMutations';
import { EditTaskSheet } from '@/components/video/EditTaskSheet';
import { cn } from '@/lib/utils';

interface CombinedTasksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: TaskWithVideo[];
  onOpenVideo: (videoId: string, timestamp?: number) => void;
}

type FilterType = 'all' | 'open' | 'completed' | 'due_today' | 'overdue';

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date();
  const due = new Date(dueDate);
  return (
    due.getDate() === today.getDate() &&
    due.getMonth() === today.getMonth() &&
    due.getFullYear() === today.getFullYear()
  );
}

export function CombinedTasksSheet({ open, onOpenChange, tasks, onOpenVideo }: CombinedTasksSheetProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [editTask, setEditTask] = useState<TaskWithVideo | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);
  const updateStatus = useUpdateTaskStatusGlobal();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const filteredTasks = tasks.filter(task => {
    switch (filter) {
      case 'open':
        return task.status !== 'completed';
      case 'completed':
        return task.status === 'completed';
      case 'due_today':
        return isDueToday(task.due_date) && task.status !== 'completed';
      case 'overdue':
        return isOverdue(task.due_date) && task.status !== 'completed';
      default:
        return true;
    }
  });

  const handleToggleComplete = (task: TaskWithVideo) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    updateStatus.mutate({ taskId: task.id, status: newStatus }, {
      onSuccess: (data) => {
        if (newStatus === 'completed' && data?.completedCount && data.completedCount % 10 === 0) {
          setMilestoneCount(data.completedCount);
        }
      },
    });
  };

  const handleOpenTask = (task: TaskWithVideo) => {
    onOpenChange(false);
    onOpenVideo(task.video_id, task.timestamp_seconds);
  };

  const handleSaveEdit = (id: string, data: { title: string; description: string | null; due_date: string | null; worksheet_sections?: unknown[] | null }) => {
    updateMutation.mutate({ id, ...data }, {
      onSuccess: () => setEditTask(null),
    });
  };

  const handleDelete = () => {
    if (deleteTaskId) {
      deleteMutation.mutate(deleteTaskId, {
        onSuccess: () => setDeleteTaskId(null),
      });
    }
  };

  const counts = {
    all: tasks.length,
    open: tasks.filter(t => t.status !== 'completed').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    due_today: tasks.filter(t => isDueToday(t.due_date) && t.status !== 'completed').length,
    overdue: tasks.filter(t => isOverdue(t.due_date) && t.status !== 'completed').length,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh]">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-todo" />
            Combined Tasks
          </SheetTitle>
          <SheetDescription>
            All tasks from your videos in one place
          </SheetDescription>
        </SheetHeader>

        {/* Filter Tabs */}
        <div className="flex gap-2 flex-wrap mb-4">
          {(['all', 'open', 'completed', 'due_today', 'overdue'] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === 'due_today' ? 'Due Today' : f}
              <Badge variant="secondary" className="ml-2 text-xs">
                {counts[f]}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Tasks List */}
        <ScrollArea className="h-[calc(85vh-180px)]">
          {filteredTasks.length > 0 ? (
            <div className="space-y-3 pr-4">
              {filteredTasks.map((task) => (
                <div
                  key={task.id}
                  className={cn(
                    "p-4 rounded-lg border bg-card",
                    task.status === 'completed' && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggleComplete(task)}
                      className="mt-0.5 shrink-0"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-ai" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                      )}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "font-medium",
                        task.status === 'completed' && "line-through"
                      )}>
                        {task.title}
                      </p>
                      
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="line-clamp-1">{task.video_title}</span>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        {task.due_date && (
                          <Badge 
                            variant={isOverdue(task.due_date) ? "destructive" : isDueToday(task.due_date) ? "default" : "outline"}
                            className="gap-1"
                          >
                            <Calendar className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString()}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="capitalize">
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditTask(task)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTaskId(task.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenTask(task)}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <CheckSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">No tasks found</p>
            </div>
          )}
        </ScrollArea>
      </SheetContent>

      {/* Edit Sheet */}
      <EditTaskSheet
        open={!!editTask}
        onOpenChange={(o) => !o && setEditTask(null)}
        task={editTask}
        onSave={handleSaveEdit}
        isSaving={updateMutation.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTaskId} onOpenChange={(o) => !o && setDeleteTaskId(null)}>
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

      {/* Milestone Encouragement */}
      <MilestoneDialog
        open={milestoneCount !== null}
        onOpenChange={(open) => !open && setMilestoneCount(null)}
        completedCount={milestoneCount || 0}
      />
    </Sheet>
  );
}
