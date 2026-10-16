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
      fund_cache: {
        Row: {
          cache_key: string
          data: Json
          expires_at: string
          id: string
          last_updated: string
        }
        Insert: {
          cache_key?: string
          data: Json
          expires_at?: string
          id?: string
          last_updated?: string
        }
        Update: {
          cache_key?: string
          data?: Json
          expires_at?: string
          id?: string
          last_updated?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_records: {
        Row: {
          attempt_count: number
          created_at: string
          expires_at: string
          hashed_otp: string
          id: string
          phone_number: string
          verified: boolean
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          expires_at: string
          hashed_otp: string
          id?: string
          phone_number: string
          verified?: boolean
        }
        Update: {
          attempt_count?: number
          created_at?: string
          expires_at?: string
          hashed_otp?: string
          id?: string
          phone_number?: string
          verified?: boolean
        }
        Relationships: []
      }
      portfolio: {
        Row: {
          created_at: string
          fund_category: string | null
          fund_id: string
          fund_name: string
          id: string
          invested_amount: number | null
          is_sip: boolean | null
          notes: string | null
          purchase_nav: number | null
          sip_amount: number | null
          units: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fund_category?: string | null
          fund_id: string
          fund_name: string
          id?: string
          invested_amount?: number | null
          is_sip?: boolean | null
          notes?: string | null
          purchase_nav?: number | null
          sip_amount?: number | null
          units?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fund_category?: string | null
          fund_id?: string
          fund_name?: string
          id?: string
          invested_amount?: number | null
          is_sip?: boolean | null
          notes?: string | null
          purchase_nav?: number | null
          sip_amount?: number | null
          units?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          dependents: number | null
          email: string | null
          existing_investments: string | null
          experience_level: string | null
          full_name: string | null
          has_insurance: boolean | null
          id: string
          income_stability: string | null
          investment_amount: string | null
          investment_goal: string | null
          investment_horizon: string | null
          monthly_emis: number | null
          occupation: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          pin_hash: string | null
          pin_salt: string | null
          pin_set: boolean | null
          risk_capacity_score: number | null
          risk_tolerance: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          dependents?: number | null
          email?: string | null
          existing_investments?: string | null
          experience_level?: string | null
          full_name?: string | null
          has_insurance?: boolean | null
          id?: string
          income_stability?: string | null
          investment_amount?: string | null
          investment_goal?: string | null
          investment_horizon?: string | null
          monthly_emis?: number | null
          occupation?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          pin_hash?: string | null
          pin_salt?: string | null
          pin_set?: boolean | null
          risk_capacity_score?: number | null
          risk_tolerance?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          dependents?: number | null
          email?: string | null
          existing_investments?: string | null
          experience_level?: string | null
          full_name?: string | null
          has_insurance?: boolean | null
          id?: string
          income_stability?: string | null
          investment_amount?: string | null
          investment_goal?: string | null
          investment_horizon?: string | null
          monthly_emis?: number | null
          occupation?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          pin_hash?: string | null
          pin_salt?: string | null
          pin_set?: boolean | null
          risk_capacity_score?: number | null
          risk_tolerance?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          created_at: string
          fund_category: string | null
          fund_id: string
          fund_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fund_category?: string | null
          fund_id: string
          fund_name: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fund_category?: string | null
          fund_id?: string
          fund_name?: string
          id?: string
          user_id?: string
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
