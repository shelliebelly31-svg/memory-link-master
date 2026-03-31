import { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Extend Window for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface WordSegment {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

interface SpeechTranscriberProps {
  isOpen: boolean;
  onClose: () => void;
  onTranscriptionComplete: (segments: { text: string; start_seconds: number; end_seconds: number }[]) => void;
  onPlayVideo: () => void;
  onPauseVideo: () => void;
  onSeekTo: (seconds: number) => void;
  getCurrentTime?: () => number | null;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export function SpeechTranscriber({
  isOpen,
  onClose,
  onTranscriptionComplete,
  onPlayVideo,
  onPauseVideo,
  onSeekTo,
  getCurrentTime,
}: SpeechTranscriberProps) {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [wordSegments, setWordSegments] = useState<WordSegment[][]>([]);
  const [status, setStatus] = useState<'idle' | 'transcribing' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);

  const recognitionRef = useRef<any>(null);
  const transcriptStartRef = useRef(0);
  const allWordsRef = useRef<WordSegment[][]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTranscribingRef = useRef(false);

  // Poll current time while transcribing
  useEffect(() => {
    if (isTranscribing && getCurrentTime) {
      tickRef.current = setInterval(() => {
        const t = getCurrentTime();
        if (t !== null) setCurrentTime(t);
      }, 250);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isTranscribing, getCurrentTime]);

  // Highlight active word
  const flatWords = wordSegments.flat();
  useEffect(() => {
    let idx = -1;
    for (let i = flatWords.length - 1; i >= 0; i--) {
      if (flatWords[i].startTime <= currentTime) { idx = i; break; }
    }
    setActiveWordIdx(idx);
  }, [currentTime, flatWords]);

  const buildRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = 'en-US';

    rec.onresult = (event: any) => {
      const now = (Date.now() - transcriptStartRef.current) / 1000;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;

        const transcript = result[0].transcript.trim();
        const confidence = result[0].confidence;
        const words = transcript.split(/\s+/);
        const wordDuration = 0.35;

        const segs: WordSegment[] = words.map((word: string, j: number) => ({
          word,
          startTime: Math.max(0, now - words.length * wordDuration + j * wordDuration),
          endTime: Math.max(0, now - (words.length - j - 1) * wordDuration),
          confidence,
        }));

        allWordsRef.current = [...allWordsRef.current, segs];

        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          setWordSegments([...allWordsRef.current]);
        }, 100);
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed') {
        setErrorMsg('Microphone permission denied. Allow mic access in your browser.');
      } else {
        setErrorMsg(`Speech recognition error: ${e.error}`);
      }
      setStatus('error');
      setIsTranscribing(false);
      isTranscribingRef.current = false;
    };

    rec.onend = () => {
      if (isTranscribingRef.current) rec.start(); // auto-restart on silence timeout
    };

    return rec;
  }, []);

  const startTranscribing = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
    } catch {
      setErrorMsg('Microphone permission denied.');
      setStatus('error');
      return;
    }

    onPlayVideo();
    transcriptStartRef.current = Date.now();
    allWordsRef.current = [];
    setWordSegments([]);

    const rec = buildRecognition();
    if (!rec) {
      setErrorMsg("Your browser doesn't support Web Speech API. Try Chrome or Edge.");
      setStatus('error');
      return;
    }
    recognitionRef.current = rec;
    rec.start();
    setIsTranscribing(true);
    isTranscribingRef.current = true;
    setStatus('transcribing');
  };

  const stopTranscribing = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    onPauseVideo();
    setIsTranscribing(false);
    isTranscribingRef.current = false;
    setStatus('done');
  };

  const handleSaveTranscript = () => {
    const flat = flatWords;
    if (flat.length === 0) return;

    // Group words into ~15-second segments
    const dbSegments: { text: string; start_seconds: number; end_seconds: number }[] = [];
    let currentSegWords: WordSegment[] = [];
    let segStart = flat[0].startTime;

    for (const w of flat) {
      currentSegWords.push(w);
      if (w.endTime - segStart >= 15 || w === flat[flat.length - 1]) {
        dbSegments.push({
          text: currentSegWords.map(cw => cw.word).join(' '),
          start_seconds: Math.round(segStart),
          end_seconds: Math.round(w.endTime),
        });
        currentSegWords = [];
        segStart = w.endTime;
      }
    }

    onTranscriptionComplete(dbSegments);
  };

  const exportTranscript = () => {
    const flat = flatWords;
    const lines = flat.map((w) => `[${formatTime(w.startTime)}] ${w.word}`).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'transcript.txt';
    a.click();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (tickRef.current) clearInterval(tickRef.current);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙</span>
          <span className="font-semibold text-sm text-primary">Live Transcribe</span>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Error */}
      {status === 'error' && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {!isTranscribing ? (
          <Button size="sm" onClick={startTranscribing} className="gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            Start Transcribing
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={stopTranscribing} className="gap-1.5">
            <MicOff className="h-3.5 w-3.5" />
            Stop
          </Button>
        )}
        {flatWords.length > 0 && status === 'done' && (
          <>
            <Button size="sm" variant="outline" onClick={exportTranscript} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export .txt
            </Button>
            <Button size="sm" onClick={handleSaveTranscript} className="gap-1.5">
              Save to Transcript
            </Button>
          </>
        )}
      </div>

      {/* Status badge */}
      {status === 'transcribing' && (
      <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Transcribing… {flatWords.length} words
        </div>
      )}

      {/* Live transcript */}
      {flatWords.length > 0 && (
        <div className="bg-background border border-border rounded-lg p-3 max-h-64 overflow-y-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold text-primary">Transcript</span>
            <span className="text-xs text-muted-foreground">{flatWords.length} words</span>
          </div>
          <div className="leading-relaxed text-sm">
            {flatWords.map((w, i) => (
              <span key={i} className="inline-block">
                <span
                  className={cn(
                    'rounded px-0.5 cursor-pointer transition-colors',
                    i === activeWordIdx
                      ? 'bg-primary/20 text-primary font-bold'
                      : 'hover:bg-muted'
                  )}
                  title={`[${formatTime(w.startTime)} → ${formatTime(w.endTime)}]`}
                  onClick={() => onSeekTo(w.startTime)}
                >
                  {w.word}
                </span>
                {i % 10 === 0 && (
                  <span className="text-[10px] bg-muted text-muted-foreground rounded px-1 mx-0.5 align-middle font-mono">
                    {formatTime(w.startTime)}
                  </span>
                )}
                {' '}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Word table (collapsible) */}
      {flatWords.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold text-primary mb-2 select-none">
            Word-level timestamp table
          </summary>
          <div className="overflow-x-auto border border-border rounded-lg max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="px-2 py-1.5 text-left font-semibold">#</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Word</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Start</th>
                  <th className="px-2 py-1.5 text-left font-semibold">End</th>
                  <th className="px-2 py-1.5 text-left font-semibold">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {flatWords.map((w, i) => (
                  <tr
                    key={i}
                    className="border-t border-border hover:bg-muted/50 cursor-pointer"
                    onClick={() => onSeekTo(w.startTime)}
                  >
                    <td className="px-2 py-1">{i + 1}</td>
                    <td className="px-2 py-1 font-semibold">{w.word}</td>
                    <td className="px-2 py-1 font-mono">{formatTime(w.startTime)}</td>
                    <td className="px-2 py-1 font-mono">{formatTime(w.endTime)}</td>
                    <td className="px-2 py-1">{w.confidence ? `${Math.round(w.confidence * 100)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* How it works */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
        <strong>How it works:</strong> Click <em>Start Transcribing</em> — the video plays and your browser
        listens via the Web Speech API. Words appear in real-time with timestamps. When done, click <em>Save to Transcript</em> to
        replace the current transcript with this verbatim capture.
      </div>
    </div>
  );
}
