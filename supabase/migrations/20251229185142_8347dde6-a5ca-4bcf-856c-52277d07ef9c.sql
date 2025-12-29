-- Create manual_items table for manual reminders and todos
CREATE TABLE public.manual_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('reminder', 'todo')),
  title TEXT NOT NULL,
  notes TEXT,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  timestamp_seconds NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manual_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for manual_items
CREATE POLICY "Users can view own manual items" 
ON public.manual_items 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own manual items" 
ON public.manual_items 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own manual items" 
ON public.manual_items 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own manual items" 
ON public.manual_items 
FOR DELETE 
USING (auth.uid() = user_id);

-- Add columns to tasks table for manual tasks
ALTER TABLE public.tasks 
ADD COLUMN source_type TEXT DEFAULT 'highlight' CHECK (source_type IN ('highlight', 'manual')),
ADD COLUMN manual_item_id UUID REFERENCES public.manual_items(id) ON DELETE CASCADE;

-- Make highlight_id nullable for manual tasks
ALTER TABLE public.tasks 
ALTER COLUMN highlight_id DROP NOT NULL;

-- Add manual_item_id to reminder_schedules for manual reminders
ALTER TABLE public.reminder_schedules
ADD COLUMN manual_item_id UUID REFERENCES public.manual_items(id) ON DELETE CASCADE;

-- Make remember_item_id nullable for manual reminder schedules
ALTER TABLE public.reminder_schedules
ALTER COLUMN remember_item_id DROP NOT NULL;

-- Add constraint: either remember_item_id or manual_item_id must be set
ALTER TABLE public.reminder_schedules
ADD CONSTRAINT reminder_schedules_item_check 
CHECK (remember_item_id IS NOT NULL OR manual_item_id IS NOT NULL);