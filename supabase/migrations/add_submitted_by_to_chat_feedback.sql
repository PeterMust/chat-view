-- Add submitted_by column to track which user submitted each piece of feedback.
-- Populated by the frontend with the authenticated user's email (Google OAuth).
alter table chat_feedback
  add column if not exists submitted_by text;
