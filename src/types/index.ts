export type HighlightType = 'remember' | 'todo' | 'ai_suggested';

export type VideoStatus = 'queued' | 'transcribing' | 'ready' | 'failed';

export interface Video {
  id: string;
  user_id: string;
  youtube_url: string;
  youtube_id: string;
  title: string;
  thumbnail_url: string;
  duration_seconds: number;
  status: VideoStatus;
  created_at: string;
  updated_at: string;
}

export interface TranscriptSegment {
  id: string;
  video_id: string;
  start_seconds: number;
  end_seconds: number;
  text: string;
}

export interface Highlight {
  id: string;
  video_id: string;
  user_id: string;
  type: HighlightType;
  start_seconds: number;
  end_seconds: number;
  selected_text: string;
  created_at: string;
}

export interface RememberItem {
  id: string;
  highlight_id: string;
  user_id: string;
  summary: string;
  key_points: string[];
  video_title: string;
  video_id: string;
  timestamp_seconds: number;
  review_schedule: 'daily' | 'weekly' | 'monthly' | null;
  last_reviewed_at: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  highlight_id: string;
  user_id: string;
  title: string;
  description: string;
  video_title: string;
  video_id: string;
  timestamp_seconds: number;
  due_date: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  order_index: number;
  created_at: string;
}

export interface QuizItem {
  id: string;
  remember_item_id: string;
  user_id: string;
  question: string;
  options: string[];
  correct_answer: number;
  explanation: string;
  times_answered: number;
  times_correct: number;
  video_id: string;
  video_title: string;
  topic: string;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  user_id: string;
  video_id: string | null;
  topic: string | null;
  score: number;
  total_questions: number;
  created_at: string;
}
