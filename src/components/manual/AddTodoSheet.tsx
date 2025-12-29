import { useState, useEffect } from 'react';
import { CheckSquare, Play, Plus, X, Loader2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCreateManualTask } from '@/hooks/useManualItems';

interface AddTodoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId?: string;
  videoTitle?: string;
  getCurrentTime?: () => number | null;
  prefillTitle?: string;
  prefillTimestamp?: number;
}

export function AddTodoSheet({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  getCurrentTime,
  prefillTitle,
  prefillTimestamp,
}: AddTodoSheetProps) {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [timestampSeconds, setTimestampSeconds] = useState<number | null>(null);
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');

  const createTask = useCreateManualTask();

  // Reset form when dialog opens / handle prefill
  useEffect(() => {
    if (open) {
      setTitle(prefillTitle || '');
      setDetails('');
      setDueDate('');
      setTimestampSeconds(prefillTimestamp ?? null);
      setChecklistItems([]);
      setNewChecklistItem('');
    }
  }, [open, prefillTitle, prefillTimestamp]);

  const handleUseCurrentTime = () => {
    if (getCurrentTime) {
      const time = getCurrentTime();
      if (time !== null) {
        setTimestampSeconds(Math.floor(time));
      }
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAddChecklistItem = () => {
    if (newChecklistItem.trim()) {
      setChecklistItems([...checklistItems, newChecklistItem.trim()]);
      setNewChecklistItem('');
    }
  };

  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!title.trim()) return;

    // Build description including checklist items
    let description = details.trim();
    if (checklistItems.length > 0) {
      const checklistText = checklistItems.map((item) => `• ${item}`).join('\n');
      description = description
        ? `${description}\n\nChecklist:\n${checklistText}`
        : `Checklist:\n${checklistText}`;
    }

    createTask.mutate(
      {
        title: title.trim(),
        description: description || undefined,
        video_id: videoId,
        timestamp_seconds: timestampSeconds ?? undefined,
        due_date: dueDate || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const canSave = title.trim().length > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        {/* Fixed Header */}
        <DrawerHeader className="border-b border-border shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-todo" />
            Add To Do
          </DrawerTitle>
          <DrawerDescription>Create a custom task to complete later</DrawerDescription>
        </DrawerHeader>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="task-title">Task</Label>
              <Input
                id="task-title"
                placeholder="What needs to be done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Details */}
            <div className="space-y-2">
              <Label htmlFor="task-details">Details (optional)</Label>
              <Textarea
                id="task-details"
                placeholder="Add any additional details..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={2}
              />
            </div>

            {/* Video link (if from video page) */}
            {videoId && videoTitle && (
              <div className="space-y-2">
                <Label>Linked Video</Label>
                <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg">
                  <Badge variant="secondary" className="shrink-0">
                    Video
                  </Badge>
                  <span className="truncate text-muted-foreground">{videoTitle}</span>
                </div>
              </div>
            )}

            {/* Due Date */}
            <div className="space-y-2">
              <Label htmlFor="task-due-date">Due Date (optional)</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Timestamp */}
            <div className="space-y-2">
              <Label htmlFor="task-timestamp">Timestamp (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="task-timestamp"
                  type="number"
                  placeholder="Seconds"
                  value={timestampSeconds ?? ''}
                  onChange={(e) =>
                    setTimestampSeconds(e.target.value ? Number(e.target.value) : null)
                  }
                  className="flex-1"
                />
                {getCurrentTime && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleUseCurrentTime}
                    className="shrink-0"
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Current Time
                  </Button>
                )}
              </div>
              {timestampSeconds !== null && (
                <p className="text-xs text-muted-foreground">{formatTimestamp(timestampSeconds)}</p>
              )}
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <Label>Checklist (optional)</Label>
              {checklistItems.length > 0 && (
                <ul className="space-y-1">
                  {checklistItems.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg"
                    >
                      <span className="flex-1">• {item}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveChecklistItem(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Add checklist item..."
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddChecklistItem}
                  disabled={!newChecklistItem.trim()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Fixed Footer */}
        <DrawerFooter className="border-t border-border shrink-0 flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || createTask.isPending} className="flex-1">
            {createTask.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}