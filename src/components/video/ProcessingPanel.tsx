import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useVideo, type ProcessingStep } from '@/hooks/useVideos';
import { cn } from '@/lib/utils';

interface ProcessingPanelProps {
  videoId: string;
  onComplete?: () => void;
}

const STEPS = [
  { key: 'processing', label: 'Processing video' },
  { key: 'extracting_captions', label: 'Extracting captions' },
  { key: 'downloading_audio', label: 'Downloading audio' },
  { key: 'transcribing', label: 'Transcribing speech' },
  { key: 'segmenting', label: 'Segmenting transcript' },
  { key: 'generating_highlights', label: 'Generating highlights' },
  { key: 'ready', label: 'Ready' },
] as const;

type StepKey = typeof STEPS[number]['key'];

function getStepIndex(step: ProcessingStep | null): number {
  if (!step) return 0;
  const idx = STEPS.findIndex(s => s.key === step);
  return idx >= 0 ? idx : 0;
}

function getStepStatus(stepKey: StepKey, currentStep: ProcessingStep | null, videoStatus: string): 'done' | 'active' | 'pending' | 'skipped' {
  const currentIdx = getStepIndex(currentStep);
  const stepIdx = STEPS.findIndex(s => s.key === stepKey);

  // If video is ready or generating highlights, mark all prior steps done
  if (videoStatus === 'ready' && currentStep === 'ready') {
    return stepIdx <= currentIdx ? 'done' : 'pending';
  }

  // Transcribing fallback: mark transcribing as the active one
  if (currentStep === 'transcribing_fallback') {
    if (stepKey === 'transcribing') return 'active';
    if (stepKey === 'downloading_audio') return 'done';
    if (stepKey === 'extracting_captions') return 'done';
    if (stepKey === 'processing') return 'done';
  }

  if (stepIdx < currentIdx) return 'done';
  if (stepIdx === currentIdx) return 'active';
  return 'pending';
}

export function ProcessingPanel({ videoId, onComplete }: ProcessingPanelProps) {
  const navigate = useNavigate();
  const { data: video } = useVideo(videoId);

  const currentStep = video?.processing_step || null;
  const videoStatus = video?.status || 'queued';
  const isComplete = currentStep === 'ready' || (videoStatus === 'ready' && !currentStep);
  const isFailed = videoStatus === 'failed' || videoStatus === 'needs_attention';
  const isFallback = currentStep === 'transcribing_fallback';

  // Determine which steps to show (skip audio steps if captions succeeded)
  const captionsSucceeded = currentStep && !['downloading_audio', 'transcribing', 'transcribing_fallback'].includes(currentStep) 
    && getStepIndex(currentStep) >= STEPS.findIndex(s => s.key === 'segmenting');

  const visibleSteps = STEPS.filter(step => {
    if (captionsSucceeded && (step.key === 'downloading_audio' || step.key === 'transcribing')) {
      return false;
    }
    return true;
  });

  useEffect(() => {
    if (isComplete && onComplete) {
      const timer = setTimeout(onComplete, 1500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        {video?.thumbnail_url && (
          <img 
            src={video.thumbnail_url} 
            alt="" 
            className="w-16 h-10 object-cover rounded-md border border-border"
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {video?.title === 'Processing...' ? 'Loading video info...' : video?.title || 'Processing...'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isComplete ? 'Processing complete' : isFailed ? 'Processing stopped' : 'Processing in progress...'}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        {visibleSteps.map((step, index) => {
          const status = isFailed && !isComplete
            ? (getStepIndex(currentStep) > STEPS.findIndex(s => s.key === step.key) ? 'done' : 
               getStepIndex(currentStep) === STEPS.findIndex(s => s.key === step.key) ? 'active' : 'pending')
            : getStepStatus(step.key, currentStep, videoStatus);

          const showFallbackNote = step.key === 'transcribing' && isFallback;

          return (
            <div
              key={step.key}
              className={cn(
                "flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-300",
                status === 'active' && "bg-primary/5",
                status === 'done' && "opacity-80",
                status === 'pending' && "opacity-40",
              )}
            >
              <div className="shrink-0">
                {status === 'done' ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/15 flex items-center justify-center">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                ) : status === 'active' ? (
                  isFailed ? (
                    <div className="w-6 h-6 rounded-full bg-destructive/15 flex items-center justify-center">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center">
                      <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                    </div>
                  )
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-border" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "text-sm font-medium",
                  status === 'active' && !isFailed && "text-primary",
                  status === 'active' && isFailed && "text-destructive",
                )}>
                  {step.label}
                </p>
                {showFallbackNote && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <Sparkles className="h-3 w-3" />
                    Using AI fallback transcription
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {isFailed && (
        <div className="mt-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
          <p className="text-sm text-destructive font-medium">
            {video?.error_message || 'Processing encountered an issue.'}
          </p>
        </div>
      )}

      {isComplete && (
        <div className="mt-4 pt-3 border-t border-border">
          <Button 
            className="w-full gap-2" 
            onClick={() => navigate(`/video/${videoId}`)}
          >
            View Transcript
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
