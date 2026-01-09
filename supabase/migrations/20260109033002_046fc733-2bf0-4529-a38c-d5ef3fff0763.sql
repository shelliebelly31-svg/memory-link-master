-- Add soft delete columns to remember_items table
ALTER TABLE public.remember_items 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL,
ADD COLUMN pending_delete_until timestamp with time zone DEFAULT NULL;

-- Add soft delete columns to manual_items table
ALTER TABLE public.manual_items 
ADD COLUMN deleted_at timestamp with time zone DEFAULT NULL,
ADD COLUMN pending_delete_until timestamp with time zone DEFAULT NULL;