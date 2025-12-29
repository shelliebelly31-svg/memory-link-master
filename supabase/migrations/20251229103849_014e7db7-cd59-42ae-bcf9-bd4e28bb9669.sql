-- Add AI suggestion tracking fields to videos table
ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS ai_suggestions_generated boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_suggestions_generated_at timestamp with time zone;

-- Add text_hash column to highlights for deduplication
ALTER TABLE public.highlights 
ADD COLUMN IF NOT EXISTS text_hash text;

-- Create index for fast deduplication lookups
CREATE INDEX IF NOT EXISTS idx_highlights_video_text_hash 
ON public.highlights(video_id, text_hash) 
WHERE type = 'ai_suggested';