import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Play, CheckCircle, Loader2, AlertCircle, RotateCcw, AlertTriangle, FileText } from 'lucide-react';
import { Video, useRetryVideo, getDisplayStatus, DisplayStatus } from '@/hooks/useVideos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

interface VideoCardProps {
  video: Video;
}

function StatusBadge({ 
  displayStatus, 
  onErrorClick,
  onNeedsAttentionClick,
}: { 
  displayStatus: DisplayStatus; 
  onErrorClick?: () => void;
  onNeedsAttentionClick?: () => void;
}) {
  switch (displayStatus) {
    case 'ready':
      return (
        <Badge className="bg-ai/20 text-ai border-ai/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Ready
        </Badge>
      );
    case 'processing':
      return (
        <Badge className="bg-todo/20 text-todo border-todo/30">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    case 'needs_attention':
      return (
        <Badge 
          className="bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border-yellow-500/30 cursor-pointer hover:bg-yellow-500/30 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onNeedsAttentionClick?.();
          }}
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          Needs attention
        </Badge>
      );
    case 'failed':
      return (
        <Badge 
          className="bg-destructive/20 text-destructive border-destructive/30 cursor-pointer hover:bg-destructive/30 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onErrorClick?.();
          }}
        >
          <AlertCircle className="h-3 w-3 mr-1" />
          Failed - Tap for details
        </Badge>
      );
  }
}

export function VideoCard({ video }: VideoCardProps) {
  const navigate = useNavigate();
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const retryMutation = useRetryVideo();
  
  const displayStatus = getDisplayStatus(video.status);
  const isClickable = displayStatus === 'ready';
  const isFailed = displayStatus === 'failed';
  const needsAttention = displayStatus === 'needs_attention';

  const handleRetry = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setErrorDialogOpen(false);
    retryMutation.mutate({ 
      videoId: video.id, 
      fromStep: video.failed_step || undefined 
    });
  };

  const handleAddTranscriptClick = () => {
    navigate(`/video/${video.id}/add-transcript`);
  };

  const content = (
    <div className="card-interactive overflow-hidden">
      <div className="relative aspect-video bg-muted">
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded font-mono">
          {formatDuration(video.duration_seconds)}
        </div>
        {isClickable && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/30">
            <div className="w-14 h-14 rounded-full bg-primary/90 flex items-center justify-center">
              <Play className="h-6 w-6 text-primary-foreground ml-1" />
            </div>
          </div>
        )}
        {needsAttention && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Button
              size="sm"
              className="gap-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAddTranscriptClick();
              }}
            >
              <FileText className="h-4 w-4" />
              Add Transcript
            </Button>
          </div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-card-foreground line-clamp-2 leading-snug">
          {video.title}
        </h3>
        <div className="flex items-center justify-between">
          <StatusBadge 
            displayStatus={displayStatus} 
            onErrorClick={() => setErrorDialogOpen(true)}
            onNeedsAttentionClick={handleAddTranscriptClick}
          />
          <span className="text-xs text-muted-foreground">
            {new Date(video.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isClickable ? (
        <Link to={`/video/${video.id}`} className="block">
          {content}
        </Link>
      ) : (
        <div className={isFailed || needsAttention ? '' : 'opacity-75'}>{content}</div>
      )}

      {/* Error Dialog */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Processing Failed
            </DialogTitle>
            <DialogDescription className="pt-2">
              {video.error_message || 'An unknown error occurred while processing this video.'}
            </DialogDescription>
          </DialogHeader>
          
          {video.failed_step && (
            <div className="text-sm text-muted-foreground">
              Failed at step: <span className="font-medium capitalize">{video.failed_step}</span>
            </div>
          )}
          
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setErrorDialogOpen(false)}
            >
              Close
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={handleRetry}
              disabled={retryMutation.isPending}
            >
              {retryMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Retry
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}