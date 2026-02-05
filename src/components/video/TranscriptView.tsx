import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain, CheckSquare, Highlighter, MousePointer, Plus } from 'lucide-react';
import { TranscriptSegment, Highlight, HighlightType } from '@/types';
import { formatTimestamp } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { QuickAddSheet } from './QuickAddSheet';

// Hook to detect active text selection within a container
function useSelectionActive(containerRef: React.RefObject<HTMLElement>) {
  const [isSelectionActive, setIsSelectionActive] = useState(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !containerRef.current) {
        setIsSelectionActive(false);
        return;
      }

      // Check if selection is within our transcript container
      try {
        const range = selection.getRangeAt(0);
        const isInContainer = containerRef.current.contains(range.commonAncestorContainer);
        setIsSelectionActive(isInContainer && selection.toString().trim().length > 0);
      } catch {
        setIsSelectionActive(false);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [containerRef]);

  // Apply/remove selection-active class on body for global CSS targeting
  useEffect(() => {
    if (isSelectionActive) {
      document.body.classList.add('transcript-selection-active');
    } else {
      document.body.classList.remove('transcript-selection-active');
    }
    return () => {
      document.body.classList.remove('transcript-selection-active');
    };
  }, [isSelectionActive]);

  return isSelectionActive;
}

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  highlights: Highlight[];
  videoId: string;
  aiSuggestionsGenerated: boolean;
  onAddHighlight: (type: HighlightType, text: string, startSeconds: number, endSeconds: number) => void;
  onHighlightsUpdated: () => void;
  onOpenReminderSheet: (text: string, timestamp: number, endTimestamp?: number) => void;
  onOpenTodoSheet: (text: string, timestamp: number, endTimestamp?: number) => void;
  getCurrentTime?: () => number | null;
}

interface SelectionState {
  text: string;
  startSeconds: number;
  endSeconds: number;
  // Frozen snapshot - captured immediately to prevent loss during scroll
  frozen: boolean;
}

interface QuickAddState {
  open: boolean;
  segmentText: string;
  segmentStart: number;
  segmentEnd: number;
}

