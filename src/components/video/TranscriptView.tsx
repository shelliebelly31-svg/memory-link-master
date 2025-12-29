import { useState, useRef, useCallback, useEffect } from 'react';
import { Brain, CheckSquare, Highlighter, MousePointer } from 'lucide-react';
import { TranscriptSegment, Highlight, HighlightType } from '@/types';
import { formatTimestamp } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AISuggestionsPanel } from './AISuggestionsPanel';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  highlights: Highlight[];
  videoId: string;
  aiSuggestionsGenerated: boolean;
  onAddHighlight: (type: HighlightType, text: string, startSeconds: number, endSeconds: number) => void;
  onHighlightsUpdated: () => void;
}

interface SelectionState {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export function TranscriptView({ segments, highlights, videoId, aiSuggestionsGenerated, onAddHighlight, onHighlightsUpdated }: TranscriptViewProps) {
  const [highlightMode, setHighlightMode] = useState(true);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get all highlights that overlap with a segment
  const getSegmentHighlights = (segment: TranscriptSegment): Highlight[] => {
    return highlights.filter(h => 
      h.start_seconds <= segment.end_seconds && h.end_seconds >= segment.start_seconds
    );
  };

  // Process selection and show toolbar
  const processSelection = useCallback(() => {
    const windowSelection = window.getSelection();
    
    // If no valid selection, hide toolbar
    if (!windowSelection || windowSelection.isCollapsed) {
      setSelection(null);
      return;
    }

    const selectedText = windowSelection.toString().trim();
    if (!selectedText || selectedText.length === 0) {
      setSelection(null);
      return;
    }

    // Find which segment(s) the selection spans
    const range = windowSelection.getRangeAt(0);
    const container = containerRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) {
      setSelection(null);
      return;
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
      setSelection({
        text: selectedText,
        startSeconds,
        endSeconds,
      });
    }
  }, []);

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

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [highlightMode, processSelection]);

  const handleHighlight = (type: 'remember' | 'todo') => {
    if (!selection) return;
    
    onAddHighlight(type, selection.text, selection.startSeconds, selection.endSeconds);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
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
              <span className="inline-block w-2 h-2 rounded-full bg-highlight-remember" title="Remember highlight" />
            )}
            {highlightTypes.includes('todo') && (
              <span className="inline-block w-2 h-2 rounded-full bg-highlight-todo" title="To Do highlight" />
            )}
            {highlightTypes.includes('ai_suggested') && (
              <span className="inline-block w-2 h-2 rounded-full bg-highlight-ai" title="AI suggested highlight" />
            )}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="relative pb-32" ref={containerRef}>
      {/* Highlight Mode Toggle */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border pb-3 mb-4">
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
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {highlightMode 
            ? 'Select text to highlight it as Remember or To Do.' 
            : 'Normal scroll and copy behavior.'}
        </p>
      </div>

      {/* Fixed Bottom Action Bar - Only shown when text is selected in highlight mode */}
      {selection && highlightMode && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
          <div className="bg-background/95 backdrop-blur-lg border-t border-border shadow-lg">
            <div className="max-w-2xl mx-auto px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2 line-clamp-1 text-center">
                "{selection.text.slice(0, 80)}{selection.text.length > 80 ? '...' : ''}"
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="remember"
                  size="default"
                  onClick={() => handleHighlight('remember')}
                  className="flex-1 max-w-[160px]"
                >
                  <Brain className="h-4 w-4" />
                  Remember
                </Button>
                <Button
                  variant="todo"
                  size="default"
                  onClick={() => handleHighlight('todo')}
                  className="flex-1 max-w-[160px]"
                >
                  <CheckSquare className="h-4 w-4" />
                  To Do
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Segments */}
      <div className={cn("space-y-2", highlightMode && "select-text cursor-text")}>
        {segments.map((segment) => {
          const segmentHighlights = getSegmentHighlights(segment);
          const hasHighlights = segmentHighlights.length > 0;
          
          return (
            <div
              key={segment.id}
              data-segment-id={segment.id}
              data-start={segment.start_seconds}
              data-end={segment.end_seconds}
              className={cn(
                "p-4 rounded-lg transition-all duration-200 border",
                highlightMode 
                  ? "border-transparent hover:bg-muted/30 cursor-text" 
                  : "border-transparent",
                hasHighlights && "bg-muted/20"
              )}
            >
              <div className="flex gap-3">
                <span className="text-xs font-mono text-muted-foreground shrink-0 mt-1 select-none">
                  {formatTimestamp(segment.start_seconds)}
                </span>
                <p className="text-sm leading-relaxed flex-1">
                  {renderHighlightedText(segment)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {segments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No transcript segments available.</p>
        </div>
      )}

      {/* AI Suggestions Panel - Separate from selection */}
      <AISuggestionsPanel
        videoId={videoId}
        aiSuggestionsGenerated={aiSuggestionsGenerated}
        highlights={highlights}
        onConvert={onAddHighlight}
        onSuggestionsUpdated={onHighlightsUpdated}
      />
    </div>
  );
}
