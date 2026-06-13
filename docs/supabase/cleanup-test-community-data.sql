-- Retro-Gamers.it community test data cleanup
-- Run this file manually in Supabase Dashboard -> SQL Editor.
--
-- Safety model:
-- 1. Target users are identified by exact email from auth.users.
-- 2. Username/display name are shown as an additional safety check, not as the
--    primary destructive selector.
-- 3. This script cleans public/community tables only.
-- 4. It does NOT delete rows from auth.users.
-- 5. It ends with ROLLBACK by default. After checking the preview and final
--    checks inside the transaction, replace ROLLBACK with COMMIT to persist.
--
-- After committing the cleanup, remove the same users manually from:
-- Supabase Dashboard -> Authentication -> Users.
--
-- Avatar files:
-- If avatar_path values are shown in the preview, remove those files manually
-- from the Supabase Storage avatars bucket after the database cleanup.

begin;

set local statement_timeout = '30s';

create temp table cleanup_expected_users (
  email text primary key,
  expected_username text null,
  expected_display_name text null,
  note text null
) on commit drop;

insert into cleanup_expected_users (email, expected_username, expected_display_name, note)
values
  ('prova@retro-gamers.it', 'prova', 'Utente Prova', 'Reader test account'),
  ('marcofinelli79@gmail.com', 'marcofinelli79', 'Marco Finelli', 'Google/OAuth test account'),
  ('finellimarco@itnautico.edu.it', 'finellimarco', 'Marco Finelli', 'School/test account');

create temp table cleanup_target_auth_users on commit drop as
select
  auth_users.id as user_id,
  auth_users.email,
  auth_users.created_at,
  expected.expected_username,
  expected.expected_display_name,
  expected.note
from auth.users as auth_users
inner join cleanup_expected_users as expected
  on lower(auth_users.email) = lower(expected.email);

create temp table cleanup_target_profiles on commit drop as
select
  profiles.id as profile_id,
  profiles.user_id,
  target.email,
  profiles.username,
  profiles.display_name,
  profiles.avatar_path,
  profiles.badge_key,
  profiles.role,
  profiles.status,
  target.expected_username,
  target.expected_display_name,
  (profiles.username is not distinct from target.expected_username) as username_matches_expected,
  (profiles.display_name is not distinct from target.expected_display_name) as display_name_matches_expected
from cleanup_target_auth_users as target
left join public.profiles as profiles
  on profiles.user_id = target.user_id
where profiles.user_id is not null;

create temp table cleanup_target_user_ids on commit drop as
select user_id
from cleanup_target_auth_users;

create temp table cleanup_target_comments on commit drop as
with recursive comment_tree as (
  select
    comments.id,
    comments.parent_id,
    comments.user_id,
    comments.profile_id,
    0 as depth
  from public.comments as comments
  where comments.user_id in (select user_id from cleanup_target_user_ids)
     or comments.profile_id in (select profile_id from cleanup_target_profiles)

  union all

  select
    child.id,
    child.parent_id,
    child.user_id,
    child.profile_id,
    comment_tree.depth + 1 as depth
  from public.comments as child
  inner join comment_tree
    on child.parent_id = comment_tree.id
)
select
  id,
  max(depth) as max_depth,
  bool_or(user_id in (select user_id from cleanup_target_user_ids)) as authored_by_target_user,
  bool_or(profile_id in (select profile_id from cleanup_target_profiles)) as linked_to_target_profile
from comment_tree
group by id;

create temp table cleanup_target_conversations on commit drop as
select conversations.*
from public.private_conversations as conversations
where conversations.user_one in (select user_id from cleanup_target_user_ids)
   or conversations.user_two in (select user_id from cleanup_target_user_ids);

create temp table cleanup_target_private_messages on commit drop as
select messages.*
from public.private_messages as messages
where messages.conversation_id in (select id from cleanup_target_conversations)
   or messages.sender_id in (select user_id from cleanup_target_user_ids);

-- STEP 1: PREVIEW / DRY RUN
-- Check these result sets before running the DELETE section for real.

select
  'target auth users found by exact email' as preview,
  *
from cleanup_target_auth_users
order by email;

select
  'profiles that will be removed' as preview,
  *
