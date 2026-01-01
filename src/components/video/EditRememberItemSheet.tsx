import { useState, useEffect } from 'react';
import { Brain, Loader2, X, Sparkles, Plus, Check } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCreateManualTask } from '@/hooks/useManualItems';

interface EditRememberItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: {
    id: string;
    summary: string;
    key_points: string[];
    timestamp_seconds: number;
    video_id?: string;
  } | null;
  onSave: (id: string, data: { summary: string; key_points: string[] }) => void;
  isSaving?: boolean;
  videoTitle?: string;
}

interface AISuggestions {
  keyPoints: string[];
  todos: string[];
}

export function EditRememberItemSheet({
  open,
  onOpenChange,
  item,
  onSave,
  isSaving,
  videoTitle,
}: EditRememberItemSheetProps) {
  const [summary, setSummary] = useState('');
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [newKeyPoint, setNewKeyPoint] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestions | null>(null);
  const [selectedKeyPoints, setSelectedKeyPoints] = useState<Set<number>>(new Set());
  const [selectedTodos, setSelectedTodos] = useState<Set<number>>(new Set());
  
  const { toast } = useToast();
  const createTaskMutation = useCreateManualTask();

  useEffect(() => {
    if (item && open) {
      setSummary(item.summary);
      setKeyPoints(item.key_points || []);
      setNewKeyPoint('');
      setSuggestions(null);
      setSelectedKeyPoints(new Set());
      setSelectedTodos(new Set());
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

  const normalizeText = (text: string): string => {
    return text.toLowerCase().trim().replace(/[^\w\s]/g, '');
  };

  const handleGenerateSuggestions = async () => {
    if (!summary.trim()) {
      toast({ title: 'Error', description: 'Summary is required to generate suggestions', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    setSuggestions(null);
    setSelectedKeyPoints(new Set());
    setSelectedTodos(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('generate-memory-suggestions', {
        body: {
          summary,
          existing_key_points: keyPoints,
          video_title: videoTitle,
          timestamp: item ? formatTimestamp(item.timestamp_seconds) : undefined,
        },
      });

      if (error) throw error;

      setSuggestions({
        keyPoints: data.keyPoints || [],
        todos: data.todos || [],
      });
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Could not generate suggestions',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleKeyPointSelection = (index: number) => {
    const newSelected = new Set(selectedKeyPoints);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedKeyPoints(newSelected);
  };

  const toggleTodoSelection = (index: number) => {
    const newSelected = new Set(selectedTodos);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTodos(newSelected);
  };

  const handleApplySelectedKeyPoints = () => {
    if (!suggestions || selectedKeyPoints.size === 0) return;

    const normalizedExisting = keyPoints.map(normalizeText);
    const newPoints = Array.from(selectedKeyPoints)
      .map(i => suggestions.keyPoints[i])
      .filter(point => !normalizedExisting.includes(normalizeText(point)));

    if (newPoints.length > 0) {
      setKeyPoints([...keyPoints, ...newPoints]);
      toast({ title: 'Added', description: `${newPoints.length} key point(s) added` });
    } else {
      toast({ title: 'No changes', description: 'Selected points already exist' });
    }
    
    setSelectedKeyPoints(new Set());
  };

  const handleAddSelectedTodos = async () => {
    if (!suggestions || selectedTodos.size === 0) return;

    const todosToAdd = Array.from(selectedTodos).map(i => suggestions.todos[i]);
    let addedCount = 0;

    for (const todoTitle of todosToAdd) {
      try {
        await createTaskMutation.mutateAsync({
          title: todoTitle,
          video_id: item?.video_id,
          timestamp_seconds: item?.timestamp_seconds,
        });
        addedCount++;
      } catch (error) {
        console.error('Error adding todo:', error);
      }
    }

    if (addedCount > 0) {
      toast({ title: 'Added to To Do', description: `${addedCount} task(s) added` });
    }
    
    setSelectedTodos(new Set());
  };

  const handleDismissSuggestions = () => {
    setSuggestions(null);
    setSelectedKeyPoints(new Set());
    setSelectedTodos(new Set());
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="border-b border-border shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-remember" />
            Edit Memory Item
          </DrawerTitle>
          <DrawerDescription>
            {item ? `Timestamp: ${formatTimestamp(item.timestamp_seconds)}` : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-160px)] p-4 space-y-4">
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
            <div className="flex items-center justify-between">
              <Label>Key Points</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateSuggestions}
                disabled={isGenerating || !summary.trim()}
                className="gap-1.5"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate key points
                  </>
                )}
              </Button>
            </div>
            
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

          {/* AI Suggestions Section */}
          {suggestions && (
            <div className="space-y-4 border border-border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  AI Suggestions
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDismissSuggestions}
                >
                  Dismiss
                </Button>
              </div>

              {/* Key Points Suggestions */}
              {suggestions.keyPoints.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Key Points Suggestions</Label>
                  <div className="space-y-1.5">
                    {suggestions.keyPoints.map((point, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm p-2 rounded-lg bg-background hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleKeyPointSelection(index)}
                      >
                        <Checkbox
                          checked={selectedKeyPoints.has(index)}
                          onCheckedChange={() => toggleKeyPointSelection(index)}
                          className="mt-0.5"
                        />
                        <span className="flex-1">{point}</span>
                      </div>
                    ))}
                  </div>
                  {selectedKeyPoints.size > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleApplySelectedKeyPoints}
                      className="w-full gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Apply selected ({selectedKeyPoints.size})
                    </Button>
                  )}
                </div>
              )}

              {/* To Do Suggestions */}
              {suggestions.todos.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">To Do Suggestions</Label>
                  <div className="space-y-1.5">
                    {suggestions.todos.map((todo, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-sm p-2 rounded-lg bg-background hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleTodoSelection(index)}
                      >
                        <Checkbox
                          checked={selectedTodos.has(index)}
                          onCheckedChange={() => toggleTodoSelection(index)}
                          className="mt-0.5"
                        />
                        <span className="flex-1">{todo}</span>
                      </div>
                    ))}
                  </div>
                  {selectedTodos.size > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleAddSelectedTodos}
                      disabled={createTaskMutation.isPending}
                      className="w-full gap-1.5"
                    >
                      {createTaskMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Add to To Do ({selectedTodos.size})
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
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
