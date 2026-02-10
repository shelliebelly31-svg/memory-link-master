import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, task_title, sections } = await req.json();

    let messages: { role: string; content: string }[] = [];

    if (action === "breakdown") {
      // Break down a task title into actionable sections
      messages = [
        {
          role: "system",
          content: `You are a task breakdown assistant. Given a task title, break it down into 2-5 clear, actionable sections that the user needs to fill in to complete this task. Each section should have a label (short name) and a prompt (a guiding question or instruction for the user).

Return a JSON array of objects with "label" and "prompt" fields. Only return the JSON array, nothing else.

Example for "Define your mission, vision, and values":
[
  {"label": "Mission", "prompt": "What is your core purpose? What problem do you solve and for whom?"},
  {"label": "Vision", "prompt": "Where do you see yourself/your organization in 5-10 years? What does success look like?"},
  {"label": "Values", "prompt": "What principles guide your decisions and behavior? List 3-5 core values."}
]`,
        },
        {
          role: "user",
          content: `Break down this task into sections: "${task_title}"`,
        },
      ];
    } else if (action === "clarify") {
      // Clarify/refine a user's answer for a specific section
      messages = [
        {
          role: "system",
          content: `You are a writing clarity assistant. The user is working on a task and has written their answer for a specific section. Your job is to refine their answer so it reads clearly, is well-structured, and is professional. Keep the user's intent and meaning intact. Make it concise but impactful. Return ONLY the refined text, no explanations or preambles.`,
        },
        {
          role: "user",
          content: `Task: "${task_title}"
Section: "${sections.label}"
Guiding prompt: "${sections.prompt}"

My answer:
${sections.answer}

Please clarify and refine this so it reads cleanly and with clarity.`,
        },
      ];
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    if (action === "breakdown") {
      // Parse JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Failed to parse AI response");
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ sections: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ clarified: content.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("ai-clarify-task error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
