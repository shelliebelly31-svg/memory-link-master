import { useState } from 'react';
import { Brain, Clock, ExternalLink, Calendar, Pencil, Trash2 } from 'lucide-react';
import { RememberItem, Highlight } from '@/types';
import { formatTimestamp } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { EditRememberItemSheet } from './EditRememberItemSheet';
import { useUpdateRememberItem, useDeleteRememberItem } from '@/hooks/useItemMutations';

interface RememberTabProps {
  rememberItems: RememberItem[];
  aiSuggestedHighlights: Highlight[];
  onConvertToRemember: (highlightId: string) => void;
  onSetSchedule: (itemId: string, schedule: 'daily' | 'weekly' | 'monthly' | null) => void;
  onJumpToTimestamp: (seconds: number) => void;
  videoTitle?: string;
}

export function RememberTab({
  rememberItems,
  aiSuggestedHighlights,
  onConvertToRemember,
  onSetSchedule,
  onJumpToTimestamp,
  videoTitle,
}: RememberTabProps) {
  const [editItem, setEditItem] = useState<RememberItem | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const updateMutation = useUpdateRememberItem();
  const deleteMutation = useDeleteRememberItem();

  const handleSaveEdit = (id: string, data: { summary: string; key_points: string[] }) => {
    updateMutation.mutate({ id, ...data }, {
      onSuccess: () => setEditItem(null),
    });
  };

  const handleDelete = () => {
    if (deleteItemId) {
      deleteMutation.mutate(deleteItemId, {
        onSuccess: () => setDeleteItemId(null),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Remember Items */}
      {rememberItems.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-remember" />
            Your Memory Items
          </h3>
          {rememberItems.map((item) => (
            <div key={item.id} className="card-elevated p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <h4 className="font-medium">{item.summary}</h4>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditItem(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteItemId(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onJumpToTimestamp(item.timestamp_seconds)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground font-medium">Key Points:</p>
                <ul className="space-y-1">
                  {item.key_points.map((point, i) => (
                    <li key={i} className="text-sm flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-remember mt-1.5 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTimestamp(item.timestamp_seconds)}
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={item.review_schedule || 'none'}
                    onValueChange={(value) => 
                      onSetSchedule(item.id, value === 'none' ? null : value as any)
                    }
                  >
                    <SelectTrigger className="w-28 h-8 text-xs">
                      <SelectValue placeholder="Schedule" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No schedule</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* AI Suggested to Convert */}
      {aiSuggestedHighlights.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <span className="text-ai">✨</span>
            AI Suggestions
          </h3>
          {aiSuggestedHighlights.map((highlight) => (
            <div key={highlight.id} className="card-elevated p-4 border-l-4 border-ai">
              <p className="text-sm mb-3">{highlight.selected_text}</p>
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-ai border-ai/30">
                  {formatTimestamp(highlight.start_seconds)}
                </Badge>
                <Button
                  variant="remember"
                  size="sm"
                  onClick={() => onConvertToRemember(highlight.id)}
                >
                  <Brain className="h-4 w-4" />
                  Convert to Remember
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {rememberItems.length === 0 && aiSuggestedHighlights.length === 0 && (
        <div className="text-center py-12">
          <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">No items to remember yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Highlight text in the transcript and tap "Remember"
          </p>
        </div>
      )}

      {/* Edit Sheet */}
      <EditRememberItemSheet
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        item={editItem}
        onSave={handleSaveEdit}
        isSaving={updateMutation.isPending}
        videoTitle={videoTitle}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItemId} onOpenChange={(open) => !open && setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete memory item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this memory item and any related quiz questions. This action cannot be undone.
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
