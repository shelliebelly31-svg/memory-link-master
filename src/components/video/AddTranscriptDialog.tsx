import { useState, useRef } from 'react';
import { FileText, Image, Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface AddTranscriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    transcript_text?: string;
    screenshot_base64_list?: string[];
  }) => Promise<void>;
  videoTitle?: string;
}

export function AddTranscriptDialog({ 
  open, 
  onOpenChange, 
  onSubmit,
  videoTitle 
}: AddTranscriptDialogProps) {
  const [transcriptText, setTranscriptText] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
    setScreenshotPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setTranscriptText('');
    setScreenshots([]);
    setScreenshotPreviews([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

    setIsLoading(true);
    try {
      await onSubmit({
        transcript_text: hasText ? transcriptText : undefined,
        screenshot_base64_list: hasScreenshots ? screenshots : undefined,
      });
      toast({
        title: 'Transcript added!',
        description: 'Processing your transcript now.',
      });
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add transcript.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      onOpenChange(newOpen);
      if (!newOpen) resetForm();
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Transcript</DialogTitle>
          {videoTitle && (
            <DialogDescription className="line-clamp-1">
              For: {videoTitle}
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Transcript Text */}
          <div className="space-y-2">
            <Label htmlFor="transcript" className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Paste Transcript
            </Label>
            <Textarea
              id="transcript"
              placeholder="Paste transcript text here... Timestamps like 0:00, 1:30 will be detected automatically."
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              disabled={isLoading}
              className="min-h-[150px] resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Screenshot Upload */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              Upload Screenshots
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
                Click to upload transcript screenshots
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

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading}>
              {isLoading ? (
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
      </DialogContent>
    </Dialog>
  );
}