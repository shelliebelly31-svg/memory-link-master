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
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ElevenLabs not configured. Please connect the ElevenLabs connector.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse multipart form data
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const videoId = formData.get('video_id') as string | null;

    if (!audioFile) {
      return new Response(
        JSON.stringify({ error: 'Audio file is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check file size (25MB limit for ElevenLabs)
    if (audioFile.size > 25 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'File is too large. Maximum size is 25MB.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Transcribing file: ${audioFile.name}, size: ${(audioFile.size / (1024 * 1024)).toFixed(1)}MB`);

    // Send to ElevenLabs Scribe v2
    const apiFormData = new FormData();
    apiFormData.append('file', audioFile);
    apiFormData.append('model_id', 'scribe_v2');
    apiFormData.append('tag_audio_events', 'false');
    apiFormData.append('diarize', 'false');
    apiFormData.append('timestamps_granularity', 'word');

    const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: apiFormData,
    });

    if (!sttResponse.ok) {
      const errText = await sttResponse.text();
      console.error('ElevenLabs STT error:', sttResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `Transcription failed (${sttResponse.status}). The file may be corrupted or in an unsupported format.` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sttData = await sttResponse.json();
    const fullText = sttData.text || '';
    const words = sttData.words || [];

    if (!fullText.trim()) {
      return new Response(
        JSON.stringify({ error: 'No speech detected in the audio file.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Transcribed ${words.length} words, full text length: ${fullText.length}`);

    // Check if word timestamps are actually valid (not all zeros)
    const hasValidTimestamps = words.length > 1 && words.some((w: any) => (w.start || 0) > 0 || (w.end || 0) > 0);
    console.log(`Has valid timestamps: ${hasValidTimestamps}, words sample:`, JSON.stringify(words.slice(0, 3)));

    const segments: Array<{ start: number; end: number; text: string }> = [];

    if (hasValidTimestamps) {
      // Group words into ~15-second segments using real timestamps
      let currentSegment: { start: number; end: number; words: string[] } | null = null;

      for (const word of words) {
        const wordStart = word.start || 0;
        const wordEnd = word.end || wordStart + 0.5;
        const wordText = word.text || '';

        if (!currentSegment) {
          currentSegment = { start: wordStart, end: wordEnd, words: [wordText] };
        } else if (wordEnd - currentSegment.start >= 15) {
          segments.push({
            start: currentSegment.start,
            end: currentSegment.end,
            text: currentSegment.words.join(' ').trim(),
          });
          currentSegment = { start: wordStart, end: wordEnd, words: [wordText] };
        } else {
          currentSegment.end = wordEnd;
          currentSegment.words.push(wordText);
        }
      }

      if (currentSegment && currentSegment.words.length > 0) {
        segments.push({
          start: currentSegment.start,
          end: currentSegment.end,
          text: currentSegment.words.join(' ').trim(),
        });
      }
    }

    // Fallback: split by sentences when no valid word timestamps
    if (segments.length <= 1 && fullText.trim()) {
      segments.length = 0; // clear any single giant segment
      // Split on sentence boundaries (. ! ?) or after ~200 chars at a natural break
      const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [];
      
      // If no sentence punctuation found, split into ~200-char chunks at word boundaries
      if (sentences.length <= 1) {
        const words = fullText.split(/\s+/);
        let chunk = '';
        let chunkWords: string[] = [];
        for (const w of words) {
          if (chunk.length + w.length > 200 && chunkWords.length > 0) {
            sentences.push(chunk.trim());
            chunk = w;
            chunkWords = [w];
          } else {
            chunk += (chunk ? ' ' : '') + w;
            chunkWords.push(w);
          }
        }
        if (chunk.trim()) sentences.push(chunk.trim());
      }

      // Estimate timing: use audio duration if available, else ~150 words/min
      const totalWords = fullText.split(/\s+/).length;
      const estimatedDuration = totalWords / 2.5; // ~150 words/min = 2.5 words/sec
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

    // If a video_id was provided, save segments directly
    if (videoId) {
      // Verify user owns this video
      const { data: video } = await supabase
        .from('videos')
        .select('id, user_id')
        .eq('id', videoId)
        .eq('user_id', user.id)
        .single();

      if (video) {
        // Delete existing segments
        await supabase
          .from('transcript_segments')
          .delete()
          .eq('video_id', videoId);

        // Insert new segments
        const segmentRows = segments.map(seg => ({
          video_id: videoId,
          start_seconds: seg.start,
          end_seconds: seg.end,
          text: seg.text,
        }));

        await supabase
          .from('transcript_segments')
          .insert(segmentRows);

        // Update video status
        const duration = segments.length > 0 ? Math.ceil(segments[segments.length - 1].end) : 0;
        await supabase
          .from('videos')
          .update({
            status: 'ready',
            source_type: 'upload',
            duration_seconds: duration,
            captions_missing: false,
            error_message: null,
            failed_step: null,
          })
          .eq('id', videoId);

        console.log(`Saved ${segments.length} segments to video ${videoId}`);
      }
    }

    return new Response(
      JSON.stringify({
        text: fullText,
        segments,
        word_count: words.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in transcribe-audio:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
