-- ============================================================================
-- Migration 002 — remove per-teacher login
--
-- Teachers now open the app and fill the form straight away; there are no
-- accounts and no PINs. Attribution comes from a plain "Your name" text box on
-- the form instead of a logged-in user.
--
-- Run this once in the Supabase SQL editor (SQL Editor → New query).
-- Safe to re-run.
-- ============================================================================

-- Who filled the form in, as typed. Replaces the created_by/updated_by links.
alter table day_entries add column if not exists entered_by text;

-- Backfill anything already recorded so no row is left without a name.
update day_entries
   set entered_by = coalesce(entered_by, 'Unknown')
 where entered_by is null;

-- These pointed at the users table, which no longer has a role to play.
-- Dropping them also drops day_entries_created_by_fkey / _updated_by_fkey.
alter table day_entries drop column if exists created_by;
alter table day_entries drop column if exists updated_by;

-- The audit trail keeps working — it stores the typed name, not a user id.
alter table entry_audit drop column if exists user_id;


-- ----------------------------------------------------------------------------
-- OPTIONAL cleanup. The users table is now unused, but dropping it is
-- irreversible, so it is left to you. Uncomment and run only if you are sure
-- you will not want per-teacher accounts back.
--
--   drop table if exists users;
--
-- Note: schema.sql no longer contains a users table, so this cannot be undone
-- by re-running it. Drop it only if you are sure.
-- ----------------------------------------------------------------------------
