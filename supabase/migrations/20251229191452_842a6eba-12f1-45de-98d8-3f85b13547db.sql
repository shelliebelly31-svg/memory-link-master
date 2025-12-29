-- Add repeat scheduling columns to reminder_schedules
ALTER TABLE public.reminder_schedules 
ADD COLUMN IF NOT EXISTS repeat_type text DEFAULT 'one_time',
ADD COLUMN IF NOT EXISTS repeat_days integer[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS repeat_dates timestamp with time zone[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS next_send_at timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS original_send_at timestamp with time zone DEFAULT NULL;

-- Add comment for repeat_type values
COMMENT ON COLUMN public.reminder_schedules.repeat_type IS 'one_time, daily, weekly, biweekly, monthly, custom_days, multiple_dates';
COMMENT ON COLUMN public.reminder_schedules.repeat_days IS 'Array of weekday numbers (0=Sunday, 1=Monday, etc.) for custom_days type';
COMMENT ON COLUMN public.reminder_schedules.repeat_dates IS 'Array of specific dates/times for multiple_dates type';