from cleanup_target_profiles
order by email;

select
  'profiles with similar username/display name but email NOT targeted - not deleted' as preview,
  auth_users.email,
  profiles.user_id,
  profiles.username,
  profiles.display_name,
  profiles.role,
  profiles.status
from public.profiles as profiles
left join auth.users as auth_users
  on auth_users.id = profiles.user_id
where (
    profiles.username in ('prova', 'marcofinelli79', 'finellimarco')
    or profiles.display_name in ('Utente Prova', 'Marco Finelli')
  )
  and coalesce(lower(auth_users.email), '') not in (
    select lower(email) from cleanup_expected_users
  )
order by auth_users.email nulls last, profiles.username;

select
  'avatar paths to remove manually from Storage avatars bucket' as preview,
  email,
  user_id,
  username,
  avatar_path
from cleanup_target_profiles
where avatar_path is not null
order by email;

select
  'comments that will be removed, including child replies' as preview,
  comments.id,
  comments.parent_id,
  comments.user_id,
  comments.profile_id,
  comments.status,
  comments.article_slug,
  comments.article_title,
  comments.created_at,
  target_comments.max_depth,
  target_comments.authored_by_target_user,
  target_comments.linked_to_target_profile
from public.comments as comments
inner join cleanup_target_comments as target_comments
  on target_comments.id = comments.id
order by target_comments.max_depth desc, comments.created_at desc;

select
  'comments moderated by target users, approved_by will be cleared' as preview,
  comments.id,
  comments.approved_by,
  comments.status,
  comments.article_slug,
  comments.article_title,
  comments.created_at
from public.comments as comments
where comments.approved_by in (select user_id from cleanup_target_user_ids)
order by comments.created_at desc;

select
  'comment reactions made by target users' as preview,
  reactions.*
from public.comment_reactions as reactions
where reactions.user_id in (select user_id from cleanup_target_user_ids)
order by reactions.created_at desc;

select
  'comment reactions received on comments being removed' as preview,
  reactions.*
from public.comment_reactions as reactions
where reactions.comment_id in (select id from cleanup_target_comments)
order by reactions.created_at desc;

select
  'comment subscriptions linked to target users or comments' as preview,
  subscriptions.*
from public.comment_subscriptions as subscriptions
where subscriptions.user_id in (select user_id from cleanup_target_user_ids)
   or subscriptions.comment_id in (select id from cleanup_target_comments)
order by subscriptions.id;

select
  'email notification logs linked to target users, emails or comments' as preview,
  email_logs.*
from public.email_notifications as email_logs
where email_logs.user_id in (select user_id from cleanup_target_user_ids)
   or lower(email_logs.recipient_email) in (select lower(email) from cleanup_expected_users)
   or email_logs.comment_id in (select id from cleanup_target_comments);

select
  'account messages for target users' as preview,
  account_messages.*
from public.account_messages as account_messages
where account_messages.user_id in (select user_id from cleanup_target_user_ids)
order by account_messages.created_at desc;

select
  'private conversations involving target users' as preview,
  *
from cleanup_target_conversations
order by updated_at desc;

select
  'private messages in conversations being removed' as preview,
  *
from cleanup_target_private_messages
order by created_at desc;

select
  'private message blocks linked to target users' as preview,
  blocks.*
from public.private_message_blocks as blocks
where blocks.blocker_id in (select user_id from cleanup_target_user_ids)
   or blocks.blocked_id in (select user_id from cleanup_target_user_ids)
order by blocks.created_at desc;

select
  'private message reports linked to target users or conversations' as preview,
  reports.*
from public.private_message_reports as reports
where reports.conversation_id in (select id from cleanup_target_conversations)
   or reports.message_id in (select id from cleanup_target_private_messages)
   or reports.reporter_id in (select user_id from cleanup_target_user_ids)
   or reports.reported_user_id in (select user_id from cleanup_target_user_ids)
   or reports.resolved_by in (select user_id from cleanup_target_user_ids)
order by reports.created_at desc;

select
  'badge assignments for target users' as preview,
  assignments.*
from public.user_badge_assignments as assignments
where assignments.user_id in (select user_id from cleanup_target_user_ids)
order by assignments.created_at desc;

