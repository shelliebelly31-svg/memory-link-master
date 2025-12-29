import { useState, useEffect } from 'react';
import { Brain, Loader2, X } from 'lucide-react';
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

interface EditRememberItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    summary: string;
    key_points: string[];
    timestamp_seconds: number;
  } | null;
  onSave: (id: string, data: { summary: string; key_points: string[] }) => void;
  isSaving?: boolean;
}

export function EditRememberItemSheet({
  open,
  onOpenChange,
  item,
  onSave,
  isSaving,
}: EditRememberItemSheetProps) {
  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [newKeyPoint, setNewKeyPoint] = useState('');

  useEffect(() => {
    if (item && open) {
      setSummary(item.summary);
      setKeyPoints(item.key_points || []);
      setNewKeyPoint('');
    }
  }, [item, open]);

  const handleAddKeyPoint = () => {
    if (newKeyPoint.trim()) {
      setKeyPoints([...keyPoints, newKeyPoint.trim()]);
      setNewKeyPoint('');
    }
  };

  const handleRemoveKeyPoint = (index: number) => {
    setKeyPoints(keyPoints.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!item || !summary.trim()) return;
    onSave(item.id, { summary: summary.trim(), key_points: keyPoints });
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="border-b border-border shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-remember" />
            Edit Memory Item
          </DrawerTitle>
          <DrawerDescription>
            {item ? `Timestamp: ${formatTimestamp(item.timestamp_seconds)}` : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto max-h-[calc(85vh-160px)] p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-summary">Summary</Label>
            <Textarea
              id="edit-summary"
              placeholder="Summary of what to remember"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Key Points</Label>
            {keyPoints.length > 0 && (
              <ul className="space-y-1">
                {keyPoints.map((point, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm bg-muted/50 p-2 rounded-lg"
                  >
                    <span className="flex-1">• {point}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemoveKeyPoint(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Add key point..."
                value={newKeyPoint}
                onChange={(e) => setNewKeyPoint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddKeyPoint();
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddKeyPoint}
                disabled={!newKeyPoint.trim()}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <DrawerFooter className="border-t border-border shrink-0 flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!summary.trim() || isSaving} className="flex-1">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
