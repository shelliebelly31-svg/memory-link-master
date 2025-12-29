import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Brain, Trophy, CheckSquare } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { YouTubePlayer } from '@/components/video/YouTubePlayer';
import { TranscriptView } from '@/components/video/TranscriptView';
import { RememberTab } from '@/components/video/RememberTab';
import { QuizTab } from '@/components/video/QuizTab';
import { TodoTab } from '@/components/video/TodoTab';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  mockVideos,
  mockTranscriptSegments,
  mockHighlights,
  mockRememberItems,
  mockTasks,
  mockQuizItems,
} from '@/lib/mockData';
import { HighlightType, Highlight } from '@/types';
import { cn } from '@/lib/utils';

interface VideoDetailPageProps {
  onLogout: () => void;
}

export default function VideoDetailPage({ onLogout }: VideoDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [highlights, setHighlights] = useState(mockHighlights);
  const [rememberItems, setRememberItems] = useState(mockRememberItems);
  const [tasks, setTasks] = useState(mockTasks);
  const [activeTab, setActiveTab] = useState('transcript');

  const video = mockVideos.find(v => v.id === id);
  const segments = mockTranscriptSegments.filter(s => s.video_id === id);

  const aiSuggestedHighlights = useMemo(
    () => highlights.filter(h => h.type === 'ai_suggested' && h.video_id === id),
    [highlights, id]
  );

  if (!video) {
    return (
      <PageLayout onLogout={onLogout}>
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <p className="text-muted-foreground">Video not found</p>
            <Button variant="link" onClick={() => navigate('/library')}>
              Back to Library
            </Button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const handleAddHighlight = (
    type: HighlightType,
    text: string,
    startSeconds: number,
    endSeconds: number
  ) => {
    const newHighlight: Highlight = {
      id: `h${Date.now()}`,
      video_id: video.id,
      user_id: 'user-1',
      type,
      start_seconds: startSeconds,
      end_seconds: endSeconds,
      selected_text: text,
      created_at: new Date().toISOString(),
    };
    
    setHighlights([...highlights, newHighlight]);
    
    toast({
      title: `Added to ${type === 'remember' ? 'Remember' : type === 'todo' ? 'To Do' : 'AI Suggested'}`,
      description: text.slice(0, 50) + '...',
    });

    // If it's a remember highlight, create a remember item
    if (type === 'remember') {
      const newRememberItem = {
        id: `r${Date.now()}`,
        highlight_id: newHighlight.id,
        user_id: 'user-1',
        summary: text.slice(0, 80) + '...',
        key_points: ['Key insight from this section'],
        video_title: video.title,
        video_id: video.id,
        timestamp_seconds: startSeconds,
        review_schedule: null,
        last_reviewed_at: null,
        created_at: new Date().toISOString(),
      };
      setRememberItems([...rememberItems, newRememberItem]);
    }

    // If it's a todo highlight, create a task
    if (type === 'todo') {
      const newTask = {
        id: `t${Date.now()}`,
        highlight_id: newHighlight.id,
        user_id: 'user-1',
        title: text.slice(0, 60),
        description: '',
        video_title: video.title,
        video_id: video.id,
        timestamp_seconds: startSeconds,
        due_date: null,
        status: 'pending' as const,
        order_index: tasks.length,
        created_at: new Date().toISOString(),
      };
      setTasks([...tasks, newTask]);
    }
  };

  const handleConvertToRemember = (highlightId: string) => {
    const highlight = highlights.find(h => h.id === highlightId);
    if (!highlight) return;

    // Update highlight type
    setHighlights(highlights.map(h => 
      h.id === highlightId ? { ...h, type: 'remember' as HighlightType } : h
    ));

    // Create remember item
    const newRememberItem = {
      id: `r${Date.now()}`,
      highlight_id: highlightId,
      user_id: 'user-1',
      summary: highlight.selected_text.slice(0, 80) + '...',
      key_points: ['AI-generated key point from this section'],
      video_title: video.title,
      video_id: video.id,
      timestamp_seconds: highlight.start_seconds,
      review_schedule: null,
      last_reviewed_at: null,
      created_at: new Date().toISOString(),
    };
    setRememberItems([...rememberItems, newRememberItem]);

    toast({
      title: 'Converted to Remember',
      description: 'Item added to your memory bank',
    });
  };

  const handleConvertToTask = (highlightId: string) => {
    const highlight = highlights.find(h => h.id === highlightId);
    if (!highlight) return;

    // Update highlight type
    setHighlights(highlights.map(h => 
      h.id === highlightId ? { ...h, type: 'todo' as HighlightType } : h
    ));

    // Create task
    const newTask = {
      id: `t${Date.now()}`,
      highlight_id: highlightId,
      user_id: 'user-1',
      title: highlight.selected_text.slice(0, 60),
      description: '',
      video_title: video.title,
      video_id: video.id,
      timestamp_seconds: highlight.start_seconds,
      due_date: null,
      status: 'pending' as const,
      order_index: tasks.length,
      created_at: new Date().toISOString(),
    };
    setTasks([...tasks, newTask]);

    toast({
      title: 'Task Created',
      description: 'Added to your To Do list',
    });
  };

  const handleSetSchedule = (itemId: string, schedule: 'daily' | 'weekly' | 'monthly' | null) => {
    setRememberItems(rememberItems.map(item =>
      item.id === itemId ? { ...item, review_schedule: schedule } : item
    ));
    toast({
      title: schedule ? 'Review scheduled' : 'Schedule removed',
      description: schedule ? `You'll be reminded ${schedule}` : 'No more reminders for this item',
    });
  };

  const handleToggleTaskStatus = (taskId: string) => {
    setTasks(tasks.map(task =>
      task.id === taskId
        ? { ...task, status: task.status === 'completed' ? 'pending' : 'completed' }
        : task
    ));
  };

  const handleJumpToTimestamp = (seconds: number) => {
    // In a real app, this would control the YouTube player
    toast({
      title: 'Jumping to timestamp',
      description: `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`,
    });
  };

  const handleRegenerateQuestion = (questionId: string) => {
    toast({
      title: 'Regenerating question',
      description: 'A new question will be generated shortly',
    });
  };

  return (
    <PageLayout onLogout={onLogout}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-20">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate('/library')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold line-clamp-1 flex-1">{video.title}</h1>
        </div>

        {/* Video Player */}
        <div className="px-4 pt-4">
          <YouTubePlayer videoId={video.youtube_id} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <div className="sticky top-[57px] z-10 bg-background/95 backdrop-blur-sm border-b border-border/50">
            <TabsList className="w-full justify-start px-4 py-6 h-auto bg-transparent gap-1">
              <TabsTrigger
                value="transcript"
                className={cn(
                  "flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                )}
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Transcript</span>
              </TabsTrigger>
              <TabsTrigger
                value="remember"
                className="flex-1 gap-1.5 data-[state=active]:bg-remember data-[state=active]:text-remember-foreground"
              >
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">Remember</span>
              </TabsTrigger>
              <TabsTrigger
                value="quiz"
                className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">Quiz</span>
              </TabsTrigger>
              <TabsTrigger
                value="todo"
                className="flex-1 gap-1.5 data-[state=active]:bg-todo data-[state=active]:text-todo-foreground"
              >
                <CheckSquare className="h-4 w-4" />
                <span className="hidden sm:inline">To Do</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-4 py-4 pb-8">
            <TabsContent value="transcript" className="mt-0">
              <TranscriptView
                segments={segments}
                highlights={highlights.filter(h => h.video_id === id)}
                onAddHighlight={handleAddHighlight}
              />
            </TabsContent>
            
            <TabsContent value="remember" className="mt-0">
              <RememberTab
                rememberItems={rememberItems.filter(r => r.video_id === id)}
                aiSuggestedHighlights={aiSuggestedHighlights}
                onConvertToRemember={handleConvertToRemember}
                onSetSchedule={handleSetSchedule}
                onJumpToTimestamp={handleJumpToTimestamp}
              />
            </TabsContent>
            
            <TabsContent value="quiz" className="mt-0">
              <QuizTab
                quizItems={mockQuizItems.filter(q => q.video_id === id)}
                onRegenerateQuestion={handleRegenerateQuestion}
              />
            </TabsContent>
            
            <TabsContent value="todo" className="mt-0">
              <TodoTab
                tasks={tasks.filter(t => t.video_id === id)}
                aiSuggestedHighlights={aiSuggestedHighlights}
                onConvertToTask={handleConvertToTask}
                onToggleTaskStatus={handleToggleTaskStatus}
                onJumpToTimestamp={handleJumpToTimestamp}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </PageLayout>
  );
}
