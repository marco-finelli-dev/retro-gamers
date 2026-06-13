-- Retro-Gamers.it community performance indexes
-- Run this file manually in the Supabase SQL Editor.
-- These indexes support account, comments, private messages and admin community queries.
-- They do not alter existing columns, policies or data.

-- Article comments: public article thread loaded by /api/comments/list.
create index if not exists comments_article_status_created_idx
  on public.comments (article_slug, article_language, status, created_at);

-- Account statistics, reader memories and admin user comment summaries.
create index if not exists comments_user_status_created_idx
  on public.comments (user_id, status, created_at desc);

-- Public reader profiles use profile_id plus approved status for counts/latest comments.
create index if not exists comments_profile_status_created_idx
  on public.comments (profile_id, status, created_at desc);

-- Reply context lookup in admin moderation and comment creation.
create index if not exists comments_parent_idx
  on public.comments (parent_id);

-- Admin comments default view and status filters.
create index if not exists comments_status_created_idx
  on public.comments (status, created_at desc);

-- Reaction counts grouped by comment and reaction type.
create index if not exists comment_reactions_comment_reaction_idx
  on public.comment_reactions (comment_id, reaction);

-- Notification center unread count and latest messages.
create index if not exists account_messages_user_unread_created_idx
  on public.account_messages (user_id, is_read, created_at desc);

-- Private conversation unread counts.
create index if not exists private_messages_conversation_sender_read_created_idx
  on public.private_messages (conversation_id, sender_id, read_at, created_at desc);

-- Latest private message per conversation and thread ordering.
create index if not exists private_messages_conversation_created_desc_idx
  on public.private_messages (conversation_id, created_at desc);

-- Public profiles and admin user filters.
create index if not exists profiles_username_status_idx
  on public.profiles (username, status);

create index if not exists profiles_role_status_idx
  on public.profiles (role, status);
