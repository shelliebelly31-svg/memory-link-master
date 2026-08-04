import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create to-do",
  description: "Create a new to-do for the signed-in user in Memory Link.",
  inputSchema: {
    title: z.string().trim().min(1).describe("Short title of the to-do."),
    description: z.string().trim().optional().describe("Optional longer description."),
    due_date: z.string().optional().describe("Optional due date as an ISO 8601 date or timestamp."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, description, due_date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: ctx.getUserId(),
        title,
        description: description ?? null,
        due_date: due_date ?? null,
        timestamp_seconds: 0,
        source_type: "manual",
        status: "pending",
      })
      .select("id, title, description, status, due_date, created_at");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data?.[0] ?? null) }],
      structuredContent: { task: data?.[0] ?? null },
    };
  },
});
