import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Brain, CheckSquare, X, ChevronUp, ChevronDown, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HighlightType, Highlight } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AISuggestionsPanelProps {
  videoId: string;
  aiSuggestionsGenerated: boolean;
  highlights: Highlight[];
  onConvert: (type: HighlightType, text: string, startSeconds: number, endSeconds: number) => void;
  onSuggestionsUpdated: () => void;
}

export function AISuggestionsPanel({ 
  videoId, 
  aiSuggestionsGenerated,
  highlights,
  onConvert,
  onSuggestionsUpdated 
}: AISuggestionsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [hasAttemptedGeneration, setHasAttemptedGeneration] = useState(false);
  
  // Filter AI suggestions from highlights
  const aiSuggestions = highlights
    .filter(h => h.type === 'ai_suggested')
    .filter(h => !dismissed.has(h.id));

  const generateSuggestions = useCallback(async (forceRegenerate = false) => {
    if (isGenerating) return;
    
    console.log('generateSuggestions called, force:', forceRegenerate, 'already generated:', aiSuggestionsGenerated);
    
    // Only generate once unless force regenerate
    if (!forceRegenerate && aiSuggestionsGenerated) {
      console.log('Skipping generation - already generated');
      return;
    }

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in to generate suggestions');
        return;
      }

      const response = await supabase.functions.invoke('ai-process', {
        body: {
          action: 'generate-suggestions',
          video_id: videoId,
          force_regenerate: forceRegenerate,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data;
      
      if (data.skipped) {
        console.log('Generation skipped:', data.message);
      } else if (data.suggestions_created > 0) {
        toast.success(`Generated ${data.suggestions_created} AI suggestions`);
        onSuggestionsUpdated();
      } else if (data.duplicates_skipped > 0) {
        toast.info('All suggestions already exist');
      }
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error('Failed to generate AI suggestions');
    } finally {
      setIsGenerating(false);
      setHasAttemptedGeneration(true);
    }
  }, [videoId, aiSuggestionsGenerated, isGenerating, onSuggestionsUpdated]);

  // Auto-generate on mount ONLY if not already generated
  useEffect(() => {
    if (!hasAttemptedGeneration && !aiSuggestionsGenerated && !isGenerating) {
      generateSuggestions(false);
    }
  }, [hasAttemptedGeneration, aiSuggestionsGenerated, isGenerating, generateSuggestions]);

  const handleDismiss = async (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    
    // Delete the AI suggestion from database
    try {
      await supabase
        .from('highlights')
        .delete()
        .eq('id', id);
    } catch (error) {
      console.error('Error dismissing suggestion:', error);
    }
  };
  
  const handleConvert = async (suggestion: Highlight, type: 'remember' | 'todo') => {
    // Update the highlight type in database
    try {
      await supabase
        .from('highlights')
        .update({ type })
        .eq('id', suggestion.id);
      
      onConvert(type, suggestion.selected_text, suggestion.start_seconds, suggestion.end_seconds);
      setDismissed(prev => new Set([...prev, suggestion.id]));
      onSuggestionsUpdated();
    } catch (error) {
      console.error('Error converting suggestion:', error);
      toast.error('Failed to convert suggestion');
    }
  };

  const handleRegenerate = () => {
    setDismissed(new Set());
    generateSuggestions(true);
  };
  
  // Don't show panel if no suggestions and not generating
  if (aiSuggestions.length === 0 && !isGenerating) {
    return null;
  }
  
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <Sparkles className="h-4 w-4 text-highlight-ai" />
          <span className="text-sm font-medium">AI Suggestions</span>
          {isGenerating ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {aiSuggestions.length}
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRegenerate}
          disabled={isGenerating}
          className="text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${isGenerating ? 'animate-spin' : ''}`} />
          Regenerate
        </Button>
      </div>
      
      {/* Suggestions List */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 max-h-[40vh] overflow-y-auto">
          {isGenerating && aiSuggestions.length === 0 && (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Analyzing transcript...</span>
            </div>
          )}
          
          {aiSuggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="p-3 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm line-clamp-2 flex-1">
                  "{suggestion.selected_text}"
                </p>
                <button
                  onClick={() => handleDismiss(suggestion.id)}
                  className="p-1 hover:bg-muted rounded-full shrink-0"
                  aria-label="Dismiss suggestion"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
              
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