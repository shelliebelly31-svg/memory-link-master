-- Add source_type column to videos table
ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'link' CHECK (source_type IN ('link', 'upload', 'manual'));

-- Update video_status enum to include 'needs_attention'
ALTER TYPE public.video_status ADD VALUE IF NOT EXISTS 'needs_attention';