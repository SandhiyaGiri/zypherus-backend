import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.');
}

// Create Supabase client with service role key for backend operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Database types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          is_admin: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          is_admin?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          name: string;
          rate_limit: number;
          is_active: boolean;
          last_used_at: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          name: string;
          rate_limit?: number;
          is_active?: boolean;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          name?: string;
          rate_limit?: number;
          is_active?: boolean;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
      };
      usage_logs: {
        Row: {
          id: string;
          api_key_id: string;
          user_id: string;
          endpoint: string;
          status_code: number;
          timestamp: string;
          ip_address: string;
        };
        Insert: {
          id?: string;
          api_key_id: string;
          user_id: string;
          endpoint: string;
          status_code: number;
          timestamp?: string;
          ip_address: string;
        };
        Update: {
          id?: string;
          api_key_id?: string;
          user_id?: string;
          endpoint?: string;
          status_code?: number;
          timestamp?: string;
          ip_address?: string;
        };
      };
    };
  };
}

export type User = Database['public']['Tables']['users']['Row'];
export type ApiKey = Database['public']['Tables']['api_keys']['Row'];
export type UsageLog = Database['public']['Tables']['usage_logs']['Row'];
