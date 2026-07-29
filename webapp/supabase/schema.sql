-- ============================================================================
-- Symbiosis Expense Manager — database schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: everything is idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Schools. One row per institute.
--
-- There is NO opening balance and no carry-forward: cash is handed over at the
-- end of each day, so every day stands alone. See src/lib/calc.ts.
--
--   opening_date  the day daily logging started. Used only to decide which
--                 unfilled days to flag — it affects no figure.
-- ---------------------------------------------------------------------------
create table if not exists schools (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  name_hi       text not null,
  opening_date  date not null default current_date,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- One row per school per calendar day. The unique constraint is what stops the
-- duplicate/conflicting rows the spreadsheet allowed.
--
-- `no_activity` distinguishes "school was shut / nothing collected" from
-- "nobody got round to logging it" — invisible in the old sheet.
-- ---------------------------------------------------------------------------
create table if not exists day_entries (
  id                   uuid primary key default gen_random_uuid(),
  school_id            uuid not null references schools (id) on delete cascade,
  entry_date           date not null,

  -- money in
  offline_receiving    numeric(14, 2) not null default 0,  -- manual receipt fees
  uolo_receiving       numeric(14, 2) not null default 0,  -- fees booked on Uolo
  principal_receiving  numeric(14, 2) not null default 0,  -- taken directly by Principal/Director

  -- of the above, the slice that never became physical cash
  online_receiving     numeric(14, 2) not null default 0,  -- PAYTM / UPI / online

  -- money out of the cash box that is not an expense
  bank_deposit         numeric(14, 2) not null default 0,
  bank_reference       text,                                -- slip / UTR, for reconciliation

  no_activity          boolean not null default false,
  note                 text,

  -- Whoever filled the form in, as typed. There are no accounts — this is the
  -- only attribution, so the audit trail still says who changed what.
  entered_by           text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (school_id, entry_date),

  constraint amounts_non_negative check (
    offline_receiving   >= 0 and
    uolo_receiving      >= 0 and
    principal_receiving >= 0 and
    online_receiving    >= 0 and
    bank_deposit        >= 0
  )
);

create index if not exists day_entries_school_date_idx
  on day_entries (school_id, entry_date desc);

-- ---------------------------------------------------------------------------
-- Itemised expenses. Replaces the free-text "Reason of Expense" blob.
--
-- `paid_from` is the important column:
--   cash     — came out of the cash box (the only kind that reduces cash in hand)
--   bank     — paid from the bank account, never touched the cash box
--   external — paid by someone else's money (Sir's own pocket, a donor, credit)
-- ---------------------------------------------------------------------------
create table if not exists expenses (
  id            uuid primary key default gen_random_uuid(),
  day_entry_id  uuid not null references day_entries (id) on delete cascade,
  amount        numeric(14, 2) not null check (amount > 0),
  reason        text not null check (length(btrim(reason)) > 0),
  category      text not null default 'other',
  paid_from     text not null check (paid_from in ('cash', 'bank', 'external')),
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists expenses_day_entry_idx on expenses (day_entry_id);

-- ---------------------------------------------------------------------------
-- Append-only audit trail. Nothing is ever silently changed.
-- ---------------------------------------------------------------------------
create table if not exists entry_audit (
  id          bigserial primary key,
  school_id   uuid not null references schools (id) on delete cascade,
  entry_date  date not null,
  user_name   text not null,
  action      text not null check (action in ('create', 'update', 'delete')),
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);

create index if not exists entry_audit_lookup_idx
  on entry_audit (school_id, entry_date, at desc);

-- ---------------------------------------------------------------------------
-- Lock the tables down. The app talks to Postgres only through the service-role
-- key from server-side code, which bypasses RLS. Enabling RLS with no policies
-- means a leaked anon key can read and write nothing.
-- ---------------------------------------------------------------------------
alter table schools     enable row level security;
alter table day_entries enable row level security;
alter table expenses    enable row level security;
alter table entry_audit enable row level security;

-- ---------------------------------------------------------------------------
-- Seed the two schools.
-- ---------------------------------------------------------------------------
insert into schools (code, name, name_hi, sort_order, opening_date)
values
  ('higher', 'Higher Secondary', 'उच्च माध्यमिक', 1, current_date),
  ('senior', 'Senior Secondary', 'वरिष्ठ माध्यमिक', 2, current_date)
on conflict (code) do nothing;
