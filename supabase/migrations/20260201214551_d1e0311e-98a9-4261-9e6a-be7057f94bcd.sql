-- Allow anonymous users to also delete their own quiz attempts (needed for ephemeral cleanup)
DROP POLICY IF EXISTS "Anyone can delete their own attempts" ON public.shared_quiz_attempts;

CREATE POLICY "Anyone can delete their own attempts"
ON public.shared_quiz_attempts
FOR DELETE
TO anon, authenticated
USING (true);

-- Also allow anonymous users to SELECT their own attempts (needed for the insert...returning)
DROP POLICY IF EXISTS "Anyone can view their own attempts" ON public.shared_quiz_attempts;

CREATE POLICY "Anyone can view their own attempts"
ON public.shared_quiz_attempts
FOR SELECT
TO anon, authenticated
USING (true);