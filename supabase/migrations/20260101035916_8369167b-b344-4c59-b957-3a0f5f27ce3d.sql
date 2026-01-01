-- Add checklist_items column to tasks table
ALTER TABLE public.tasks 
ADD COLUMN checklist_items jsonb DEFAULT '[]'::jsonb;