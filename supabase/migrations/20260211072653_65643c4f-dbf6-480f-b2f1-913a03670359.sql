-- Make video_id nullable on tasks table so standalone tasks can be created
ALTER TABLE public.tasks ALTER COLUMN video_id DROP NOT NULL;