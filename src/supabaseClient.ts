import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      games: {
        Row: {
          id: string;
          code: string;
          name: string;
          phase: "live" | "play" | "review";
          active_stop_id: string | null;
          timer_running: boolean;
          timer_started_at: string;
          timer_seconds_total: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          phase?: "live" | "play" | "review";
          active_stop_id?: string | null;
          timer_running?: boolean;
          timer_started_at?: string;
          timer_seconds_total?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["games"]["Insert"]>;
        Relationships: [];
      };
      groups: {
        Row: {
          game_id: string;
          slug: string;
          name: string;
          short_name: string;
          color_key: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          game_id: string;
          slug: string;
          name: string;
          short_name: string;
          color_key: string;
          sort_order: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["groups"]["Insert"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          game_id: string;
          slug: string;
          title: string;
          description: string;
          icon: string;
          is_free: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          game_id: string;
          slug: string;
          title: string;
          description: string;
          icon: string;
          is_free?: boolean;
          sort_order: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      group_board_tasks: {
        Row: {
          game_id: string;
          group_slug: string;
          task_slug: string;
          slot_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          game_id: string;
          group_slug: string;
          task_slug: string;
          slot_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["group_board_tasks"]["Insert"]>;
        Relationships: [];
      };
      stops: {
        Row: {
          id: string;
          game_id: string;
          slug: string;
          name: string;
          detail: string;
          arrive_time: string;
          leave_time: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          slug: string;
          name: string;
          detail: string;
          arrive_time: string;
          leave_time: string;
          sort_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stops"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          game_id: string;
          user_id: string;
          role: "player" | "host";
          group_slug: string | null;
          display_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id: string;
          role: "player" | "host";
          group_slug?: string | null;
          display_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [];
      };
      submissions: {
        Row: {
          id: string;
          game_id: string;
          group_slug: string;
          task_slug: string;
          submitted_by: string;
          image_path: string;
          image_name: string;
          status: "pending" | "approved" | "retake";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          group_slug: string;
          task_slug: string;
          submitted_by: string;
          image_path: string;
          image_name: string;
          status?: "pending" | "approved" | "retake";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["submissions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      configure_game_code: {
        Args: {
          desired_game_code: string;
          pin: string;
          display_name: string;
        };
        Returns: Database["public"]["Tables"]["memberships"]["Row"];
      };
      claim_host: {
        Args: {
          game_code: string;
          pin: string;
          display_name: string;
        };
        Returns: Database["public"]["Tables"]["memberships"]["Row"];
      };
    };
    Enums: {
      hunt_phase: "live" | "play" | "review";
      membership_role: "player" | "host";
      submission_status: "pending" | "approved" | "retake";
    };
    CompositeTypes: Record<string, never>;
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabasePublishableKey.length > 0;

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.",
    );
  }

  return supabase;
}
