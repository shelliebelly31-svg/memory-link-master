import { useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Brain, Trophy, CheckSquare, AlertCircle, Plus } from 'lucide-react';
import { MilestoneDialog } from '@/components/todo/MilestoneDialog';
import { PageLayout } from '@/components/layout/PageLayout';
import { YouTubePlayer } from '@/components/video/YouTubePlayer';
import { TranscriptView } from '@/components/video/TranscriptView';
import { RememberTab } from '@/components/video/RememberTab';
import { QuizTab } from '@/components/video/QuizTab';
import { TodoTab } from '@/components/video/TodoTab';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AddReminderSheet } from '@/components/manual/AddReminderSheet';
import { AddTodoSheet } from '@/components/manual/AddTodoSheet';
import { 
  useVideo, 
  useTranscriptSegments, 
  useHighlights, 
  useRememberItems, 
  useTasks, 
  useQuizItems,
  useAddHighlight,
  useUpdateRememberSchedule,
  useUpdateTaskStatus,
  useConvertHighlight,
  getDisplayStatus,
} from '@/hooks/useVideos';

import { HighlightType } from '@/types';
import { cn } from '@/lib/utils';

interface VideoDetailPageProps {
  onLogout: () => void;
}

export default function VideoDetailPage({ onLogout }: VideoDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('transcript');
  const [showDebug, setShowDebug] = useState(false);
  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [addTodoOpen, setAddTodoOpen] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState<string | undefined>();
  const [originalSelectedText, setOriginalSelectedText] = useState<string | undefined>();
  const [prefillTimestamp, setPrefillTimestamp] = useState<number | undefined>();
  const [prefillEndTimestamp, setPrefillEndTimestamp] = useState<number | undefined>();
  const [milestoneCount, setMilestoneCount] = useState<number | null>(null);
  const [isResegmenting, setIsResegmenting] = useState(false);
  const [isRefetchingCaptions, setIsRefetchingCaptions] = useState(false);
  const [isFixingTimestamps, setIsFixingTimestamps] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Ref for getting current playback time
  const playerTimeRef = useRef<(() => number | null) | null>(null);
  const playerControlsRef = useRef<{ seekTo: (s: number) => void; pause: () => void; play: () => void } | null>(null);

  // Fetch real data from database
  const { data: video, isLoading: videoLoading, error: videoError } = useVideo(id || '');
  const { data: segments = [], isLoading: segmentsLoading } = useTranscriptSegments(id || '');
  const { data: highlights = [] } = useHighlights(id || '');
  const { data: rememberItems = [] } = useRememberItems(id || '');
  const { data: tasks = [] } = useTasks(id || '');
  const { data: quizItems = [] } = useQuizItems(id || '');

  // Mutations
  const addHighlightMutation = useAddHighlight();
  const updateScheduleMutation = useUpdateRememberSchedule();
  const updateTaskMutation = useUpdateTaskStatus();
  const convertHighlightMutation = useConvertHighlight();
  const queryClient = useQueryClient();

  // Callback to refresh highlights after AI suggestions update
  const handleHighlightsUpdated = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['highlights', id] });
    queryClient.invalidateQueries({ queryKey: ['video', id] });
  }, [queryClient, id]);

  const aiSuggestedHighlights = useMemo(
    () => highlights.filter(h => h.type === 'ai_suggested'),
    [highlights]
  );

  // Handler for opening reminder sheet from transcript selection
  const handleOpenReminderFromSelection = useCallback((text: string, timestamp: number, endTimestamp?: number) => {
    setPrefillTitle(text);
    setOriginalSelectedText(text);
    setPrefillTimestamp(timestamp);
    setPrefillEndTimestamp(endTimestamp);
    setAddReminderOpen(true);
  }, []);

  // Handler for opening todo sheet from transcript selection
  const handleOpenTodoFromSelection = useCallback((text: string, timestamp: number, endTimestamp?: number) => {
    setPrefillTitle(text);
    setOriginalSelectedText(text);
    setPrefillTimestamp(timestamp);
    setPrefillEndTimestamp(endTimestamp);
    setAddTodoOpen(true);
  }, []);

  // Clear prefill when manually opening sheets
  const handleOpenReminderManual = useCallback(() => {
    setPrefillTitle(undefined);
    setOriginalSelectedText(undefined);
    setPrefillTimestamp(undefined);
    setPrefillEndTimestamp(undefined);
    setAddReminderOpen(true);
  }, []);

  const handleOpenTodoManual = useCallback(() => {
    setPrefillTitle(undefined);
    setOriginalSelectedText(undefined);
    setPrefillTimestamp(undefined);
    setPrefillEndTimestamp(undefined);
    setAddTodoOpen(true);
  }, []);

  const handleResegment = useCallback(async () => {
    if (!id) return;
    setIsResegmenting(true);
    try {
      const { data, error } = await supabase.functions.invoke('re-segment-transcript', {
        body: { video_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Transcript re-segmented',
        description: `Split into ${data.new_count} segments`,
      });
      queryClient.invalidateQueries({ queryKey: ['transcript_segments', id] });
    } catch (err: any) {
      toast({
        title: 'Re-segment failed',
        description: err.message || 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsResegmenting(false);
    }
  }, [id, queryClient, toast]);

  const handleRefetchCaptions = useCallback(async () => {
    if (!id) return;
    setIsRefetchingCaptions(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-video', {
        body: { refetch_captions_video_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'YouTube captions fetched',
        description: `Loaded ${data.segment_count} segments with accurate timestamps`,
      });
      queryClient.invalidateQueries({ queryKey: ['transcript_segments', id] });
    } catch (err: any) {
      toast({
        title: 'Could not fetch YouTube captions',
        description: err.message || 'Captions may not be available for this video',
        variant: 'destructive',
      });
    } finally {
      setIsRefetchingCaptions(false);
    }
  }, [id, queryClient, toast]);

  const handleFixTimestampsViaAudio = useCallback(async (file: File) => {
    if (!id) return;
    if (file.size > 25 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 25MB',
        variant: 'destructive',
      });
      return;
    }
    setIsFixingTimestamps(true);
    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('video_id', id);

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Transcription failed');

      toast({
        title: 'Audio transcribed',
        description: `Created ${result.segments?.length || 0} segments with accurate timestamps`,
      });
      queryClient.invalidateQueries({ queryKey: ['transcript_segments', id] });
      queryClient.invalidateQueries({ queryKey: ['video', id] });
    } catch (err: any) {
      toast({
        title: 'Transcription failed',
        description: err.message || 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsFixingTimestamps(false);
    }
  }, [id, queryClient, toast]);

  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size > 0) {
          const file = new File([blob], 'recorded-audio.webm', { type: 'audio/webm' });
          await handleFixTimestampsViaAudio(file);
        }
      };
      
      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      
      // Auto-play the video
      playerControlsRef.current?.play();
      
      toast({ title: 'Recording started', description: 'Play the video — your mic is capturing the audio' });
    } catch (err: any) {
      toast({
        title: 'Microphone access denied',
        description: 'Please allow microphone access to record video audio',
        variant: 'destructive',
      });
    }
  }, [handleFixTimestampsViaAudio, toast]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    playerControlsRef.current?.pause();
  }, []);

  const handleReprocessTranscript = useCallback(async () => {
    if (!id) return;
    setIsReprocessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('add-video', {
        body: { retry_video_id: id, retry_from_step: 'captions' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({
        title: 'Re-processing transcript',
        description: 'Running quality check with audio transcription fallback...',
      });
      queryClient.invalidateQueries({ queryKey: ['video', id] });
      queryClient.invalidateQueries({ queryKey: ['transcript_segments', id] });
    } catch (err: any) {
      toast({
        title: 'Re-process failed',
        description: err.message || 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsReprocessing(false);
    }
  }, [id, queryClient, toast]);

  // Loading state
  if (videoLoading || segmentsLoading) {
    return (
      <PageLayout onLogout={onLogout}>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  // Video not found
  if (!video) {
    return (
      <PageLayout onLogout={onLogout}>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <p className="text-muted-foreground">Video not found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              ID: <code className="bg-muted px-1 rounded">{id}</code>
            </p>
          </div>
          <Link to="/library">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Library
            </Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  const displayStatus = getDisplayStatus(video.status);

  const handleAddHighlight = (
    type: HighlightType,
    text: string,
    startSeconds: number,
    endSeconds: number
  ) => {
    addHighlightMutation.mutate({
      videoId: video.id,
      type,
      startSeconds,
      endSeconds,
      selectedText: text,
    });
  };

  const handleConvertToRemember = (highlightId: string) => {
    convertHighlightMutation.mutate({
      highlightId,
      toType: 'remember',
      videoId: video.id,
    });
  };

  const handleConvertToTask = (highlightId: string) => {
    convertHighlightMutation.mutate({
      highlightId,
      toType: 'todo',
      videoId: video.id,
    });
  };

  const handleSetSchedule = (itemId: string, schedule: 'daily' | 'weekly' | 'monthly' | null) => {
    updateScheduleMutation.mutate({
      itemId,
      schedule,
      videoId: video.id,
    });
    toast({
      title: schedule ? 'Review scheduled' : 'Schedule removed',
      description: schedule ? `You'll be reminded ${schedule}` : 'No more reminders for this item',
    });
  };

  const handleToggleTaskStatus = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      updateTaskMutation.mutate({
        taskId,
        status: newStatus,
        videoId: video.id,
      }, {
        onSuccess: (data) => {
          if (newStatus === 'completed' && data?.completedCount && data.completedCount % 10 === 0) {
            setMilestoneCount(data.completedCount);
          }
        },
      });
    }
  };

  const handleJumpToTimestamp = (seconds: number) => {
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

  // Map remember items to include video_title for display
  const rememberItemsWithTitle = rememberItems.map(item => ({
    ...item,
    video_title: video.title,
  }));

  // Map tasks to include video_title for display  
  const tasksWithTitle = tasks.map(task => ({
    ...task,
    video_title: video.title,
  }));

  // Check if there's a selection active (for hiding top buttons)
  const hasSelection = false; // This would need to be lifted from TranscriptView if needed

  return (
    <PageLayout onLogout={onLogout}>
      <div className="flex flex-col">
        {/* Debug Panel */}
        {showDebug && (
          <div className="bg-muted/50 border-b border-border px-4 py-2 text-xs font-mono">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-muted-foreground">Debug Panel</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-5 text-xs"
                onClick={() => setShowDebug(false)}
              >
                Hide
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
              <div>Route ID: <code className="text-foreground">{id}</code></div>
              <div>Loaded Video ID: <code className="text-foreground">{video.id}</code></div>
              <div>Status: <code className="text-foreground">{video.status}</code></div>
              <div>Display Status: <code className="text-foreground">{displayStatus}</code></div>
              <div>Segments Count: <code className="text-foreground">{segments.length}</code></div>
              <div>Highlights Count: <code className="text-foreground">{highlights.length}</code></div>
              <div>Failed Step: <code className="text-foreground">{video.failed_step || 'none'}</code></div>
              <div className="col-span-2">Error: <code className="text-foreground">{video.error_message || 'none'}</code></div>
            </div>
          </div>
        )}

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
          {!showDebug && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs opacity-50"
              onClick={() => setShowDebug(true)}
            >
              Debug
            </Button>
          )}
        </div>

        {/* Video Player */}
        {video.youtube_id && !video.youtube_id.startsWith('manual-') && (
          <div className="px-4 pt-4">
            <YouTubePlayer 
              videoId={video.youtube_id} 
              onTimeRef={(getTime) => { playerTimeRef.current = getTime; }}
              onPlayerControls={(controls) => { playerControlsRef.current = controls; }}
            />
          </div>
        )}


        {/* No transcript CTA */}
        {segments.length === 0 && (
          <div className="px-4 py-8">
            <div className="bg-muted/50 border border-dashed border-border rounded-lg p-6 text-center">
              <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-semibold mb-1">No transcript available</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {video.status === 'needs_attention' 
                  ? video.error_message || 'Add a transcript to unlock all features'
                  : 'Add a transcript to unlock all features'}
              </p>
              <Button onClick={() => navigate(`/video/${id}/add-transcript`)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Transcript
              </Button>
            </div>
          </div>
        )}

        {/* Tabs - only show if we have segments */}
        {segments.length > 0 && (
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
                  segments={segments.map(s => ({
                    id: s.id,
                    video_id: s.video_id,
                    start_seconds: s.start_seconds,
                    end_seconds: s.end_seconds,
                    text: s.text,
                  }))}
                  highlights={highlights}
                  videoId={video.id}
                  aiSuggestionsGenerated={video.ai_suggestions_generated || false}
                  onAddHighlight={handleAddHighlight}
                  onHighlightsUpdated={handleHighlightsUpdated}
                  onOpenReminderSheet={handleOpenReminderFromSelection}
                  onOpenTodoSheet={handleOpenTodoFromSelection}
                  getCurrentTime={playerTimeRef.current || undefined}
                  onSeekTo={(seconds) => playerControlsRef.current?.seekTo(seconds)}
                  onPauseVideo={() => playerControlsRef.current?.pause()}
                  onPlayVideo={() => playerControlsRef.current?.play()}
                   onResegment={handleResegment}
                   isResegmenting={isResegmenting}
                   onRefetchCaptions={video.youtube_id && !video.youtube_id.startsWith('manual-') ? handleRefetchCaptions : undefined}
                   isRefetchingCaptions={isRefetchingCaptions}
                   onFixTimestampsViaAudio={handleFixTimestampsViaAudio}
                   isFixingTimestamps={isFixingTimestamps}
                   onStartRecording={handleStartRecording}
                   onStopRecording={handleStopRecording}
                   isRecording={isRecording}
                 />
              </TabsContent>
              
              <TabsContent value="remember" className="mt-0">
                <RememberTab
                  rememberItems={rememberItemsWithTitle}
                  aiSuggestedHighlights={aiSuggestedHighlights}
                  onConvertToRemember={handleConvertToRemember}
                  onSetSchedule={handleSetSchedule}
                  onJumpToTimestamp={handleJumpToTimestamp}
                  videoTitle={video.title}
                />
              </TabsContent>
              
              <TabsContent value="quiz" className="mt-0">
                <QuizTab
                  quizItems={quizItems.length > 0 ? quizItems.map(q => ({
                    ...q,
                    video_title: video.title,
                    explanation: q.explanation || '',
                    topic: q.topic || '',
                  })) : []}
                  videoId={video.id}
                  videoTitle={video.title}
                  rememberItemsCount={rememberItems.length}
                  onRegenerateQuestion={handleRegenerateQuestion}
                />
              </TabsContent>
              
              <TabsContent value="todo" className="mt-0">
                <TodoTab
                  tasks={tasksWithTitle}
                  aiSuggestedHighlights={aiSuggestedHighlights}
                  onConvertToTask={handleConvertToTask}
                  onToggleTaskStatus={handleToggleTaskStatus}
                  onJumpToTimestamp={handleJumpToTimestamp}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>

      {/* Manual Item Sheets */}
      <AddReminderSheet
        open={addReminderOpen}
        onOpenChange={setAddReminderOpen}
        videoId={video?.id}
        videoTitle={video?.title}
        getCurrentTime={playerTimeRef.current || undefined}
        prefillTitle={prefillTitle}
        prefillTimestamp={prefillTimestamp}
        prefillEndTimestamp={prefillEndTimestamp}
        originalSelectedText={originalSelectedText}
      />
      <AddTodoSheet
        open={addTodoOpen}
        onOpenChange={setAddTodoOpen}
        videoId={video?.id}
        videoTitle={video?.title}
        getCurrentTime={playerTimeRef.current || undefined}
        prefillTitle={prefillTitle}
        prefillTimestamp={prefillTimestamp}
        prefillEndTimestamp={prefillEndTimestamp}
        originalSelectedText={originalSelectedText}
      />
      <MilestoneDialog
        open={milestoneCount !== null}
        onOpenChange={(open) => !open && setMilestoneCount(null)}
        completedCount={milestoneCount || 0}
      />
    </PageLayout>
  );
}