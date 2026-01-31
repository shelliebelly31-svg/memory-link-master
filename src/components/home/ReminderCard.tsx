import { Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CombinedReminder } from '@/hooks/useHomeData';

interface ReminderCardProps {
  reminder: CombinedReminder;
  index: number;
  onOpenVideo: () => void;
  onDelete: () => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ReminderCard({ reminder, index, onOpenVideo, onDelete }: ReminderCardProps) {
  return (
    <Card 
      className="card-elevated animate-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header with delete */}
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium leading-relaxed flex-1">{reminder.summary}</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Key points */}
        {reminder.key_points.length > 0 && (
          <ul className="text-sm text-muted-foreground space-y-1">
            {reminder.key_points.slice(0, 3).map((point, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span>
                {point}
              </li>
            ))}
          </ul>
        )}

        {/* Video info */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {reminder.is_manual && (
            <Badge variant="outline" className="shrink-0 text-xs">Manual</Badge>
          )}
          <span className="line-clamp-1 flex-1">{reminder.video_title}</span>
          {reminder.timestamp_seconds > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {formatTimestamp(reminder.timestamp_seconds)}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenVideo}
            className="w-full"
          >
            <Play className="h-3 w-3" />
            Open Video
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
