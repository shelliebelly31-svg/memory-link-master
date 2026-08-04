import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_task_status",
  title: "Update to-do status",
  description: "Update the status of one of the signed-in user's to-dos (pending, in_progress, completed).",
  inputSchema: {
    task_id: z.string().uuid().describe("Id of the task to update."),
    status: z.enum(["pending", "in_progress", "completed"]).describe("New status for the task."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, status }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .update({ status })
      .eq("id", task_id)
      .select("id, title, status, due_date");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data?.length) {
      return { content: [{ type: "text", text: "Task not found" }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data[0]) }],
      structuredContent: { task: data[0] },
    };
  },
});
