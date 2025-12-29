import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { youtube_url } = await req.json();
    
    if (!youtube_url) {
      return new Response(
        JSON.stringify({ error: 'YouTube URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract YouTube video ID
    const youtubeIdMatch = youtube_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (!youtubeIdMatch) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const youtube_id = youtubeIdMatch[1];

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

    // Fetch video info from YouTube oEmbed
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(youtube_url)}&format=json`;
    let title = 'Untitled Video';
    let thumbnail_url = `https://img.youtube.com/vi/${youtube_id}/maxresdefault.jpg`;
    
    try {
      const oembedRes = await fetch(oembedUrl);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        title = oembedData.title || title;
        thumbnail_url = oembedData.thumbnail_url || thumbnail_url;
      }
    } catch (e) {
      console.log('Could not fetch oEmbed data, using defaults');
    }

    // Create video record
    const { data: video, error: insertError } = await supabase
      .from('videos')
      .insert({
        user_id: user.id,
        youtube_url,
        youtube_id,
        title,
        thumbnail_url,
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

    // Trigger transcription in background (fire and forget)
    processVideo(video.id, youtube_id, supabase).catch(e => console.error('Background processing error:', e));

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

async function processVideo(videoId: string, youtubeId: string, supabase: any) {
  try {
    // Update status to transcribing
    await supabase
      .from('videos')
      .update({ status: 'transcribing' })
      .eq('id', videoId);

    console.log('Starting transcription for video:', videoId);

    // Try to fetch YouTube captions
    let transcript = await fetchYouTubeCaptions(youtubeId);
    
    if (!transcript || transcript.length === 0) {
      // Mark as failed if no captions available
      await supabase
        .from('videos')
        .update({ 
          status: 'failed',
          error_message: 'No captions available for this video. YouTube automatic or manual captions are required.'
        })
        .eq('id', videoId);
      return;
    }

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
      throw new Error('Failed to save transcript');
    }

    // Calculate total duration
    const duration = Math.ceil(transcript[transcript.length - 1]?.end || 0);
    
    // Update video status to ready
    await supabase
      .from('videos')
      .update({ 
        status: 'ready',
        duration_seconds: duration
      })
      .eq('id', videoId);

    console.log('Video processed successfully:', videoId);

    // Generate AI suggestions in background
    await generateAISuggestions(videoId, transcript, supabase);

  } catch (error: unknown) {
    console.error('Error processing video:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process video';
    await supabase
      .from('videos')
      .update({ 
        status: 'failed',
        error_message: errorMessage
      })
      .eq('id', videoId);
  }
}

async function fetchYouTubeCaptions(youtubeId: string): Promise<Array<{start: number, end: number, text: string}>> {
  try {
    // Fetch the YouTube video page to get caption track info
    const videoUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const response = await fetch(videoUrl);
    const html = await response.text();
    
    // Extract captions URL from the page
    const captionMatch = html.match(/"captionTracks":\s*\[(.*?)\]/);
    if (!captionMatch) {
      console.log('No caption tracks found');
      return [];
    }

    // Parse caption track info
    const captionData = JSON.parse(`[${captionMatch[1]}]`);
    if (!captionData.length) {
      return [];
    }

    // Prefer English captions
    let captionTrack = captionData.find((t: any) => t.languageCode === 'en') || captionData[0];
    
    if (!captionTrack?.baseUrl) {
      return [];
    }

    // Fetch the actual captions
    const captionUrl = captionTrack.baseUrl;
    const captionResponse = await fetch(captionUrl);
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
        // Combine if current segment is short and gap is small
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

    // Get video info
    const { data: video } = await supabase
      .from('videos')
      .select('user_id, title')
      .eq('id', videoId)
      .single();

    if (!video) return;

    // Prepare transcript text
    const fullTranscript = transcript.map((s, i) => `[${i}] ${s.text}`).join('\n');

    // Call AI to identify key concepts
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

    // Create AI-suggested highlights
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
