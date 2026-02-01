-- Drop the existing restrictive policy and recreate it to allow anonymous access
DROP POLICY IF EXISTS "Anyone can view active shared quizzes" ON public.shared_quizzes;

-- Create a policy that allows ANYONE (including anonymous/unauthenticated users) to view active shared quizzes
CREATE POLICY "Public can view active shared quizzes"
ON public.shared_quizzes
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Also ensure shared_quiz_attempts allows anonymous inserts
DROP POLICY IF EXISTS "Anyone can insert quiz attempts" ON public.shared_quiz_attempts;

CREATE POLICY "Anyone can insert quiz attempts"
ON public.shared_quiz_attempts
FOR INSERT
TO anon, authenticated
WITH CHECK (true);