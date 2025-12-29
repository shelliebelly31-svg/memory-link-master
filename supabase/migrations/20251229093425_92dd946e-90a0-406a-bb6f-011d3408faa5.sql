-- Add failed_step column to track where in the pipeline a failure occurred
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS failed_step text;

-- Add captions_missing flag for transcript strategy
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS captions_missing boolean NOT NULL DEFAULT false;