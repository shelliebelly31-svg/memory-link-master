import { useState, useMemo, useRef, useCallback } from 'react';
import { Search, SlidersHorizontal, X, RefreshCw } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { VideoCard } from '@/components/video/VideoCard';
import { AddVideoDialog } from '@/components/video/AddVideoDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useVideos, useAddVideoWithSources, useRetryVideo, getDisplayStatus, DisplayStatus } from '@/hooks/useVideos';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface LibraryPageProps {
  onLogout: () => void;
}

type FilterStatus = 'all' | DisplayStatus;

export default function LibraryPage({ onLogout }: LibraryPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { data: videos = [], isLoading } = useVideos();
  const addVideo = useAddVideoWithSources();
  const retryVideo = useRetryVideo();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Pull-to-refresh state
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isRefreshing) return;
    if (scrollRef.current && scrollRef.current.scrollTop > 0) return;
    const diff = e.touches[0].clientY - touchStartY.current;
    if (diff > 0) {
      setPullDistance(Math.min(diff * 0.5, 120));
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(PULL_THRESHOLD);

      // Find needs_attention videos and reprocess them
      const needsAttentionVideos = videos.filter(v => v.status === 'needs_attention' || v.status === 'failed');

      if (needsAttentionVideos.length > 0) {
        toast({
          title: 'Reprocessing videos...',
          description: `Retrying ${needsAttentionVideos.length} video${needsAttentionVideos.length > 1 ? 's' : ''} that need attention.`,
        });

        await Promise.allSettled(
          needsAttentionVideos.map(v => retryVideo.mutateAsync({ videoId: v.id }))
        );
      } else {
        // Just refresh data if no videos need attention
        await queryClient.invalidateQueries({ queryKey: ['videos'] });
        toast({ title: 'Refreshed', description: 'All videos are up to date.' });
      }

      setIsRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, isRefreshing, videos, retryVideo, queryClient, toast]);

  const filteredVideos = useMemo(() => {
    return videos.filter(video => {
      const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase());
      const displayStatus = getDisplayStatus(video.status);
      const matchesStatus = filterStatus === 'all' || displayStatus === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [videos, searchQuery, filterStatus]);

  const statusCounts = useMemo(() => ({
    all: videos.length,
    ready: videos.filter(v => getDisplayStatus(v.status) === 'ready').length,
    processing: videos.filter(v => getDisplayStatus(v.status) === 'processing').length,
    needs_attention: videos.filter(v => getDisplayStatus(v.status) === 'needs_attention').length,
    failed: videos.filter(v => getDisplayStatus(v.status) === 'failed').length,
  }), [videos]);

  return (
    <PageLayout onLogout={onLogout}>
      <div
        ref={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative"
        style={{ overscrollBehavior: 'contain' }}
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="flex items-center justify-center overflow-hidden transition-all duration-200"
          style={{ height: pullDistance > 0 ? pullDistance : 0 }}
        >
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <RefreshCw
              className={`h-5 w-5 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: isRefreshing ? undefined : `rotate(${pullDistance * 3}deg)` }}
            />
            <span className="text-xs">
              {isRefreshing
                ? 'Reprocessing...'
                : pullDistance >= PULL_THRESHOLD
                  ? 'Release to reprocess'
                  : 'Pull to reprocess failed videos'}
            </span>
          </div>
        </div>
      <div className="px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {videos.length} videos saved
            </p>
          </div>
          <AddVideoDialog onAddVideo={async (data) => { await addVideo.mutateAsync(data); }} />
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search videos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
              {searchQuery && (
                <Button variant="ghost" size="icon-sm" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setSearchQuery('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button variant={showFilters ? 'secondary' : 'outline'} size="icon" onClick={() => setShowFilters(!showFilters)}>
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {showFilters && (
            <div className="flex gap-2 flex-wrap animate-fade-up">
              {(['all', 'ready', 'processing', 'needs_attention', 'failed'] as const).map((status) => (
                <Button key={status} variant={filterStatus === status ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(status)} className="capitalize">
                  {status === 'all' ? 'All' : status === 'needs_attention' ? 'Needs Attention' : status}
                  <Badge variant="secondary" className="ml-2 text-xs">{statusCounts[status]}</Badge>
                </Button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredVideos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredVideos.map((video, index) => (
              <div key={video.id} className="animate-fade-up" style={{ animationDelay: `${index * 50}ms` }}>
                <VideoCard video={video} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{videos.length === 0 ? 'No videos yet' : 'No videos found'}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              {videos.length === 0 ? 'Add your first YouTube video to get started' : 'Try adjusting your search or filters'}
            </p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
