-- Add shuffle_seed column to quiz_items for deterministic option order
ALTER TABLE public.quiz_items 
ADD COLUMN shuffle_seed integer NOT NULL DEFAULT floor(random() * 2147483647)::integer;