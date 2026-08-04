import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_memory_items",
  title: "List memory items",
  description: "List the signed-in user's saved memory items (summaries and key points captured from videos).",
  inputSchema: {
    video_id: z.string().uuid().optional().describe("Only return memory items for this video id."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum number of items to return (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ video_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("remember_items")
      .select("id, summary, key_points, video_id, timestamp_seconds, review_schedule, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (video_id) query = query.eq("video_id", video_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { memory_items: data ?? [] },
    };
  },
});
