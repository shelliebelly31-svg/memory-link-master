import { useState } from 'react';
import { Brain, CheckSquare, Sparkles } from 'lucide-react';
import { TranscriptSegment, Highlight, HighlightType } from '@/types';
import { formatTimestamp } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  highlights: Highlight[];
  onAddHighlight: (type: HighlightType, text: string, startSeconds: number, endSeconds: number) => void;
}

export function TranscriptView({ segments, highlights, onAddHighlight }: TranscriptViewProps) {
  const [selectedText, setSelectedText] = useState('');
  const [selectedSegments, setSelectedSegments] = useState<TranscriptSegment[]>([]);
  const [showToolbar, setShowToolbar] = useState(false);

  const getHighlightType = (segmentId: string): HighlightType | null => {
    const highlight = highlights.find(h => {
      const segment = segments.find(s => s.id === segmentId);
      if (!segment) return false;
      return h.start_seconds <= segment.start_seconds && h.end_seconds >= segment.end_seconds;
    });
    return highlight?.type || null;
  };

  const handleSegmentClick = (segment: TranscriptSegment) => {
    const isSelected = selectedSegments.some(s => s.id === segment.id);
    
    if (isSelected) {
      setSelectedSegments(selectedSegments.filter(s => s.id !== segment.id));
    } else {
      setSelectedSegments([...selectedSegments, segment]);
    }
    
    const newSelected = isSelected 
      ? selectedSegments.filter(s => s.id !== segment.id)
      : [...selectedSegments, segment];
    
    if (newSelected.length > 0) {
      const text = newSelected.map(s => s.text).join(' ');
      setSelectedText(text);
      setShowToolbar(true);
    } else {
      setSelectedText('');
      setShowToolbar(false);
    }
  };

  const handleHighlight = (type: HighlightType) => {
    if (selectedSegments.length === 0) return;
    
    const startSeconds = Math.min(...selectedSegments.map(s => s.start_seconds));
    const endSeconds = Math.max(...selectedSegments.map(s => s.end_seconds));
    
    onAddHighlight(type, selectedText, startSeconds, endSeconds);
    setSelectedSegments([]);
    setSelectedText('');
    setShowToolbar(false);
  };

  return (
    <div className="relative">
      {/* Floating Highlight Toolbar */}
      {showToolbar && (
        <div className="sticky top-0 z-10 glass rounded-xl p-3 mb-4 animate-scale-in">
          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
            {selectedText.slice(0, 100)}...
          </p>
          <div className="flex gap-2">
            <Button
              variant="remember"
              size="sm"
              onClick={() => handleHighlight('remember')}
              className="flex-1"
            >
              <Brain className="h-4 w-4" />
              Remember
            </Button>
            <Button
              variant="todo"
              size="sm"
              onClick={() => handleHighlight('todo')}
              className="flex-1"
            >
              <CheckSquare className="h-4 w-4" />
              To Do
            </Button>
            <Button
              variant="ai"
              size="sm"
              onClick={() => handleHighlight('ai_suggested')}
              className="flex-1"
            >
              <Sparkles className="h-4 w-4" />
              AI
            </Button>
          </div>
        </div>
      )}

      {/* Transcript Segments */}
      <div className="space-y-2">
        {segments.map((segment) => {
          const highlightType = getHighlightType(segment.id);
          const isSelected = selectedSegments.some(s => s.id === segment.id);
          
          return (
            <button
              key={segment.id}
              onClick={() => handleSegmentClick(segment)}
              className={cn(
                "w-full text-left p-4 rounded-lg transition-all duration-200 border",
                isSelected 
                  ? "ring-2 ring-primary bg-primary/10 border-primary/30" 
                  : "border-transparent hover:bg-muted/50",
                highlightType === 'remember' && "highlight-remember",
                highlightType === 'todo' && "highlight-todo",
                highlightType === 'ai_suggested' && "highlight-ai",
              )}
            >
              <div className="flex gap-3">
                <span className="text-xs font-mono text-muted-foreground shrink-0 mt-1">
                  {formatTimestamp(segment.start_seconds)}
                </span>
                <p className="text-sm leading-relaxed">{segment.text}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
