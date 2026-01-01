export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      highlights: {
        Row: {
          created_at: string
          end_seconds: number
          id: string
          selected_text: string
          start_seconds: number
          text_hash: string | null
          type: Database["public"]["Enums"]["highlight_type"]
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          end_seconds: number
          id?: string
          selected_text: string
          start_seconds: number
          text_hash?: string | null
          type: Database["public"]["Enums"]["highlight_type"]
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          end_seconds?: number
          id?: string
          selected_text?: string
          start_seconds?: number
          text_hash?: string | null
          type?: Database["public"]["Enums"]["highlight_type"]
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "highlights_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          timestamp_seconds: number | null
          title: string
          type: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          timestamp_seconds?: number | null
          title: string
          type: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          timestamp_seconds?: number | null
          title?: string
          type?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "manual_items_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          created_at: string
          id: string
          score: number
          topic: string | null
          total_questions: number
          user_id: string
          video_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          score: number
          topic?: string | null
          total_questions: number
          user_id: string
          video_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          score?: number
          topic?: string | null
          total_questions?: number
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_items: {
        Row: {
          correct_answer: number
          created_at: string
          explanation: string | null
          id: string
          options: string[]
          question: string
          remember_item_id: string
          times_answered: number
          times_correct: number
          topic: string | null
          user_id: string
          video_id: string
        }
        Insert: {
          correct_answer: number
          created_at?: string
          explanation?: string | null
          id?: string
          options: string[]
          question: string
          remember_item_id: string
          times_answered?: number
          times_correct?: number
          topic?: string | null
          user_id: string
          video_id: string
        }
        Update: {
          correct_answer?: number
          created_at?: string
          explanation?: string | null
          id?: string
          options?: string[]
          question?: string
          remember_item_id?: string
          times_answered?: number
          times_correct?: number
          topic?: string | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_items_remember_item_id_fkey"
            columns: ["remember_item_id"]
            isOneToOne: false
            referencedRelation: "remember_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_items_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      remember_items: {
        Row: {
          created_at: string
          highlight_id: string
          id: string
          key_points: string[]
          last_reviewed_at: string | null
          review_schedule: Database["public"]["Enums"]["review_schedule"] | null
          summary: string
          timestamp_seconds: number
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          highlight_id: string
          id?: string
          key_points?: string[]
          last_reviewed_at?: string | null
          review_schedule?:
            | Database["public"]["Enums"]["review_schedule"]
            | null
          summary: string
          timestamp_seconds: number
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          highlight_id?: string
          id?: string
          key_points?: string[]
          last_reviewed_at?: string | null
          review_schedule?:
            | Database["public"]["Enums"]["review_schedule"]
            | null
          summary?: string
          timestamp_seconds?: number
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "remember_items_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "remember_items_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_schedules: {
        Row: {
          channel: Database["public"]["Enums"]["reminder_channel"]
          created_at: string
          id: string
          manual_item_id: string | null
          next_send_at: string | null
          original_send_at: string | null
          remember_item_id: string | null
          repeat_dates: string[] | null
          repeat_days: number[] | null
          repeat_type: string | null
          send_at: string
          status: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          created_at?: string
          id?: string
          manual_item_id?: string | null
          next_send_at?: string | null
          original_send_at?: string | null
          remember_item_id?: string | null
          repeat_dates?: string[] | null
          repeat_days?: number[] | null
          repeat_type?: string | null
          send_at: string
          status?: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["reminder_channel"]
          created_at?: string
          id?: string
          manual_item_id?: string | null
          next_send_at?: string | null
          original_send_at?: string | null
          remember_item_id?: string | null
          repeat_dates?: string[] | null
          repeat_days?: number[] | null
          repeat_type?: string | null
          send_at?: string
          status?: Database["public"]["Enums"]["reminder_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_schedules_manual_item_id_fkey"
            columns: ["manual_item_id"]
            isOneToOne: false
            referencedRelation: "manual_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_schedules_remember_item_id_fkey"
            columns: ["remember_item_id"]
            isOneToOne: false
            referencedRelation: "remember_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          checklist_items: Json | null
          created_at: string
          description: string | null
          due_date: string | null
          highlight_id: string | null
          id: string
          manual_item_id: string | null
          order_index: number
          source_type: string | null
          status: Database["public"]["Enums"]["task_status"]
          timestamp_seconds: number
          title: string
          user_id: string
          video_id: string
        }
        Insert: {
          checklist_items?: Json | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          highlight_id?: string | null
          id?: string
          manual_item_id?: string | null
          order_index?: number
          source_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          timestamp_seconds: number
          title: string
          user_id: string
          video_id: string
        }
        Update: {
          checklist_items?: Json | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          highlight_id?: string | null
          id?: string
          manual_item_id?: string | null
          order_index?: number
          source_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          timestamp_seconds?: number
          title?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_highlight_id_fkey"
            columns: ["highlight_id"]
            isOneToOne: false
            referencedRelation: "highlights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_manual_item_id_fkey"
            columns: ["manual_item_id"]
            isOneToOne: false
            referencedRelation: "manual_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_segments: {
        Row: {
          created_at: string
          end_seconds: number
          id: string
          start_seconds: number
          text: string
          video_id: string
        }
        Insert: {
          created_at?: string
          end_seconds: number
          id?: string
          start_seconds: number
          text: string
          video_id: string
        }
        Update: {
          created_at?: string
          end_seconds?: number
          id?: string
          start_seconds?: number
          text?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_segments_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          id: string
          phone_number: string | null
          phone_verified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_number?: string | null
          phone_verified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_number?: string | null
          phone_verified?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          ai_suggestions_generated: boolean
          ai_suggestions_generated_at: string | null
          captions_missing: boolean
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          failed_step: string | null
          id: string
          source_type: string | null
          status: Database["public"]["Enums"]["video_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          youtube_id: string
          youtube_url: string
        }
        Insert: {
          ai_suggestions_generated?: boolean
          ai_suggestions_generated_at?: string | null
          captions_missing?: boolean
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          failed_step?: string | null
          id?: string
          source_type?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
          youtube_id: string
          youtube_url: string
        }
        Update: {
          ai_suggestions_generated?: boolean
          ai_suggestions_generated_at?: string | null
          captions_missing?: boolean
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          failed_step?: string | null
          id?: string
          source_type?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          youtube_id?: string
          youtube_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      highlight_type: "remember" | "todo" | "ai_suggested"
      reminder_channel: "sms"
      reminder_status: "scheduled" | "sent" | "failed"
      review_schedule: "daily" | "weekly" | "monthly"
      task_status: "pending" | "in_progress" | "completed"
      video_status:
        | "queued"
        | "transcribing"
        | "ready"
        | "failed"
        | "needs_attention"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      highlight_type: ["remember", "todo", "ai_suggested"],
      reminder_channel: ["sms"],
      reminder_status: ["scheduled", "sent", "failed"],
      review_schedule: ["daily", "weekly", "monthly"],
      task_status: ["pending", "in_progress", "completed"],
      video_status: [
        "queued",
        "transcribing",
        "ready",
        "failed",
        "needs_attention",
      ],
    },
  },
} as const
