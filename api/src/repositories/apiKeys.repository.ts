import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { logger } from '../config/logger';
import type { ApiKeyRecord } from '../types';
import { getSupabaseClient } from '../lib/supabase';

/**
 * API Keys Repository - Handles all database queries for API keys using Supabase
 */
export class ApiKeysRepository {
  /**
   * Get API key record by key value
   */
  static async findByKey(key: string): Promise<ApiKeyRecord | undefined> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.from('api_keys').select('*').eq('key', key).single();

    if (error) {
      // Return undefined if not found (expected for invalid keys)
      if (error.code === 'PGRST116') {
        return undefined;
      }
      throw new Error(`Failed to fetch API key: ${error.message}`);
    }

    return data as ApiKeyRecord;
  }

  /**
   * Get all API keys
   */
  static async findAll(): Promise<ApiKeyRecord[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch API keys: ${error.message}`);
    }

    return data as ApiKeyRecord[];
  }

  /**
   * Create new API key
   */
  static async create(key: string, name: string): Promise<ApiKeyRecord> {
    const supabase = getSupabaseClient();

    // Check if key already exists
    const existing = await this.findByKey(key);
    if (existing) {
      throw new Error('API key already exists');
    }

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        key,
        name,
        is_active: 1,
      } as any)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }

    return data as ApiKeyRecord;
  }

  /**
   * Deactivate an API key
   */
  static async deactivate(key: string): Promise<boolean> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('api_keys')
      // @ts-expect-error - Supabase generic type inference limitation
      .update({ is_active: 0 })
      .eq('key', key);

    if (error) {
      throw new Error(`Failed to deactivate API key: ${error.message}`);
    }

    return true;
  }

  /**
   * Increment usage count and update last_used
   * Note: With Supabase, this is handled automatically by a database trigger
   * when a transcription is inserted. This method is kept for manual updates if needed.
   */
  static async recordUsage(key: string): Promise<void> {
    const supabase = getSupabaseClient();

    const record = await this.findByKey(key);
    if (!record || record.is_active === 0) {
      return;
    }

    const { error } = await supabase
      .from('api_keys')
      // @ts-expect-error - Supabase generic type inference limitation
      .update({
        last_used: new Date().toISOString(),
        usage_count: record.usage_count + 1,
      })
      .eq('key', key);

    if (error) {
      throw new Error(`Failed to record API key usage: ${error.message}`);
    }
  }

  /**
   * Get usage statistics
   */
  static async getStats(): Promise<{ total: number; active: number }> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('get_api_key_stats');

    if (error) {
      throw new Error(`Failed to fetch stats: ${error.message}`);
    }

    const record = data as any;
    const result = Array.isArray(record) ? record[0] : record;

    return {
      total: Number(result?.total_keys || 0),
      active: Number(result?.active_keys || 0),
    };
  }

  /**
   * Generate a secure API key
   */
  static generateApiKey(): string {
    return `wsp_${randomBytes(32).toString('hex')}`;
  }
}

/**
 * Ensure at least one API key exists for testing (development only)
 * Note: In production with Supabase, you should create keys via the admin API
 */
async function ensureDefaultKey(): Promise<void> {
  try {
    const keys = await ApiKeysRepository.findAll();
    if (keys.length === 0) {
      const key = ApiKeysRepository.generateApiKey();
      await ApiKeysRepository.create(key, 'Default Test Key');
      logger.info('Created default API key for testing', { key });
    }
  } catch (error) {
    logger.warn('Could not create default API key', {
      error: (error as Error).message,
      hint: 'Make sure Supabase is configured and the migration has been run.',
    });
  }
}

// Only run in development when explicitly enabled.
// This prevents noisy warnings in local setups that don't use API keys.
if (config.isDev && config.bootstrap.enableDefaultApiKey) {
  ensureDefaultKey().catch((error: unknown) => {
    logger.error('Failed to bootstrap default API key', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
