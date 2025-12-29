import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize text for deduplication: lowercase, trim, collapse whitespace
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Simple hash function for text deduplication
function hashText(text: string): string {
  const normalized = normalizeText(text);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, highlight_id, selected_text, video_id, force_regenerate } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth header
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

    if (action === 'generate-suggestions') {
      console.log('generate-suggestions called for video:', video_id, 'force:', force_regenerate);
      
      // Check if suggestions already generated (unless force regenerate)
      if (!force_regenerate) {
        const { data: video } = await supabase
          .from('videos')
          .select('ai_suggestions_generated')
          .eq('id', video_id)
          .eq('user_id', user.id)
          .single();
        
        if (video?.ai_suggestions_generated) {
          console.log('AI suggestions already generated, skipping');
          return new Response(
            JSON.stringify({ skipped: true, message: 'Suggestions already generated' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Get transcript segments
      const { data: segments } = await supabase
        .from('transcript_segments')
        .select('id, text, start_seconds, end_seconds')
        .eq('video_id', video_id)
        .order('start_seconds');

      if (!segments?.length) {
        return new Response(
          JSON.stringify({ error: 'No transcript segments found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get existing highlights for context
      const { data: existingHighlights } = await supabase
        .from('highlights')
        .select('selected_text, text_hash')
        .eq('video_id', video_id)
        .eq('user_id', user.id);

      const existingHashes = new Set(existingHighlights?.map(h => h.text_hash).filter(Boolean) || []);

      // Prepare transcript context
      const transcriptText = segments.map(s => s.text).join('\n');

      // Generate AI suggestions
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
              content: `You analyze video transcripts and suggest key passages worth remembering or acting on.
Return JSON with "suggestions" array. Each suggestion has:
- "text": exact quote from transcript (use verbatim text)
- "type": either "remember" (key info) or "todo" (action item)
- "reason": brief explanation why this is important
Find 3-5 most important passages. Focus on:
- Key definitions, facts, or concepts (remember)
- Action items, steps, or things to do (todo)
- Important warnings or tips
Do not modify the original text, quote it exactly.`
            },
            {
              role: 'user',
              content: `Analyze this transcript and suggest highlights:\n\n${transcriptText}`
            }
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        console.error('AI error:', await response.text());
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'AI credits exhausted.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'AI processing failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiResult = await response.json();
      const content = JSON.parse(aiResult.choices[0].message.content);
      const suggestions = content.suggestions || [];
      
      let insertedCount = 0;
      let skippedCount = 0;

      for (const suggestion of suggestions) {
        const textHash = hashText(suggestion.text);
        
        // Skip if duplicate
        if (existingHashes.has(textHash)) {
          console.log('Skipping duplicate suggestion:', suggestion.text.substring(0, 50));
          skippedCount++;
          continue;
        }

        // Find matching segment for timestamps
        const matchingSegment = segments.find(s => 
          s.text.toLowerCase().includes(normalizeText(suggestion.text).substring(0, 30))
        ) || segments.find(s =>
          normalizeText(suggestion.text).includes(s.text.toLowerCase().substring(0, 30))
        );

        const startSeconds = matchingSegment?.start_seconds || 0;
        const endSeconds = matchingSegment?.end_seconds || startSeconds + 10;

        const { error: insertError } = await supabase
          .from('highlights')
          .insert({
            video_id: video_id,
            user_id: user.id,
            type: 'ai_suggested',
            selected_text: suggestion.text,
            text_hash: textHash,
            start_seconds: startSeconds,
            end_seconds: endSeconds,
          });

        if (insertError) {
          console.error('Insert error:', insertError);
        } else {
          existingHashes.add(textHash);
          insertedCount++;
        }
      }

      // Mark video as having AI suggestions generated
      await supabase
        .from('videos')
        .update({
          ai_suggestions_generated: true,
          ai_suggestions_generated_at: new Date().toISOString(),
        })
        .eq('id', video_id)
        .eq('user_id', user.id);

      console.log(`Generated ${insertedCount} suggestions, skipped ${skippedCount} duplicates`);
      
      return new Response(
        JSON.stringify({ 
          suggestions_created: insertedCount,
          duplicates_skipped: skippedCount 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate-summary') {
      // Generate summary and key points for a remember item
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
              content: 'You help users remember key information. Given highlighted text, provide a concise summary (1-2 sentences) and 2-4 key bullet points. Return JSON with "summary" (string) and "key_points" (array of strings).'
            },
            {
              role: 'user',
              content: `Summarize this for memorization:\n\n${selected_text}`
            }
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI error:', errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'AI credits exhausted. Please add credits in workspace settings.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        return new Response(
          JSON.stringify({ error: 'AI processing failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiResult = await response.json();
      const content = JSON.parse(aiResult.choices[0].message.content);
      
      return new Response(
        JSON.stringify(content),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate-task') {
      // Generate task title and description from highlighted text
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
              content: 'You help users create actionable tasks. Given highlighted text, create a clear task title (max 60 chars) and optional description. Return JSON with "title" (string) and "description" (string).'
            },
            {
              role: 'user',
              content: `Create a task from this:\n\n${selected_text}`
            }
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'AI credits exhausted.' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'AI processing failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiResult = await response.json();
      const content = JSON.parse(aiResult.choices[0].message.content);
      
      return new Response(
        JSON.stringify(content),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'generate-quiz') {
      // Generate quiz questions from remember items
      const { data: rememberItems } = await supabase
        .from('remember_items')
        .select('id, summary, key_points')
        .eq('video_id', video_id)
        .eq('user_id', user.id);

      if (!rememberItems?.length) {
        return new Response(
          JSON.stringify({ error: 'No remember items to quiz on' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const context = rememberItems.map(r => 
        `Summary: ${r.summary}\nKey points: ${r.key_points.join(', ')}`
      ).join('\n\n');

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
              content: 'You create multiple-choice quiz questions. Given learning content, create 3-5 questions. Return JSON with "questions" array, each having: "question" (string), "options" (array of 4 strings), "correct_answer" (0-3 index), "explanation" (string), "topic" (string).'
            },
            {
              role: 'user',
              content: `Create quiz questions from:\n\n${context}`
            }
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded.' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'AI processing failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiResult = await response.json();
      const content = JSON.parse(aiResult.choices[0].message.content);
      
      // Save quiz items to database
      const questions = content.questions || [];
      for (const q of questions) {
        await supabase
          .from('quiz_items')
          .insert({
            remember_item_id: rememberItems[0].id,
            user_id: user.id,
            video_id: video_id,
            question: q.question,
            options: q.options,
            correct_answer: q.correct_answer,
            explanation: q.explanation || '',
            topic: q.topic || 'General',
          });
      }
      
      return new Response(
        JSON.stringify({ questions_created: questions.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in ai-process:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
