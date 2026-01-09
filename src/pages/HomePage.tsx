import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Trophy, CheckSquare, Shuffle, ChevronRight, Clock, Play, MessageSquare, Calendar, Loader2, Plus } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAllRememberItems, useAllTasks, useAllQuizItems, useAllRemindersCombined, RememberItemWithVideo, TaskWithVideo, CombinedReminder, useSoftDeleteReminder, useUndoDeleteReminder } from '@/hooks/useHomeData';
import { ReminderCard } from '@/components/home/ReminderCard';
import { CombinedTasksSheet } from '@/components/home/CombinedTasksSheet';
import { DailyQuizSheet } from '@/components/home/DailyQuizSheet';
import { TextMeDialog } from '@/components/home/TextMeDialog';
import { AddReminderDialog } from '@/components/manual/AddReminderDialog';
import { AddTodoDialog } from '@/components/manual/AddTodoDialog';
import { toast } from 'sonner';

interface HomePageProps {
  onLogout: () => void;
}

// Seeded random for daily quiz consistency
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function shuffleWithSeed<T>(array: T[], seed: number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function HomePage({ onLogout }: HomePageProps) {
  const navigate = useNavigate();
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [displayCount, setDisplayCount] = useState(5);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [textMeOpen, setTextMeOpen] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<CombinedReminder | null>(null);
  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  
  // Delete undo state
  const [pendingDeletes, setPendingDeletes] = useState<Map<string, { reminder: CombinedReminder; index: number; timeoutId: NodeJS.Timeout }>>(new Map());

  const { data: rememberItems = [], isLoading: loadingReminders } = useAllRemindersCombined();
  const { data: allTasks = [], isLoading: loadingTasks } = useAllTasks();
  const { data: quizItems = [], isLoading: loadingQuiz } = useAllQuizItems();
  
  const softDeleteMutation = useSoftDeleteReminder();
  const undoDeleteMutation = useUndoDeleteReminder();

  // Shuffle reminders for display
  const shuffledReminders = useMemo(() => {
    return shuffleWithSeed(rememberItems, shuffleSeed);
  }, [rememberItems, shuffleSeed]);

  const displayedReminders = shuffledReminders.slice(0, displayCount);

  // Get today's date as seed for daily quiz
  const todaySeed = useMemo(() => {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  }, []);

  // Daily quiz questions (randomized by date)
  const dailyQuizQuestions = useMemo(() => {
    const filtered = selectedVideos.length > 0
      ? quizItems.filter(q => selectedVideos.includes(q.video_id))
      : quizItems;
    return shuffleWithSeed(filtered, todaySeed).slice(0, 10);
  }, [quizItems, selectedVideos, todaySeed]);

  // Get unique videos that have quiz items
  const videosWithQuiz = useMemo(() => {
    const videoMap = new Map<string, { id: string; title: string }>();
    quizItems.forEach(q => {
      if (!videoMap.has(q.video_id)) {
        videoMap.set(q.video_id, { id: q.video_id, title: q.video_title });
      }
    });
    return Array.from(videoMap.values());
  }, [quizItems]);

  // Task counts
  const pendingTasks = allTasks.filter(t => t.status === 'pending').length;
  const completedTasks = allTasks.filter(t => t.status === 'completed').length;
  const overdueTasks = allTasks.filter(t => {
    if (!t.due_date || t.status === 'completed') return false;
    return new Date(t.due_date) < new Date();
  }).length;

  const handleShuffle = () => {
    setShuffleSeed(Date.now());
    setDisplayCount(5);
  };

  const handleLoadMore = () => {
    setDisplayCount(prev => Math.min(prev + 5, shuffledReminders.length));
  };

  const handleOpenVideo = (videoId: string, timestamp?: number) => {
    navigate(`/video/${videoId}${timestamp ? `?t=${timestamp}` : ''}`);
  };

  const handleTextMe = (reminder: CombinedReminder) => {
    setSelectedReminder(reminder);
    setTextMeOpen(true);
  };

  const handleDeleteReminder = useCallback((reminder: CombinedReminder, index: number) => {
    // Find current index in shuffled list for restore position
    const currentIndex = shuffledReminders.findIndex(r => r.id === reminder.id);
    
    // Perform soft delete
    softDeleteMutation.mutate(
      { id: reminder.id, isManual: reminder.is_manual },
      {
        onSuccess: () => {
          // Store for undo
          const timeoutId = setTimeout(() => {
            // Remove from pending after 30 seconds
            setPendingDeletes(prev => {
              const next = new Map(prev);
              next.delete(reminder.id);
              return next;
            });
          }, 30000);
          
          setPendingDeletes(prev => {
            const next = new Map(prev);
            next.set(reminder.id, { reminder, index: currentIndex, timeoutId });
            return next;
          });
          
          // Show toast with undo
          toast('Reminder deleted', {
            action: {
              label: 'Undo',
              onClick: () => handleUndoDelete(reminder.id, reminder.is_manual),
            },
            duration: 30000,
          });
        },
      }
    );
  }, [shuffledReminders, softDeleteMutation]);

  const handleUndoDelete = useCallback((id: string, isManual: boolean) => {
    // Clear timeout
    const pending = pendingDeletes.get(id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      setPendingDeletes(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
    
    // Undo the delete
    undoDeleteMutation.mutate(
      { id, isManual },
      {
        onSuccess: () => {
          toast.success('Reminder restored');
        },
      }
    );
  }, [pendingDeletes, undoDeleteMutation]);

  const handleStartDailyQuiz = () => {
    setSelectedVideos([]);
    setQuizOpen(true);
  };

  const handlePickVideos = () => {
    // Toggle to show video picker
    setSelectedVideos([]);
    setQuizOpen(true);
  };

  const isLoading = loadingReminders || loadingTasks || loadingQuiz;

  return (
    <PageLayout onLogout={onLogout}>
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Today</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your daily learning hub
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Quick Add Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 text-remember border-remember/30 hover:bg-remember/10"
                onClick={() => setAddReminderOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Reminder
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-1.5 text-todo border-todo/30 hover:bg-todo/10"
                onClick={() => setAddTodoOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add To Do
              </Button>
            </div>

            {/* Section 1: Today's Reminders */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-remember" />
                  <h2 className="text-lg font-semibold">Today's Reminders</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={handleShuffle}>
                  <Shuffle className="h-4 w-4 mr-1" />
                  Shuffle
                </Button>
              </div>

              {displayedReminders.length > 0 ? (
                <div className="space-y-3">
                  {displayedReminders.map((reminder, index) => (
                    <ReminderCard
                      key={reminder.id}
                      reminder={reminder}
                      index={index}
                      onOpenVideo={() => handleOpenVideo(reminder.video_id, reminder.timestamp_seconds)}
                      onTextMe={() => handleTextMe(reminder)}
                      onDelete={() => handleDeleteReminder(reminder, index)}
                    />
                  ))}

                  {displayCount < shuffledReminders.length && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={handleLoadMore}
                    >
                      Load more ({shuffledReminders.length - displayCount} remaining)
                    </Button>
                  )}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-8 text-center">
                    <Brain className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">No reminders yet</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">
                      Add "Remember" highlights to your videos
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Section 2: Daily Quiz */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Daily Quiz</h2>
              </div>

              <Card className="card-elevated">
                <CardContent className="p-5">
                  {quizItems.length > 0 ? (
                    <>
                      <div className="text-center mb-4">
                        <Trophy className="h-10 w-10 text-primary mx-auto mb-2" />
                        <h3 className="font-semibold text-lg">Ready to test yourself?</h3>
                        <p className="text-sm text-muted-foreground">
                          {quizItems.length} questions available from {videosWithQuiz.length} videos
                        </p>
                      </div>
                      <div className="flex gap-3">
                        <Button
                          variant="glow"
                          className="flex-1"
                          onClick={handleStartDailyQuiz}
                        >
                          <Play className="h-4 w-4" />
                          Start Daily Quiz
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={handlePickVideos}
                        >
                          Pick Videos
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Trophy className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-muted-foreground">No quiz questions yet</p>
                      <p className="text-sm text-muted-foreground/70 mt-1">
                        Add "Remember" items to generate quizzes
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* Section 3: Tasks */}
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5 text-todo" />
                <h2 className="text-lg font-semibold">Tasks</h2>
              </div>

              <Card 
                className="card-interactive cursor-pointer"
                onClick={() => setTasksOpen(true)}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold">Combined Tasks</h3>
                      <p className="text-sm text-muted-foreground">
                        View all tasks from your videos
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                  
                  <div className="flex gap-3 mt-4">
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {pendingTasks} pending
                    </Badge>
                    {overdueTasks > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        {overdueTasks} overdue
                      </Badge>
                    )}
                    <Badge variant="secondary" className="gap-1">
                      {completedTasks} done
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </section>
          </>
        )}
      </div>

      {/* Sheets & Dialogs */}
      <CombinedTasksSheet 
        open={tasksOpen} 
        onOpenChange={setTasksOpen} 
        tasks={allTasks}
        onOpenVideo={handleOpenVideo}
      />
      
      <DailyQuizSheet
        open={quizOpen}
        onOpenChange={setQuizOpen}
        questions={dailyQuizQuestions}
        allVideos={videosWithQuiz}
        selectedVideos={selectedVideos}
        onSelectVideos={setSelectedVideos}
        quizItems={quizItems}
        todaySeed={todaySeed}
      />

      <TextMeDialog
        open={textMeOpen}
        onOpenChange={setTextMeOpen}
        reminder={selectedReminder}
      />

      <AddReminderDialog
        open={addReminderOpen}
        onOpenChange={setAddReminderOpen}
      />

      <AddTodoDialog
        open={addTodoOpen}
        onOpenChange={setAddTodoOpen}
      />
    </PageLayout>
  );
}
