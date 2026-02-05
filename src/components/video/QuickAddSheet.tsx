import { Brain, CheckSquare, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

interface QuickAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentText: string;
  segmentStart: number;
  segmentEnd: number;
  onSelectReminder: () => void;
  onSelectTodo: () => void;
}

export function QuickAddSheet({
  open,
  onOpenChange,
  segmentText,
  segmentStart,
  segmentEnd,
  onSelectReminder,
  onSelectTodo,
}: QuickAddSheetProps) {
  // Extract first and last words from the selected text
  const getTextMarkers = (text: string): { first: string; last: string } => {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return { first: '', last: '' };
    if (words.length === 1) return { first: words[0], last: words[0] };
    
    // Get first few words and last few words
    const firstWords = words.slice(0, 3).join(' ');
    const lastWords = words.slice(-2).join(' ');
    return { first: firstWords, last: lastWords };
  };

  const markers = getTextMarkers(segmentText);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <DrawerHeader className="border-b border-border">
          <DrawerTitle className="text-base">Save to...</DrawerTitle>
          <DrawerDescription className="sr-only">
            Choose where to save this segment
          </DrawerDescription>
        </DrawerHeader>

        <div className="p-4 space-y-4">
          {/* Preview with colored text markers */}
          <div className="bg-muted/50 p-3 rounded-lg border border-border">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="font-medium">
                <span className="text-remember">{markers.first}</span>
                <span className="text-muted-foreground/50"> ... </span>
                <span className="text-todo">{markers.last}</span>
              </span>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-2 line-clamp-2">
              "{segmentText.slice(0, 100)}{segmentText.length > 100 ? '...' : ''}"
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 border-remember/30 text-remember hover:bg-remember/10"
              onClick={() => {
                onSelectReminder();
                onOpenChange(false);
              }}
            >
              <Brain className="h-5 w-5" />
              <span className="font-medium">Save as Reminder</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 border-todo/30 text-todo hover:bg-todo/10"
              onClick={() => {
                onSelectTodo();
                onOpenChange(false);
              }}
            >
              <CheckSquare className="h-5 w-5" />
              <span className="font-medium">Save as To Do</span>
            </Button>
            <Button
              variant="ghost"
              className="w-full h-10 text-muted-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
