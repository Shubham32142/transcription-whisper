import { getSupabaseClient, type TranscriptionRecord } from '../lib/supabase';

/**
 * Transcriptions Repository - Handles all database queries for transcriptions using Supabase
 */
export class TranscriptionsRepository {
  /**
   * Create a new transcription record
   */
  static async create(
    apiKey: string,
    filename: string,
    transcript: string,
    language: string | null = null,
    duration: number | null = null,
  ): Promise<TranscriptionRecord> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('transcriptions')
      .insert({
        api_key: apiKey,
        filename,
        transcript,
        language,
        duration,
      } as any)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create transcription: ${error.message}`);
    }

    return data as TranscriptionRecord;
  }

  /**
   * Get transcriptions by API key
   */
  static async findByApiKey(apiKey: string, limit = 100): Promise<TranscriptionRecord[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('transcriptions')
      .select('*')
      .eq('api_key', apiKey)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch transcriptions: ${error.message}`);
    }

    return data as TranscriptionRecord[];
  }

  /**
   * Get all transcriptions
   */
  static async findAll(limit = 100): Promise<TranscriptionRecord[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('transcriptions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch transcriptions: ${error.message}`);
    }

    return data as TranscriptionRecord[];
  }

  /**
   * Get transcription by ID
   */
  static async findById(id: number): Promise<TranscriptionRecord | undefined> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.from('transcriptions').select('*').eq('id', id).single();

    if (error) {
      // Return undefined if not found
      if (error.code === 'PGRST116') {
        return undefined;
      }
      throw new Error(`Failed to fetch transcription: ${error.message}`);
    }

    return data as TranscriptionRecord;
  }

  /**
   * Get transcription statistics
   */
  static async getStats(): Promise<{
    total: number;
    totalDuration: number;
    averageDuration: number;
  }> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.from('transcriptions').select('duration');

    if (error) {
      throw new Error(`Failed to fetch transcription stats: ${error.message}`);
    }

    const durations = (data as any[])
      .map((t: any) => t.duration)
      .filter((d: any): d is number => d !== null && d !== undefined);

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0;

    return {
      total: data.length,
      totalDuration,
      averageDuration,
    };
  }

  /**
   * Delete old transcriptions
   * Useful for cleanup jobs
   */
  static async deleteOlderThan(days: number): Promise<number> {
    const supabase = getSupabaseClient();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const { error, count } = await supabase
      .from('transcriptions')
      .delete({ count: 'exact' })
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      throw new Error(`Failed to delete old transcriptions: ${error.message}`);
    }

    return count || 0;
  }
}
