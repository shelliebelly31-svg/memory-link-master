import { useState, useEffect } from 'react';
import { Brain, Play, Loader2, X, Plus, Sparkles } from 'lucide-react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Checkbox } from '@/components/ui/checkbox';
import { useCreateManualReminder, type RepeatType } from '@/hooks/useManualItems';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddReminderSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoId?: string;
  videoTitle?: string;
  getCurrentTime?: () => number | null;
  prefillTitle?: string;
  prefillTimestamp?: number;
  prefillEndTimestamp?: number;
}

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export function AddReminderSheet({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  getCurrentTime,
  prefillTitle,
  prefillTimestamp,
  prefillEndTimestamp,
}: AddReminderSheetProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [timestampSeconds, setTimestampSeconds] = useState<number | null>(null);
  const [endTimestampSeconds, setEndTimestampSeconds] = useState<number | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [repeatType, setRepeatType] = useState<RepeatType>('one_time');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [multipleDates, setMultipleDates] = useState<{ date: string; time: string }[]>([]);
  const [isGeneratingKeyPoints, setIsGeneratingKeyPoints] = useState(false);

  const createReminder = useCreateManualReminder();

  // Reset form when dialog opens / handle prefill
  useEffect(() => {
    if (open) {
      setTitle(prefillTitle || '');
      setNotes('');
      setTimestampSeconds(prefillTimestamp ?? null);
      setEndTimestampSeconds(prefillEndTimestamp ?? null);
      setScheduleDate('');
      setScheduleTime('09:00');
      setRepeatType('one_time');
      setSelectedDays([]);
      setMultipleDates([]);
    }
  }, [open, prefillTitle, prefillTimestamp, prefillEndTimestamp]);

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

  const formatTimestampRange = (): string => {
    if (timestampSeconds === null) return '';
    if (endTimestampSeconds !== null && endTimestampSeconds !== timestampSeconds) {
      return `${formatTimestamp(timestampSeconds)} - ${formatTimestamp(endTimestampSeconds)}`;
    }
    return formatTimestamp(timestampSeconds);
  };

  const handleDayToggle = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleAddDate = () => {
    setMultipleDates((prev) => [
      ...prev,
      { date: new Date().toISOString().split('T')[0], time: '09:00' },
    ]);
  };

  const handleRemoveDate = (index: number) => {
    setMultipleDates((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDateChange = (index: number, field: 'date' | 'time', value: string) => {
    setMultipleDates((prev) =>
      prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
    );
  };

  const handleGenerateKeyPoints = async () => {
    if (!title.trim()) {
      toast.error('Please enter a title first');
      return;
    }

    setIsGeneratingKeyPoints(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-key-points', {
        body: {
          title: title.trim(),
          notes: notes.trim() || undefined,
          video_id: videoId,
        },
      });

      if (error) throw error;

      const keyPoints = data.key_points || [];
      if (keyPoints.length > 0) {
        const bulletPoints = keyPoints.map((p: string) => `• ${p}`).join('\n');
        
        if (notes.trim()) {
          // Append below existing notes with divider
          setNotes(notes.trim() + '\n\n---\nKey points:\n' + bulletPoints);
        } else {
          setNotes('Key points:\n' + bulletPoints);
        }
        toast.success(`Generated ${keyPoints.length} key points`);
      }
    } catch (error) {
      console.error('Error generating key points:', error);
      toast.error('Failed to generate key points');
    } finally {
      setIsGeneratingKeyPoints(false);
    }
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
        repeat_type: repeatType,
        repeat_days: repeatType === 'custom_days' ? selectedDays : undefined,
        repeat_dates:
          repeatType === 'multiple_dates'
            ? multipleDates.map((d) => new Date(`${d.date}T${d.time}`))
            : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const canSave = title.trim().length > 0;
  const timestampDisplay = formatTimestampRange();

  // Determine if we have long prefilled text that needs review
  const hasLongPrefill = (prefillTitle?.length || 0) > 80;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        {/* Fixed Header */}
        <DrawerHeader className="border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-remember" />
              {hasLongPrefill ? 'Review & Save Reminder' : 'Add Reminder'}
            </DrawerTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateKeyPoints}
              disabled={isGeneratingKeyPoints || !title.trim()}
              className="gap-1.5"
            >
              {isGeneratingKeyPoints ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate key points
            </Button>
          </div>
          <DrawerDescription>
            {hasLongPrefill 
              ? 'Review and edit your highlighted text before saving' 
              : 'Create a custom reminder to remember later'}
          </DrawerDescription>
        </DrawerHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Selected Text - Multi-line expandable textarea for long text */}
            <div className="space-y-2">
              <Label htmlFor="reminder-title">Selected Text</Label>
              <Textarea
                id="reminder-title"
                placeholder="This is the text you selected. You can edit it before saving."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                className="min-h-[80px] max-h-[40vh] resize-y"
                style={{
                  // Auto-expand based on content, with reasonable limits
                  height: hasLongPrefill ? 'auto' : undefined,
                  minHeight: hasLongPrefill ? '120px' : '80px',
                }}
                rows={hasLongPrefill ? Math.min(Math.ceil(title.length / 50), 10) : 3}
              />
              {title.length > 200 && (
                <p className="text-xs text-muted-foreground">
                  {title.length} characters
                </p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="reminder-notes">Notes (optional)</Label>
              <Textarea
                id="reminder-notes"
                placeholder="Add any additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="min-h-[60px] resize-y"
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

            {/* Timestamp Range Display */}
            {timestampDisplay && (
              <div className="space-y-2">
                <Label>Timestamp</Label>
                <div className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg">
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {timestampDisplay}
                  </Badge>
                </div>
              </div>
            )}

            {/* Timestamp Input (only show if no prefill) */}
            {!prefillTimestamp && (
              <div className="space-y-2">
                <Label htmlFor="reminder-timestamp">Timestamp (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="reminder-timestamp"
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
              </div>
            )}

            {/* Schedule */}
            <div className="space-y-2">
              <Label>Schedule (optional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="schedule-date" className="text-xs text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    id="schedule-date"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="schedule-time" className="text-xs text-muted-foreground">
                    Time
                  </Label>
                  <Input
                    id="schedule-time"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Repeat Type */}
            <div className="space-y-3">
              <Label>Repeat</Label>
              <ToggleGroup
                type="single"
                value={repeatType}
                onValueChange={(value) => value && setRepeatType(value as RepeatType)}
                className="flex flex-wrap gap-1"
              >
                <ToggleGroupItem value="one_time" size="sm" className="text-xs">
                  One time
                </ToggleGroupItem>
                <ToggleGroupItem value="daily" size="sm" className="text-xs">
                  Daily
                </ToggleGroupItem>
                <ToggleGroupItem value="weekly" size="sm" className="text-xs">
                  Weekly
                </ToggleGroupItem>
                <ToggleGroupItem value="biweekly" size="sm" className="text-xs">
                  Bi-weekly
                </ToggleGroupItem>
                <ToggleGroupItem value="monthly" size="sm" className="text-xs">
                  Monthly
                </ToggleGroupItem>
                <ToggleGroupItem value="custom_days" size="sm" className="text-xs">
                  Custom days
                </ToggleGroupItem>
                <ToggleGroupItem value="multiple_dates" size="sm" className="text-xs">
                  Multiple dates
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Custom Days */}
              {repeatType === 'custom_days' && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <Label className="text-xs text-muted-foreground">Select days</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => (
                      <div key={day.value} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`day-${day.value}`}
                          checked={selectedDays.includes(day.value)}
                          onCheckedChange={() => handleDayToggle(day.value)}
                        />
                        <Label htmlFor={`day-${day.value}`} className="text-sm cursor-pointer">
                          {day.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Multiple Dates */}
              {repeatType === 'multiple_dates' && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Specific dates</Label>
                    <Button type="button" variant="ghost" size="sm" onClick={handleAddDate}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add date
                    </Button>
                  </div>
                  {multipleDates.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No dates added yet
                    </p>
                  )}
                  {multipleDates.map((d, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Input
                        type="date"
                        value={d.date}
                        onChange={(e) => handleDateChange(index, 'date', e.target.value)}
                        className="flex-1"
                        min={new Date().toISOString().split('T')[0]}
                      />
                      <Input
                        type="time"
                        value={d.time}
                        onChange={(e) => handleDateChange(index, 'time', e.target.value)}
                        className="w-24"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveDate(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
        </div>

        {/* Fixed Footer */}
        <DrawerFooter className="border-t border-border shrink-0 flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || createReminder.isPending} className="flex-1">
            {createReminder.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
