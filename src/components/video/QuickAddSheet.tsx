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
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
          {/* Preview text */}
          <div className="bg-muted/50 p-3 rounded-lg border border-border">
            <p className="text-sm line-clamp-3 text-muted-foreground">
              "{segmentText.slice(0, 150)}{segmentText.length > 150 ? '...' : ''}"
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {formatTimestamp(segmentStart)} - {formatTimestamp(segmentEnd)}
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
