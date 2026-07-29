-- ============================================================================
-- Migration 004 — drop the unused opening_cash column
--
-- Nothing has read this since the carry-forward model was removed, but it sat
-- in the schema documented as the base for a running balance — teaching the
-- next reader the exact model the app abandoned.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table schools drop column if exists opening_cash;
