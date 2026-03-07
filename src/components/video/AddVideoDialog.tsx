import { useState, useRef } from 'react';
import { Plus, Link as LinkIcon, X, Loader2, FileText, Image, Upload, Mic, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ProcessingPanel } from './ProcessingPanel';

interface AddVideoDialogProps {
  onAddVideo: (data: {
    youtube_url?: string;
    transcript_text?: string;
    screenshot_base64_list?: string[];
    audio_file?: File;
  }) => Promise<any>;
  triggerButton?: React.ReactNode;
}

export function AddVideoDialog({ onAddVideo, triggerButton }: AddVideoDialogProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: 'File too large',
        description: 'Audio/video files must be under 20MB.',
        variant: 'destructive',
      });
      return;
    }

    setAudioFile(file);
  };

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
    setScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setUrl('');
    setTranscriptText('');
    setScreenshots([]);
    setScreenshotPreviews([]);
    setAudioFile(null);
    setLoadingStep('');
    setProcessingVideoId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (audioInputRef.current) audioInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const hasUrl = url.trim();
    const hasText = transcriptText.trim();
    const hasScreenshots = screenshots.length > 0;
    const hasAudio = !!audioFile;

    if (!hasUrl && !hasText && !hasScreenshots && !hasAudio) {
      toast({
        title: 'Input required',
        description: 'Please provide a video link, audio file, transcript text, or screenshots',
        variant: 'destructive',
      });
      return;
    }

    if (hasUrl) {
      // Basic URL validation - accept any URL
      try {
        const testUrl = url.startsWith('http') ? url : `https://${url}`;
        new URL(testUrl);
      } catch {
        toast({
          title: 'Invalid URL',
          description: 'Please enter a valid URL',
          variant: 'destructive',
        });
        return;
      }
    }

    setIsLoading(true);
    setLoadingStep(hasAudio ? 'Uploading & transcribing...' : 'Adding...');
    
    try {
      const result = await onAddVideo({
        youtube_url: hasUrl ? url : undefined,
        transcript_text: hasText ? transcriptText : undefined,
        screenshot_base64_list: hasScreenshots ? screenshots : undefined,
        audio_file: hasAudio ? audioFile : undefined,
      });

      // If we got a video ID back, show the processing panel
      const videoId = result?.video?.id;
      if (videoId && hasUrl) {
        setProcessingVideoId(videoId);
        setIsLoading(false);
        setLoadingStep('');
      } else {
        // For text/screenshot/audio, close immediately
        toast({
          title: 'Video added!',
          description: hasAudio 
            ? 'Your audio is being transcribed. This may take a minute.'
            : 'Your video is being processed.',
        });
        resetForm();
        setOpen(false);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add video. Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
      setLoadingStep('');
    }
  };

  const handleDialogClose = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    setOpen(newOpen);
  };

  // Show processing panel after submission
  if (processingVideoId) {
    return (
      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogTrigger asChild>
          {triggerButton || (
            <Button variant="glow" size="lg" className="gap-2">
              <Plus className="h-5 w-5" />
              Add Video
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Processing Video</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            <ProcessingPanel 
              videoId={processingVideoId}
              onComplete={() => {
                // Don't auto-close, let user click "View Transcript"
              }}
            />
            <div className="mt-4 pt-3 border-t border-border">
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  resetForm();
                  setOpen(false);
                }}
              >
                Close & Process in Background
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>
        {triggerButton || (
          <Button variant="glow" size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            Add Video
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Video</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Video Link */}
          <div className="space-y-2">
            <Label htmlFor="url" className="flex items-center gap-2">
              <LinkIcon className="h-4 w-4 text-muted-foreground" />
              Link
              <span className="text-xs text-muted-foreground">(any video, podcast, or web link)</span>
            </Label>
            <div className="relative">
              <Input
                id="url"
                placeholder="https://youtube.com/watch?v=... or any web/video link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
              />
              {url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setUrl('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Audio/Video File Upload */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-muted-foreground" />
              Upload Audio / Video
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            {audioFile ? (
              <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                <Music className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{audioFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(audioFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setAudioFile(null);
                    if (audioInputRef.current) audioInputRef.current.value = '';
                  }}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                  "hover:border-primary/50 hover:bg-primary/5",
                  isLoading && "pointer-events-none opacity-50"
                )}
                onClick={() => audioInputRef.current?.click()}
              >
                <Mic className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Tap to upload audio or video file
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  MP3, MP4, WAV, M4A, MOV — up to 20MB
                </p>
                <p className="text-xs text-primary/70 mt-1 font-medium">
                  ✨ Transcribed automatically with ElevenLabs
                </p>
              </div>
            )}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.mp4,.wav,.m4a,.mov,.webm,.ogg"
              className="hidden"
              onChange={handleAudioSelect}
              disabled={isLoading}
            />
          </div>

          {/* Paste Transcript */}
          <div className="space-y-2">
            <Label htmlFor="transcript" className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Paste Transcript
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="transcript"
              placeholder="Paste transcript text here... Timestamps like 0:00, 1:30 will be detected automatically."
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              disabled={isLoading}
              className="min-h-[120px] resize-none"
            />
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              Upload Screenshots
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
                isLoading && "pointer-events-none opacity-50"
              )}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG up to 10 files
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              disabled={isLoading}
            />
            
            {screenshotPreviews.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {screenshotPreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Screenshot ${index + 1}`}
                      className="h-16 w-16 object-cover rounded border border-border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeScreenshot(index);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Helper text */}
          <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            💡 Provide at least one: any web/video/podcast link, audio/video file, pasted transcript, or screenshots. 
            Links are automatically inspected and transcribed using AI.
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {loadingStep || 'Adding...'}
                </>
              ) : (
                'Add Video'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
