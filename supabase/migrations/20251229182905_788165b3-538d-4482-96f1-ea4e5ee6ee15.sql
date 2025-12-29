-- Create user_profiles table for storing phone numbers
CREATE TABLE public.user_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  phone_number TEXT,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_profiles
CREATE POLICY "Users can view their own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Create reminder_schedules table
CREATE TYPE public.reminder_channel AS ENUM ('sms');
CREATE TYPE public.reminder_status AS ENUM ('scheduled', 'sent', 'failed');

CREATE TABLE public.reminder_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  remember_item_id UUID NOT NULL REFERENCES public.remember_items(id) ON DELETE CASCADE,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  channel public.reminder_channel NOT NULL DEFAULT 'sms',
  status public.reminder_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reminder_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies for reminder_schedules
CREATE POLICY "Users can view their own reminder schedules" ON public.reminder_schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own reminder schedules" ON public.reminder_schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reminder schedules" ON public.reminder_schedules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reminder schedules" ON public.reminder_schedules FOR DELETE USING (auth.uid() = user_id);

-- Add cascade delete to existing tables
-- First drop existing foreign keys and recreate with CASCADE

-- highlights -> videos
ALTER TABLE public.highlights DROP CONSTRAINT IF EXISTS highlights_video_id_fkey;
ALTER TABLE public.highlights ADD CONSTRAINT highlights_video_id_fkey 
  FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;

-- transcript_segments -> videos
ALTER TABLE public.transcript_segments DROP CONSTRAINT IF EXISTS transcript_segments_video_id_fkey;
ALTER TABLE public.transcript_segments ADD CONSTRAINT transcript_segments_video_id_fkey 
  FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;

-- remember_items -> videos and highlights
ALTER TABLE public.remember_items DROP CONSTRAINT IF EXISTS remember_items_video_id_fkey;
ALTER TABLE public.remember_items DROP CONSTRAINT IF EXISTS remember_items_highlight_id_fkey;
ALTER TABLE public.remember_items ADD CONSTRAINT remember_items_video_id_fkey 
  FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
ALTER TABLE public.remember_items ADD CONSTRAINT remember_items_highlight_id_fkey 
  FOREIGN KEY (highlight_id) REFERENCES public.highlights(id) ON DELETE CASCADE;

-- tasks -> videos and highlights
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_video_id_fkey;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_highlight_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_video_id_fkey 
  FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_highlight_id_fkey 
  FOREIGN KEY (highlight_id) REFERENCES public.highlights(id) ON DELETE CASCADE;

-- quiz_items -> videos and remember_items
ALTER TABLE public.quiz_items DROP CONSTRAINT IF EXISTS quiz_items_video_id_fkey;
ALTER TABLE public.quiz_items DROP CONSTRAINT IF EXISTS quiz_items_remember_item_id_fkey;
ALTER TABLE public.quiz_items ADD CONSTRAINT quiz_items_video_id_fkey 
  FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
ALTER TABLE public.quiz_items ADD CONSTRAINT quiz_items_remember_item_id_fkey 
  FOREIGN KEY (remember_item_id) REFERENCES public.remember_items(id) ON DELETE CASCADE;

-- quiz_attempts -> videos
ALTER TABLE public.quiz_attempts DROP CONSTRAINT IF EXISTS quiz_attempts_video_id_fkey;
ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_video_id_fkey 
  FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;

-- Trigger for user_profiles updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();