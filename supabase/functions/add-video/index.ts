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
  const urlObj = new URL(url);
  if (urlObj.hostname.includes('youtube.com')) {
    const videoId = urlObj.searchParams.get('v');
    if (videoId && videoId.match(/^[a-zA-Z0-9_-]{11}$/)) {
      return videoId;
    }
  }
  
  // Handle embed links
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  
  return null;
}

// Create canonical YouTube URL (removes tracking params like si)
function getCanonicalUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { youtube_url, retry_video_id, retry_from_step } = await req.json();
    
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
      processVideo(retry_video_id, existingVideo.youtube_id, supabase, retry_from_step).catch(e => 
        console.error('Retry processing error:', e)
      );

      return new Response(
        JSON.stringify({ video: { ...existingVideo, status: 'queued' } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // New video case - validate URL
    if (!youtube_url) {
      return new Response(
        JSON.stringify({ error: 'YouTube URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract and validate video ID
    let videoId: string | null = null;
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

    // Create canonical URL
    const canonicalUrl = getCanonicalUrl(videoId);

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

    // Create video record with queued status
    const { data: video, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        youtube_url: canonicalUrl,
        youtube_id: videoId,
        title: 'Loading...',
        status: 'queued',
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

    console.log('Video created:', video.id);

    // Trigger processing in background
    processVideo(video.id, videoId, supabase).catch(e => console.error('Background processing error:', e));

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

async function processVideo(videoId: string, youtubeId: string, supabase: any, startFromStep?: string) {
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

      const transcript = await fetchYouTubeCaptions(youtubeId);
      
      if (!transcript || transcript.length === 0) {
        // Mark captions as missing
        await supabase
          .from('videos')
          .update({ 
            captions_missing: true,
            status: 'failed',
            failed_step: 'captions',
            error_message: 'No captions available for this video. YouTube captions (automatic or manual) are required. Try a video with closed captions enabled.'
          })
          .eq('id', videoId);
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
    }

    // Step 3: Generate AI suggestions (optional, doesn't fail the video)
    if (startIndex <= 2) {
      console.log('Step 3: Generating AI suggestions for video:', videoId);
      
      // Fetch transcript for AI processing
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
  try {
    // Fetch the YouTube video page to get caption track info
    const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = await response.text();
    
    // Extract captions URL from the page
    const captionMatch = html.match(/"captionTracks":\s*\[(.*?)\]/);
    if (!captionMatch) {
      console.log('No caption tracks found in page');
      return [];
    }

    // Parse caption track info
    let captionData;
    try {
      captionData = JSON.parse(`[${captionMatch[1]}]`);
    } catch (e) {
      console.error('Failed to parse caption data');
      return [];
    }
    
    if (!captionData.length) {
      return [];
    }

    // Prefer English captions, then auto-generated, then any available
    let captionTrack = captionData.find((t: any) => t.languageCode === 'en' && !t.kind) 
      || captionData.find((t: any) => t.languageCode === 'en')
      || captionData.find((t: any) => !t.kind)
      || captionData[0];
    
    if (!captionTrack?.baseUrl) {
      console.log('No valid caption track URL found');
      return [];
    }

    // Fetch the actual captions
    const captionResponse = await fetch(captionTrack.baseUrl);
    const captionXml = await captionResponse.text();
    
    // Parse XML captions
    const segments: Array<{start: number, end: number, text: string}> = [];
    const textMatches = captionXml.matchAll(/<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([^<]*)<\/text>/g);
    
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
        segments.push({
          start,
          end: start + duration,
          text,
        });
      }
    }

    // Combine short segments for better readability (aim for ~15-30 second chunks)
    const combinedSegments: Array<{start: number, end: number, text: string}> = [];
    let currentSegment: {start: number, end: number, text: string} | null = null;
    
    for (const seg of segments) {
      if (!currentSegment) {
        currentSegment = { ...seg };
      } else if (currentSegment.end - currentSegment.start < 15 && seg.start - currentSegment.end < 2) {
        currentSegment.end = seg.end;
        currentSegment.text += ' ' + seg.text;
      } else {
        combinedSegments.push(currentSegment);
        currentSegment = { ...seg };
      }
    }
    
    if (currentSegment) {
      combinedSegments.push(currentSegment);
    }

    console.log(`Parsed ${combinedSegments.length} transcript segments`);
    return combinedSegments;

  } catch (error) {
    console.error('Error fetching captions:', error);
    return [];
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

    // Delete existing AI suggestions if retrying
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
