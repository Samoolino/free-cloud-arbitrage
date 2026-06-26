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
      balances_snapshot: {
        Row: {
          balances: Json
          exchange_id: string
          id: number
          taken_at: string
          total_usd: number | null
          user_id: string
        }
        Insert: {
          balances: Json
          exchange_id: string
          id?: number
          taken_at?: string
          total_usd?: number | null
          user_id: string
        }
        Update: {
          balances?: Json
          exchange_id?: string
          id?: number
          taken_at?: string
          total_usd?: number | null
          user_id?: string
        }
        Relationships: []
      }
      bot_config: {
        Row: {
          bot_secret_hint: string | null
          coingecko_plan: string
          conflict_mode: string
          enabled_exchanges: string[]
          min_trigger_balance_usd: number
          paper_trading: boolean
          pentagonal_enabled: boolean
          slippage_buffer_pct: number
          target_profit_pct: number
          tracked_assets: string[]
          triangular_enabled: boolean
          updated_at: string
          user_id: string
          ws_staleness_ms: number
        }
        Insert: {
          bot_secret_hint?: string | null
          coingecko_plan?: string
          conflict_mode?: string
          enabled_exchanges?: string[]
          min_trigger_balance_usd?: number
          paper_trading?: boolean
          pentagonal_enabled?: boolean
          slippage_buffer_pct?: number
          target_profit_pct?: number
          tracked_assets?: string[]
          triangular_enabled?: boolean
          updated_at?: string
          user_id: string
          ws_staleness_ms?: number
        }
        Update: {
          bot_secret_hint?: string | null
          coingecko_plan?: string
          conflict_mode?: string
          enabled_exchanges?: string[]
          min_trigger_balance_usd?: number
          paper_trading?: boolean
          pentagonal_enabled?: boolean
          slippage_buffer_pct?: number
          target_profit_pct?: number
          tracked_assets?: string[]
          triangular_enabled?: boolean
          updated_at?: string
          user_id?: string
          ws_staleness_ms?: number
        }
        Relationships: []
      }
      exchange_credentials: {
        Row: {
          api_key_enc: string | null
          api_secret_enc: string | null
          created_at: string
          enabled: boolean
          exchange_id: string
          id: string
          is_trigger: boolean
          label: string | null
          network_pref: Json
          passphrase_enc: string | null
          taker_fee_bps: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_enc?: string | null
          api_secret_enc?: string | null
          created_at?: string
          enabled?: boolean
          exchange_id: string
          id?: string
          is_trigger?: boolean
          label?: string | null
          network_pref?: Json
          passphrase_enc?: string | null
          taker_fee_bps?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_enc?: string | null
          api_secret_enc?: string | null
          created_at?: string
          enabled?: boolean
          exchange_id?: string
          id?: string
          is_trigger?: boolean
          label?: string | null
          network_pref?: Json
          passphrase_enc?: string | null
          taker_fee_bps?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          detected_at: string
          expected_net_usd: number | null
          gate_passed: boolean
          gross_pct: number | null
          id: string
          legs: Json
          loop_path: string
          max_size_usd: number | null
          net_pct: number | null
          reason: string | null
          session_id: string | null
          strategy: Database["public"]["Enums"]["strategy_kind"]
          user_id: string
        }
        Insert: {
          detected_at?: string
          expected_net_usd?: number | null
          gate_passed?: boolean
          gross_pct?: number | null
          id?: string
          legs: Json
          loop_path: string
          max_size_usd?: number | null
          net_pct?: number | null
          reason?: string | null
          session_id?: string | null
          strategy: Database["public"]["Enums"]["strategy_kind"]
          user_id: string
        }
        Update: {
          detected_at?: string
          expected_net_usd?: number | null
          gate_passed?: boolean
          gross_pct?: number | null
          id?: string
          legs?: Json
          loop_path?: string
          max_size_usd?: number | null
          net_pct?: number | null
          reason?: string | null
          session_id?: string | null
          strategy?: Database["public"]["Enums"]["strategy_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          ended_at: string | null
          id: string
          notes: string | null
          realized_pnl_usd: number
          started_at: string
          starting_balance_usd: number | null
          status: Database["public"]["Enums"]["session_status"]
          target_amount_usd: number
          trades_count: number
          trigger_exchange: string | null
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          notes?: string | null
          realized_pnl_usd?: number
          started_at?: string
          starting_balance_usd?: number | null
          status?: Database["public"]["Enums"]["session_status"]
          target_amount_usd: number
          trades_count?: number
          trigger_exchange?: string | null
          user_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          notes?: string | null
          realized_pnl_usd?: number
          started_at?: string
          starting_balance_usd?: number | null
          status?: Database["public"]["Enums"]["session_status"]
          target_amount_usd?: number
          trades_count?: number
          trigger_exchange?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          context: Json | null
          created_at: string
          id: number
          level: string
          message: string
          session_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: number
          level?: string
          message: string
          session_id?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: number
          level?: string
          message?: string
          session_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_intents: {
        Row: {
          ack_at: string | null
          allocated_usd: number
          created_at: string
          error: string | null
          expected_net_usd: number
          id: string
          legs: Json
          lock_token: string
          opportunity_id: string | null
          realized_pnl_usd: number | null
          result_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["intent_status"]
          ttl_ms: number
          user_id: string
        }
        Insert: {
          ack_at?: string | null
          allocated_usd: number
          created_at?: string
          error?: string | null
          expected_net_usd: number
          id?: string
          legs: Json
          lock_token: string
          opportunity_id?: string | null
          realized_pnl_usd?: number | null
          result_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["intent_status"]
          ttl_ms?: number
          user_id: string
        }
        Update: {
          ack_at?: string | null
          allocated_usd?: number
          created_at?: string
          error?: string | null
          expected_net_usd?: number
          id?: string
          legs?: Json
          lock_token?: string
          opportunity_id?: string | null
          realized_pnl_usd?: number | null
          result_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["intent_status"]
          ttl_ms?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_intents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_intents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          executed_at: string
          id: string
          intent_id: string | null
          legs: Json
          notional_usd: number
          paper: boolean
          realized_pnl_usd: number
          session_id: string | null
          strategy: Database["public"]["Enums"]["strategy_kind"]
          user_id: string
        }
        Insert: {
          executed_at?: string
          id?: string
          intent_id?: string | null
          legs: Json
          notional_usd: number
          paper?: boolean
          realized_pnl_usd?: number
          session_id?: string | null
          strategy: Database["public"]["Enums"]["strategy_kind"]
          user_id: string
        }
        Update: {
          executed_at?: string
          id?: string
          intent_id?: string | null
          legs?: Json
          notional_usd?: number
          paper?: boolean
          realized_pnl_usd?: number
          session_id?: string | null
          strategy?: Database["public"]["Enums"]["strategy_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "trade_intents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          asset: string
          confirmed_at: string | null
          created_at: string
          fee: number | null
          from_exchange: string
          id: string
          intent_id: string | null
          network: string
          status: Database["public"]["Enums"]["transfer_status"]
          to_exchange: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount: number
          asset: string
          confirmed_at?: string | null
          created_at?: string
          fee?: number | null
          from_exchange: string
          id?: string
          intent_id?: string | null
          network: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_exchange: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          asset?: string
          confirmed_at?: string | null
          created_at?: string
          fee?: number | null
          from_exchange?: string
          id?: string
          intent_id?: string | null
          network?: string
          status?: Database["public"]["Enums"]["transfer_status"]
          to_exchange?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "trade_intents"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      intent_status:
        | "queued"
        | "acked"
        | "executing"
        | "filled"
        | "partial"
        | "failed"
        | "cancelled"
        | "aborted_stale"
      session_status:
        | "running"
        | "target_reached"
        | "stopped"
        | "lockout"
        | "cooldown"
        | "error"
      strategy_kind: "triangular" | "pentagonal"
      transfer_status: "pending" | "broadcast" | "confirmed" | "failed"
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
      app_role: ["admin", "user"],
      intent_status: [
        "queued",
        "acked",
        "executing",
        "filled",
        "partial",
        "failed",
        "cancelled",
        "aborted_stale",
      ],
      session_status: [
        "running",
        "target_reached",
        "stopped",
        "lockout",
        "cooldown",
        "error",
      ],
      strategy_kind: ["triangular", "pentagonal"],
      transfer_status: ["pending", "broadcast", "confirmed", "failed"],
    },
  },
} as const