select
  'badge assignments created by target users for other users, assigned_by will be cleared' as preview,
  assignments.*
from public.user_badge_assignments as assignments
where assignments.assigned_by in (select user_id from cleanup_target_user_ids)
  and assignments.user_id not in (select user_id from cleanup_target_user_ids)
order by assignments.created_at desc;

select
  'summary counts before cleanup' as preview,
  (select count(*) from cleanup_target_auth_users) as target_auth_users,
  (select count(*) from cleanup_target_profiles) as target_profiles,
  (select count(*) from cleanup_target_comments) as comments_and_child_replies,
  (
    select count(*)
    from public.comment_reactions
    where user_id in (select user_id from cleanup_target_user_ids)
       or comment_id in (select id from cleanup_target_comments)
  ) as comment_reactions,
  (
    select count(*)
    from public.comment_subscriptions
    where user_id in (select user_id from cleanup_target_user_ids)
       or comment_id in (select id from cleanup_target_comments)
  ) as comment_subscriptions,
  (
    select count(*)
    from public.email_notifications
    where user_id in (select user_id from cleanup_target_user_ids)
       or lower(recipient_email) in (select lower(email) from cleanup_expected_users)
       or comment_id in (select id from cleanup_target_comments)
  ) as email_notification_logs,
  (select count(*) from public.account_messages where user_id in (select user_id from cleanup_target_user_ids)) as account_messages,
  (select count(*) from cleanup_target_conversations) as private_conversations,
  (select count(*) from cleanup_target_private_messages) as private_messages,
  (
    select count(*)
    from public.private_message_blocks
    where blocker_id in (select user_id from cleanup_target_user_ids)
       or blocked_id in (select user_id from cleanup_target_user_ids)
  ) as private_message_blocks,
  (
    select count(*)
    from public.private_message_reports
    where conversation_id in (select id from cleanup_target_conversations)
       or message_id in (select id from cleanup_target_private_messages)
       or reporter_id in (select user_id from cleanup_target_user_ids)
       or reported_user_id in (select user_id from cleanup_target_user_ids)
       or resolved_by in (select user_id from cleanup_target_user_ids)
  ) as private_message_reports,
  (select count(*) from public.user_badge_assignments where user_id in (select user_id from cleanup_target_user_ids)) as badge_assignments;

-- STEP 2: DELETE. Run only after checking the preview above.
-- The DELETE section is active, but the script rolls back by default.
-- To persist the cleanup, replace the final ROLLBACK with COMMIT.

delete from public.private_message_reports as reports
where reports.conversation_id in (select id from cleanup_target_conversations)
   or reports.message_id in (select id from cleanup_target_private_messages)
   or reports.reporter_id in (select user_id from cleanup_target_user_ids)
   or reports.reported_user_id in (select user_id from cleanup_target_user_ids);

update public.private_message_reports as reports
set resolved_by = null
where reports.resolved_by in (select user_id from cleanup_target_user_ids);

delete from public.private_message_blocks as blocks
where blocks.blocker_id in (select user_id from cleanup_target_user_ids)
   or blocks.blocked_id in (select user_id from cleanup_target_user_ids);

delete from public.private_messages as messages
where messages.id in (select id from cleanup_target_private_messages);

delete from public.private_conversations as conversations
where conversations.id in (select id from cleanup_target_conversations);

delete from public.account_messages as account_messages
where account_messages.user_id in (select user_id from cleanup_target_user_ids);

delete from public.email_notifications as email_logs
where email_logs.user_id in (select user_id from cleanup_target_user_ids)
   or lower(email_logs.recipient_email) in (select lower(email) from cleanup_expected_users)
   or email_logs.comment_id in (select id from cleanup_target_comments);

delete from public.comment_subscriptions as subscriptions
where subscriptions.user_id in (select user_id from cleanup_target_user_ids)
   or subscriptions.comment_id in (select id from cleanup_target_comments);

delete from public.comment_reactions as reactions
where reactions.user_id in (select user_id from cleanup_target_user_ids)
   or reactions.comment_id in (select id from cleanup_target_comments);

update public.user_badge_assignments as assignments
set assigned_by = null
where assignments.assigned_by in (select user_id from cleanup_target_user_ids);

