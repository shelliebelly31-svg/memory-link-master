import { useState, useEffect } from 'react';
import { CheckSquare, Loader2, Plus, Trash2, Check } from 'lucide-react';
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

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
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
  } | null;
  onSave: (id: string, data: { 
    title: string; 
    description: string | null; 
    due_date: string | null;
    checklist_items: ChecklistItem[];
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
    
    // Check if we're entering a checklist section
    if (trimmed.toLowerCase().includes('checklist')) {
      inChecklistSection = true;
      continue;
    }
    
    // Check if line is a bullet point
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
      // Reset checklist section if we hit non-bullet content
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

  useEffect(() => {
    if (task && open) {
      setTitle(task.title);
      setDueDate(task.due_date || '');
      setNewItemText('');
      
      // Check if task already has checklist_items
      if (task.checklist_items && task.checklist_items.length > 0) {
        setChecklistItems(task.checklist_items);
        setDescription(task.description || '');
      } else if (task.description) {
        // Try to migrate bullets from description
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
    
    // Immediately persist toggle if callback provided
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

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const completedCount = checklistItems.filter(item => item.completed).length;
  const totalCount = checklistItems.length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh] flex flex-col">
        <DrawerHeader className="border-b border-border shrink-0">
          <DrawerTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-todo" />
            Edit Task
          </DrawerTitle>
          <DrawerDescription>
            {task ? `${task.video_title || 'Unknown'} • ${formatTimestamp(task.timestamp_seconds)}` : ''}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto max-h-[calc(85vh-160px)] p-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title</Label>
            <Input
              id="edit-title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
            
            {/* Add new item */}
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
            
            {/* Checklist items */}
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
