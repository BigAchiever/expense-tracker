#!/usr/bin/env node
/**
 * Imports an existing "Expense Manager" workbook into the database.
 *
 *   npm run import -- --file "../Expense Manager - Higher Secondary.xlsx" --school higher
 *   npm run import -- --file "..." --school higher --commit
 *
 * Without --commit it only prints what it would do, so you can check first.
 *
 * Two things worth knowing about the import:
 *
 *  1. Columns are matched by header text, not position. The workbook uses three
 *     different column orders across its tabs and this copes with all of them.
 *
 *  2. The free-text "Reason of Expense" is split into individual expense lines
 *     ("600 naved sir , 500 Meera didi" → two rows). The split is only accepted
 *     when the parts add up to the Cash Expense figure. Otherwise the whole
 *     text is kept as one line, so the imported totals can never disagree with
 *     the original sheet.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

// ---------------------------------------------------------------------------
// args + env
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const commit = args.includes("--commit");
// Without this, a second run silently reverts every correction teachers made
// through the app: it overwrites entered_by, note and no_activity, and deletes
// their itemised expense lines.
const overwriteEdits = args.includes("--overwrite-edits");
const file = arg("file");
const schoolCode = arg("school") ?? "higher";

if (!file) {
  console.error('\n  Usage: npm run import -- --file "path/to/workbook.xlsx" --school higher [--commit]\n');
  process.exit(1);
}

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("\n  Missing Supabase credentials in .env.local\n");
  process.exit(1);
}
// See src/lib/supabase.ts — Node 20 has no native WebSocket and supabase-js
// wants one at construction time even though Realtime is never used here.
class UnusedWebSocket {
  constructor() {
    throw new Error("Realtime subscriptions are not used by this script.");
  }
}

const db = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: UnusedWebSocket },
});

// ---------------------------------------------------------------------------
// column mapping — by header text, because the tabs disagree on order
// ---------------------------------------------------------------------------
const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

function mapHeaders(row) {
  const map = {};
  row.eachCell((cell, col) => {
    const h = norm(cell.value);
    if (!h) return;
    if (h.includes("date")) map.date = col;
    else if (h.includes("offline")) map.offline = col;
    else if (h.includes("uolo")) map.uolo = col;
    else if (h.includes("online")) map.online = col;
    else if (h.includes("bank") && h.includes("deposit")) map.deposit = col;
    else if (h.includes("cash") && h.includes("expense")) map.cashExpense = col;
    else if (h.includes("reason")) map.reason = col;
    // "A/S Receiv." / "Sir Recieve" — but not "A/S Cash", which is derived.
    else if ((h.includes("a/s") || h.includes("sir")) && !h.includes("cash")) map.principal = col;
  });
  return map;
}

const numAt = (row, col) => {
  if (!col) return 0;
  const v = row.getCell(col).value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof v.result === "number") return v.result; // formula cell
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/**
 * True when the cell holds a formula rather than a typed number.
 *
 * This matters for the "A/S Receiv." / "Sir Recieve" column, which means two
 * different things across the workbook:
 *
 *   Dec 2025 and the pre-built Aug–Dec 2026 tabs:  =B+C+D  — a derived TOTAL
 *   Jan–Jul 2026 tabs:                             a typed principal receipt
 *
 * Importing the first kind as a receipt double-counts the whole month, so a
 * formula in this column is treated as "not a real receipt".
 */
const isFormula = (row, col) => {
  if (!col) return false;
  const cell = row.getCell(col);
  // ExcelJS reports the first cell of a filled-down range as ValueType.Formula
  // with a `formula` key, and every copy below it as SharedString/`sharedFormula`.
  // Checking the type catches both; checking only for a `formula` key does not.
  if (cell.type === ExcelJS.ValueType.Formula) return true;
  const v = cell.value;
  return Boolean(v && typeof v === "object" && ("formula" in v || "sharedFormula" in v));
};

