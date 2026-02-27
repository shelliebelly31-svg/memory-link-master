import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { video_id } = await req.json();
    if (!video_id) {
      return new Response(JSON.stringify({ error: 'video_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify user owns the video
    const { data: video } = await supabase
      .from('videos')
      .select('id, user_id, duration_seconds')
      .eq('id', video_id)
      .eq('user_id', user.id)
      .single();

    if (!video) {
      return new Response(JSON.stringify({ error: 'Video not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get existing segments ordered by start time
    const { data: existingSegments } = await supabase
      .from('transcript_segments')
      .select('*')
      .eq('video_id', video_id)
      .order('start_seconds', { ascending: true });

    if (!existingSegments || existingSegments.length === 0) {
      return new Response(JSON.stringify({ error: 'No transcript segments found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Combine all text
    const fullText = existingSegments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
    const totalDuration = video.duration_seconds || existingSegments[existingSegments.length - 1].end_seconds || fullText.split(/\s+/).length / 2.5;

    // Split by sentences
    let sentences = fullText.match(/[^.!?]+[.!?]+/g) || [];
    
    // If no punctuation, split into ~200-char chunks at word boundaries
    if (sentences.length <= 1) {
      sentences = [];
      const words = fullText.split(/\s+/);
      let chunk = '';
      for (const w of words) {
        if (chunk.length + w.length > 200 && chunk.length > 0) {
          sentences.push(chunk.trim());
          chunk = w;
        } else {
          chunk += (chunk ? ' ' : '') + w;
        }
      }
      if (chunk.trim()) sentences.push(chunk.trim());
    }

    // Distribute timestamps proportionally
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    let currentTime = 0;
    const newSegments = sentences.map(sentence => {
      const proportion = sentence.length / totalChars;
      const duration = Math.max(1, totalDuration * proportion);
      const seg = {
        video_id,
        start_seconds: Math.round(currentTime * 10) / 10,
        end_seconds: Math.round((currentTime + duration) * 10) / 10,
        text: sentence.trim(),
      };
      currentTime += duration;
      return seg;
    });

    // Delete old segments and insert new ones
    await supabase.from('transcript_segments').delete().eq('video_id', video_id);
    await supabase.from('transcript_segments').insert(newSegments);

    console.log(`Re-segmented video ${video_id}: ${existingSegments.length} -> ${newSegments.length} segments`);

    return new Response(JSON.stringify({ 
      success: true, 
      previous_count: existingSegments.length,
      new_count: newSegments.length 
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Error in re-segment-transcript:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
