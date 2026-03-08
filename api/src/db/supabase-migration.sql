-- Supabase Migration: Initial Schema
-- This migration creates the necessary tables for the voice transcription API

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- API Keys Table
-- Stores API keys for authentication
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used TIMESTAMPTZ,
  is_active INTEGER NOT NULL DEFAULT 1,
  usage_count INTEGER NOT NULL DEFAULT 0
);

-- Create index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- Transcriptions Table
-- Stores transcription history and results
CREATE TABLE IF NOT EXISTS transcriptions (
  id BIGSERIAL PRIMARY KEY,
  api_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  transcript TEXT NOT NULL,
  language TEXT,
  duration REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (api_key) REFERENCES api_keys(key) ON DELETE CASCADE
);

-- Create indexes for foreign keys and common queries
CREATE INDEX IF NOT EXISTS idx_transcriptions_api_key ON transcriptions(api_key);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at DESC);

-- Add RLS (Row Level Security) policies
-- Enable RLS on both tables
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to have full access
CREATE POLICY "Service role has full access to api_keys"
  ON api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role has full access to transcriptions"
  ON transcriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anon users to read active API keys (for validation)
-- Note: In production, you might want to restrict this further
CREATE POLICY "Anon can read active api keys"
  ON api_keys
  FOR SELECT
  TO anon
  USING (is_active = 1);

-- Policy: Allow anon users to insert transcriptions
CREATE POLICY "Anon can insert transcriptions"
  ON transcriptions
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Allow anon users to read their own transcriptions
-- This assumes we'll add user_id later; for now, allow read access
CREATE POLICY "Anon can read transcriptions"
  ON transcriptions
  FOR SELECT
  TO anon
  USING (true);

-- Create a function to automatically update last_used and usage_count
CREATE OR REPLACE FUNCTION update_api_key_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE api_keys
  SET last_used = NOW(),
      usage_count = usage_count + 1
  WHERE key = NEW.api_key;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function after transcription insert
CREATE TRIGGER trigger_update_api_key_usage
  AFTER INSERT ON transcriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_api_key_usage();

-- Add some useful database functions
CREATE OR REPLACE FUNCTION get_api_key_stats()
RETURNS TABLE (
  total_keys BIGINT,
  active_keys BIGINT,
  total_transcriptions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM api_keys)::BIGINT,
    (SELECT COUNT(*) FROM api_keys WHERE is_active = 1)::BIGINT,
    (SELECT COUNT(*) FROM transcriptions)::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE api_keys IS 'Stores API keys for authentication and usage tracking';
COMMENT ON TABLE transcriptions IS 'Stores transcription history and results';
COMMENT ON COLUMN api_keys.is_active IS '1 for active, 0 for inactive';
COMMENT ON COLUMN transcriptions.duration IS 'Duration of audio in seconds';
