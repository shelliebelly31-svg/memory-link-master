import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, notes, video_id } = await req.json();
    
    if (!title) {
      return new Response(
        JSON.stringify({ error: "Title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const prompt = `Given the following content that a user wants to remember from a video:

Title: "${title}"
${notes ? `Additional notes: "${notes}"` : ''}

Generate 3-7 concise, actionable key points that capture the most important information. Each key point should:
- Be 1-2 sentences max
- Focus on actionable insights or facts worth remembering
- Be specific and clear

Return ONLY a JSON array of strings, no explanation. Example format:
["Key point 1", "Key point 2", "Key point 3"]`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful assistant that generates concise key points from content. Always respond with valid JSON." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    
    // Parse the JSON array from the response
    let keyPoints: string[] = [];
    try {
      // Try to extract JSON from the response (in case there's extra text)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        keyPoints = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error("Error parsing key points:", parseError);
      // Fallback: split by newlines if JSON parsing fails
      keyPoints = content
        .split('\n')
        .filter((line: string) => line.trim().length > 0)
        .slice(0, 7);
    }

    // Ensure we have at least 3 and at most 7 points
    if (keyPoints.length < 3) {
      keyPoints = [
        `Key insight from: ${title.slice(0, 50)}`,
        "Review this content for better retention",
        "Consider how this applies to your goals"
      ];
    }
    keyPoints = keyPoints.slice(0, 7);

    return new Response(
      JSON.stringify({ key_points: keyPoints }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating key points:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
