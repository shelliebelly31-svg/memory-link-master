import { useState, useEffect } from 'react';
import { CheckSquare, Loader2, Plus, Trash2, Sparkles, Copy, Share2, Check } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorksheetSection {
  label: string;
  prompt: string;
  answer: string;
  clarified: string;
  selected: boolean;
  isClarifying: boolean;
}

interface EditTaskSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: {
    id: string;
    title: string;
    description: string | null;
    timestamp_seconds: number;
    due_date: string | null;
    video_title?: string;
    checklist_items?: ChecklistItem[] | null;
    worksheet_sections?: WorksheetSection[] | null;
  } | null;
  onSave: (id: string, data: { 
    title: string; 
    description: string | null; 
    due_date: string | null;
    checklist_items: ChecklistItem[];
    worksheet_sections: WorksheetSection[] | null;
  }) => void;
  onChecklistToggle?: (id: string, checklistItems: ChecklistItem[]) => void;
  isSaving?: boolean;
}

// Parse bullet points from description into checklist items (migration helper)
function parseBulletsFromDescription(description: string): { 
  checklistItems: ChecklistItem[]; 
  cleanedDescription: string;
} {
  const lines = description.split('\n');
  const checklistItems: ChecklistItem[] = [];
  const otherLines: string[] = [];
  let inChecklistSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().includes('checklist')) {
      inChecklistSection = true;
      continue;
    }
    const bulletMatch = trimmed.match(/^[-•*]\s*(.+)$/);
    if (bulletMatch && inChecklistSection) {
      const text = bulletMatch[1].trim();
      if (text) {
        checklistItems.push({
          id: crypto.randomUUID(),
          text,
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    } else if (trimmed) {
      if (inChecklistSection && !bulletMatch) {
        inChecklistSection = false;
      }
      otherLines.push(line);
    }
  }

  return {
    checklistItems,
    cleanedDescription: otherLines.join('\n').trim(),
  };
}

export function EditTaskSheet({
  open,
  onOpenChange,
  task,
  onSave,
  onChecklistToggle,
  isSaving,
}: EditTaskSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  
  // Worksheet state
  const [worksheetSections, setWorksheetSections] = useState<WorksheetSection[]>([]);
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [worksheetOpen, setWorksheetOpen] = useState(false);

  const { toast } = useToast();
  const { session } = useAuth();

  useEffect(() => {
    if (task && open) {
      setTitle(task.title);
      setDueDate(task.due_date || '');
      setNewItemText('');
      
      // Restore saved worksheet sections
      if (task.worksheet_sections && task.worksheet_sections.length > 0) {
        setWorksheetSections(task.worksheet_sections.map(s => ({ ...s, isClarifying: false })));
        setWorksheetOpen(true);
      } else {
        setWorksheetSections([]);
        setWorksheetOpen(false);
      }
      
      if (task.checklist_items && task.checklist_items.length > 0) {
        setChecklistItems(task.checklist_items);
        setDescription(task.description || '');
      } else if (task.description) {
        const { checklistItems: parsed, cleanedDescription } = parseBulletsFromDescription(task.description);
        if (parsed.length > 0) {
          setChecklistItems(parsed);
          setDescription(cleanedDescription);
        } else {
          setChecklistItems([]);
          setDescription(task.description);
        }
      } else {
        setChecklistItems([]);
        setDescription('');
      }
    }
  }, [task, open]);

  const handleSave = () => {
    if (!task || !title.trim()) return;
    onSave(task.id, { 
      title: title.trim(), 
      description: description.trim() || null,
      due_date: dueDate || null,
      checklist_items: checklistItems,
      worksheet_sections: worksheetSections.length > 0 
        ? worksheetSections.map(({ isClarifying, ...rest }) => ({ ...rest, isClarifying: false }))
        : null,
    });
  };

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newItemText.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setChecklistItems([...checklistItems, newItem]);
    setNewItemText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };

  const handleToggleItem = (itemId: string) => {
    const updated = checklistItems.map(item => 
      item.id === itemId 
        ? { ...item, completed: !item.completed, updatedAt: new Date().toISOString() }
        : item
    );
    setChecklistItems(updated);
    if (onChecklistToggle && task) {
      onChecklistToggle(task.id, updated);
    }
  };

  const handleDeleteItem = (itemId: string) => {
    setChecklistItems(checklistItems.filter(item => item.id !== itemId));
  };

  const handleEditItem = (itemId: string, newText: string) => {
    setChecklistItems(checklistItems.map(item =>
      item.id === itemId
        ? { ...item, text: newText, updatedAt: new Date().toISOString() }
        : item
    ));
  };

  // === AI Worksheet functions ===

  const handleBreakdown = async () => {
    if (!title.trim()) return;
    setIsBreakingDown(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-clarify-task`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ action: 'breakdown', task_title: title }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to break down task');
      }
      const data = await response.json();
      setWorksheetSections(
        data.sections.map((s: { label: string; prompt: string }) => ({
          label: s.label,
          prompt: s.prompt,
          answer: '',
          clarified: '',
          selected: false,
          isClarifying: false,
        }))
      );
      setWorksheetOpen(true);
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' });
    } finally {
      setIsBreakingDown(false);
    }
  };

  const handleClarifySection = async (index: number) => {
    const section = worksheetSections[index];
    if (!section.answer.trim()) {
      toast({ title: 'Write something first', description: 'Fill in your answer before clarifying.', variant: 'destructive' });
      return;
    }

    setWorksheetSections(prev => prev.map((s, i) => i === index ? { ...s, isClarifying: true } : s));

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-clarify-task`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            action: 'clarify',
            task_title: title,
            sections: { label: section.label, prompt: section.prompt, answer: section.answer },
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to clarify');
      }
      const data = await response.json();
      setWorksheetSections(prev => prev.map((s, i) => i === index ? { ...s, clarified: data.clarified, isClarifying: false } : s));
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' });
      setWorksheetSections(prev => prev.map((s, i) => i === index ? { ...s, isClarifying: false } : s));
    }
  };

  const handleUseClarified = (index: number) => {
    setWorksheetSections(prev => prev.map((s, i) => i === index ? { ...s, answer: s.clarified, clarified: '' } : s));
  };

  const handleToggleSection = (index: number) => {
    setWorksheetSections(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s));
  };

  const handleSelectAll = () => {
    const allSelected = worksheetSections.every(s => s.selected);
    setWorksheetSections(prev => prev.map(s => ({ ...s, selected: !allSelected })));
  };

  const getSelectedText = () => {
    const selected = worksheetSections.filter(s => s.selected && (s.clarified || s.answer));
    if (selected.length === 0) return '';
    return selected.map(s => `**${s.label}**\n${s.clarified || s.answer}`).join('\n\n');
  };

  const handleCopySelected = async () => {
    const selected = worksheetSections.filter(s => s.selected && (s.clarified || s.answer));
    if (selected.length === 0) {
      toast({ title: 'Nothing to copy', description: 'Select sections with content first.', variant: 'destructive' });
      return;
    }
    const plain = selected.map(s => `${s.label}\n${s.clarified || s.answer}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(plain);
      toast({ title: 'Copied!', description: 'Selected sections copied to clipboard.' });
    } catch (err) {
      console.error('Copy failed:', err);
      toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
    }
  };

  const handleShareSelected = async () => {
    const selected = worksheetSections.filter(s => s.selected && (s.clarified || s.answer));
    if (selected.length === 0) {
      toast({ title: 'Nothing to share', description: 'Select sections with content first.', variant: 'destructive' });
      return;
    }
    const plain = selected.map(s => `${s.label}\n${s.clarified || s.answer}`).join('\n\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'Worksheet', text: plain });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Fall through to clipboard on NotAllowedError or other failures
    }
    try {
      await navigator.clipboard.writeText(plain);
      toast({ title: 'Copied!', description: 'Content copied to clipboard.' });
    } catch {
      toast({ title: 'Failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalCount = checklistItems.length;
  const hasSelectedSections = worksheetSections.some(s => s.selected && (s.clarified || s.answer));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh] flex flex-col">
        <DrawerHeader className="border-b border-border shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-todo" />
            Edit Task
          </DrawerTitle>
          <DrawerDescription>
            {task ? `${task.video_title || 'Unknown'} • ${formatTimestamp(task.timestamp_seconds)}` : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto max-h-[calc(90vh-160px)] p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* AI Worksheet Section */}
          <div className="space-y-3">
            {!worksheetOpen ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed border-primary/40 text-primary hover:bg-primary/5"
                onClick={handleBreakdown}
                disabled={isBreakingDown || !title.trim()}
              >
                {isBreakingDown ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isBreakingDown ? 'Breaking down...' : 'AI Worksheet — Break this down'}
              </Button>
            ) : (
              <div className="border border-primary/20 rounded-lg overflow-hidden">
                <div className="bg-primary/5 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Sparkles className="h-4 w-4" />
                    AI Worksheet
                  </div>
                  <div className="flex items-center gap-1">
                    {hasSelectedSections && (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={handleCopySelected} title="Copy selected">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={handleShareSelected} title="Share selected">
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={handleSelectAll}
                    >
                      {worksheetSections.every(s => s.selected) ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {worksheetSections.map((section, idx) => (
                    <div key={idx} className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={section.selected}
                          onCheckedChange={() => handleToggleSection(idx)}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{section.label}</p>
                          <p className="text-xs text-muted-foreground">{section.prompt}</p>
                        </div>
                      </div>

                      <Textarea
                        placeholder={`Write your ${section.label.toLowerCase()} here...`}
                        value={section.answer}
                        onChange={(e) => {
                          const val = e.target.value;
                          setWorksheetSections(prev => prev.map((s, i) => i === idx ? { ...s, answer: val } : s));
                        }}
                        rows={2}
                        className="text-sm"
                      />

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs h-7"
                          onClick={() => handleClarifySection(idx)}
                          disabled={section.isClarifying || !section.answer.trim()}
                        >
                          {section.isClarifying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                          Clarify with AI
                        </Button>
                        {section.selected && (section.clarified || section.answer) && (
                          <div className="flex gap-1 ml-auto">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await navigator.clipboard.writeText(section.clarified || section.answer);
                                  toast({ title: 'Copied!', description: `${section.label} copied.` });
                                } catch (err) {
                                  console.error('Copy failed:', err);
                                  toast({ title: 'Copy failed', variant: 'destructive' });
                                }
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const text = section.clarified || section.answer;
                                try {
                                  if (navigator.share) {
                                    await navigator.share({ title: section.label, text });
                                    return;
                                  }
                                } catch (err) {
                                  if (err instanceof Error && err.name === 'AbortError') return;
                                }
                                try {
                                  await navigator.clipboard.writeText(text);
                                  toast({ title: 'Copied!', description: 'Content copied to clipboard.' });
                                } catch {
                                  toast({ title: 'Failed', description: 'Could not copy.', variant: 'destructive' });
                                }
                              }}
                            >
                              <Share2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {section.clarified && (
                        <div className="bg-muted/50 rounded-md p-2.5 space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">AI Suggestion</p>
                          <p className="text-sm whitespace-pre-wrap">{section.clarified}</p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => handleUseClarified(idx)}
                          >
                            <Check className="h-3 w-3" />
                            Use this
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Checklist Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Checklist</Label>
              {totalCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {completedCount} of {totalCount} completed
                </span>
              )}
            </div>
            
            <div className="flex gap-2">
              <Input
                placeholder="Add checklist item..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Button 
                type="button" 
                size="icon" 
                variant="outline"
                onClick={handleAddItem}
                disabled={!newItemText.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            {checklistItems.length > 0 && (
              <div className="space-y-1 border border-border rounded-md p-2">
                {checklistItems.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    onToggle={() => handleToggleItem(item.id)}
                    onDelete={() => handleDeleteItem(item.id)}
                    onEdit={(text) => handleEditItem(item.id, text)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Notes (optional)</Label>
            <Textarea
              id="edit-description"
              placeholder="Additional notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-due-date">Due Date (optional)</Label>
            <Input
              id="edit-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DrawerFooter className="border-t border-border shrink-0 flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving} className="flex-1">
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Save
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// Checklist item row component
function ChecklistItemRow({ 
  item, 
  onToggle, 
  onDelete,
  onEdit,
}: { 
  item: ChecklistItem; 
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (text: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onEdit(editText.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      setEditText(item.text);
      setIsEditing(false);
    }
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 group">
      <Checkbox
        checked={item.completed}
        onCheckedChange={onToggle}
        className="shrink-0"
      />
      
      {isEditing ? (
        <Input
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleSaveEdit}
          onKeyDown={handleKeyDown}
          className="flex-1 h-7 text-sm"
          autoFocus
        />
      ) : (
        <span 
          className={cn(
            "flex-1 text-sm cursor-pointer",
            item.completed && "line-through text-muted-foreground"
          )}
          onClick={() => setIsEditing(true)}
        >
          {item.text}
        </span>
      )}
      
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}
