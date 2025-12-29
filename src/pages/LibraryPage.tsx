import { useState, useMemo } from 'react';
import { Search, Filter, SlidersHorizontal, X } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { VideoCard } from '@/components/video/VideoCard';
import { AddVideoDialog } from '@/components/video/AddVideoDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { mockVideos } from '@/lib/mockData';
import { VideoStatus } from '@/types';

interface LibraryPageProps {
  onLogout: () => void;
}

type FilterStatus = 'all' | VideoStatus;

export default function LibraryPage({ onLogout }: LibraryPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showFilters, setShowFilters] = useState(false);

  const filteredVideos = useMemo(() => {
    return mockVideos.filter(video => {
      const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'all' || video.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, filterStatus]);

  const handleAddVideo = async (url: string) => {
    // In a real app, this would call the backend
    console.log('Adding video:', url);
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  const statusCounts = useMemo(() => {
    return {
      all: mockVideos.length,
      ready: mockVideos.filter(v => v.status === 'ready').length,
      transcribing: mockVideos.filter(v => v.status === 'transcribing').length,
      queued: mockVideos.filter(v => v.status === 'queued').length,
      failed: mockVideos.filter(v => v.status === 'failed').length,
    };
  }, []);

  return (
    <PageLayout onLogout={onLogout}>
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Library</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mockVideos.length} videos saved
            </p>
          </div>
          <AddVideoDialog onAddVideo={handleAddVideo} />
        </div>

        {/* Search & Filter */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search videos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </div>

          {/* Filter Chips */}
          {showFilters && (
            <div className="flex gap-2 flex-wrap animate-fade-up">
              {(['all', 'ready', 'transcribing', 'queued', 'failed'] as const).map((status) => (
                <Button
                  key={status}
                  variant={filterStatus === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus(status)}
                  className="capitalize"
                >
                  {status === 'all' ? 'All' : status}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {statusCounts[status]}
                  </Badge>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Video Grid */}
        {filteredVideos.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredVideos.map((video, index) => (
              <div
                key={video.id}
                className="animate-fade-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <VideoCard video={video} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No videos found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Try adjusting your search or filters
            </p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
