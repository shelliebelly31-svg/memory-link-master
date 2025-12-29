import { useState } from 'react';
import { Sparkles, Brain, CheckSquare, X, ChevronUp, ChevronDown, Pencil, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HighlightType, TranscriptSegment, Highlight } from '@/types';
import { cn } from '@/lib/utils';

interface AISuggestion {
  id: string;
  text: string;
  startSeconds: number;
  endSeconds: number;
  reason: string;
}

interface AISuggestionsPanelProps {
  segments: TranscriptSegment[];
  highlights: Highlight[];
  onConvert: (type: HighlightType, text: string, startSeconds: number, endSeconds: number) => void;
}

// Generate mock AI suggestions based on transcript content
function generateSuggestions(segments: TranscriptSegment[], highlights: Highlight[]): AISuggestion[] {
  // Filter out already highlighted content
  const highlightedTexts = new Set(highlights.map(h => h.selected_text.toLowerCase()));
  
  const suggestions: AISuggestion[] = [];
  
  // Look for key phrases that might be worth highlighting
  const keyPhrases = [
    { pattern: /important|key|remember|note|critical/i, reason: 'Contains key information' },
    { pattern: /step \d|first|second|third|finally|then/i, reason: 'Part of a process or steps' },
    { pattern: /definition|means|is called|refers to/i, reason: 'Contains a definition' },
    { pattern: /example|for instance|such as/i, reason: 'Provides an example' },
    { pattern: /todo|action|task|should|must|need to/i, reason: 'Suggests an action item' },
  ];
  
  segments.forEach((segment) => {
    // Skip if already highlighted
    if (highlightedTexts.has(segment.text.toLowerCase())) return;
    
    for (const { pattern, reason } of keyPhrases) {
      if (pattern.test(segment.text) && suggestions.length < 5) {
        suggestions.push({
          id: `suggestion-${segment.id}`,
          text: segment.text,
          startSeconds: segment.start_seconds,
          endSeconds: segment.end_seconds,
          reason,
        });
        break;
      }
    }
  });
  
  return suggestions.slice(0, 3);
}

export function AISuggestionsPanel({ segments, highlights, onConvert }: AISuggestionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  
  const suggestions = generateSuggestions(segments, highlights).filter(s => !dismissed.has(s.id));
  
  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
  };
  
  const handleConvert = (suggestion: AISuggestion, type: 'remember' | 'todo') => {
    onConvert(type, suggestion.text, suggestion.startSeconds, suggestion.endSeconds);
    handleDismiss(suggestion.id);
  };
  
  if (suggestions.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-lg">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-highlight-ai" />
          <span className="text-sm font-medium">AI Suggestions</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {suggestions.length}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      
      {/* Suggestions List */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 max-h-[40vh] overflow-y-auto">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="p-3 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm line-clamp-2 flex-1">
                  "{suggestion.text}"
                </p>
                <button
                  onClick={() => handleDismiss(suggestion.id)}
                  className="p-1 hover:bg-muted rounded-full shrink-0"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
              
              <p className="text-xs text-muted-foreground mb-3">
                <Sparkles className="h-3 w-3 inline mr-1" />
                {suggestion.reason}
              </p>
              
              <div className="flex gap-2">
                <Button
                  variant="remember"
                  size="sm"
                  onClick={() => handleConvert(suggestion, 'remember')}
                  className="flex-1"
                >
                  <Brain className="h-3 w-3" />
                  Remember
                </Button>
                <Button
                  variant="todo"
                  size="sm"
                  onClick={() => handleConvert(suggestion, 'todo')}
                  className="flex-1"
                >
                  <CheckSquare className="h-3 w-3" />
                  To Do
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
