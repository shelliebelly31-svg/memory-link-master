import { Video, TranscriptSegment, Highlight, RememberItem, Task, QuizItem } from '@/types';

export const mockVideos: Video[] = [
  {
    id: '1',
    user_id: 'user-1',
    youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    youtube_id: 'dQw4w9WgXcQ',
    title: 'Introduction to Machine Learning',
    thumbnail_url: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=480&h=270&fit=crop',
    duration_seconds: 1245,
    status: 'ready',
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:35:00Z',
  },
  {
    id: '2',
    user_id: 'user-1',
    youtube_url: 'https://www.youtube.com/watch?v=abc123',
    youtube_id: 'abc123',
    title: 'React Best Practices 2024',
    thumbnail_url: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=480&h=270&fit=crop',
    duration_seconds: 892,
    status: 'ready',
    created_at: '2024-01-14T14:20:00Z',
    updated_at: '2024-01-14T14:25:00Z',
  },
  {
    id: '3',
    user_id: 'user-1',
    youtube_url: 'https://www.youtube.com/watch?v=xyz789',
    youtube_id: 'xyz789',
    title: 'Building APIs with Node.js',
    thumbnail_url: 'https://images.unsplash.com/photo-1627398242454-45a1465c2479?w=480&h=270&fit=crop',
    duration_seconds: 2100,
    status: 'transcribing',
    created_at: '2024-01-16T09:00:00Z',
    updated_at: '2024-01-16T09:00:00Z',
  },
];

export const mockTranscriptSegments: TranscriptSegment[] = [
  { id: '1', video_id: '1', start_seconds: 0, end_seconds: 15, text: "Welcome to this introduction to machine learning. Today we're going to cover the fundamental concepts that will help you understand how AI systems learn from data." },
  { id: '2', video_id: '1', start_seconds: 15, end_seconds: 35, text: "Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed." },
  { id: '3', video_id: '1', start_seconds: 35, end_seconds: 55, text: "The three main types of machine learning are supervised learning, unsupervised learning, and reinforcement learning. Each has its own use cases and applications." },
  { id: '4', video_id: '1', start_seconds: 55, end_seconds: 75, text: "In supervised learning, we train models using labeled data. The algorithm learns to map inputs to outputs based on example pairs provided during training." },
  { id: '5', video_id: '1', start_seconds: 75, end_seconds: 95, text: "Unsupervised learning finds hidden patterns in data without labeled examples. Common techniques include clustering and dimensionality reduction." },
  { id: '6', video_id: '1', start_seconds: 95, end_seconds: 115, text: "Reinforcement learning involves an agent learning to make decisions by interacting with an environment and receiving rewards or penalties." },
  { id: '7', video_id: '1', start_seconds: 115, end_seconds: 135, text: "Key concepts include features, labels, training data, validation data, and test data. Understanding these is essential for any ML practitioner." },
  { id: '8', video_id: '1', start_seconds: 135, end_seconds: 155, text: "The training process involves feeding data through a model, calculating errors, and adjusting parameters to minimize those errors over time." },
];

export const mockHighlights: Highlight[] = [
  {
    id: 'h1',
    video_id: '1',
    user_id: 'user-1',
    type: 'remember',
    start_seconds: 15,
    end_seconds: 35,
    selected_text: 'Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.',
    created_at: '2024-01-15T11:00:00Z',
  },
  {
    id: 'h2',
    video_id: '1',
    user_id: 'user-1',
    type: 'todo',
    start_seconds: 95,
    end_seconds: 115,
    selected_text: 'Reinforcement learning involves an agent learning to make decisions by interacting with an environment.',
    created_at: '2024-01-15T11:05:00Z',
  },
  {
    id: 'h3',
    video_id: '1',
    user_id: 'user-1',
    type: 'ai_suggested',
    start_seconds: 35,
    end_seconds: 55,
    selected_text: 'The three main types of machine learning are supervised learning, unsupervised learning, and reinforcement learning.',
    created_at: '2024-01-15T11:02:00Z',
  },
];

export const mockRememberItems: RememberItem[] = [
  {
    id: 'r1',
    highlight_id: 'h1',
    user_id: 'user-1',
    summary: 'Core definition of machine learning and its relationship to AI',
    key_points: [
      'ML is a subset of AI',
      'Computers learn from experience',
      'No explicit programming required',
    ],
    video_title: 'Introduction to Machine Learning',
    video_id: '1',
    timestamp_seconds: 15,
    review_schedule: 'weekly',
    last_reviewed_at: '2024-01-20T10:00:00Z',
    created_at: '2024-01-15T11:00:00Z',
  },
];

export const mockTasks: Task[] = [
  {
    id: 't1',
    highlight_id: 'h2',
    user_id: 'user-1',
    title: 'Research reinforcement learning frameworks',
    description: 'Look into OpenAI Gym, Stable Baselines, and RLlib for implementing RL algorithms',
    video_title: 'Introduction to Machine Learning',
    video_id: '1',
    timestamp_seconds: 95,
    due_date: '2024-02-01',
    status: 'pending',
    order_index: 0,
    created_at: '2024-01-15T11:05:00Z',
  },
  {
    id: 't2',
    highlight_id: 'h2',
    user_id: 'user-1',
    title: 'Build a simple RL agent',
    description: 'Create a basic Q-learning agent for a simple environment',
    video_title: 'Introduction to Machine Learning',
    video_id: '1',
    timestamp_seconds: 95,
    due_date: '2024-02-15',
    status: 'pending',
    order_index: 1,
    created_at: '2024-01-15T11:10:00Z',
  },
];

export const mockQuizItems: QuizItem[] = [
  {
    id: 'q1',
    remember_item_id: 'r1',
    user_id: 'user-1',
    question: 'What is machine learning a subset of?',
    options: ['Data Science', 'Artificial Intelligence', 'Computer Vision', 'Robotics'],
    correct_answer: 1,
    explanation: 'Machine learning is a subset of artificial intelligence that enables computers to learn from experience.',
    times_answered: 3,
    times_correct: 2,
    video_id: '1',
    video_title: 'Introduction to Machine Learning',
    topic: 'ML Fundamentals',
    created_at: '2024-01-15T11:15:00Z',
  },
  {
    id: 'q2',
    remember_item_id: 'r1',
    user_id: 'user-1',
    question: 'Which type of machine learning uses labeled data for training?',
    options: ['Unsupervised Learning', 'Reinforcement Learning', 'Supervised Learning', 'Transfer Learning'],
    correct_answer: 2,
    explanation: 'Supervised learning trains models using labeled data where the algorithm learns to map inputs to outputs.',
    times_answered: 2,
    times_correct: 1,
    video_id: '1',
    video_title: 'Introduction to Machine Learning',
    topic: 'ML Fundamentals',
    created_at: '2024-01-15T11:20:00Z',
  },
];

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
