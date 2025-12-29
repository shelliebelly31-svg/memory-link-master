-- Create enum for video status
CREATE TYPE public.video_status AS ENUM ('queued', 'transcribing', 'ready', 'failed');

-- Create enum for highlight types
CREATE TYPE public.highlight_type AS ENUM ('remember', 'todo', 'ai_suggested');

-- Create enum for task status
CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed');

-- Create enum for review schedule
CREATE TYPE public.review_schedule AS ENUM ('daily', 'weekly', 'monthly');

-- Videos table
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Video',
  thumbnail_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  status video_status NOT NULL DEFAULT 'queued',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transcript segments table
CREATE TABLE public.transcript_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  start_seconds NUMERIC NOT NULL,
  end_seconds NUMERIC NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Highlights table
CREATE TABLE public.highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type highlight_type NOT NULL,
  start_seconds NUMERIC NOT NULL,
  end_seconds NUMERIC NOT NULL,
  selected_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Remember items table
CREATE TABLE public.remember_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  key_points TEXT[] NOT NULL DEFAULT '{}',
  timestamp_seconds NUMERIC NOT NULL,
  review_schedule review_schedule,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  highlight_id UUID NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  timestamp_seconds NUMERIC NOT NULL,
  due_date DATE,
  status task_status NOT NULL DEFAULT 'pending',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quiz items table
CREATE TABLE public.quiz_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remember_item_id UUID NOT NULL REFERENCES public.remember_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options TEXT[] NOT NULL,
  correct_answer INTEGER NOT NULL,
  explanation TEXT,
  topic TEXT,
  times_answered INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Quiz attempts table
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  topic TEXT,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remember_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for videos
CREATE POLICY "Users can view own videos" ON public.videos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own videos" ON public.videos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own videos" ON public.videos
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own videos" ON public.videos
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for transcript_segments (users can view segments of their videos)
CREATE POLICY "Users can view segments of own videos" ON public.transcript_segments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.videos WHERE videos.id = transcript_segments.video_id AND videos.user_id = auth.uid())
  );

-- RLS Policies for highlights
CREATE POLICY "Users can view own highlights" ON public.highlights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own highlights" ON public.highlights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own highlights" ON public.highlights
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own highlights" ON public.highlights
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for remember_items
CREATE POLICY "Users can view own remember items" ON public.remember_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own remember items" ON public.remember_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own remember items" ON public.remember_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own remember items" ON public.remember_items
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for tasks
CREATE POLICY "Users can view own tasks" ON public.tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks" ON public.tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON public.tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tasks" ON public.tasks
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for quiz_items
CREATE POLICY "Users can view own quiz items" ON public.quiz_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quiz items" ON public.quiz_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quiz items" ON public.quiz_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own quiz items" ON public.quiz_items
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for quiz_attempts
CREATE POLICY "Users can view own quiz attempts" ON public.quiz_attempts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own quiz attempts" ON public.quiz_attempts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX idx_videos_user_id ON public.videos(user_id);
CREATE INDEX idx_videos_status ON public.videos(status);
CREATE INDEX idx_transcript_segments_video_id ON public.transcript_segments(video_id);
CREATE INDEX idx_highlights_video_id ON public.highlights(video_id);
CREATE INDEX idx_highlights_user_id ON public.highlights(user_id);
CREATE INDEX idx_remember_items_user_id ON public.remember_items(user_id);
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_quiz_items_user_id ON public.quiz_items(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Apply trigger to videos table
CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
