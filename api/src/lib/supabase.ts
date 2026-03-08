import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// Types for our database schema
export interface ApiKeyRecord {
  id: number;
  key: string;
  name: string;
  created_at: string;
  last_used: string | null;
  is_active: number;
  usage_count: number;
}

export interface TranscriptionRecord {
  id: number;
  api_key: string;
  filename: string;
  transcript: string;
  language: string | null;
  duration: number | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: ApiKeyRecord;
        Insert: {
          key: string;
          name: string;
          created_at?: string;
          last_used?: string | null;
          is_active?: number;
          usage_count?: number;
        };
        Update: {
          key?: string;
          name?: string;
          created_at?: string;
          last_used?: string | null;
          is_active?: number;
          usage_count?: number;
        };
      };
      transcriptions: {
        Row: TranscriptionRecord;
        Insert: {
          api_key: string;
          filename: string;
          transcript: string;
          language?: string | null;
          duration?: number | null;
          created_at?: string;
        };
        Update: {
          api_key?: string;
          filename?: string;
          transcript?: string;
          language?: string | null;
          duration?: number | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      get_api_key_stats: {
        Args: Record<string, never>;
        Returns: Array<{
          total_keys: number;
          active_keys: number;
          total_transcriptions: number;
        }>;
      };
    };
  };
}

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Get or create a Supabase client instance (singleton pattern)
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseInstance) {
    if (!config.supabase.url || !config.supabase.anonKey) {
      throw new Error(
        'Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.',
      );
    }

    supabaseInstance = createClient<Database>(config.supabase.url, config.supabase.anonKey, {
      auth: {
        persistSession: false, // We're not using Supabase Auth yet
        autoRefreshToken: false,
      },
      db: {
        schema: 'public',
      },
    });
  }

  return supabaseInstance;
}

/**
 * Export a default instance for convenience
 * Note: This will be created lazily when first accessed
 */
let defaultInstance: SupabaseClient<Database> | null = null;

export function getSupabase(): SupabaseClient<Database> {
  if (!defaultInstance) {
    defaultInstance = getSupabaseClient();
  }
  return defaultInstance;
}