export function TranscriptView({ 
  segments, 
  highlights, 
  videoId, 
  onAddHighlight, 
  onHighlightsUpdated,
  onOpenReminderSheet,
  onOpenTodoSheet,
  getCurrentTime,
}: TranscriptViewProps) {
  const [highlightMode, setHighlightMode] = useState(true);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddState>({
    open: false,
    segmentText: '',
    segmentStart: 0,
    segmentEnd: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const transcriptContentRef = useRef<HTMLDivElement>(null);
  
  // Track active selection for disabling pointer events on sticky elements
  const isSelectionActive = useSelectionActive(transcriptContentRef);

  // Get all highlights that overlap with a segment
  const getSegmentHighlights = (segment: TranscriptSegment): Highlight[] => {
    return highlights.filter(h => 
      h.start_seconds <= segment.end_seconds && h.end_seconds >= segment.start_seconds
    );
  };

  // Capture selection using absolute indices to prevent loss during scroll
  const captureSelectionSnapshot = useCallback((): SelectionState | null => {
    const windowSelection = window.getSelection();
    
    if (!windowSelection || windowSelection.isCollapsed) {
      return null;
    }

    const selectedText = windowSelection.toString().trim();
    if (!selectedText || selectedText.length === 0) {
      return null;
    }

    const range = windowSelection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      return null;
    }

    // Find the segment elements that contain the selection
    const segmentElements = container.querySelectorAll('[data-segment-id]');
    let startSeconds: number | null = null;
    let endSeconds: number | null = null;

    segmentElements.forEach((el) => {
      if (range.intersectsNode(el)) {
        const segmentStart = parseFloat(el.getAttribute('data-start') || '0');
        const segmentEnd = parseFloat(el.getAttribute('data-end') || '0');
        
        if (startSeconds === null || segmentStart < startSeconds) {
          startSeconds = segmentStart;
        }
        if (endSeconds === null || segmentEnd > endSeconds) {
          endSeconds = segmentEnd;
        }
      }
    });

    if (startSeconds !== null && endSeconds !== null) {
      return {
        text: selectedText,
        startSeconds,
        endSeconds,
        frozen: true,
      };
    }
    return null;
  }, []);

  // Process selection and update state (for UI preview only)
  const processSelection = useCallback(() => {
    // Don't overwrite a frozen selection
    if (selection?.frozen) return;

    const snapshot = captureSelectionSnapshot();
    if (snapshot) {
      setSelection({ ...snapshot, frozen: false });
    } else {
      setSelection(null);
    }
  }, [captureSelectionSnapshot, selection?.frozen]);

  // Listen for selectionchange events when highlight mode is on
  useEffect(() => {
    if (!highlightMode) {
      setSelection(null);
      return;
    }

    const handleSelectionChange = () => {
      // Small delay to let selection settle
      requestAnimationFrame(processSelection);
    };

    // Reset frozen state when selection is cleared by user
    const handleMouseUp = () => {
      setTimeout(() => {
        const windowSelection = window.getSelection();
        if (!windowSelection || windowSelection.isCollapsed) {
          setSelection(null);
        }
      }, 50);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchend', handleMouseUp);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [highlightMode, processSelection]);

  // Clear selection helper
  const clearSelection = () => {
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  // Handle reminder button tap - freeze selection FIRST to prevent scroll loss
  const handleReminderTap = () => {
    if (highlightMode) {
      // Capture fresh snapshot immediately to freeze current selection state
      const frozenSnapshot = captureSelectionSnapshot();
      const selectionToUse = frozenSnapshot || selection;
      
      if (selectionToUse) {
        // Use frozen snapshot data to prevent any loss during UI transition
        onOpenReminderSheet(selectionToUse.text, selectionToUse.startSeconds, selectionToUse.endSeconds);
        clearSelection();
        return;
      }
    }
    // No selection: open empty sheet (manual entry)
    const timestamp = getCurrentTime?.() ?? 0;
    onOpenReminderSheet('', timestamp);
  };

  // Handle todo button tap - freeze selection FIRST to prevent scroll loss
  const handleTodoTap = () => {
    if (highlightMode) {
      // Capture fresh snapshot immediately to freeze current selection state
      const frozenSnapshot = captureSelectionSnapshot();
      const selectionToUse = frozenSnapshot || selection;
      
      if (selectionToUse) {
        // Use frozen snapshot data to prevent any loss during UI transition
        onOpenTodoSheet(selectionToUse.text, selectionToUse.startSeconds, selectionToUse.endSeconds);
        clearSelection();
        return;
      }
    }
    // No selection: open empty sheet (manual entry)
    const timestamp = getCurrentTime?.() ?? 0;
    onOpenTodoSheet('', timestamp);
  };

  // Handle plus button click on segment
  const handlePlusClick = (segment: TranscriptSegment, e: React.MouseEvent) => {
    e.stopPropagation();
    setQuickAdd({
      open: true,
      segmentText: segment.text,
      segmentStart: segment.start_seconds,
      segmentEnd: segment.end_seconds,
    });
  };

  // Handle quick add selections
  const handleQuickAddReminder = () => {
    onOpenReminderSheet(quickAdd.segmentText, quickAdd.segmentStart, quickAdd.segmentEnd);
  };

  const handleQuickAddTodo = () => {
    onOpenTodoSheet(quickAdd.segmentText, quickAdd.segmentStart, quickAdd.segmentEnd);
  };

  // Render text with existing highlights marked
  const renderHighlightedText = (segment: TranscriptSegment) => {
    const segmentHighlights = getSegmentHighlights(segment);
    
    if (segmentHighlights.length === 0) {
      return <span>{segment.text}</span>;
    }

    // Show visual indicators for highlighted segments
    const highlightTypes = [...new Set(segmentHighlights.map(h => h.type))];
    
    return (
      <span className="relative">
        {segment.text}
        {highlightTypes.length > 0 && (
          <span className="ml-2 inline-flex gap-1">
            {highlightTypes.includes('remember') && (
              <span className="inline-block w-2 h-2 rounded-full bg-remember" title="Remember highlight" />
            )}
            {highlightTypes.includes('todo') && (
              <span className="inline-block w-2 h-2 rounded-full bg-todo" title="To Do highlight" />
            )}
          </span>
        )}
      </span>
    );
  };

  const hasSelection = selection && highlightMode;

  return (
    <div className="relative" ref={containerRef}>
      {/* Sticky Header: Toggle + Quick Add Buttons - unselectable */}
      <div 
        className={cn(
          "sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4 -mx-4 px-4 pt-1",
          "select-none"
        )}
        style={{ 
          WebkitUserSelect: 'none', 
          userSelect: 'none',
          // When selection active, disable pointer events to prevent handle interference
          pointerEvents: isSelectionActive ? 'none' : 'auto',
        }}
        data-no-select
      >
        {/* Highlight Mode Toggle Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {highlightMode ? (
              <Highlighter className="h-4 w-4 text-primary" />
            ) : (
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {highlightMode ? 'Highlight mode' : 'Reading mode'}
            </span>
          </div>
          <Switch
            checked={highlightMode}
            onCheckedChange={setHighlightMode}
            aria-label="Toggle highlight mode"
            style={{ pointerEvents: 'auto' }} // Keep switch interactive
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {highlightMode 
            ? 'Select text or tap + to save' 
            : 'Normal scroll and copy behavior.'}
        </p>

        {/* Quick Add Buttons - Always visible, changes behavior based on selection */}
        <div className="flex gap-2 mt-3" style={{ pointerEvents: 'auto' }}>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "rounded-full gap-1.5 flex-1",
              hasSelection 
                ? "text-primary-foreground bg-remember border-remember hover:bg-remember/90" 
                : "text-remember border-remember/30 hover:bg-remember/10"
            )}
            onClick={handleReminderTap}
          >
            <Brain className="h-4 w-4" />
            {hasSelection ? 'Save as Reminder' : 'Add Reminder'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "rounded-full gap-1.5 flex-1",
              hasSelection 
                ? "text-primary-foreground bg-todo border-todo hover:bg-todo/90" 
                : "text-todo border-todo/30 hover:bg-todo/10"
            )}
            onClick={handleTodoTap}
          >
            <CheckSquare className="h-4 w-4" />
            {hasSelection ? 'Save as To Do' : 'Add To Do'}
          </Button>
        </div>

        {/* Selection preview when text is selected */}
        {hasSelection && (
          <div className="mt-2 p-2 bg-muted/50 rounded-lg border border-border">
            <p className="text-xs text-muted-foreground line-clamp-2">
              "{selection.text.slice(0, 120)}{selection.text.length > 120 ? '...' : ''}"
            </p>
          </div>
        )}
      </div>

      {/* Transcript Segments - Isolated selectable area with safe padding */}
      <div 
        ref={transcriptContentRef}
        className={cn(
          highlightMode && "select-text cursor-text",
          "pt-4 pb-32" // Safe padding zones to prevent handle overlap with sticky elements
        )}
        style={{
          WebkitUserSelect: highlightMode ? 'text' : 'auto',
          userSelect: highlightMode ? 'text' : 'auto',
          overscrollBehavior: 'contain', // Prevent scroll chaining during selection
        }}
      >
        {segments.map((segment, index) => {
          const segmentHighlights = getSegmentHighlights(segment);
          const hasHighlights = segmentHighlights.length > 0;
          
          // Check if there's a gap (paragraph break) - more than 2 seconds between segments
          const prevSegment = index > 0 ? segments[index - 1] : null;
          const hasGap = prevSegment && (segment.start_seconds - prevSegment.end_seconds) > 2;
          
          return (
            <div
              key={segment.id}
              data-segment-id={segment.id}
              data-start={segment.start_seconds}
              data-end={segment.end_seconds}
              className={cn(
                "group flex gap-2 py-1 px-2 transition-colors relative",
                highlightMode && "hover:bg-muted/30 cursor-text",
                hasHighlights && "bg-muted/20",
                hasGap && "mt-3 pt-2 border-t border-border/30"
              )}
            >
              {/* Plus button for quick add - unselectable */}
              <button
                onClick={(e) => handlePlusClick(segment, e)}
                className={cn(
                  "shrink-0 w-5 h-5 rounded-full flex items-center justify-center select-none",
                  "border border-border/50 bg-background text-muted-foreground",
                  "hover:border-primary hover:text-primary hover:bg-primary/10",
                  "transition-colors opacity-0 group-hover:opacity-100",
                  "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary/30"
                )}
                style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                aria-label="Quick add this segment"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span 
                className="text-[11px] font-mono text-muted-foreground w-10 shrink-0 select-none tabular-nums"
                style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
              >
                {formatTimestamp(segment.start_seconds)}
              </span>
              <span className="text-sm leading-snug flex-1">
                {renderHighlightedText(segment)}
              </span>
            </div>
          );
        })}
      </div>

      {segments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No transcript segments available.</p>
        </div>
      )}

      {/* Quick Add Sheet */}
      <QuickAddSheet
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd(prev => ({ ...prev, open }))}
        segmentText={quickAdd.segmentText}
        segmentStart={quickAdd.segmentStart}
        segmentEnd={quickAdd.segmentEnd}
        onSelectReminder={handleQuickAddReminder}
        onSelectTodo={handleQuickAddTodo}
      />
    </div>
  );
}
