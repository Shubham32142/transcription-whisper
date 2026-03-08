# Supabase Migration Guide

This document explains how to set up and use Supabase as the database backend for this project.

## Prerequisites

1. A Supabase account (free tier available at https://supabase.com)
2. A new Supabase project created

## Setup Steps

### 1. Create a Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Enter a name (e.g., "voice-transcription-api")
4. Set a database password (save this securely)
5. Select a region closest to your users
6. Wait for the project to be provisioned (~2 minutes)

### 2. Run the Migration

1. In your Supabase project dashboard, go to the **SQL Editor**
2. Click **New Query**
3. Copy the contents of `supabase-migration.sql` and paste it into the editor
4. Click **Run** to execute the migration
5. Verify that the tables were created by going to **Table Editor**

### 3. Get Your Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (looks like `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon public** key (the long JWT token under "Project API keys")

### 4. Configure Environment Variables

Add the following to your `.env` file in the `api` directory:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Replace the values with your actual Supabase URL and anon key.

### 5. Create an Initial API Key

After starting your API server, you can create your first API key using the admin endpoint:

```bash
curl -X POST http://localhost:3000/api/admin/keys \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"name": "My First API Key"}'
```

## Database Schema

### Tables

#### `api_keys`

- `id` - Auto-incrementing primary key
- `key` - Unique API key string (format: `wsp_...`)
- `name` - Descriptive name for the key
- `created_at` - Timestamp when key was created
- `last_used` - Timestamp when key was last used
- `is_active` - Status (1 = active, 0 = inactive)
- `usage_count` - Number of times the key has been used

#### `transcriptions`

- `id` - Auto-incrementing primary key
- `api_key` - API key used for this transcription (foreign key)
- `filename` - Original filename of the audio file
- `transcript` - The transcribed text
- `language` - Detected language (optional)
- `duration` - Audio duration in seconds (optional)
- `created_at` - Timestamp when transcription was created

### Security

The migration includes Row Level Security (RLS) policies:

- Service role has full access to all tables
- Anonymous users can read active API keys (for validation)
- Anonymous users can insert and read transcriptions

### Functions

#### `update_api_key_usage()`

Automatically triggered after a transcription is inserted to update the API key's `last_used` and `usage_count`.

#### `get_api_key_stats()`

Returns statistics about API keys and transcriptions usage.

## Querying from Supabase Dashboard

You can run analytics queries directly in the SQL Editor:

```sql
-- Get usage statistics
SELECT * FROM get_api_key_stats();

-- View recent transcriptions
SELECT
  t.id,
  t.filename,
  t.language,
  t.duration,
  t.created_at,
  k.name as api_key_name
FROM transcriptions t
JOIN api_keys k ON t.api_key = k.key
ORDER BY t.created_at DESC
LIMIT 10;

-- Get API key usage summary
SELECT
  name,
  key,
  usage_count,
  last_used,
  is_active
FROM api_keys
ORDER BY usage_count DESC;
```

## Backup and Recovery

Supabase automatically creates daily backups for paid plans. For free tier:

1. Go to **Database** → **Backups**
2. Click **Download Backup** to manually save your data

## Migration from SQLite

If you were previously using SQLite (`better-sqlite3`), the data structure is compatible. You can export your existing data and import it into Supabase using the SQL Editor or using a migration script.

## Troubleshooting

### "Supabase configuration is missing" error

- Ensure `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in your `.env` file
- Restart your API server after adding environment variables

### "Invalid API key" errors

- Check that RLS policies are properly configured
- Verify that your anon key has the correct permissions

### Performance issues

- Add indexes if you're querying on columns not already indexed
- Consider enabling connection pooling for high-traffic scenarios
- Use Supabase's built-in caching features

## Next Steps

- Consider integrating Supabase Auth for user authentication
- Set up Supabase Storage for audio file uploads
- Enable real-time subscriptions for live transcription updates
- Configure backups and monitoring in the Supabase dashboard
