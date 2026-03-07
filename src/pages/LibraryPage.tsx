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
