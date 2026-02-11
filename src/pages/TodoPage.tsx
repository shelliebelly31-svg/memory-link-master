import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CheckSquare, Circle, CheckCircle2, Calendar, ExternalLink, 
  Pencil, Trash2, MessageSquare, Search, Loader2, Plus 
} from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { TaskWithVideo, useAllTasks, useUpdateTaskStatusGlobal } from '@/hooks/useHomeData';
import { useUpdateTask, useDeleteTask, useUpdateTaskChecklist, ChecklistItem } from '@/hooks/useItemMutations';
import { EditTaskSheet } from '@/components/video/EditTaskSheet';
import { TextMeTaskDialog } from '@/components/todo/TextMeTaskDialog';
import { AddTodoDialog } from '@/components/manual/AddTodoDialog';
import { MilestoneDialog } from '@/components/todo/MilestoneDialog';
import { cn } from '@/lib/utils';

interface TodoPageProps {
  onLogout: () => void;
}

type FilterType = 'all' | 'open' | 'done';

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999);
  return due < new Date();
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function TodoPage({ onLogout }: TodoPageProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editTask, setEditTask] = useState<TaskWithVideo | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [textMeTask, setTextMeTask] = useState<TaskWithVideo | null>(null);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);
  const { data: allTasks = [], isLoading } = useAllTasks();
  const updateStatus = useUpdateTaskStatusGlobal();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const checklistMutation = useUpdateTaskChecklist();

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // Apply status filter - "all" and "open" hide completed tasks
    switch (filter) {
      case 'all':
      case 'open':
        tasks = tasks.filter(t => t.status !== 'completed');
        break;
      case 'done':
        tasks = tasks.filter(t => t.status === 'completed');
        break;
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.video_title.toLowerCase().includes(query)
      );
    }

    return tasks;
  }, [allTasks, filter, searchQuery]);

  const counts = {
    all: allTasks.filter(t => t.status !== 'completed').length,
    open: allTasks.filter(t => t.status !== 'completed').length,
    done: allTasks.filter(t => t.status === 'completed').length,
  };

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

  const handleOpenVideo = (task: TaskWithVideo) => {
    navigate(`/video/${task.video_id}?t=${task.timestamp_seconds}`);
  };

  const handleSaveEdit = (id: string, data: { title: string; description: string | null; due_date: string | null; checklist_items: ChecklistItem[]; worksheet_sections?: unknown[] | null }) => {
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
    <PageLayout onLogout={onLogout}>
      <div className="px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CheckSquare className="h-6 w-6 text-todo" />
              To Do
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              All your tasks in one place
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAddTodoOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2">
          {(['all', 'open', 'done'] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
              <Badge variant="secondary" className="ml-2 text-xs">
                {counts[f]}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Tasks List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length > 0 ? (
          <div className="space-y-3 pb-24">
            {filteredTasks.map((task) => (
              <Card
                key={task.id}
                className={cn(
                  "transition-opacity",
                  task.status === 'completed' && "opacity-60"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Toggle Complete */}
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
                      {/* Title */}
                      <p className={cn(
                        "font-medium",
                        task.status === 'completed' && "line-through"
                      )}>
                        {task.title}
                      </p>

                      {/* Description */}
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      
                      {/* Video Source */}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="line-clamp-1">{task.video_title}</span>
                        {task.timestamp_seconds > 0 && (
                          <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                            {formatTimestamp(task.timestamp_seconds)}
                          </Badge>
                        )}
                      </div>

                      {/* Status Badges */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {task.due_date && (
                          <Badge 
                            variant={isOverdue(task.due_date) && task.status !== 'completed' ? "destructive" : "outline"}
                            className="gap-1"
                          >
                            <Calendar className="h-3 w-3" />
                            {new Date(task.due_date).toLocaleDateString()}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="capitalize">
                          {task.status === 'completed' ? 'Done' : 'Open'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border">
                    {task.status === 'completed' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTaskId(task.id)}
                        className="gap-1.5 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTask(task)}
                          className="gap-1.5"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTaskId(task.id)}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenVideo(task)}
                          className="gap-1.5"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Video
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setTextMeTask(task)}
                          className="gap-1.5 ml-auto"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Text Me
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No tasks match your search' : 'No tasks yet'}
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                {searchQuery ? 'Try a different search term' : 'Add tasks from videos or create new ones'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Sheet */}
      <EditTaskSheet
        open={!!editTask}
        onOpenChange={(o) => !o && setEditTask(null)}
        task={editTask}
        onSave={handleSaveEdit}
        onChecklistToggle={handleChecklistToggle}
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
            <AlertDialogAction 
              onClick={handleDelete} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Text Me Dialog */}
      <TextMeTaskDialog
        open={!!textMeTask}
        onOpenChange={(o) => !o && setTextMeTask(null)}
        task={textMeTask}
      />

      {/* Add Todo Dialog */}
      <AddTodoDialog
        open={addTodoOpen}
        onOpenChange={setAddTodoOpen}
      />

      {/* Milestone Encouragement */}
      <MilestoneDialog
        open={milestoneCount !== null}
        onOpenChange={(open) => !open && setMilestoneCount(null)}
        completedCount={milestoneCount || 0}
      />
    </PageLayout>
  );
}
