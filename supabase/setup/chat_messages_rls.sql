-- RLS setup for chat_messages table.
-- Run this in Supabase SQL Editor for any environment where chat_messages
-- exists but has no read policy for authenticated users.
--
-- The app connects with the anon key + Google OAuth. Without this policy,
-- authenticated users will see 0 sessions even after a successful login.

-- Enable RLS (safe to run even if already enabled)
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all rows
DROP POLICY IF EXISTS "Allow authenticated read" ON chat_messages;
CREATE POLICY "Allow authenticated read" ON chat_messages
  FOR SELECT TO authenticated USING (true);
