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
    const { summary, existing_key_points, video_title, timestamp } = await req.json();
    
    if (!summary) {
      return new Response(
        JSON.stringify({ error: "Summary is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const existingPointsText = existing_key_points?.length > 0 
      ? `\nExisting key points (avoid duplicating these):\n${existing_key_points.map((p: string) => `- ${p}`).join('\n')}`
      : '';

    const prompt = `Given the following memory item from a video:

Summary: "${summary}"
${video_title ? `Video Title: "${video_title}"` : ''}
${timestamp ? `Timestamp: ${timestamp}` : ''}
${existingPointsText}

Generate:
1. 3-6 additional key points that capture important insights from this content. Each should be:
   - Short, punchy, and actionable
   - Specific and clear
   - Different from existing key points

2. 3-6 to-do suggestions - specific next steps a user could take in real life based on this content. Each should be:
   - Actionable and concrete
   - Something the user can actually do
   - Relevant to the content

Return ONLY a valid JSON object in this exact format, no explanation:
{
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "todos": ["Do this first", "Then do this", "Finally do this"]
}`;

    console.log("Generating memory suggestions for:", { summary: summary.slice(0, 50), video_title });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful assistant that generates actionable insights and to-dos from content. Always respond with valid JSON only." },
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
    const content = data.choices?.[0]?.message?.content || "{}";
    
    console.log("AI response:", content);

    // Parse the JSON response
    let result = { keyPoints: [] as string[], todos: [] as string[] };
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result.keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 6) : [];
        result.todos = Array.isArray(parsed.todos) ? parsed.todos.slice(0, 6) : [];
      }
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      // Provide fallback suggestions
      result = {
        keyPoints: [
          "Review and reinforce this concept regularly",
          "Connect this to related topics you know",
          "Practice applying this knowledge"
        ],
        todos: [
          "Research more about this topic",
          "Take notes on practical applications",
          "Schedule a review session"
        ]
      };
    }

    // Ensure we have at least some suggestions
    if (result.keyPoints.length === 0) {
      result.keyPoints = ["Key takeaway from this content", "Important insight to remember"];
    }
    if (result.todos.length === 0) {
      result.todos = ["Review this material again", "Apply this knowledge in practice"];
    }

    console.log("Returning suggestions:", { keyPointsCount: result.keyPoints.length, todosCount: result.todos.length });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating memory suggestions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
