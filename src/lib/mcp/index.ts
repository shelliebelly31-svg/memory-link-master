import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listVideosTool from "./tools/list-videos";
import listMemoryItemsTool from "./tools/list-memory-items";
import listTasksTool from "./tools/list-tasks";
import createTaskTool from "./tools/create-task";
import updateTaskStatusTool from "./tools/update-task-status";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "memory-link-master",
  title: "Memory Link Master",
  version: "0.1.0",
  instructions:
    "Tools for Memory Link, an app that turns videos into memory items and to-dos. Use `list_videos` to see saved videos, `list_memory_items` for captured summaries and key points, and `list_tasks` / `create_task` / `update_task_status` to manage the user's to-dos.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listVideosTool, listMemoryItemsTool, listTasksTool, createTaskTool, updateTaskStatusTool],
});
