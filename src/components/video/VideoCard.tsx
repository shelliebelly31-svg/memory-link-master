import { Link } from 'react-router-dom';
import { Play, Clock, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { Video } from '@/hooks/useVideos';
import { Badge } from '@/components/ui/badge';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
  video: Video;
}

function getStatusBadge(status: VideoStatus) {
  switch (status) {
    case 'ready':
      return (
        <Badge className="bg-ai/20 text-ai border-ai/30">
          <CheckCircle className="h-3 w-3 mr-1" />
          Ready
        </Badge>
      );
    case 'transcribing':
      return (
        <Badge className="bg-todo/20 text-todo border-todo/30">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Processing
        </Badge>
      );
    case 'queued':
      return (
        <Badge className="bg-muted text-muted-foreground border-border">
          <Clock className="h-3 w-3 mr-1" />
          Queued
        </Badge>
      );
    case 'failed':
      return (
        <Badge className="bg-destructive/20 text-destructive border-destructive/30">
          <AlertCircle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      );
  }
}

export function VideoCard({ video }: VideoCardProps) {
  const isClickable = video.status === 'ready';

  const content = (
    <div className="card-interactive overflow-hidden">
      <div className="relative aspect-video bg-muted">
        <img
          src={video.thumbnail_url}
          alt={video.title}
          className="w-full h-full object-cover"
        />
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
      </div>
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-card-foreground line-clamp-2 leading-snug">
          {video.title}
        </h3>
        <div className="flex items-center justify-between">
          {getStatusBadge(video.status)}
          <span className="text-xs text-muted-foreground">
            {new Date(video.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );

  if (isClickable) {
    return (
      <Link to={`/video/${video.id}`} className="block">
        {content}
      </Link>
    );
  }

  return <div className="opacity-75">{content}</div>;
}