const dateAt = (row, col) => {
  const v = row.getCell(col).value;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(
      v.getUTCDate(),
    ).padStart(2, "0")}`;
  }
  return null;
};

// ---------------------------------------------------------------------------
// reason parsing
// ---------------------------------------------------------------------------
const CATEGORY_HINTS = [
  [/\b(tea|chay|chai|nasta|breakfast|refresh)/i, "tea"],
  [/\b(labour|lebour|lebar|labor|belder|mistri|kaam)/i, "labour"],
  [/\b(salary|sir|ma'?am|aunti|aunty|didi|bhaiya|bhai|madni|joya)/i, "salary"],
  [/\b(advertis|advt|pamphlet|hoarding)/i, "advertisement"],
  [/\b(senting|centring|construction|nirman|cement|sariya)/i, "construction"],
  [/\b(repair|rep\.|laptop|computer|maintenance)/i, "maintenance"],
  [/\b(fees? (return|balance|refund)|wrong entry)/i, "fee_refund"],
  [/\b(welfair|welfare|socity|society|donation|chanda)/i, "welfare"],
  [/\b(kantener|kontener|contener|container|pani|dormat|kapde|decoration|material|sim|brash|stationery)/i, "supplies"],
  [/\b(kachra|gadi|transport|petrol|diesel|auto)/i, "transport"],
  [/\b(bijli|bill|electric|water)/i, "utilities"],
];

const guessCategory = (text) => {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(text)) return cat;
  return "other";
};

/**
 * "600 naved sir , 500 Meera didi , 70 tea" → three {amount, reason} items.
 * Thousands separators inside numbers ("50,000 senting") are stripped before
 * splitting so they are not mistaken for item separators.
 */
function parseReason(raw, cashExpense) {
  const text = String(raw ?? "").trim();
  if (!text) {
    return cashExpense > 0
      ? [{ amount: cashExpense, reason: "Expense (no reason recorded in old sheet)", category: "other" }]
      : [];
  }

  const flat = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
  const parts = flat
    .split(/[,;]|\s+\/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed = [];
  let matchedTotal = 0;
  let allHaveAmounts = true;

  for (const part of parts) {
    const m = part.match(/^(\d+(?:\.\d+)?)\s*[-–—:]?\s*(.+)$/);
    if (m && Number(m[1]) > 0 && m[2].trim().length > 0) {
      const amount = Number(m[1]);
      const reason = m[2].trim();
      parsed.push({ amount, reason, category: guessCategory(reason) });
      matchedTotal += amount;
    } else {
      allHaveAmounts = false;
    }
  }

  const near = Math.abs(matchedTotal - cashExpense) < 0.5;

  // Only trust the split when every part carried an amount and they add up.
  if (parsed.length && allHaveAmounts && near) return parsed;

  // Otherwise keep it as one line so the total always matches the old sheet.
  if (cashExpense > 0) {
    return [{ amount: cashExpense, reason: text, category: guessCategory(text) }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const { data: school, error: schoolErr } = await db
  .from("schools")
  .select("id, code, name")
  .eq("code", schoolCode)
  .maybeSingle();

if (schoolErr || !school) {
  console.error(`\n  School "${schoolCode}" not found. Run supabase/schema.sql first.\n`);
  process.exit(1);
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(resolve(process.cwd(), file));

const days = [];
const notes = [];
const derivedPrincipalSheets = new Set();

for (const ws of wb.worksheets) {
  const map = mapHeaders(ws.getRow(1));
  if (!map.date) {
    notes.push(`skipped sheet "${ws.name}" — no Date column found`);
    continue;
  }

  ws.eachRow((row, i) => {
    if (i === 1) return;
    const date = dateAt(row, map.date);
    if (!date) return; // TOTAL rows and blank rows land here

    const offline = numAt(row, map.offline);
    const uolo = numAt(row, map.uolo);
    // A formula here is a derived total, not a receipt — see isFormula().
    const principalIsDerived = isFormula(row, map.principal);
    const principal = principalIsDerived ? 0 : numAt(row, map.principal);
    if (principalIsDerived) derivedPrincipalSheets.add(ws.name);
    const online = numAt(row, map.online);
    const deposit = numAt(row, map.deposit);
    const cashExpense = numAt(row, map.cashExpense);
    const reason = map.reason ? String(row.getCell(map.reason).value ?? "").trim() : "";

    const total = offline + uolo + principal;
    if (total === 0 && online === 0 && deposit === 0 && cashExpense === 0 && !reason) return;

    // The sheet let online exceed the booked total (e.g. 6 Jan 2026). Cap it,
    // and note it rather than silently changing the number.
    let onlineUsed = online;
    if (online > total) {
      notes.push(
        `${date}: online ${online} exceeded total collected ${total} — capped to ${total} (sheet "${ws.name}")`,
      );
      onlineUsed = total;
    }

    days.push({
      date,
      sheet: ws.name,
      offline,
      uolo,
      principal,
      online: onlineUsed,
      deposit,
      cashExpense,
      expenses: parseReason(reason, cashExpense),
    });
  });
}

for (const sheet of derivedPrincipalSheets) {
  notes.push(
    `sheet "${sheet}": its "A/S Receiv." column is a formula (a derived total, not a receipt) — ignored, ` +
      `otherwise the month would be counted twice`,
  );
}

days.sort((a, b) => a.date.localeCompare(b.date));

// De-duplicate: the same date can appear on more than one tab.
const seen = new Map();
for (const d of days) {
  if (seen.has(d.date)) {
    notes.push(`${d.date}: appears on more than one sheet — kept the row from "${seen.get(d.date).sheet}"`);
    continue;
  }
  seen.set(d.date, d);
}
const rows = [...seen.values()];

// Report
let handedOver = 0;
let negativeDays = 0;
let totals = { in: 0, online: 0, dep: 0, exp: 0 };
for (const d of rows) {
  // Cash is handed over daily, so this is a sum of independent days.
  const cashInHand = d.offline + d.uolo + d.principal - d.online - d.deposit - d.cashExpense;
  handedOver += cashInHand;
  if (cashInHand < 0) negativeDays++;
  totals.in += d.offline + d.uolo + d.principal;
  totals.online += d.online;
  totals.dep += d.deposit;
  totals.exp += d.cashExpense;
}

const fmt = (n) => n.toLocaleString("en-IN");
console.log(`\n  ${school.name} — ${rows.length} days from ${rows[0]?.date} to ${rows.at(-1)?.date}\n`);
console.log(`    Total collected     ₹${fmt(totals.in)}`);
console.log(`    Non-cash (online)   ₹${fmt(totals.online)}`);
console.log(`    Bank deposits       ₹${fmt(totals.dep)}`);
console.log(`    Cash expenses       ₹${fmt(totals.exp)}`);
console.log(`    Cash handed over    ₹${fmt(handedOver)}`);
console.log(`    Days needing outside money  ${negativeDays}`);
console.log(`    Expense lines       ${rows.reduce((a, d) => a + d.expenses.length, 0)}`);

if (notes.length) {
  console.log(`\n  ${notes.length} thing(s) worth a look:`);
  for (const n of notes.slice(0, 30)) console.log(`    · ${n}`);
  if (notes.length > 30) console.log(`    · …and ${notes.length - 30} more`);
}

if (!commit) {
  console.log("\n  Dry run. Nothing was written. Re-run with --commit to import.\n");
  process.exit(0);
}

// Write
//
// Days already touched through the app are skipped unless --overwrite-edits is
// passed. "Touched" means entered_by is set to anything other than the marker
// this script writes.
const IMPORT_MARKER = "Imported from spreadsheet";

const { data: existingRows } = await db
  .from("day_entries")
  .select("entry_date, entered_by")
  .eq("school_id", school.id);

const humanEdited = new Set(
  (existingRows ?? [])
    .filter((r) => r.entered_by && r.entered_by !== IMPORT_MARKER)
    .map((r) => r.entry_date),
);

let done = 0;
let skipped = 0;
let failed = 0;
for (const d of rows) {
  if (humanEdited.has(d.date) && !overwriteEdits) {
    skipped++;
    continue;
  }

  const { data: entry, error } = await db
    .from("day_entries")
    .upsert(
      {
        school_id: school.id,
        entry_date: d.date,
        offline_receiving: d.offline,
        uolo_receiving: d.uolo,
        principal_receiving: d.principal,
        online_receiving: d.online,
        bank_deposit: d.deposit,
        note: `Imported from "${d.sheet}"`,
        no_activity: false,
        entered_by: IMPORT_MARKER,
        // Carried so a slip number never outlives the deposit it refers to.
        bank_reference: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id,entry_date" },
    )
    .select("id")
    .single();

  if (error) {
    console.error(`  ${d.date}: ${error.message}`);
    failed++;
    continue;
  }

  const { error: delErr } = await db.from("expenses").delete().eq("day_entry_id", entry.id);
  if (delErr) {
    console.error(`  ${d.date}: could not clear old expenses — ${delErr.message}`);
    failed++;
    continue;
  }

  if (d.expenses.length) {
    const { error: insErr } = await db.from("expenses").insert(
      d.expenses.map((e, i) => ({
        day_entry_id: entry.id,
        amount: e.amount,
        reason: e.reason,
        category: e.category,
        paid_from: "cash", // the old sheet's Cash Expense column was cash by definition
        position: i,
      })),
    );
    // Previously discarded, so a day could end up with receipts and no
    // expenses while still being counted as imported.
    if (insErr) {
      console.error(`  ${d.date}: expenses failed to write — ${insErr.message}`);
      failed++;
      continue;
    }
  }
  done++;
}

console.log(`\n  Imported ${done} day(s) into ${school.name}.`);
if (skipped) {
  console.log(
    `  Skipped ${skipped} day(s) already edited in the app — pass --overwrite-edits to replace them.`,
  );
}
if (failed) console.log(`  ${failed} day(s) FAILED — see the errors above.`);
console.log("");
