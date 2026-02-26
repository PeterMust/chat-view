-- Create the chat_feedback table for storing feedback submissions
create table if not exists chat_feedback (
  id            bigint generated always as identity primary key,
  feedback_type text not null check (feedback_type in ('chat', 'message')),
  category      text not null,
  comment       text not null,
  session_id    text not null,
  message_index int,
  message_type  text,
  message_timestamp timestamptz,
  message_text_excerpt text,
  tool_name     text,
  message_count int,
  raw_message   jsonb,
  submitted_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Allow inserts from the service role (edge function uses service key)
-- No RLS needed since the edge function bypasses it with the service role key.
