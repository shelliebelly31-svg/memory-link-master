import { useState, useEffect } from 'react';
import { Brain, Clock, Play, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useCreateManualReminder } from '@/hooks/useManualItems';

interface AddReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId?: string;
  videoTitle?: string;
  getCurrentTime?: () => number | null;
}

export function AddReminderDialog({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  getCurrentTime,
}: AddReminderDialogProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [timestampSeconds, setTimestampSeconds] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');

  const createReminder = useCreateManualReminder();

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTitle('');
      setNotes('');
      setTimestampSeconds(null);
      setScheduleDate('');
      setScheduleTime('09:00');
    }
  }, [open]);

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

  const handleSave = () => {
    if (!title.trim()) return;

    let sendAt: Date | undefined;
    if (scheduleDate && scheduleTime) {
      sendAt = new Date(`${scheduleDate}T${scheduleTime}`);
    }

    createReminder.mutate(
      {
        title: title.trim(),
        notes: notes.trim() || undefined,
        video_id: videoId,
        timestamp_seconds: timestampSeconds ?? undefined,
        schedule_at: sendAt,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-remember" />
            Add Reminder
          </DialogTitle>
          <DialogDescription>
            Create a custom reminder to remember later
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="What do you want to remember?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Video link (if from video page) */}
          {videoId && videoTitle && (
            <div className="space-y-2">
              <Label>Linked Video</Label>
              <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg">
                <Badge variant="secondary" className="shrink-0">Video</Badge>
                <span className="truncate text-muted-foreground">{videoTitle}</span>
              </div>
            </div>
          )}

          {/* Timestamp */}
          <div className="space-y-2">
            <Label htmlFor="timestamp">Timestamp (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="timestamp"
                type="number"
                placeholder="Seconds"
                value={timestampSeconds ?? ''}
                onChange={(e) => setTimestampSeconds(e.target.value ? Number(e.target.value) : null)}
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
                  Use Current Time
                </Button>
              )}
            </div>
            {timestampSeconds !== null && (
              <p className="text-xs text-muted-foreground">
                {formatTimestamp(timestampSeconds)}
              </p>
            )}
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Schedule (optional)</Label>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="schedule-date" className="text-xs text-muted-foreground">Date</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="schedule-time" className="text-xs text-muted-foreground">Time</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || createReminder.isPending}
          >
            {createReminder.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
