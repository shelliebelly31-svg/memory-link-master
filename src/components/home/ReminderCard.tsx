import { Play, Trash2, Pencil, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CombinedReminder } from '@/hooks/useHomeData';
import { useToast } from '@/hooks/use-toast';

interface ReminderCardProps {
  reminder: CombinedReminder;
  index: number;
  onOpenVideo: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function ReminderCard({ reminder, index, onOpenVideo, onDelete, onEdit }: ReminderCardProps) {
  const { toast } = useToast();

  const getShareText = () => {
    let text = reminder.summary;
    if (reminder.key_points.length > 0) {
      text += '\n\n' + reminder.key_points.map(p => `• ${p}`).join('\n');
    }
    text += `\n\n— ${reminder.video_title}`;
    if (reminder.timestamp_seconds > 0) {
      text += ` (${formatTimestamp(reminder.timestamp_seconds)})`;
    }
    return text;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareText());
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const text = getShareText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  return (
    <Card 
      className="card-elevated animate-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header with edit and delete */}
        <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleShare(); }}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
        </div>
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
