import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Image, Upload, X, Loader2 } from 'lucide-react';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useVideo, useAddTranscriptToVideo } from '@/hooks/useVideos';
import { cn } from '@/lib/utils';

interface AddTranscriptPageProps {
  onLogout: () => void;
}

export default function AddTranscriptPage({ onLogout }: AddTranscriptPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const { data: video, isLoading: videoLoading } = useVideo(id || '');
  const addTranscriptMutation = useAddTranscriptToVideo();

  const [transcriptText, setTranscriptText] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newBase64List: string[] = [];
    const newPreviews: string[] = [];

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        newBase64List.push(base64);
        newPreviews.push(base64);
        
        if (newBase64List.length === files.length) {
          setScreenshots((prev) => [...prev, ...newBase64List]);
          setScreenshotPreviews((prev) => [...prev, ...newPreviews]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
    setScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasText = transcriptText.trim();
    const hasScreenshots = screenshots.length > 0;

    if (!hasText && !hasScreenshots) {
      toast({
        title: 'Input required',
        description: 'Please paste transcript text or upload screenshots',
        variant: 'destructive',
      });
      return;
    }

    try {
      await addTranscriptMutation.mutateAsync({
        videoId: id!,
        transcript_text: hasText ? transcriptText : undefined,
        screenshot_base64_list: hasScreenshots ? screenshots : undefined,
      });
      navigate(`/video/${id}`);
    } catch (error) {
      // Error handled by the hook
    }
  };

  if (videoLoading) {
    return (
      <PageLayout onLogout={onLogout}>
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!video) {
    return (
      <PageLayout onLogout={onLogout}>
        <div className="px-4 py-6">
          <p className="text-muted-foreground">Video not found</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout onLogout={onLogout}>
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          onClick={() => navigate('/library')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Library
        </Button>

        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Add Transcript</h1>
            <p className="text-muted-foreground mt-1 line-clamp-1">
              For: {video.title}
            </p>
          </div>

          {video.error_message && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                {video.error_message}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Transcript Text */}
            <div className="space-y-3">
              <Label htmlFor="transcript" className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Paste Transcript Text
              </Label>
              <Textarea
                id="transcript"
                placeholder="Paste transcript text here...

Timestamps like 0:00, 1:30, or [00:45] will be detected automatically.

Example:
0:00 Introduction to the topic
0:30 First key point..."
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                disabled={addTranscriptMutation.isPending}
                className="min-h-[200px] resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 border-t border-border" />
              <span className="text-sm text-muted-foreground">or</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* Screenshot Upload */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base">
                <Image className="h-5 w-5 text-muted-foreground" />
                Upload Screenshots
              </Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  "hover:border-primary/50 hover:bg-primary/5",
                  addTranscriptMutation.isPending && "pointer-events-none opacity-50"
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  Click to upload transcript screenshots
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  We'll extract the text using OCR
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={addTranscriptMutation.isPending}
              />
              
              {screenshotPreviews.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-3">
                  {screenshotPreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Screenshot ${index + 1}`}
                        className="h-20 w-20 object-cover rounded-lg border border-border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeScreenshot(index);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => navigate('/library')}
                disabled={addTranscriptMutation.isPending}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="flex-1" 
                disabled={addTranscriptMutation.isPending}
              >
                {addTranscriptMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Add Transcript'
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PageLayout>
  );
}
