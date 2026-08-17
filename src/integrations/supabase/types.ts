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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          meta: Json | null
          target: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          meta?: Json | null
          target?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          meta?: Json | null
          target?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_encrypted: string
          label: string
          last_four: string
          last_used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_encrypted: string
          label: string
          last_four: string
          last_used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_encrypted?: string
          label?: string
          last_four?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      attempts: {
        Row: {
          answers: Json
          bookmarks: Json
          correct_count: number | null
          id: string
          score: number | null
          started_at: string
          status: string
          submitted_at: string | null
          test_id: string
          time_taken_sec: number | null
          unattempted_count: number | null
          user_id: string
          wrong_count: number | null
        }
        Insert: {
          answers?: Json
          bookmarks?: Json
          correct_count?: number | null
          id?: string
          score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          test_id: string
          time_taken_sec?: number | null
          unattempted_count?: number | null
          user_id: string
          wrong_count?: number | null
        }
        Update: {
          answers?: Json
          bookmarks?: Json
          correct_count?: number | null
          id?: string
          score?: number | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          test_id?: string
          time_taken_sec?: number | null
          unattempted_count?: number | null
          user_id?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          meta: Json | null
          severity: string
          status: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          meta?: Json | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chapters: {
        Row: {
          class: number | null
          created_at: string
          id: string
          name: string
          order_index: number
          subject_id: string
        }
        Insert: {
          class?: number | null
          created_at?: string
          id?: string
          name: string
          order_index?: number
          subject_id: string
        }
        Update: {
          class?: number | null
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_entries: {
        Row: {
          attempt_id: string | null
          contest_id: string
          id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          attempt_id?: string | null
          contest_id: string
          id?: string
          joined_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string | null
          contest_id?: string
          id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_entries_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_entries_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_results: {
        Row: {
          contest_id: string
          created_at: string
          id: string
          prize_amount: number
          rank: number
          score: number
          time_taken_sec: number | null
          user_id: string
        }
        Insert: {
          contest_id: string
          created_at?: string
          id?: string
          prize_amount?: number
          rank: number
          score?: number
          time_taken_sec?: number | null
          user_id: string
        }
        Update: {
          contest_id?: string
          created_at?: string
          id?: string
          prize_amount?: number
          rank?: number
          score?: number
          time_taken_sec?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_results_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          chapter_ids: string[]
          created_at: string
          created_by: string | null
          description: string | null
          duration_min: number
          ends_at: string
          entry_fee: number
          id: string
          prize_pool: number
          question_ids: string[]
          starts_at: string
          status: string
          test_id: string
          title: string
          total_questions: number
        }
        Insert: {
          chapter_ids?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min: number
          ends_at: string
          entry_fee?: number
          id?: string
          prize_pool?: number
          question_ids?: string[]
          starts_at: string
          status?: string
          test_id: string
          title: string
          total_questions: number
        }
        Update: {
          chapter_ids?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_min?: number
          ends_at?: string
          entry_fee?: number
          id?: string
          prize_pool?: number
          question_ids?: string[]
          starts_at?: string
          status?: string
          test_id?: string
          title?: string
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: "contests_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_runs: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          job_name: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          job_name: string
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          job_name?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          razorpay_order_id: string
          razorpay_payment_id: string | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bonus_balance: number
          created_at: string
          daily_goal: number
          deposit_balance: number
          email: string | null
          full_name: string | null
          id: string
          target_year: number | null
          updated_at: string
          wallet_balance: number
          winnings_balance: number
          xp_total: number
        }
        Insert: {
          avatar_url?: string | null
          bonus_balance?: number
          created_at?: string
          daily_goal?: number
          deposit_balance?: number
          email?: string | null
          full_name?: string | null
          id: string
          target_year?: number | null
          updated_at?: string
          wallet_balance?: number
          winnings_balance?: number
          xp_total?: number
        }
        Update: {
          avatar_url?: string | null
          bonus_balance?: number
          created_at?: string
          daily_goal?: number
          deposit_balance?: number
          email?: string | null
          full_name?: string | null
          id?: string
          target_year?: number | null
          updated_at?: string
          wallet_balance?: number
          winnings_balance?: number
          xp_total?: number
        }
        Relationships: []
      }
      question_diagrams: {
        Row: {
          created_at: string
          data: string
          id: string
          mime: string
          prompt: string | null
          question_id: string | null
        }
        Insert: {
          created_at?: string
          data: string
          id?: string
          mime?: string
          prompt?: string | null
          question_id?: string | null
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          mime?: string
          prompt?: string | null
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_diagrams_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_reports: {
        Row: {
          ai_verdict: Json | null
          created_at: string
          details: string | null
          id: string
          question_id: string
          reason: string
          reviewed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          ai_verdict?: Json | null
          created_at?: string
          details?: string | null
          id?: string
          question_id: string
          reason: string
          reviewed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          ai_verdict?: Json | null
          created_at?: string
          details?: string | null
          id?: string
          question_id?: string
          reason?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          chapter_id: string | null
          correct_index: number
          created_at: string
          difficulty: string
          explanation: string | null
          id: string
          is_pyq: boolean
          marks_correct: number
          marks_wrong: number
          options: Json
          pyq_year: number | null
          source: string
          subject_id: string | null
          text: string
          text_hash: string | null
          year: number | null
        }
        Insert: {
          chapter_id?: string | null
          correct_index: number
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          is_pyq?: boolean
          marks_correct?: number
          marks_wrong?: number
          options: Json
          pyq_year?: number | null
          source?: string
          subject_id?: string | null
          text: string
          text_hash?: string | null
          year?: number | null
        }
        Update: {
          chapter_id?: string | null
          correct_index?: number
          created_at?: string
          difficulty?: string
          explanation?: string | null
          id?: string
          is_pyq?: boolean
          marks_correct?: number
          marks_wrong?: number
          options?: Json
          pyq_year?: number | null
          source?: string
          subject_id?: string | null
          text?: string
          text_hash?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          difficulty: string
          duration_min: number
          ends_at: string | null
          entry_fee: number
          id: string
          is_paid: boolean
          marks_correct: number
          marks_wrong: number
          prize_pool: number
          question_ids: string[]
          source: string
          starts_at: string | null
          syllabus: Json | null
          title: string
          total_questions: number
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string
          duration_min?: number
          ends_at?: string | null
          entry_fee?: number
          id?: string
          is_paid?: boolean
          marks_correct?: number
          marks_wrong?: number
          prize_pool?: number
          question_ids?: string[]
          source?: string
          starts_at?: string | null
          syllabus?: Json | null
          title: string
          total_questions?: number
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          difficulty?: string
          duration_min?: number
          ends_at?: string | null
          entry_fee?: number
          id?: string
          is_paid?: boolean
          marks_correct?: number
          marks_wrong?: number
          prize_pool?: number
          question_ids?: string[]
          source?: string
          starts_at?: string | null
          syllabus?: Json | null
          title?: string
          total_questions?: number
          type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          bucket: string
          created_at: string
          id: string
          meta: Json | null
          reference: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          bucket?: string
          created_at?: string
          id?: string
          meta?: Json | null
          reference?: string | null
          status?: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          bucket?: string
          created_at?: string
          id?: string
          meta?: Json | null
          reference?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          processed_at: string | null
          processed_by: string | null
          status: string
          upi_or_note: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount: number
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          upi_or_note: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          upi_or_note?: string
          user_id?: string
        }
        Relationships: []
      }
      wrong_questions: {
        Row: {
          chapter_id: string | null
          created_at: string
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          chapter_id?: string | null
          created_at?: string
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          attempt_id: string | null
          created_at: string
          id: string
          kind: string
          meta: Json | null
          points: number
          user_id: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          id?: string
          kind: string
          meta?: Json | null
          points: number
          user_id: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          meta?: Json | null
          points?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_list_ai_keys: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          last_four: string
          last_used_at: string
        }[]
      }
      admin_list_pending_withdrawals: {
        Args: never
        Returns: {
          amount: number
          available_balance: number
          created_at: string
          email: string
          full_name: string
          id: string
          upi_or_note: string
          user_id: string
        }[]
      }
      approve_withdrawal: {
        Args: { _admin_note: string; _request_id: string }
        Returns: undefined
      }
      award_attempt_xp: { Args: { _attempt_id: string }; Returns: number }
      credit_wallet_for_payment: {
        Args: {
          _amount: number
          _razorpay_order_id: string
          _razorpay_payment_id: string
          _user_id: string
        }
        Returns: boolean
      }
      finalize_contest: { Args: { _contest_id: string }; Returns: number }
      get_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          email: string
          full_name: string
          id: string
          xp_total: number
        }[]
      }
      get_user_rank: { Args: { _user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_contest: { Args: { _contest_id: string }; Returns: string }
      reject_withdrawal: {
        Args: { _admin_note: string; _request_id: string }
        Returns: undefined
      }
      request_withdrawal: {
        Args: { _amount: number; _upi_or_note: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
