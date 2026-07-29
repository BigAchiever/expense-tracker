-- ============================================================================
-- Migration 003 — make saving a day atomic, and stop silent overwrites
--
-- Two problems this fixes.
--
-- 1. The app used to save a day as three separate statements: upsert the row,
--    DELETE every expense line, then INSERT the new ones. Each was its own
--    transaction. If the INSERT failed — a dropped connection on school wifi is
--    enough — the day kept its new receipts but lost every expense line, and the
--    audit row (written last) never ran. A day could silently gain a ₹50,000
--    phantom surplus with nothing recording it.
--
-- 2. Two people editing the same day both saved unconditionally. The second
--    save overwrote the first, including deleting their expense lines, and
--    neither person was told.
--
-- A plpgsql function runs in a single implicit transaction, so either the whole
-- save lands or none of it does. The optimistic-concurrency check compares the
-- row's updated_at against what the browser last loaded.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

create or replace function save_day_entry(
  p_school_id           uuid,
  p_entry_date          date,
  p_offline_receiving   numeric,
  p_uolo_receiving      numeric,
  p_principal_receiving numeric,
  p_online_receiving    numeric,
  p_bank_deposit        numeric,
  p_bank_reference      text,
  p_note                text,
  p_no_activity         boolean,
  p_entered_by          text,
  p_expenses            jsonb,        -- [{amount, reason, category, paid_from}, …]
  p_expected_updated_at timestamptz,  -- null = "I believe this day has no entry yet"
  p_force               boolean default false
)
returns timestamptz
language plpgsql
as $$
declare
  v_existing   day_entries%rowtype;
  v_entry_id   uuid;
  v_before     jsonb;
  v_after      jsonb;
  v_now        timestamptz := now();
begin
  select * into v_existing
    from day_entries
   where school_id = p_school_id and entry_date = p_entry_date;

  -- ---- optimistic concurrency -------------------------------------------
  if not p_force then
    if found and p_expected_updated_at is null then
      raise exception 'CONFLICT_CREATED'
        using hint = coalesce(v_existing.entered_by, 'someone');
    end if;
    if found and p_expected_updated_at is not null
       and v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception 'CONFLICT_CHANGED'
        using hint = coalesce(v_existing.entered_by, 'someone');
    end if;
    if not found and p_expected_updated_at is not null then
      raise exception 'CONFLICT_DELETED' using hint = 'someone';
    end if;
  end if;

  -- ---- capture the true prior state, expenses and note included ---------
  if found then
    v_before := jsonb_build_object(
      'offlineReceiving',   v_existing.offline_receiving,
      'uoloReceiving',      v_existing.uolo_receiving,
      'principalReceiving', v_existing.principal_receiving,
      'onlineReceiving',    v_existing.online_receiving,
      'bankDeposit',        v_existing.bank_deposit,
      'bankReference',      v_existing.bank_reference,
      'note',               v_existing.note,
      'noActivity',         v_existing.no_activity,
      'enteredBy',          v_existing.entered_by,
      'expenses',           coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'amount', e.amount, 'reason', e.reason,
                  'category', e.category, 'paidFrom', e.paid_from) order by e.position)
           from expenses e where e.day_entry_id = v_existing.id),
        '[]'::jsonb)
    );
  end if;

  -- ---- write the day ----------------------------------------------------
  insert into day_entries as d (
    school_id, entry_date, offline_receiving, uolo_receiving, principal_receiving,
    online_receiving, bank_deposit, bank_reference, note, no_activity, entered_by, updated_at
  ) values (
    p_school_id, p_entry_date, p_offline_receiving, p_uolo_receiving, p_principal_receiving,
    p_online_receiving, p_bank_deposit, p_bank_reference, p_note, p_no_activity, p_entered_by, v_now
  )
  on conflict (school_id, entry_date) do update set
    offline_receiving   = excluded.offline_receiving,
    uolo_receiving      = excluded.uolo_receiving,
    principal_receiving = excluded.principal_receiving,
    online_receiving    = excluded.online_receiving,
    bank_deposit        = excluded.bank_deposit,
    bank_reference      = excluded.bank_reference,
    note                = excluded.note,
    no_activity         = excluded.no_activity,
    entered_by          = excluded.entered_by,
    updated_at          = excluded.updated_at
  returning d.id into v_entry_id;

  -- ---- replace the expense lines, in the same transaction ---------------
  delete from expenses where day_entry_id = v_entry_id;

  if p_expenses is not null and jsonb_array_length(p_expenses) > 0 then
    insert into expenses (day_entry_id, amount, reason, category, paid_from, position)
    select v_entry_id,
           (x->>'amount')::numeric,
           x->>'reason',
           coalesce(x->>'category', 'other'),
           x->>'paid_from',
           (ord - 1)
      from jsonb_array_elements(p_expenses) with ordinality as t(x, ord);
  end if;

  -- ---- audit, inside the same transaction so it cannot go missing -------
  v_after := jsonb_build_object(
    'offlineReceiving',   p_offline_receiving,
    'uoloReceiving',      p_uolo_receiving,
    'principalReceiving', p_principal_receiving,
    'onlineReceiving',    p_online_receiving,
    'bankDeposit',        p_bank_deposit,
    'bankReference',      p_bank_reference,
    'note',               p_note,
    'noActivity',         p_no_activity,
    'enteredBy',          p_entered_by,
    'expenses',           coalesce(p_expenses, '[]'::jsonb)
  );

  insert into entry_audit (school_id, entry_date, user_name, action, before, after)
  values (p_school_id, p_entry_date, p_entered_by,
          case when v_before is null then 'create' else 'update' end,
          v_before, v_after);

  return v_now;
end;
$$;


-- ---------------------------------------------------------------------------
-- Deleting a day. An entry saved against the wrong date previously could not be
-- removed at all: there was no delete path, and blanking every field was
-- rejected by the "nothing has been filled in" rule. The row is copied into the
-- audit trail before it goes, so a delete is recoverable by hand.
-- ---------------------------------------------------------------------------
create or replace function delete_day_entry(
  p_school_id  uuid,
  p_entry_date date,
  p_deleted_by text
)
returns boolean
language plpgsql
as $$
declare
  v_existing day_entries%rowtype;
  v_before   jsonb;
begin
  select * into v_existing
    from day_entries
   where school_id = p_school_id and entry_date = p_entry_date;

  if not found then
    return false;
  end if;

  v_before := jsonb_build_object(
    'offlineReceiving',   v_existing.offline_receiving,
    'uoloReceiving',      v_existing.uolo_receiving,
    'principalReceiving', v_existing.principal_receiving,
    'onlineReceiving',    v_existing.online_receiving,
    'bankDeposit',        v_existing.bank_deposit,
    'bankReference',      v_existing.bank_reference,
    'note',               v_existing.note,
    'noActivity',         v_existing.no_activity,
    'enteredBy',          v_existing.entered_by,
    'expenses',           coalesce(
      (select jsonb_agg(jsonb_build_object(
                'amount', e.amount, 'reason', e.reason,
                'category', e.category, 'paidFrom', e.paid_from) order by e.position)
         from expenses e where e.day_entry_id = v_existing.id),
      '[]'::jsonb)
  );

  insert into entry_audit (school_id, entry_date, user_name, action, before, after)
  values (p_school_id, p_entry_date, p_deleted_by, 'delete', v_before, null);

  -- expenses go with it via on delete cascade
  delete from day_entries where id = v_existing.id;
  return true;
end;
$$;
