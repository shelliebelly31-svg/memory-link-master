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

    if (hasLink) {
      try {
        videoId = extractVideoId(youtube_url);
      } catch (e) {
        console.error('URL parsing error:', e);
      }

      if (!videoId) {
        return new Response(
          JSON.stringify({ error: 'Invalid YouTube URL. Please use a link like youtube.com/watch?v=... or youtu.be/...' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      canonicalUrl = getCanonicalUrl(videoId);
      sourceType = 'link';

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
    // Priority C: Only link provided
    else if (hasLink && videoId) {
      processVideoFromLink(video.id, videoId, supabase).catch(e => 
        console.error('Link processing error:', e)
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

// Priority C: Process from YouTube link
async function processVideoFromLink(videoId: string, youtubeId: string, supabase: any, startFromStep?: string) {
  const steps = ['metadata', 'captions', 'ai_suggestions'];
  const startIndex = startFromStep ? steps.indexOf(startFromStep) : 0;
  
  try {
    // Step 1: Fetch metadata
    if (startIndex <= 0) {
      console.log('Step 1: Fetching metadata for video:', videoId);
      
      await supabase
        .from('videos')
        .update({ status: 'transcribing' })
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

      await supabase
        .from('videos')
        .update({ 
          title: metadata.title,
          thumbnail_url: metadata.thumbnail_url,
          duration_seconds: metadata.duration_seconds
        })
        .eq('id', videoId);

      console.log('Metadata fetched:', metadata.title);
    }

    // Step 2: Fetch captions/transcript
    if (startIndex <= 1) {
      console.log('Step 2: Fetching captions for video:', videoId);

      const captionResult = await fetchYouTubeCaptions(youtubeId);
      const transcript = captionResult.segments;
      
      if (!transcript || transcript.length === 0) {
        // Captions not found - set to needs_attention instead of failed
        await supabase
          .from('videos')
          .update({ 
            captions_missing: true,
            status: 'needs_attention',
            failed_step: 'captions',
            error_message: 'No captions available for this video. Please add the transcript manually by pasting text or uploading screenshots.'
          })
          .eq('id', videoId);
        
        console.log('Captions not found, set to needs_attention');
        return;
      }

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

      // Calculate total duration from transcript if not set
      const duration = Math.ceil(transcript[transcript.length - 1]?.end || 0);
      
      await supabase
        .from('videos')
        .update({ 
          status: 'ready',
          duration_seconds: duration,
          captions_missing: false,
          error_message: null,
          failed_step: null
        })
        .eq('id', videoId);

      console.log('Transcript saved with', segments.length, 'segments');

      // If Firecrawl was used, timestamps are estimated - try to fix them with ElevenLabs audio transcription
      if (captionResult.method === 'firecrawl') {
        console.log('Firecrawl was used - attempting ElevenLabs audio timestamp correction...');
        correctTimestampsViaAudio(videoId, youtubeId, transcript, supabase).catch(e => 
          console.error('ElevenLabs timestamp correction failed (non-fatal):', e)
        );
      }
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

interface CaptionResult {
  segments: Array<{start: number, end: number, text: string}>;
  method: 'innertube' | 'html_scrape' | 'timedtext' | 'firecrawl' | 'none';
}

async function fetchYouTubeCaptions(youtubeId: string): Promise<CaptionResult> {
  // Try multiple methods in order of reliability
  
  // Method 1: Innertube API (most reliable)
  try {
    console.log('Method 1: Trying Innertube API for', youtubeId);
    const innertubeResult = await fetchCaptionsViaInnertube(youtubeId);
    if (innertubeResult.length > 0) {
      console.log(`Innertube: Got ${innertubeResult.length} segments`);
      return { segments: innertubeResult, method: 'innertube' };
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
      return { segments: htmlResult, method: 'html_scrape' };
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
      return { segments: timedtextResult, method: 'timedtext' };
    }
  } catch (e) {
    console.error('Timedtext method failed:', e);
  }

  // Method 4: Firecrawl scrape (extracts page content as transcript substitute)
  try {
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (FIRECRAWL_API_KEY) {
      console.log('Method 4: Trying Firecrawl scrape for', youtubeId);
      const firecrawlResult = await fetchContentViaFirecrawl(youtubeId, FIRECRAWL_API_KEY);
      if (firecrawlResult.length > 0) {
        console.log(`Firecrawl: Got ${firecrawlResult.length} segments`);
        return { segments: firecrawlResult, method: 'firecrawl' };
      }
    } else {
      console.log('Firecrawl not configured, skipping Method 4');
    }
  } catch (e) {
    console.error('Firecrawl method failed:', e);
  }

  console.log('All caption methods failed for', youtubeId);
  return { segments: [], method: 'none' };
}

// Method 4: Use Firecrawl to scrape YouTube page content, then AI to extract only spoken words
async function fetchContentViaFirecrawl(youtubeId: string, apiKey: string): Promise<Array<{start: number, end: number, text: string}>> {
  const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  
  // Use AbortController for a 45-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response: Response;
  try {
    response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: videoUrl,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 5000,
        timeout: 60000,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    console.error('Firecrawl fetch error (timeout or network):', e);
    return [];
  }
  clearTimeout(timeoutId);

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

  // Use AI to extract only the spoken transcript, filtering out title, description, metadata
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.log('No LOVABLE_API_KEY, cannot clean Firecrawl content');
    return [];
  }

  try {
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `You are a transcript extractor. Given scraped YouTube page content, extract ONLY the spoken words/transcript from the video. 
Remove ALL of the following:
- Video title and description
- Channel name, subscriber counts, view counts
- Links, URLs, hashtags
- Comments section
- Related video suggestions
- Upload dates, like counts
- Any metadata or navigation elements
- Copyright notices

Return ONLY the actual spoken words as a clean transcript. Split into natural paragraphs (one paragraph per topic shift or every ~30 seconds of speech). 
Return as a JSON object with a "paragraphs" array of strings. Each string should be one paragraph of spoken content.
If you cannot identify any spoken transcript content, return {"paragraphs": []}.`
          },
          {
            role: 'user',
            content: `Extract the spoken transcript from this YouTube page content:\n\n${markdown.slice(0, 15000)}`
          }
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI cleanup failed:', aiResponse.status);
      return [];
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) return [];

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI transcript response');
      return [];
    }

    const paragraphs: string[] = parsed.paragraphs || [];
    if (paragraphs.length === 0) return [];

    // Estimate total duration: ~150 words per minute of speech
    const totalWords = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0);
    const estimatedDurationSeconds = Math.max(60, (totalWords / 150) * 60);

    const segments: Array<{start: number, end: number, text: string}> = [];
    let wordsSoFar = 0;

    for (const para of paragraphs) {
      const paraWords = para.split(/\s+/).length;
      const startTime = Math.round((wordsSoFar / totalWords) * estimatedDurationSeconds);
      wordsSoFar += paraWords;
      const endTime = Math.round((wordsSoFar / totalWords) * estimatedDurationSeconds);

      segments.push({
        start: startTime,
        end: endTime,
        text: para.trim(),
      });
    }

    console.log(`Firecrawl+AI: Extracted ${segments.length} clean segments (~${Math.round(estimatedDurationSeconds)}s estimated)`);
    return segments;

  } catch (e) {
    console.error('AI transcript extraction failed:', e);
    return [];
  }
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

// Correct estimated timestamps by downloading audio and transcribing with ElevenLabs
async function correctTimestampsViaAudio(
  videoId: string, 
  youtubeId: string, 
  firecrawlSegments: Array<{start: number, end: number, text: string}>,
  supabase: any
) {
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
  if (!ELEVENLABS_API_KEY) {
    console.log('No ELEVENLABS_API_KEY, skipping timestamp correction');
    return;
  }

  try {
    // Step 1: Download audio via Cobalt API
    console.log('Downloading audio for timestamp correction via Cobalt...');
    
    const cobaltResponse = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${youtubeId}`,
        downloadMode: 'audio',
        audioFormat: 'mp3',
        audioBitrate: '64',
      }),
    });

    if (!cobaltResponse.ok) {
      const errText = await cobaltResponse.text();
      console.error('Cobalt API error:', cobaltResponse.status, errText);
      return;
    }

    const cobaltData = await cobaltResponse.json();
    
    if (!cobaltData.url || (cobaltData.status !== 'tunnel' && cobaltData.status !== 'redirect')) {
      console.error('Cobalt did not return a download URL:', cobaltData.status);
      return;
    }

    console.log('Cobalt returned download URL, fetching audio...');

    // Step 2: Download the actual audio file
    const audioResponse = await fetch(cobaltData.url);
    if (!audioResponse.ok) {
      console.error('Audio download failed:', audioResponse.status);
      return;
    }

    const audioBuffer = await audioResponse.arrayBuffer();
    const audioSizeMB = audioBuffer.byteLength / (1024 * 1024);
    console.log(`Audio downloaded: ${audioSizeMB.toFixed(1)}MB`);

    // ElevenLabs has a 25MB limit
    if (audioBuffer.byteLength > 25 * 1024 * 1024) {
      console.log('Audio too large for ElevenLabs (>25MB), skipping timestamp correction');
      return;
    }

    // Step 3: Send to ElevenLabs Scribe v2 for word-level timestamps
    console.log('Sending audio to ElevenLabs for transcription...');
    
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model_id', 'scribe_v2');
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'false');
    formData.append('timestamps_granularity', 'word');

    const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: formData,
    });

    if (!sttResponse.ok) {
      const errText = await sttResponse.text();
      console.error('ElevenLabs STT error:', sttResponse.status, errText);
      return;
    }

    const sttData = await sttResponse.json();
    const words = sttData.words || [];
    
    if (!words.length || !words.some((w: any) => (w.start || 0) > 0 || (w.end || 0) > 0)) {
      console.log('ElevenLabs returned no valid word timestamps, skipping correction');
      return;
    }

    console.log(`ElevenLabs returned ${words.length} words with timestamps`);

    // Step 4: Build corrected segments by grouping words into ~15-second segments
    const correctedSegments: Array<{start: number, end: number, text: string}> = [];
    let currentSegment: { start: number; end: number; words: string[] } | null = null;

    for (const word of words) {
      const wordStart = word.start || 0;
      const wordEnd = word.end || wordStart + 0.5;
      const wordText = (word.text || '').trim();
      if (!wordText) continue;

      if (!currentSegment) {
        currentSegment = { start: wordStart, end: wordEnd, words: [wordText] };
      } else if (wordEnd - currentSegment.start >= 15) {
        correctedSegments.push({
          start: Math.round(currentSegment.start * 10) / 10,
          end: Math.round(currentSegment.end * 10) / 10,
          text: currentSegment.words.join(' ').trim(),
        });
        currentSegment = { start: wordStart, end: wordEnd, words: [wordText] };
      } else {
        currentSegment.end = wordEnd;
        currentSegment.words.push(wordText);
      }
    }

    if (currentSegment && currentSegment.words.length > 0) {
      correctedSegments.push({
        start: Math.round(currentSegment.start * 10) / 10,
        end: Math.round(currentSegment.end * 10) / 10,
        text: currentSegment.words.join(' ').trim(),
      });
    }

    if (correctedSegments.length === 0) {
      console.log('No corrected segments produced, keeping Firecrawl timestamps');
      return;
    }

    // Step 5: Replace transcript segments in database
    console.log(`Replacing ${firecrawlSegments.length} estimated segments with ${correctedSegments.length} accurately-timed segments`);

    await supabase
      .from('transcript_segments')
      .delete()
      .eq('video_id', videoId);

    const segmentRows = correctedSegments.map(seg => ({
      video_id: videoId,
      start_seconds: seg.start,
      end_seconds: seg.end,
      text: seg.text,
    }));

    const { error: insertError } = await supabase
      .from('transcript_segments')
      .insert(segmentRows);

    if (insertError) {
      console.error('Failed to insert corrected segments:', insertError);
      return;
    }

    // Update video duration from accurate timestamps
    const accurateDuration = Math.ceil(correctedSegments[correctedSegments.length - 1].end);
    await supabase
      .from('videos')
      .update({ duration_seconds: accurateDuration })
      .eq('id', videoId);

    console.log(`Timestamp correction complete! ${correctedSegments.length} segments with accurate timestamps saved.`);

  } catch (error) {
    console.error('Error in correctTimestampsViaAudio:', error);
  }
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