delete from public.user_badge_assignments as assignments
where assignments.user_id in (select user_id from cleanup_target_user_ids);

update public.comments as comments
set approved_by = null
where comments.approved_by in (select user_id from cleanup_target_user_ids);

do $$
declare
  deleted_count integer;
begin
  loop
    delete from public.comments as comments
    using cleanup_target_comments as target_comments
    where comments.id = target_comments.id
      and not exists (
        select 1
        from public.comments as child
        inner join cleanup_target_comments as target_child
          on target_child.id = child.id
        where child.parent_id = comments.id
      );

    get diagnostics deleted_count = row_count;
    exit when deleted_count = 0;
  end loop;
end $$;

delete from public.profiles as profiles
where profiles.user_id in (select user_id from cleanup_target_user_ids);

-- STEP 3: FINAL CHECKS INSIDE THIS TRANSACTION
-- These should be zero, except target_auth_users because auth.users is not deleted here.

select
  'final check - profiles still present' as check_name,
  count(*) as remaining
from public.profiles
where user_id in (select user_id from cleanup_target_user_ids);

select
  'final check - profile rows linked to target auth emails' as check_name,
  auth_users.email,
  profiles.*
from auth.users as auth_users
inner join cleanup_expected_users as expected
  on lower(auth_users.email) = lower(expected.email)
left join public.profiles as profiles
  on profiles.user_id = auth_users.id
where profiles.user_id is not null
order by auth_users.email;

select
  'final check - comments still linked' as check_name,
  count(*) as remaining
from public.comments
where user_id in (select user_id from cleanup_target_user_ids)
   or profile_id in (select profile_id from cleanup_target_profiles)
   or id in (select id from cleanup_target_comments);

select
  'final check - comment reactions still linked' as check_name,
  count(*) as remaining
from public.comment_reactions
where user_id in (select user_id from cleanup_target_user_ids)
   or comment_id in (select id from cleanup_target_comments);

select
  'final check - comment subscriptions still linked' as check_name,
  count(*) as remaining
from public.comment_subscriptions
where user_id in (select user_id from cleanup_target_user_ids)
   or comment_id in (select id from cleanup_target_comments);

select
  'final check - email logs still linked' as check_name,
  count(*) as remaining
from public.email_notifications
where user_id in (select user_id from cleanup_target_user_ids)
   or lower(recipient_email) in (select lower(email) from cleanup_expected_users)
   or comment_id in (select id from cleanup_target_comments);

select
  'final check - private conversations still linked' as check_name,
  count(*) as remaining
from public.private_conversations
where user_one in (select user_id from cleanup_target_user_ids)
   or user_two in (select user_id from cleanup_target_user_ids);

select
  'final check - private messages still linked' as check_name,
  count(*) as remaining
from public.private_messages
where sender_id in (select user_id from cleanup_target_user_ids)
   or conversation_id in (select id from cleanup_target_conversations);

select
  'final check - account messages still linked' as check_name,
  count(*) as remaining
from public.account_messages
where user_id in (select user_id from cleanup_target_user_ids);

select
  'final check - private blocks still linked' as check_name,
  count(*) as remaining
from public.private_message_blocks
where blocker_id in (select user_id from cleanup_target_user_ids)
   or blocked_id in (select user_id from cleanup_target_user_ids);

select
  'final check - private reports still linked' as check_name,
  count(*) as remaining
from public.private_message_reports
where conversation_id in (select id from cleanup_target_conversations)
   or message_id in (select id from cleanup_target_private_messages)
   or reporter_id in (select user_id from cleanup_target_user_ids)
   or reported_user_id in (select user_id from cleanup_target_user_ids)
   or resolved_by in (select user_id from cleanup_target_user_ids);

select
  'final check - badge assignments still linked' as check_name,
  count(*) as remaining
from public.user_badge_assignments
where user_id in (select user_id from cleanup_target_user_ids);

select
  'auth users to remove manually after COMMIT' as manual_step,
  user_id,
  email,
  created_at
from cleanup_target_auth_users
order by email;

-- Default safety behavior: do not persist changes.
-- Replace ROLLBACK with COMMIT only after checking all preview and final-check rows.
rollback;

-- commit;
