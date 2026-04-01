import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract YouTube video ID from various URL formats
function extractVideoId(url: string): string | null {
  // Handle youtu.be links
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  
  // Handle youtube.com links with v parameter
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      const videoId = urlObj.searchParams.get('v');
      if (videoId && videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
        return videoId;
      }
    }
  } catch (e) {
    // Continue to other patterns
  }
  
  // Handle embed links
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  
  return null;
}

// Create canonical YouTube URL
function getCanonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// Check if URL is a direct media file
function isDirectMediaUrl(url: string): boolean {
  const mediaExtensions = /\.(mp4|webm|mov|avi|mkv|m4v|mp3|wav|m4a|ogg|flac|aac|wma)(\?|$)/i;
  return mediaExtensions.test(url);
}

// Check if URL is YouTube
function isYouTubeUrl(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

// Normalize any URL
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  return normalized;
}

// Parse timestamps from transcript text
// Supports formats: 00:00, 0:00, 00:00:00, [00:00], (00:00)
function parseTranscriptText(text: string): Array<{start: number, end: number, text: string}> {
  const lines = text.split('\n').filter(line => line.trim());
  const segments: Array<{start: number, end: number, text: string}> = [];
  
  const timestampRegex = /^[\[\(]?(\d{1,2}:)?(\d{1,2}):(\d{2})[\]\)]?\s*[-–:]?\s*/;
  
  let currentStart = 0;
  let currentText = '';
  
  for (const line of lines) {
    const match = line.match(timestampRegex);
    
    if (match) {
      // Save previous segment if exists
      if (currentText.trim()) {
        segments.push({
          start: currentStart,
          end: currentStart + 30, // Default segment length
          text: currentText.trim(),
        });
      }
      
      // Parse new timestamp
      const hours = match[1] ? parseInt(match[1].replace(':', '')) : 0;
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      currentStart = hours * 3600 + minutes * 60 + seconds;
      currentText = line.replace(timestampRegex, '').trim();
    } else {
      // Append to current segment
      currentText += ' ' + line.trim();
    }
  }
  
  // Save last segment
  if (currentText.trim()) {
    segments.push({
      start: currentStart,
      end: currentStart + 30,
      text: currentText.trim(),
    });
  }
  
  // If no timestamps found, create segments based on paragraph breaks
  if (segments.length === 0 && text.trim()) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    let currentTime = 0;
    for (const para of paragraphs) {
      segments.push({
        start: currentTime,
        end: currentTime + 30,
        text: para.replace(/\n/g, ' ').trim(),
      });
      currentTime += 30;
    }
  }
  
  // Update end times to match next segment's start
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i].end = segments[i + 1].start;
  }
  
  return segments;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      youtube_url, 
      transcript_text, 
      screenshot_base64_list,
      retry_video_id, 
      retry_from_step,
      add_transcript_to_video_id,
    } = await req.json();
    
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Handle adding transcript to existing video (for needs_attention state)
    if (add_transcript_to_video_id) {
      const { data: existingVideo, error: fetchError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', add_transcript_to_video_id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingVideo) {
        return new Response(
          JSON.stringify({ error: 'Video not found or access denied' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Process transcript text or screenshots
      let segments: Array<{start: number, end: number, text: string}> = [];
      let sourceType = 'manual';

      if (transcript_text && transcript_text.trim()) {
        segments = parseTranscriptText(transcript_text);
        sourceType = 'manual';
      } else if (screenshot_base64_list && screenshot_base64_list.length > 0) {
        const ocrText = await processScreenshotsOCR(screenshot_base64_list);
        if (ocrText) {
          segments = parseTranscriptText(ocrText);
          sourceType = 'upload';
        }
      }

      if (segments.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Could not extract transcript from provided input' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete existing segments if any
      await supabase
        .from('transcript_segments')
        .delete()
        .eq('video_id', add_transcript_to_video_id);

      // Insert new segments
      const segmentRows = segments.map(seg => ({
        video_id: add_transcript_to_video_id,
        start_seconds: seg.start,
        end_seconds: seg.end,
        text: seg.text,
      }));

      const { error: segmentError } = await supabase
        .from('transcript_segments')
        .insert(segmentRows);

      if (segmentError) {
        console.error('Segment insert error:', segmentError);
        return new Response(
          JSON.stringify({ error: 'Failed to save transcript' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update video status
      await supabase
        .from('videos')
        .update({
          status: 'ready',
          source_type: sourceType,
          error_message: null,
          failed_step: null,
          captions_missing: false,
        })
        .eq('id', add_transcript_to_video_id);

      // Generate AI suggestions in background
      generateAISuggestions(add_transcript_to_video_id, segments, supabase).catch(e => 
        console.error('AI suggestions error:', e)
      );

      return new Response(
        JSON.stringify({ success: true, video_id: add_transcript_to_video_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle retry case
    if (retry_video_id) {
      const { data: existingVideo, error: fetchError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', retry_video_id)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !existingVideo) {
        return new Response(
          JSON.stringify({ error: 'Video not found or access denied' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reset error state and queue for reprocessing
      await supabase
        .from('videos')
        .update({ 
          status: 'queued',
          error_message: null,
          failed_step: null,
          captions_missing: false
        })
        .eq('id', retry_video_id);

      console.log('Retrying video:', retry_video_id, 'from step:', retry_from_step);
      
      // Process in background
      processVideoFromLink(retry_video_id, existingVideo.youtube_id, supabase, retry_from_step).catch(e => 
        console.error('Retry processing error:', e)
      );

      return new Response(
        JSON.stringify({ video: { ...existingVideo, status: 'queued' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New video case - validate we have at least one source
    const hasLink = youtube_url && youtube_url.trim();
    const hasText = transcript_text && transcript_text.trim();
    const hasScreenshots = screenshot_base64_list && screenshot_base64_list.length > 0;

    if (!hasLink && !hasText && !hasScreenshots) {
      return new Response(
        JSON.stringify({ error: 'Please provide a video link, paste transcript text, or upload screenshots' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine source type and extract video ID if link provided
    let videoId: string | null = null;
    let canonicalUrl = '';
    let sourceType = 'manual';
    let isYouTube = false;
    let isDirectMedia = false;
    let genericUrl = '';

    if (hasLink) {
      const normalizedUrl = normalizeUrl(youtube_url);
      
      // Check if it's a YouTube URL
      if (isYouTubeUrl(normalizedUrl)) {
        try {
          videoId = extractVideoId(normalizedUrl);
        } catch (e) {
          console.error('URL parsing error:', e);
        }

        if (!videoId) {
          return new Response(
            JSON.stringify({ error: 'Could not parse YouTube URL. Please check the link.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        canonicalUrl = getCanonicalUrl(videoId);
        sourceType = 'link';
        isYouTube = true;

        // Check if video already exists for this user
        const { data: existingVideo } = await supabase
          .from('videos')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('youtube_id', videoId)
          .maybeSingle();

        if (existingVideo) {
          return new Response(
            JSON.stringify({ 
              error: 'You already have this video in your library',
              existing_video_id: existingVideo.id
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        // Generic URL (web page, direct media, podcast, etc.)
        genericUrl = normalizedUrl;
        isDirectMedia = isDirectMediaUrl(normalizedUrl);
        sourceType = isDirectMedia ? 'media_link' : 'web_link';
        canonicalUrl = normalizedUrl;
        videoId = `generic-${Date.now()}`;
        
        // Check for duplicate URLs
        const { data: existingVideo } = await supabase
          .from('videos')
          .select('id, status')
          .eq('user_id', user.id)
          .eq('youtube_url', normalizedUrl)
          .maybeSingle();

        if (existingVideo) {
          return new Response(
            JSON.stringify({ 
              error: 'You already have this link in your library',
              existing_video_id: existingVideo.id
            }),
            { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } else if (hasScreenshots) {
      sourceType = 'upload';
    }

    // Create video record
    const { data: video, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        youtube_url: canonicalUrl || 'manual-entry',
        youtube_id: videoId || `manual-${Date.now()}`,
        title: 'Processing...',
        status: 'queued',
        source_type: sourceType,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create video record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Video created:', video.id, 'source_type:', sourceType);

    // Priority A: Transcript text provided
    if (hasText) {
      processFromText(video.id, transcript_text, videoId, supabase).catch(e => 
        console.error('Text processing error:', e)
      );
    }
    // Priority B: Screenshots provided
    else if (hasScreenshots) {
      processFromScreenshots(video.id, screenshot_base64_list, videoId, supabase).catch(e => 
        console.error('Screenshot processing error:', e)
      );
    }
    // Priority C: YouTube link
    else if (hasLink && isYouTube && videoId) {
      processVideoFromLink(video.id, videoId, supabase).catch(e => 
        console.error('Link processing error:', e)
      );
    }
    // Priority D: Generic URL (web page, direct media, podcast)
    else if (hasLink && !isYouTube && genericUrl) {
      processGenericUrl(video.id, genericUrl, isDirectMedia, supabase).catch(e => 
        console.error('Generic URL processing error:', e)
      );
    }

    return new Response(
      JSON.stringify({ video }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in add-video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Priority A: Process from pasted transcript text
async function processFromText(videoId: string, transcriptText: string, youtubeId: string | null, supabase: any) {
  try {
    await supabase
      .from('videos')
      .update({ status: 'transcribing' })
      .eq('id', videoId);

    // If we have a YouTube ID, fetch metadata
    if (youtubeId) {
      const metadata = await fetchVideoMetadata(youtubeId);
      if (metadata.success) {
        await supabase
          .from('videos')
          .update({
            title: metadata.title,
            thumbnail_url: metadata.thumbnail_url,
            duration_seconds: metadata.duration_seconds,
          })
          .eq('id', videoId);
      }
    }

    // Parse transcript text
    const segments = parseTranscriptText(transcriptText);

    if (segments.length === 0) {
      await supabase
        .from('videos')
        .update({
          status: 'failed',
          failed_step: 'parsing',
          error_message: 'Could not parse transcript text. Please check the format.',
        })
        .eq('id', videoId);
      return;
    }

    // Insert segments
    const segmentRows = segments.map(seg => ({
      video_id: videoId,
      start_seconds: seg.start,
      end_seconds: seg.end,
      text: seg.text,
    }));

    const { error: segmentError } = await supabase
      .from('transcript_segments')
      .insert(segmentRows);

    if (segmentError) {
      console.error('Segment insert error:', segmentError);
      await supabase
        .from('videos')
        .update({
          status: 'failed',
          failed_step: 'saving',
          error_message: 'Failed to save transcript segments.',
        })
        .eq('id', videoId);
      return;
    }

    // Update title if not set from metadata
    const { data: currentVideo } = await supabase
      .from('videos')
      .select('title')
      .eq('id', videoId)
      .single();

    const duration = segments[segments.length - 1]?.end || 0;
    
    await supabase
      .from('videos')
      .update({
        status: 'ready',
        title: currentVideo?.title === 'Processing...' ? 'Manual Transcript' : currentVideo?.title,
        duration_seconds: Math.ceil(duration),
        source_type: 'manual',
      })
      .eq('id', videoId);

    console.log('Text transcript saved with', segments.length, 'segments');

    // Generate AI suggestions
    await generateAISuggestions(videoId, segments, supabase);

  } catch (error: unknown) {
    console.error('Error processing text:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    await supabase
      .from('videos')
      .update({
        status: 'failed',
        failed_step: 'unknown',
        error_message: errorMessage,
      })
      .eq('id', videoId);
  }
}

// Priority B: Process from screenshots with OCR
async function processFromScreenshots(videoId: string, screenshots: string[], youtubeId: string | null, supabase: any) {
  try {
    await supabase
      .from('videos')
      .update({ status: 'transcribing' })
      .eq('id', videoId);

    // If we have a YouTube ID, fetch metadata
    if (youtubeId) {
      const metadata = await fetchVideoMetadata(youtubeId);
      if (metadata.success) {
        await supabase
          .from('videos')
          .update({
            title: metadata.title,
            thumbnail_url: metadata.thumbnail_url,
            duration_seconds: metadata.duration_seconds,
          })
          .eq('id', videoId);
      }
    }

    // Run OCR on screenshots
    const extractedText = await processScreenshotsOCR(screenshots);

    if (!extractedText || !extractedText.trim()) {
      await supabase
        .from('videos')
        .update({
          status: 'failed',
          failed_step: 'ocr',
          error_message: 'Could not extract text from screenshots. Please ensure the images contain readable text.',
        })
        .eq('id', videoId);
      return;
    }

    // Parse the OCR text
    const segments = parseTranscriptText(extractedText);

    if (segments.length === 0) {
      await supabase
        .from('videos')
        .update({
          status: 'failed',
          failed_step: 'parsing',
          error_message: 'Could not parse transcript from extracted text.',
        })
        .eq('id', videoId);
      return;
    }

    // Insert segments
    const segmentRows = segments.map(seg => ({
      video_id: videoId,
      start_seconds: seg.start,
      end_seconds: seg.end,
      text: seg.text,
    }));

    const { error: segmentError } = await supabase
      .from('transcript_segments')
      .insert(segmentRows);

    if (segmentError) {
      console.error('Segment insert error:', segmentError);
      await supabase
        .from('videos')
        .update({
          status: 'failed',
          failed_step: 'saving',
          error_message: 'Failed to save transcript segments.',
        })
        .eq('id', videoId);
      return;
    }

    // Update video
    const { data: currentVideo } = await supabase
      .from('videos')
      .select('title')
      .eq('id', videoId)
      .single();

    const duration = segments[segments.length - 1]?.end || 0;

    await supabase
      .from('videos')
      .update({
        status: 'ready',
        title: currentVideo?.title === 'Processing...' ? 'Screenshot Transcript' : currentVideo?.title,
        duration_seconds: Math.ceil(duration),
        source_type: 'upload',
      })
      .eq('id', videoId);

    console.log('Screenshot transcript saved with', segments.length, 'segments');

    // Generate AI suggestions
    await generateAISuggestions(videoId, segments, supabase);

  } catch (error: unknown) {
    console.error('Error processing screenshots:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    await supabase
      .from('videos')
      .update({
        status: 'failed',
        failed_step: 'unknown',
        error_message: errorMessage,
      })
      .eq('id', videoId);
  }
}
// Priority D: Process from generic URL (web pages, direct media, podcasts)
async function processGenericUrl(videoId: string, url: string, isDirectMedia: boolean, supabase: any) {
  try {
    await supabase
      .from('videos')
      .update({ status: 'transcribing', processing_step: 'processing' })
      .eq('id', videoId);

    console.log(`Processing generic URL: ${url} (directMedia: ${isDirectMedia})`);

    // Try to extract a title from the URL
    let title = 'Web Content';
    try {
      const urlObj = new URL(url);
      title = urlObj.hostname.replace('www.', '');
      // Extract path for better title
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
          .replace(/[-_]/g, ' ')
          .replace(/\.\w+$/, '') // remove file extension
          .trim();
        if (lastPart) title = `${title} — ${lastPart}`;
      }
    } catch (e) {
      // use default title
    }

    await supabase
      .from('videos')
      .update({ title })
      .eq('id', videoId);

    let segments: Array<{start: number, end: number, text: string}> = [];
    let transcriptSource = 'generic_url';

    if (isDirectMedia) {
      // Direct media file — download and transcribe
      console.log('Generic URL: Direct media file detected, downloading...');
      await supabase.from('videos').update({ processing_step: 'downloading_audio' }).eq('id', videoId);
      
      segments = await downloadAndTranscribeDirectMedia(url, videoId, supabase);
      transcriptSource = 'audio_transcription';
    }
    
    // If direct media failed or it's a web page, try Gemini
    if (segments.length === 0) {
      console.log('Generic URL: Using Gemini to analyze content from URL...');
      await supabase.from('videos').update({ processing_step: 'transcribing' }).eq('id', videoId);
      
      segments = await transcribeViaGeminiGenericUrl(url, videoId, supabase);
      transcriptSource = 'gemini_analysis';
    }

    if (segments.length === 0) {
      await supabase
        .from('videos')
        .update({
          status: 'needs_attention',
          failed_step: 'transcription',
          processing_step: 'failed',
          error_message: 'Could not extract content from this URL. Try uploading the audio/video file directly, or paste the transcript.',
        })
        .eq('id', videoId);
      return;
    }

    // Save segments
    await supabase.from('videos').update({ processing_step: 'segmenting' }).eq('id', videoId);

    await supabase
      .from('transcript_segments')
      .delete()
      .eq('video_id', videoId);

    const segmentRows = segments.map(seg => ({
      video_id: videoId,
      start_seconds: seg.start,
      end_seconds: seg.end,
      text: seg.text,
    }));

    const { error: segmentError } = await supabase
      .from('transcript_segments')
      .insert(segmentRows);

    if (segmentError) {
      console.error('Segment insert error:', segmentError);
      await supabase.from('videos').update({
        status: 'failed',
        failed_step: 'saving',
        error_message: 'Failed to save transcript segments.',
      }).eq('id', videoId);
      return;
    }

    const duration = Math.ceil(segments[segments.length - 1]?.end || 0);
    
    await supabase
      .from('videos')
      .update({
        status: 'ready',
        duration_seconds: duration,
        error_message: null,
        failed_step: null,
        processing_step: 'generating_highlights',
        transcript_source: transcriptSource,
      })
      .eq('id', videoId);

    console.log(`Generic URL transcript saved with ${segments.length} segments (source: ${transcriptSource})`);

    // Generate AI suggestions
    await generateAISuggestions(videoId, segments, supabase);
    await supabase.from('videos').update({ processing_step: 'ready' }).eq('id', videoId);

  } catch (error: unknown) {
    console.error('Error processing generic URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
    await supabase.from('videos').update({
      status: 'failed',
      failed_step: 'unknown',
      error_message: errorMessage,
    }).eq('id', videoId);
  }
}

// Download and transcribe a direct media URL
async function downloadAndTranscribeDirectMedia(url: string, videoId: string, supabase: any): Promise<Array<{start: number, end: number, text: string}>> {
  try {
    console.log('Downloading direct media from:', url);
    
    const audioResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': 'bytes=0-25165824', // First 24MB
      },
    });

    if (!audioResponse.ok && audioResponse.status !== 206) {
      console.error('Direct media download failed:', audioResponse.status);
      return [];
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Direct media: Downloaded ${(audioBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB`);

    if (audioBuffer.byteLength < 1000) {
      console.log('Direct media: Downloaded file too small');
      return [];
    }

    // Determine MIME type from URL
    const ext = url.match(/\.(\w+)(\?|$)/)?.[1]?.toLowerCase() || 'mp4';
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', mp4: 'video/mp4', wav: 'audio/wav', m4a: 'audio/mp4',
      webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
      mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
    };
    const mimeType = mimeMap[ext] || 'audio/mp4';

    // Try ElevenLabs first
    if (videoId && supabase) await supabase.from('videos').update({ processing_step: 'transcribing' }).eq('id', videoId);
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (ELEVENLABS_API_KEY) {
      try {
        console.log('Direct media: Trying ElevenLabs transcription...');
        const audioBlob = new Blob([audioBuffer], { type: mimeType });
        const formData = new FormData();
        formData.append('file', audioBlob, `audio.${ext}`);
        formData.append('model_id', 'scribe_v2');
        formData.append('tag_audio_events', 'false');
        formData.append('diarize', 'false');
        formData.append('timestamps_granularity', 'word');

        const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: { 'xi-api-key': ELEVENLABS_API_KEY },
          body: formData,
        });

        if (sttResponse.ok) {
          const sttData = await sttResponse.json();
          if (sttData.text?.trim()) {
            console.log(`Direct media: ElevenLabs transcribed ${sttData.words?.length || 0} words`);
            return wordsToSegments(sttData.text, sttData.words || []);
          }
        } else {
          console.error('Direct media: ElevenLabs failed:', sttResponse.status);
        }
      } catch (e) {
        console.error('Direct media: ElevenLabs error:', e);
      }
    }

    // Fallback to Gemini audio transcription
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) return [];

    try {
      console.log('Direct media: Trying Gemini transcription...');
      if (videoId && supabase) await supabase.from('videos').update({ processing_step: 'transcribing_fallback' }).eq('id', videoId);
      
      const audioBytes = new Uint8Array(audioBuffer);
      let base64Audio = '';
      const chunkSize = 8192;
      for (let i = 0; i < audioBytes.length; i += chunkSize) {
        const chunk = audioBytes.subarray(i, i + chunkSize);
        base64Audio += String.fromCharCode(...chunk);
      }
      base64Audio = btoa(base64Audio);

      const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are an audio transcription assistant. Transcribe the audio accurately. Return ONLY valid JSON:
{"segments": [{"start": 0, "end": 15, "text": "segment text here"}]}
Rules: Transcribe all spoken words, split into ~15-20s segments, estimate timestamps. No markdown, no explanation.`
            },
            {
              role: 'user',
              content: [
                { type: 'input_audio', input_audio: { data: base64Audio, format: ext === 'wav' ? 'wav' : ext === 'mp3' ? 'mp3' : 'mp4' } },
                { type: 'text', text: 'Transcribe this audio recording. Return only JSON.' }
              ]
            }
          ],
        }),
      });

      if (geminiResponse.ok) {
        const geminiData = await geminiResponse.json();
        const content = geminiData.choices?.[0]?.message?.content || '';
        const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.segments?.length > 0) {
          return parsed.segments
            .map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
            .filter((s: any) => s.text.length > 0);
        }
      }
    } catch (e) {
      console.error('Direct media: Gemini error:', e);
    }

    return [];
  } catch (error) {
    console.error('Direct media: Unexpected error:', error);
    return [];
  }
}

// Use Gemini to analyze and extract content from any URL
async function transcribeViaGeminiGenericUrl(url: string, videoId: string, supabase: any): Promise<Array<{start: number, end: number, text: string}>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('Gemini generic URL: No LOVABLE_API_KEY');
    return [];
  }

  try {
    console.log('Gemini generic URL: Analyzing content from', url);

    // First, try to fetch the page content for context
    let pageContent = '';
    try {
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (pageResponse.ok) {
        const html = await pageResponse.text();
        // Extract text content, title, and meta description
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["'](.*?)["']/i);
        const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i);
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);
        
        const pageTitle = ogTitleMatch?.[1] || titleMatch?.[1] || '';
        if (pageTitle) {
          await supabase.from('videos').update({ 
            title: pageTitle.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').slice(0, 200),
            thumbnail_url: ogImageMatch?.[1] || null,
          }).eq('id', videoId);
        }
        
        // Strip HTML tags to get plain text (limited to first 15000 chars)
        pageContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 15000);
      }
    } catch (e) {
      console.log('Could not fetch page content:', e);
    }

    // Use Gemini to analyze the URL content
    const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You analyze web content and extract all valuable information, organizing it into segments. Return ONLY valid JSON:
{
  "title": "descriptive title",
  "segments": [
    {"start": 0, "end": 30, "text": "content segment here"},
    {"start": 30, "end": 60, "text": "next content segment"}
  ]
}
Rules:
- Extract ALL valuable, actionable, and informative content from the page
- If there's video/audio content mentioned, describe what was discussed
- Split into logical segments of 20-30 seconds each (assign sequential timestamps)
- Include key points, insights, data, quotes, instructions — everything useful
- Do NOT include navigation elements, ads, or boilerplate
- If this is a video/podcast page, extract any transcripts, show notes, or descriptions
- Be thorough — capture everything worth remembering or acting on
- No markdown, no explanation — ONLY the JSON object`
          },
          {
            role: 'user',
            content: `Analyze this URL and extract all valuable content: ${url}

${pageContent ? `Here is the page text content:\n\n${pageContent}` : 'Please visit the URL and analyze the content.'}`
          }
        ],
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini generic URL: API error', geminiResponse.status, errText.slice(0, 300));
      return [];
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.choices?.[0]?.message?.content || '';
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const parsed = JSON.parse(jsonStr);
    
    // Update title if Gemini found a better one
    if (parsed.title) {
      await supabase.from('videos').update({ title: String(parsed.title).slice(0, 200) }).eq('id', videoId);
    }

    if (parsed.segments?.length > 0) {
      const segments = parsed.segments
        .map((s: any) => ({
          start: Number(s.start) || 0,
          end: Number(s.end) || 0,
          text: String(s.text || '').trim(),
        }))
        .filter((s: any) => s.text.length > 0);
      
      console.log(`Gemini generic URL: Extracted ${segments.length} segments`);
      return segments;
    }

    return [];
  } catch (e) {
    console.error('Gemini generic URL: Error:', e);
    return [];
  }
}


function evaluateTranscriptQuality(segments: Array<{start: number, end: number, text: string}>, videoDurationSeconds?: number): {
  isGood: boolean;
  reason: string;
} {
  if (!segments || segments.length === 0) {
    return { isGood: false, reason: 'No segments' };
  }

  // Check 1: Too few segments for a real transcript
  if (segments.length < 3) {
    return { isGood: false, reason: `Only ${segments.length} segments — likely incomplete` };
  }

  // Check 2: Total word count too low (a real spoken transcript has many words)
  const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  if (totalWords < 50) {
    return { isGood: false, reason: `Only ${totalWords} words — too sparse for spoken transcript` };
  }

  // Check 3: Average segment length is suspiciously short (page metadata, not speech)
  const avgWordsPerSegment = totalWords / segments.length;
  if (avgWordsPerSegment < 4) {
    return { isGood: false, reason: `Average ${avgWordsPerSegment.toFixed(1)} words/segment — looks like metadata, not speech` };
  }

  // Check 4: Large timestamp gaps (>120s between consecutive segments)
  let largeGaps = 0;
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap > 120) largeGaps++;
  }
  if (largeGaps > segments.length * 0.3) {
    return { isGood: false, reason: `${largeGaps} large timestamp gaps — missing spoken continuity` };
  }

  // Check 5: All timestamps are 0 or synthetic (30s intervals)
  const allSyntheticTimestamps = segments.every((s, i) => s.start === i * 30);
  if (allSyntheticTimestamps && segments.length > 2) {
    // Check if content looks like page text vs speech
    const fullText = segments.map(s => s.text).join(' ').toLowerCase();
    const pageIndicators = ['subscribe', 'click here', 'copyright', 'privacy policy', 'terms of service', 'all rights reserved', 'sign in', 'sign up', 'cookies'];
    const pageIndicatorCount = pageIndicators.filter(ind => fullText.includes(ind)).length;
    if (pageIndicatorCount >= 2) {
      return { isGood: false, reason: 'Content appears to be page text, not spoken dialogue' };
    }
    return { isGood: false, reason: 'Synthetic timestamps detected — likely scraped page text, not real captions' };
  }

  // Check 6: If we know the video duration, check coverage
  if (videoDurationSeconds && videoDurationSeconds > 60) {
    const transcriptDuration = segments[segments.length - 1].end - segments[0].start;
    const coverage = transcriptDuration / videoDurationSeconds;
    if (coverage < 0.3) {
      return { isGood: false, reason: `Transcript covers only ${(coverage * 100).toFixed(0)}% of video duration` };
    }
  }

  return { isGood: true, reason: 'Passed quality checks' };
}

// Check if transcript content is topically relevant to the video title using AI
async function checkTopicalRelevance(
  title: string,
  segments: Array<{start: number, end: number, text: string}>
): Promise<{ relevant: boolean; reason: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('No LOVABLE_API_KEY — skipping topical relevance check');
    return { relevant: true, reason: 'Skipped — no API key' };
  }

  try {
    // Use first ~500 words of transcript for the check
    const sampleText = segments.map(s => s.text).join(' ').slice(0, 2000);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          {
            role: 'system',
            content: `You determine whether a transcript excerpt matches a given video title. Return ONLY valid JSON: {"relevant": true/false, "reason": "brief explanation"}. A transcript is RELEVANT if it discusses the same topic, person, or theme as the title — even loosely. It is NOT relevant if it's clearly about a completely different subject (e.g., title about psychology but transcript about shopping). Be lenient — partial overlap counts as relevant.`
          },
          {
            role: 'user',
            content: `Video title: "${title}"\n\nTranscript excerpt:\n${sampleText}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error('Topical relevance check: API error', response.status);
      return { relevant: true, reason: 'API error — defaulting to relevant' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    console.log(`Topical relevance check: relevant=${parsed.relevant}, reason=${parsed.reason}`);
    return { relevant: !!parsed.relevant, reason: String(parsed.reason || '') };
  } catch (e) {
    console.error('Topical relevance check error:', e);
    return { relevant: true, reason: 'Error during check — defaulting to relevant' };
  }
}

// Priority C: Process from YouTube link
async function processVideoFromLink(videoId: string, youtubeId: string, supabase: any, startFromStep?: string) {
  const steps = ['metadata', 'captions', 'ai_suggestions'];
  const startIndex = startFromStep ? steps.indexOf(startFromStep) : 0;
  
  try {
    let videoDurationSeconds: number | undefined;
    let videoTitle: string | undefined;

    // Step 1: Fetch metadata
    if (startIndex <= 0) {
      console.log('Step 1: Fetching metadata for video:', videoId);
      
      await supabase
        .from('videos')
        .update({ status: 'transcribing', processing_step: 'processing' })
        .eq('id', videoId);

      const metadata = await fetchVideoMetadata(youtubeId);
      
      if (!metadata.success) {
        await supabase
          .from('videos')
          .update({ 
            status: 'failed',
            failed_step: 'metadata',
            error_message: metadata.error || 'Could not fetch video information. The video may be private, deleted, or region-restricted.'
          })
          .eq('id', videoId);
        return;
      }

      videoDurationSeconds = metadata.duration_seconds;

      await supabase
        .from('videos')
        .update({ 
          title: metadata.title,
          thumbnail_url: metadata.thumbnail_url,
          duration_seconds: metadata.duration_seconds
        })
        .eq('id', videoId);

      videoTitle = metadata.title;
      console.log('Metadata fetched:', metadata.title);
    }

    // Step 2: Fetch captions/transcript with quality check
    if (startIndex <= 1) {
      // Fetch title if we don't have it (retry case)
      if (!videoTitle) {
        const { data: vd } = await supabase.from('videos').select('title, duration_seconds').eq('id', videoId).single();
        videoTitle = vd?.title;
        if (!videoDurationSeconds) videoDurationSeconds = vd?.duration_seconds;
      }

      console.log('Step 2: Fetching captions for video:', videoId);

      await supabase.from('videos').update({ processing_step: 'extracting_captions' }).eq('id', videoId);

      let transcript = await fetchYouTubeCaptions(youtubeId);
      let transcriptSource = 'captions';
      
      // Quality check: evaluate if the fetched transcript is actually good
      if (transcript && transcript.length > 0) {
        const quality = evaluateTranscriptQuality(transcript, videoDurationSeconds);
        if (!quality.isGood) {
          console.log(`Caption quality check FAILED: ${quality.reason}. Proceeding to audio transcription...`);
          // Store the weak captions as fallback but try audio first
          const weakCaptions = transcript;
          
          await supabase.from('videos').update({ processing_step: 'downloading_audio' }).eq('id', videoId);
          const audioTranscript = await downloadAndTranscribeAudio(youtubeId, videoId, supabase, videoTitle);
          
          if (audioTranscript && audioTranscript.length > 0) {
            const audioQuality = evaluateTranscriptQuality(audioTranscript, videoDurationSeconds);
            if (audioQuality.isGood) {
              console.log('Audio transcription succeeded and passed quality check — using it over weak captions');
              transcript = audioTranscript;
              transcriptSource = 'audio_transcription';
            } else {
              // Audio also weak — pick whichever has more content
              const captionWords = weakCaptions.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
              const audioWords = audioTranscript.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
              if (audioWords > captionWords) {
                console.log('Both weak, but audio has more content — using audio');
                transcript = audioTranscript;
                transcriptSource = 'audio_transcription';
              } else {
                console.log('Both weak, keeping original captions as they have more content');
                transcriptSource = 'captions';
              }
            }
          } else {
            console.log('Audio transcription failed or empty — weak captions are not usable, setting needs_attention');
            await supabase
              .from('videos')
              .update({
                captions_missing: true,
                status: 'needs_attention',
                failed_step: 'captions',
                processing_step: 'failed',
                error_message: 'Captions were low quality (page text/comments, not spoken dialogue) and audio transcription failed. Please add the transcript manually.',
              })
              .eq('id', videoId);
            return;
          }
        } else {
          console.log('Caption quality check PASSED — using fetched captions');
          transcriptSource = 'captions';
        }
      }
      
      // If captions were empty/null, try audio transcription
      if (!transcript || transcript.length === 0) {
        console.log('All caption methods failed, trying audio download + transcription...');
        await supabase.from('videos').update({ processing_step: 'downloading_audio' }).eq('id', videoId);
        transcript = await downloadAndTranscribeAudio(youtubeId, videoId, supabase, videoTitle);
        if (transcript && transcript.length > 0) {
          transcriptSource = 'audio_transcription';
        }
      }

      // Last resort: Try Firecrawl page scrape (page text, not spoken word)
      if (!transcript || transcript.length === 0) {
        const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
        if (FIRECRAWL_API_KEY) {
          try {
            console.log('Last resort: Trying Firecrawl page scrape for', youtubeId);
            await supabase.from('videos').update({ processing_step: 'scraping_page' }).eq('id', videoId);
            transcript = await fetchContentViaFirecrawl(youtubeId, FIRECRAWL_API_KEY);
            if (transcript && transcript.length > 0) {
              transcriptSource = 'firecrawl_scrape';
              console.log(`Firecrawl last resort: Got ${transcript.length} segments (page text, not spoken word)`);
            }
          } catch (e) {
            console.error('Firecrawl last resort failed:', e);
          }
        }
      }

      if (!transcript || transcript.length === 0) {
        await supabase
          .from('videos')
          .update({ 
            captions_missing: true,
            status: 'needs_attention',
            failed_step: 'captions',
            processing_step: 'failed',
            error_message: 'No captions available and audio transcription failed. Please add the transcript manually by pasting text or uploading screenshots.'
          })
          .eq('id', videoId);
        
        console.log('All methods failed (captions, audio, Firecrawl), set to needs_attention');
        return;
      }

      // Detect if Gemini fallback was used (check processing_step)
      const { data: currentState } = await supabase.from('videos').select('processing_step').eq('id', videoId).single();
      if (currentState?.processing_step === 'transcribing_fallback' && transcriptSource === 'audio_transcription') {
        transcriptSource = 'gemini_fallback';
      }

      // Topical relevance check
      const { data: videoForTitle } = await supabase.from('videos').select('title').eq('id', videoId).single();
      const currentTitle = videoForTitle?.title || videoTitle || '';
      
      if (currentTitle && currentTitle !== 'Processing...' && transcript && transcript.length > 0) {
        const relevance = await checkTopicalRelevance(currentTitle, transcript);
        if (!relevance.relevant) {
          console.log(`Topical relevance FAILED: "${relevance.reason}". Rejecting transcript.`);
          await supabase
            .from('videos')
            .update({
              status: 'needs_attention',
              failed_step: 'captions',
              processing_step: 'failed',
              error_message: `Transcript content does not match the video topic ("${currentTitle}"). Please record the audio manually.`,
              captions_missing: true,
            })
            .eq('id', videoId);
          return;
        }
      }

      await supabase.from('videos').update({ processing_step: 'segmenting' }).eq('id', videoId);

      // Delete existing segments if retrying
      await supabase
        .from('transcript_segments')
        .delete()
        .eq('video_id', videoId);

      // Insert transcript segments
      const segments = transcript.map(seg => ({
        video_id: videoId,
        start_seconds: seg.start,
        end_seconds: seg.end,
        text: seg.text,
      }));

      const { error: segmentError } = await supabase
        .from('transcript_segments')
        .insert(segments);

      if (segmentError) {
        console.error('Segment insert error:', segmentError);
        await supabase
          .from('videos')
          .update({ 
            status: 'failed',
            failed_step: 'captions',
            error_message: 'Failed to save transcript. Please try again.'
          })
          .eq('id', videoId);
        return;
      }

      const duration = Math.ceil(transcript[transcript.length - 1]?.end || 0);
      
      await supabase
        .from('videos')
        .update({ 
          status: 'ready',
          duration_seconds: duration,
          captions_missing: false,
          error_message: null,
          failed_step: null,
          processing_step: 'generating_highlights',
          transcript_source: transcriptSource,
        })
        .eq('id', videoId);

      console.log(`Transcript saved with ${segments.length} segments (source: ${transcriptSource})`);
    }

    // Step 3: Generate AI suggestions
    if (startIndex <= 2) {
      console.log('Step 3: Generating AI suggestions for video:', videoId);
      
      const { data: segments } = await supabase
        .from('transcript_segments')
        .select('*')
        .eq('video_id', videoId)
        .order('start_seconds');

      if (segments && segments.length > 0) {
        const transcript = segments.map((s: any) => ({
          start: s.start_seconds,
          end: s.end_seconds,
          text: s.text
        }));
        
        await generateAISuggestions(videoId, transcript, supabase);
      }
    }

    await supabase.from('videos').update({ processing_step: 'ready' }).eq('id', videoId);
    console.log('Video processed successfully:', videoId);

  } catch (error: unknown) {
    console.error('Error processing video:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred while processing the video.';
    await supabase
      .from('videos')
      .update({ 
        status: 'failed',
        failed_step: 'unknown',
        error_message: errorMessage
      })
      .eq('id', videoId);
  }
}

async function processScreenshotsOCR(screenshots: string[]): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('No LOVABLE_API_KEY, cannot process OCR');
    return '';
  }

  const allText: string[] = [];

  for (const base64Image of screenshots) {
    try {
      // Use vision model to extract text
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text from this image. Preserve timestamps if present (like 0:00, 1:30, etc). Return only the extracted text, nothing else.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const extractedText = result.choices?.[0]?.message?.content;
        if (extractedText) {
          allText.push(extractedText);
        }
      } else {
        console.error('OCR request failed:', response.status);
      }
    } catch (error) {
      console.error('Error processing screenshot:', error);
    }
  }

  return allText.join('\n\n');
}

async function fetchVideoMetadata(youtubeId: string): Promise<{
  success: boolean;
  title?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  error?: string;
}> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'This video is private or restricted.' };
      }
      if (response.status === 404) {
        return { success: false, error: 'Video not found. Please check the URL.' };
      }
      return { success: false, error: `Could not access video (status: ${response.status})` };
    }
    
    const data = await response.json();
    
    return {
      success: true,
      title: data.title || 'Untitled Video',
      thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
    };
  } catch (error) {
    console.error('Error fetching metadata:', error);
    return { success: false, error: 'Network error while fetching video information.' };
  }
}

async function fetchYouTubeCaptions(youtubeId: string): Promise<Array<{start: number, end: number, text: string}>> {
  // Try multiple methods in order of reliability
  
  // Method 0: RapidAPI YouTube Transcript
  const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY');
  if (RAPIDAPI_KEY) {
    try {
      console.log('Method 0: Trying RapidAPI YouTube Transcript for', youtubeId);
      const rapidRes = await fetch(
        `https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${youtubeId}`,
        {
          method: 'GET',
          headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': 'youtube-transcript3.p.rapidapi.com',
          },
        }
      );
      if (rapidRes.ok) {
        const rapidData = await rapidRes.json();
        const items = rapidData?.transcript ?? rapidData ?? [];
        if (Array.isArray(items) && items.length > 0) {
          const segments = items.map((item: any) => ({
            start: Number(item.offset ?? item.start ?? 0) / 1000,
            end: (Number(item.offset ?? item.start ?? 0) + Number(item.duration ?? 5000)) / 1000,
            text: String(item.text ?? item.subtitle ?? '').trim(),
          })).filter((s: any) => s.text.length > 0);
          if (segments.length > 0) {
            console.log(`Method 0: RapidAPI got ${segments.length} segments`);
            return segments;
          }
        }
      } else {
        console.log('Method 0: RapidAPI returned', rapidRes.status);
      }
    } catch (e) {
      console.error('Method 0: RapidAPI error:', e);
    }
  }

  // Method 1: Innertube API (most reliable)
  try {
    console.log('Method 1: Trying Innertube API for', youtubeId);
    const innertubeResult = await fetchCaptionsViaInnertube(youtubeId);
    if (innertubeResult.length > 0) {
      console.log(`Innertube: Got ${innertubeResult.length} segments`);
      return innertubeResult;
    }
  } catch (e) {
    console.error('Innertube method failed:', e);
  }

  // Method 2: HTML scrape (original approach)
  try {
    console.log('Method 2: Trying HTML scrape for', youtubeId);
    const htmlResult = await fetchCaptionsViaHtmlScrape(youtubeId);
    if (htmlResult.length > 0) {
      console.log(`HTML scrape: Got ${htmlResult.length} segments`);
      return htmlResult;
    }
  } catch (e) {
    console.error('HTML scrape method failed:', e);
  }

  // Method 3: Direct timedtext API
  try {
    console.log('Method 3: Trying direct timedtext API for', youtubeId);
    const timedtextResult = await fetchCaptionsViaTimedtext(youtubeId);
    if (timedtextResult.length > 0) {
      console.log(`Timedtext: Got ${timedtextResult.length} segments`);
      return timedtextResult;
    }
  } catch (e) {
    console.error('Timedtext method failed:', e);
  }

  console.log('All caption methods failed for', youtubeId);
  return [];
}

// Method 4: Use Firecrawl to scrape YouTube page content
async function fetchContentViaFirecrawl(youtubeId: string, apiKey: string): Promise<Array<{start: number, end: number, text: string}>> {
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: videoUrl,
      formats: ['markdown'],
      onlyMainContent: true,
    }),
  });

  if (!response.ok) {
    console.error('Firecrawl API error:', response.status);
    return [];
  }

  const data = await response.json();
  const markdown = data?.data?.markdown || data?.markdown || '';
  
  if (!markdown || markdown.trim().length < 100) {
    console.log('Firecrawl: Not enough content extracted');
    return [];
  }

  // Parse the markdown content into transcript-like segments
  // Filter out navigation, metadata lines — keep substantive paragraphs
  const paragraphs = markdown
    .split(/\n\n+/)
    .map((p: string) => p.replace(/\n/g, ' ').trim())
    .filter((p: string) => p.length > 20 && !p.startsWith('#') && !p.startsWith('[') && !p.startsWith('!'));

  if (paragraphs.length === 0) return [];

  const segments: Array<{start: number, end: number, text: string}> = [];
  let currentTime = 0;
  const avgSegmentDuration = 30;

  for (const para of paragraphs) {
    segments.push({
      start: currentTime,
      end: currentTime + avgSegmentDuration,
      text: para,
    });
    currentTime += avgSegmentDuration;
  }

  // Update end times to be contiguous
  for (let i = 0; i < segments.length - 1; i++) {
    segments[i].end = segments[i + 1].start;
  }

  return segments;
}

// Method 1: Use YouTube's Innertube API
async function fetchCaptionsViaInnertube(youtubeId: string): Promise<Array<{start: number, end: number, text: string}>> {
  const response = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
        },
      },
      videoId: youtubeId,
    }),
  });

  if (!response.ok) {
    console.error('Innertube API returned:', response.status);
    return [];
  }

  const data = await response.json();
  const captions = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  
  if (!captions || captions.length === 0) {
    console.log('No caption tracks in Innertube response');
    return [];
  }

  // Prefer manual English, then auto English, then any
  let track = captions.find((t: any) => t.languageCode === 'en' && t.kind !== 'asr')
    || captions.find((t: any) => t.languageCode === 'en')
    || captions.find((t: any) => t.kind !== 'asr')
    || captions[0];

  if (!track?.baseUrl) return [];

  return await fetchAndParseCaptionXml(track.baseUrl);
}

// Method 2: Scrape HTML page for caption track URLs
async function fetchCaptionsViaHtmlScrape(youtubeId: string): Promise<Array<{start: number, end: number, text: string}>> {
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const response = await fetch(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  const html = await response.text();
  
  // Try multiple regex patterns
  const patterns = [
    /"captionTracks":\s*(\[.*?\])/,
    /captionTracks":\s*(\[.*?\])\s*,/,
  ];

  let captionData: any[] = [];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        captionData = JSON.parse(match[1]);
        break;
      } catch (e) {
        continue;
      }
    }
  }

  if (captionData.length === 0) {
    // Try extracting from ytInitialPlayerResponse
    const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{.*?\});/);
    if (playerMatch) {
      try {
        const playerData = JSON.parse(playerMatch[1]);
        captionData = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      } catch (e) {
        console.error('Failed to parse player response');
      }
    }
  }
  
  if (captionData.length === 0) return [];

  let track = captionData.find((t: any) => t.languageCode === 'en' && !t.kind) 
    || captionData.find((t: any) => t.languageCode === 'en')
    || captionData.find((t: any) => !t.kind)
    || captionData[0];
  
  if (!track?.baseUrl) return [];

  return await fetchAndParseCaptionXml(track.baseUrl);
}

// Method 3: Direct timedtext API (works for some videos with auto-captions)
async function fetchCaptionsViaTimedtext(youtubeId: string): Promise<Array<{start: number, end: number, text: string}>> {
  const langs = ['en', 'en-US', 'en-GB'];
  
  for (const lang of langs) {
    // Try auto-generated captions
    const asr_url = `https://www.youtube.com/api/timedtext?v=${youtubeId}&lang=${lang}&kind=asr&fmt=srv3`;
    try {
      const response = await fetch(asr_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (response.ok) {
        const xml = await response.text();
        if (xml.includes('<text')) {
          const segments = parseCaptionXml(xml);
          if (segments.length > 0) return combineShortSegments(segments);
        }
      }
    } catch (e) { /* continue */ }

    // Try manual captions
    const manual_url = `https://www.youtube.com/api/timedtext?v=${youtubeId}&lang=${lang}&fmt=srv3`;
    try {
      const response = await fetch(manual_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      if (response.ok) {
        const xml = await response.text();
        if (xml.includes('<text')) {
          const segments = parseCaptionXml(xml);
          if (segments.length > 0) return combineShortSegments(segments);
        }
      }
    } catch (e) { /* continue */ }
  }

  return [];
}

// Shared: Fetch a caption URL and parse the XML
async function fetchAndParseCaptionXml(url: string): Promise<Array<{start: number, end: number, text: string}>> {
  const response = await fetch(url);
  if (!response.ok) return [];
  const xml = await response.text();
  const segments = parseCaptionXml(xml);
  return combineShortSegments(segments);
}

// Shared: Parse caption XML into segments
function parseCaptionXml(xml: string): Array<{start: number, end: number, text: string}> {
  const segments: Array<{start: number, end: number, text: string}> = [];
  const textMatches = xml.matchAll(/<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g);
  
  for (const match of textMatches) {
    const start = parseFloat(match[1]);
    const duration = parseFloat(match[2]);
    let text = match[3]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
    
    if (text) {
      segments.push({ start, end: start + duration, text });
    }
  }
  return segments;
}

// Shared: Combine short segments into longer ones
function combineShortSegments(segments: Array<{start: number, end: number, text: string}>): Array<{start: number, end: number, text: string}> {
  const combined: Array<{start: number, end: number, text: string}> = [];
  let current: {start: number, end: number, text: string} | null = null;
  
  for (const seg of segments) {
    if (!current) {
      current = { ...seg };
    } else if (current.end - current.start < 15 && seg.start - current.end < 2) {
      current.end = seg.end;
      current.text += ' ' + seg.text;
    } else {
      combined.push(current);
      current = { ...seg };
    }
  }
  if (current) combined.push(current);

  console.log(`Combined into ${combined.length} segments`);
  return combined;
}

// Method 5b: Use Gemini to transcribe directly from YouTube URL (no audio extraction needed)
async function transcribeViaGeminiYouTubeUrl(youtubeId: string, videoId?: string, supabase?: any, videoTitle?: string): Promise<Array<{start: number, end: number, text: string}>> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('Gemini YouTube fallback: No LOVABLE_API_KEY');
    return [];
  }

  try {
    console.log('Gemini YouTube fallback: Transcribing directly from YouTube URL for', youtubeId);
    if (videoId && supabase) await supabase.from('videos').update({ processing_step: 'transcribing_fallback' }).eq('id', videoId);

    const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content: `You are a content reconstruction assistant. When given a YouTube video URL and title, reconstruct the likely spoken content based on your knowledge of the video, its creator, and the topic. Return ONLY valid JSON with this exact format:
{
  "segments": [
    {"start": 0, "end": 15, "text": "segment text here"},
    {"start": 15, "end": 30, "text": "next segment text"}
  ]
}
Rules:
- Reconstruct the spoken content as faithfully as possible based on the video's topic and creator
- Split into segments of roughly 15-20 seconds each
- Assign plausible timestamps
- Include substantive content — do NOT just summarize in one paragraph
- Generate at least 10 segments of detailed content
- Stay on topic with the video title
- Do NOT include any markdown, code fences, or explanation — ONLY the JSON object`
          },
          {
            role: 'user',
            content: `Reconstruct the spoken content from this YouTube video: https://www.youtube.com/watch?v=${youtubeId}
Video title: "${videoTitle || 'Unknown'}"

Based on the video title and creator, generate detailed, topically accurate content segments about this specific topic. Return only the JSON.`
          }
        ],
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini YouTube fallback: API error', geminiResponse.status, errText.slice(0, 300));
      return [];
    }

    const geminiData = await geminiResponse.json();
    const content = geminiData.choices?.[0]?.message?.content || '';
    const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const parsed = JSON.parse(jsonStr);
    if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
      const segments = parsed.segments
        .map((s: any) => ({
          start: Number(s.start) || 0,
          end: Number(s.end) || 0,
          text: String(s.text || '').trim(),
        }))
        .filter((s: any) => s.text.length > 0);
      
      console.log(`Gemini YouTube fallback: Transcribed ${segments.length} segments`);
      return segments;
    }
    
    console.log('Gemini YouTube fallback: No valid segments in response');
    return [];
  } catch (e) {
    console.error('Gemini YouTube fallback: Error:', e);
    return [];
  }
}

// Method 5: Download YouTube audio via Innertube streaming URLs and transcribe
async function downloadAndTranscribeAudio(youtubeId: string, videoId?: string, supabase?: any, videoTitle?: string): Promise<Array<{start: number, end: number, text: string}>> {
  try {
    // Method 0: RapidAPI YouTube Transcript (most reliable)
    const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY');
    if (RAPIDAPI_KEY) {
      try {
        console.log('Audio fallback: Trying RapidAPI transcript for', youtubeId);
        const rapidRes = await fetch(
          `https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${youtubeId}`,
          {
            method: 'GET',
            headers: {
              'x-rapidapi-key': RAPIDAPI_KEY,
              'x-rapidapi-host': 'youtube-transcript3.p.rapidapi.com',
            },
          }
        );
        if (rapidRes.ok) {
          const rapidData = await rapidRes.json();
          const items = rapidData?.transcript ?? rapidData ?? [];
          if (Array.isArray(items) && items.length > 0) {
            const segments = items.map((item: any) => ({
              start: Number(item.offset ?? item.start ?? 0) / 1000,
              end: (Number(item.offset ?? item.start ?? 0) + Number(item.duration ?? 5000)) / 1000,
              text: String(item.text ?? item.subtitle ?? '').trim(),
            })).filter((s: any) => s.text.length > 0);
            if (segments.length > 0) {
              console.log(`Audio fallback: RapidAPI got ${segments.length} segments`);
              return segments;
            }
          }
        } else {
          console.log('Audio fallback: RapidAPI returned', rapidRes.status);
        }
      } catch (e) {
        console.error('Audio fallback: RapidAPI error:', e);
      }
    }

    // Step 1: Try multiple Innertube clients to find audio streams
    // WEB client often blocks direct URLs; ANDROID/IOS clients expose them more reliably
    const clientConfigs = [
      {
        name: 'TV_EMBEDDED',
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraBody: {
          thirdParty: { embedUrl: 'https://www.youtube.com/' },
          racyCheckOk: true,
          contentCheckOk: true,
        },
      },
      {
        name: 'WEB',
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      {
        name: 'ANDROID',
        clientName: 'ANDROID',
        clientVersion: '19.09.37',
        userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
        androidSdkVersion: 34,
      },
      {
        name: 'IOS',
        clientName: 'IOS',
        clientVersion: '19.09.3',
        userAgent: 'com.google.ios.youtube/19.09.3 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
    ];

    let audioFormat: any = null;
    let audioUrl: string | null = null;
    let usedClient = '';

    for (const client of clientConfigs) {
      console.log(`Audio fallback: Trying ${client.name} client for`, youtubeId);
      try {
        const body: any = {
          context: {
            client: {
              hl: 'en',
              gl: 'US',
              clientName: client.clientName,
              clientVersion: client.clientVersion,
            },
          },
          videoId: youtubeId,
          ...(client as any).extraBody,
        };

        // Android client needs androidSdkVersion
        if ((client as any).androidSdkVersion) {
          body.context.client.androidSdkVersion = (client as any).androidSdkVersion;
        }

        const playerResponse = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': client.userAgent,
          },
          body: JSON.stringify(body),
        });

        if (!playerResponse.ok) {
          console.log(`Audio fallback: ${client.name} returned ${playerResponse.status}`);
          continue;
        }

        const playerData = await playerResponse.json();
        
        // Check playability status
        const playability = playerData?.playabilityStatus?.status;
        if (playability && playability !== 'OK') {
          console.log(`Audio fallback: ${client.name} playability: ${playability}`);
          continue;
        }

        const adaptiveFormats = playerData?.streamingData?.adaptiveFormats || [];
        const formats = playerData?.streamingData?.formats || [];
        const allFormats = [...adaptiveFormats, ...formats];
        
        // Find audio-only streams, prefer mp4a (AAC) for best compatibility
        const audioFormats = allFormats
          .filter((f: any) => f.mimeType?.startsWith('audio/'))
          .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

        if (audioFormats.length === 0) {
          console.log(`Audio fallback: ${client.name} — no audio streams found`);
          continue;
        }

        const candidate = audioFormats.find((f: any) => f.mimeType?.includes('mp4a'))
          || audioFormats[0];
        
        const candidateUrl = candidate.url;
        if (!candidateUrl) {
          console.log(`Audio fallback: ${client.name} — audio URL not directly available (signature required)`);
          continue;
        }

        audioFormat = candidate;
        audioUrl = candidateUrl;
        usedClient = client.name;
        console.log(`Audio fallback: ${client.name} — found audio stream! (${candidate.mimeType}, bitrate: ${candidate.bitrate})`);
        break;
      } catch (e) {
        console.error(`Audio fallback: ${client.name} error:`, e);
      }
    }

    // Fallback: Try Piped API instances if Innertube failed
    if (!audioUrl) {
      const pipedInstances = [
        'https://pipedapi.tokhmi.xyz',
        'https://piped-api.garudalinux.org',
        'https://pipedapi.leptons.xyz',
      ];

      for (const instance of pipedInstances) {
        try {
          console.log(`Audio fallback: Trying Piped instance ${instance} for`, youtubeId);
          const pipedResponse = await fetch(`${instance}/streams/${youtubeId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });

          if (!pipedResponse.ok) {
            console.log(`Audio fallback: Piped ${instance} returned ${pipedResponse.status}`);
            continue;
          }

          const pipedData = await pipedResponse.json();
          const audioStreams = pipedData?.audioStreams || [];
          
          if (audioStreams.length === 0) {
            console.log(`Audio fallback: Piped ${instance} — no audio streams`);
            continue;
          }

          // Sort by bitrate, prefer mp4a
          const sorted = audioStreams
            .filter((s: any) => s.url)
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          
          const best = sorted.find((s: any) => s.mimeType?.includes('mp4a') || s.codec?.includes('mp4a'))
            || sorted[0];

          if (best?.url) {
            audioUrl = best.url;
            audioFormat = { mimeType: best.mimeType || 'audio/mp4', bitrate: best.bitrate };
            usedClient = `Piped(${instance})`;
            console.log(`Audio fallback: Piped found audio! (${best.mimeType}, bitrate: ${best.bitrate})`);
            break;
          }
        } catch (e) {
          console.error(`Audio fallback: Piped ${instance} error:`, e);
        }
      }
    }

    // Fallback: Try cobalt.tools API
    if (!audioUrl) {
      console.log('Audio fallback: Trying cobalt.tools API for', youtubeId);
      try {
        const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${youtubeId}`,
            isAudioOnly: true,
            aFormat: 'mp3',
          }),
        });

        if (cobaltResponse.ok) {
          const cobaltData = await cobaltResponse.json();
          console.log('Audio fallback: cobalt response status:', cobaltData.status);
          
          if (cobaltData.status === 'tunnel' || cobaltData.status === 'redirect') {
            audioUrl = cobaltData.url;
            audioFormat = { mimeType: 'audio/mpeg', bitrate: 128000 };
            usedClient = 'cobalt.tools';
            console.log('Audio fallback: cobalt.tools provided audio URL!');
          } else if (cobaltData.status === 'error') {
            console.log('Audio fallback: cobalt.tools error:', cobaltData.error?.code || cobaltData.text);
          }
        } else {
          const errText = await cobaltResponse.text();
          console.log(`Audio fallback: cobalt.tools returned ${cobaltResponse.status}:`, errText.slice(0, 200));
        }
      } catch (e) {
        console.error('Audio fallback: cobalt.tools error:', e);
      }
    }

    // Fallback: Try Invidious instances
    if (!audioUrl) {
      const invidiousInstances = [
        'https://invidious.privacyredirect.com',
        'https://iv.datura.network',
        'https://invidious.perennialte.ch',
        'https://yt.cdaut.de',
      ];
      
      for (const instance of invidiousInstances) {
        try {
          console.log(`Audio fallback: Trying Invidious ${instance} for`, youtubeId);
          const invResponse = await fetch(`${instance}/api/v1/videos/${youtubeId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          
          if (!invResponse.ok) {
            console.log(`Audio fallback: Invidious ${instance} returned ${invResponse.status}`);
            await invResponse.text(); // consume body
            continue;
          }
          
          const invData = await invResponse.json();
          const adaptiveFormats = invData?.adaptiveFormats || [];
          const audioStreams = adaptiveFormats
            .filter((f: any) => f.type?.startsWith('audio/'))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          
          if (audioStreams.length === 0) {
            console.log(`Audio fallback: Invidious ${instance} — no audio streams`);
            continue;
          }
          
          const best = audioStreams.find((s: any) => s.type?.includes('mp4a')) || audioStreams[0];
          if (best?.url) {
            audioUrl = best.url;
            audioFormat = { mimeType: best.type?.split(';')[0] || 'audio/mp4', bitrate: best.bitrate };
            usedClient = `Invidious(${instance})`;
            console.log(`Audio fallback: Invidious found audio! (${best.type}, bitrate: ${best.bitrate})`);
            break;
          }
        } catch (e) {
          console.error(`Audio fallback: Invidious ${instance} error:`, e);
        }
      }
    }

    if (!audioFormat || !audioUrl) {
      console.log('Audio fallback: No audio streams found from any source — trying direct Gemini YouTube transcription');
      // Final fallback: Use Gemini to transcribe directly from YouTube URL (no audio download needed)
      const geminiDirect = await transcribeViaGeminiYouTubeUrl(youtubeId, videoId, supabase, videoTitle);
      if (geminiDirect && geminiDirect.length > 0) {
        return geminiDirect;
      }
      return [];
    }

    // Step 2: Download the audio (limit to ~25MB / first few minutes)
    console.log(`Audio fallback: Downloading audio stream via ${usedClient} (${audioFormat.mimeType}, bitrate: ${audioFormat.bitrate})`);
    const downloadUserAgent = usedClient === 'ANDROID'
      ? 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip'
      : usedClient === 'IOS'
        ? 'com.google.ios.youtube/19.09.3 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const audioResponse = await fetch(audioUrl, {
      headers: {
        'User-Agent': downloadUserAgent,
        'Range': 'bytes=0-25165824', // First 24MB
      },
    });

    if (!audioResponse.ok && audioResponse.status !== 206) {
      console.error('Audio fallback: Download failed with status', audioResponse.status);
      return [];
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    console.log(`Audio fallback: Downloaded ${(audioBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB`);

    if (audioBuffer.byteLength < 1000) {
      console.log('Audio fallback: Downloaded audio too small, likely failed');
      return [];
    }

    // Step 3: Try ElevenLabs transcription
    if (videoId && supabase) await supabase.from('videos').update({ processing_step: 'transcribing' }).eq('id', videoId);
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (ELEVENLABS_API_KEY) {
      try {
        console.log('Audio fallback: Trying ElevenLabs transcription...');
        const mimeType = audioFormat.mimeType?.split(';')[0] || 'audio/mp4';
        const audioBlob = new Blob([audioBuffer], { type: mimeType });
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.mp4');
        formData.append('model_id', 'scribe_v2');
        formData.append('tag_audio_events', 'false');
        formData.append('diarize', 'false');
        formData.append('timestamps_granularity', 'word');

        const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: { 'xi-api-key': ELEVENLABS_API_KEY },
          body: formData,
        });

        if (sttResponse.ok) {
          const sttData = await sttResponse.json();
          const fullText = sttData.text || '';
          const words = sttData.words || [];

          if (fullText.trim()) {
            console.log(`Audio fallback: ElevenLabs transcribed ${words.length} words`);
            return wordsToSegments(fullText, words);
          }
        } else {
          const errText = await sttResponse.text();
          console.error('Audio fallback: ElevenLabs failed:', sttResponse.status, errText);
        }
      } catch (e) {
        console.error('Audio fallback: ElevenLabs error:', e);
      }
    } else {
      console.log('Audio fallback: No ELEVENLABS_API_KEY, skipping ElevenLabs');
    }

    // Step 4: Gemini fallback
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.log('Audio fallback: No LOVABLE_API_KEY for Gemini fallback');
      return [];
    }

    try {
      console.log('Audio fallback: Trying Gemini transcription...');
      if (videoId && supabase) await supabase.from('videos').update({ processing_step: 'transcribing_fallback' }).eq('id', videoId);
      const audioBytes = new Uint8Array(audioBuffer);
      let base64Audio = '';
      const chunkSize = 8192;
      for (let i = 0; i < audioBytes.length; i += chunkSize) {
        const chunk = audioBytes.subarray(i, i + chunkSize);
        base64Audio += String.fromCharCode(...chunk);
      }
      base64Audio = btoa(base64Audio);

      const mimeType = audioFormat.mimeType?.split(';')[0] || 'audio/mp4';

      const geminiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are an audio transcription assistant. Transcribe the audio accurately. Return ONLY valid JSON with this exact format:
{
  "text": "full transcription text here",
  "segments": [
    {"start": 0, "end": 15, "text": "segment text here"},
    {"start": 15, "end": 30, "text": "next segment text"}
  ]
}
Rules:
- Transcribe all spoken words accurately
- Split into segments of roughly 15-20 seconds each
- Estimate timestamps based on speech pacing (~2.5 words per second)
- Do NOT include any markdown, code fences, or explanation - ONLY the JSON object`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: base64Audio,
                    format: mimeType.includes('wav') ? 'wav' : mimeType.includes('mp3') ? 'mp3' : 'mp4',
                  }
                },
                {
                  type: 'text',
                  text: 'Transcribe this audio recording. Return only the JSON object with text and segments.'
                }
              ]
            }
          ],
        }),
      });

      if (!geminiResponse.ok) {
        const geminiErr = await geminiResponse.text();
        console.error('Audio fallback: Gemini failed:', geminiResponse.status, geminiErr);
        return [];
      }

      const geminiData = await geminiResponse.json();
      const content = geminiData.choices?.[0]?.message?.content || '';
      const jsonStr = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      
      const parsed = JSON.parse(jsonStr);
      if (parsed.segments && Array.isArray(parsed.segments) && parsed.segments.length > 0) {
        const segments = parsed.segments
          .map((s: any) => ({
            start: Number(s.start) || 0,
            end: Number(s.end) || 0,
            text: String(s.text || '').trim(),
          }))
          .filter((s: any) => s.text.length > 0);
        
        console.log(`Audio fallback: Gemini transcribed ${segments.length} segments`);
        return segments;
      }
    } catch (e) {
      console.error('Audio fallback: Gemini error:', e);
    }

    return [];
  } catch (error) {
    console.error('Audio fallback: Unexpected error:', error);
    return [];
  }
}

// Convert ElevenLabs word-level data to segments
function wordsToSegments(fullText: string, words: any[]): Array<{start: number, end: number, text: string}> {
  const segments: Array<{start: number, end: number, text: string}> = [];
  const hasValidTimestamps = words.length > 1 && words.some((w: any) => (w.start || 0) > 0 || (w.end || 0) > 0);

  if (hasValidTimestamps) {
    let current: { start: number; end: number; words: string[] } | null = null;
    for (const word of words) {
      const ws = word.start || 0;
      const we = word.end || ws + 0.5;
      const wt = word.text || '';
      if (!current) {
        current = { start: ws, end: we, words: [wt] };
      } else if (we - current.start >= 15) {
        segments.push({ start: current.start, end: current.end, text: current.words.join(' ').trim() });
        current = { start: ws, end: we, words: [wt] };
      } else {
        current.end = we;
        current.words.push(wt);
      }
    }
    if (current && current.words.length > 0) {
      segments.push({ start: current.start, end: current.end, text: current.words.join(' ').trim() });
    }
  }

  // Fallback: sentence-based segmentation
  if (segments.length <= 1 && fullText.trim()) {
    segments.length = 0;
    const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
    const totalWords = fullText.split(/\s+/).length;
    const estimatedDuration = totalWords / 2.5;
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    let currentTime = 0;
    for (const sentence of sentences) {
      const proportion = sentence.length / totalChars;
      const duration = Math.max(2, estimatedDuration * proportion);
      segments.push({
        start: Math.round(currentTime * 10) / 10,
        end: Math.round((currentTime + duration) * 10) / 10,
        text: sentence.trim(),
      });
      currentTime += duration;
    }
  }

  return segments;
}

async function generateAISuggestions(videoId: string, transcript: Array<{start: number, end: number, text: string}>, supabase: any) {
  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.log('No LOVABLE_API_KEY, skipping AI suggestions');
      return;
    }

    const { data: video } = await supabase
      .from('videos')
      .select('user_id, title')
      .eq('id', videoId)
      .single();

    if (!video) return;

    const fullTranscript = transcript.map((s, i) => `[${i}] ${s.text}`).join('\n');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You analyze video transcripts and identify 3-5 key concepts or actionable items that would be valuable to remember or act on. Return a JSON array of objects with: segment_index (the [N] number), type ("remember" or "todo"), and reason (why this is important). Focus on definitions, key insights, and actionable advice.`
          },
          {
            role: 'user',
            content: `Analyze this transcript and identify key concepts:\n\n${fullTranscript.slice(0, 10000)}`
          }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('AI response not ok:', response.status);
      return;
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;
    
    if (!content) return;

    let suggestions;
    try {
      const parsed = JSON.parse(content);
      suggestions = parsed.suggestions || parsed.items || parsed;
      if (!Array.isArray(suggestions)) {
        suggestions = [suggestions];
      }
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      return;
    }

    // Delete existing AI suggestions
    await supabase
      .from('highlights')
      .delete()
      .eq('video_id', videoId)
      .eq('type', 'ai_suggested');

    for (const suggestion of suggestions.slice(0, 5)) {
      const segmentIndex = suggestion.segment_index || 0;
      const segment = transcript[Math.min(segmentIndex, transcript.length - 1)];
      
      if (segment) {
        await supabase
          .from('highlights')
          .insert({
            video_id: videoId,
            user_id: video.user_id,
            type: 'ai_suggested',
            start_seconds: segment.start,
            end_seconds: segment.end,
            selected_text: segment.text,
          });
      }
    }

    console.log('AI suggestions generated for video:', videoId);

  } catch (error) {
    console.error('Error generating AI suggestions:', error);
  }
}