import { Play, MessageSquare, Calendar, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RememberItemWithVideo } from '@/hooks/useHomeData';

interface ReminderCardProps {
  reminder: RememberItemWithVideo;
  index: number;
  onOpenVideo: () => void;
  onTextMe: () => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ReminderCard({ reminder, index, onOpenVideo, onTextMe }: ReminderCardProps) {
  return (
    <Card 
      className="card-elevated animate-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Summary */}
        <p className="font-medium leading-relaxed">{reminder.summary}</p>
        
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
          <span className="line-clamp-1 flex-1">{reminder.video_title}</span>
          {reminder.timestamp_seconds > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {formatTimestamp(reminder.timestamp_seconds)}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenVideo}
            className="flex-1"
          >
            <Play className="h-3 w-3" />
            Open Video
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onTextMe}
            className="flex-1"
          >
            <MessageSquare className="h-3 w-3" />
            Text Me
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
