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

    // Use AI to split by topic changes
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let paragraphs: string[];

    if (lovableApiKey) {
      paragraphs = await splitByTopicAI(fullText, lovableApiKey);
    } else {
      // Fallback: split by sentences and group into ~3-5 sentence paragraphs
      paragraphs = splitByParagraphsFallback(fullText);
    }

    // Distribute timestamps proportionally
    const totalChars = paragraphs.reduce((sum, p) => sum + p.length, 0);
    let currentTime = 0;
    const newSegments = paragraphs.map(paragraph => {
      const proportion = paragraph.length / totalChars;
      const duration = Math.max(1, totalDuration * proportion);
      const seg = {
        video_id,
        start_seconds: Math.round(currentTime * 10) / 10,
        end_seconds: Math.round((currentTime + duration) * 10) / 10,
        text: paragraph.trim(),
      };
      currentTime += duration;
      return seg;
    });

    // Delete old segments and insert new ones
    await supabase.from('transcript_segments').delete().eq('video_id', video_id);
    await supabase.from('transcript_segments').insert(newSegments);

    console.log(`Re-segmented video ${video_id}: ${existingSegments.length} -> ${newSegments.length} segments (topic-based)`);

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

async function splitByTopicAI(fullText: string, apiKey: string): Promise<string[]> {
  const prompt = `You are a transcript segmentation tool. Split the following transcript into paragraphs based on TOPIC CHANGES. Each paragraph should cover one coherent topic or idea.

Rules:
- Return ONLY a JSON array of strings, where each string is one paragraph
- Keep all original text intact - do not summarize, edit, or remove any words
- Each paragraph should be a meaningful topic block (typically 2-8 sentences)
- Split when the speaker changes subject, introduces a new concept, or transitions to a new point
- Do NOT include any explanation, just the JSON array
- Remove any metadata segments that aren't actual speech (e.g. video descriptions, links, copyright notices)

Transcript:
${fullText}`;

  const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    console.error('AI API error:', response.status, await response.text());
    return splitByParagraphsFallback(fullText);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  
  try {
    // Extract JSON array from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((p: unknown) => typeof p === 'string')) {
        // Filter out empty paragraphs
        const filtered = parsed.filter((p: string) => p.trim().length > 0);
        if (filtered.length > 0) return filtered;
      }
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e);
  }

  return splitByParagraphsFallback(fullText);
}

function splitByParagraphsFallback(fullText: string): string[] {
  // Split by sentences first
  let sentences = fullText.match(/[^.!?]+[.!?]+/g) || [];
  
  if (sentences.length <= 1) {
    // No punctuation: split into ~200-char chunks at word boundaries
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
    return sentences;
  }

  // Group sentences into paragraphs of 3-5 sentences
  const paragraphs: string[] = [];
  const groupSize = Math.max(3, Math.min(5, Math.ceil(sentences.length / 15)));
  
  for (let i = 0; i < sentences.length; i += groupSize) {
    const group = sentences.slice(i, i + groupSize);
    paragraphs.push(group.join(' ').trim());
  }

  return paragraphs;
}
