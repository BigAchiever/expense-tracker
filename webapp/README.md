# Expense Manager

A web app for school staff to log each day's fees and expenses, and for you to see
where the money is — replacing the monthly Excel workbook.

Built with Next.js and Supabase. Deploys to Vercel, so updates go out by pushing
to git and teachers just reload the page.

---

## What it fixes

The old workbook worked, but it had gaps that quietly cost accuracy. Each one has
a specific answer here.

| Problem in the spreadsheet | What the app does |
| --- | --- |
| A negative `Cash Inhand` (−23,700 on 25 Jul, −3,390 on 18 Apr) looked like an error with no explanation | Same daily figure, but now labelled for what it is: money brought in from outside because the day's spending exceeded its collection |
| A payment made from the bank looked identical to one made in cash | Every expense line records **where the money came from**: cash, bank, or outside money. Only cash-paid ones reduce the cash handed over |
| One `Cash Expense` number plus a free-text reason. 27 Apr read *"250000 naved sir, 3000 shaista ma'am"* against a booked 28,000 | Itemised expense lines, each with its own amount, reason and category. The parts always add up because they *are* the total |
| Three different column layouts across the tabs, with different formulas. Aug–Dec 2026 were pre-built with the wrong ones | One schema. There is no layout to get wrong |
| Typed values silently overwrote formulas — Dec 2025 row 11 dropped 106,550 from the month's total | Totals are computed, never typed |
| No way to tell "school was shut" from "nobody logged it" | A **No activity** tick, and the history screen lists the days nobody filled in |
| Anyone could change a past number, invisibly | Every save records the name typed on the form and the time, and an append-only audit trail keeps the before/after |
| Bank deposits had no slip reference | Optional reference field per deposit |
| Higher and Senior lived in separate files | Both in one app, separately or combined |

### How the cash works

Cash does not sit in a drawer. Whatever is left at the end of a day is handed
over and goes home, so **every day starts from zero**. "Cash in hand" is a daily
figure, exactly as the original sheet had it — there is no running balance and
no accumulated cash position anywhere in this app.

That also explains the negative days. On 25 Jul 2026 the school spent ₹50,200
against ₹31,500 collected; the difference was brought in from outside. The app
shows that as *"₹23,700 needed from outside"* rather than treating it as an
error, and the Records section reports the month's collection and spending
rather than a balance.

---

## The maths

```
Total collected = Offline + Uolo + Principal/Director
Cash received   = Total collected − Non-cash (online/Paytm/UPI/bank transfer)
Cash in hand    = Cash received − Bank deposit − Expenses paid from cash
```

`Cash in hand` is the cash handed over at the end of that day. Negative means
that much had to come from outside to cover the day's spending.

Expenses paid from the **bank** or with **outside money** are recorded and
reported, but do not reduce the cash handed over.

This is the old sheet's column I, unchanged, so the numbers reconcile against
any old month. `npm test` pins it to real rows from the workbook.

---

## Setup

You need Node 20+ and a free Supabase account.

**1. Create the database**

Create a project at [supabase.com](https://supabase.com). Open **SQL Editor → New
query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and run it.
This creates the tables and seeds the two schools.

**2. Configure**

```bash
cp .env.example .env.local
```

Fill in from **Supabase → Project Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL` — the Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key
- `SESSION_SECRET` — run `openssl rand -base64 32`
- `RECORDS_PASSWORD` — the shared password that opens the Records section

The `service_role` key bypasses all database security. It is only ever read on
the server. Never commit it, and never put it in a `NEXT_PUBLIC_` variable.

**3. Install and run**

```bash
npm install
npm run dev
```

Open http://localhost:3000. There is nothing to sign into — the form is right
there.

---

## Bringing over the old spreadsheet

```bash
npm run import -- --file "../Expense Manager - Higher Secondary.xlsx" --school higher
```

That is a **dry run** — it prints what it would do and flags anything odd.
Add `--commit` when the summary looks right.

The importer matches columns by their header text, so it handles all three
layouts in the workbook. It splits the free-text reason into separate expense
lines (`"600 naved sir , 500 Meera didi"` → two rows) but only when the parts add
up to the `Cash Expense` figure — otherwise it keeps the text as one line, so
imported totals can never disagree with the original.

If your project already has the old schema (with the `users` table), run
[`supabase/migration-002-remove-login.sql`](supabase/migration-002-remove-login.sql)
once in the SQL editor first. It adds `entered_by` and drops the login columns.

---

## Day to day

It is one page.

**The top half is the form.** No sign-in: open the link, pick the school and the
day, fill in the amounts, add a line per expense, type your name, save, share to
WhatsApp. Earlier dates are reachable with the arrows or the date picker; future
dates are blocked. Your name is remembered in that browser so it is typed once.

**The bottom half is Records, behind `RECORDS_PASSWORD`.** The month's
collection, what was spent and on what, bank deposits, cash handed over, the
day-by-day ledger, unfilled days, WhatsApp share and the Excel download. It
stays unlocked in that browser for 8 hours, or until **Lock** is pressed.

### What the password does and does not protect

Anyone with the link can add or edit a day's entry. That is deliberate — staff
should never be locked out of recording money by a forgotten password. The
consequence is worth being clear about: **treat the URL as semi-private**, and
rely on the audit trail (every save keeps the name and the before/after) rather
than on access control.

---

## Deploying

Push to GitHub, then import the repo at [vercel.com](https://vercel.com). Set the
root directory to `webapp`, add the four environment variables from
`.env.local`, and deploy. Every later `git push` ships an update — teachers just
reload.

---

## Commands

```bash
npm run dev            # local development
npm run build          # production build
npm test               # money maths, pinned to real spreadsheet rows
npm run typecheck      # TypeScript
npm run lint           # ESLint
npm run import         # import an old workbook
```

## Where things live

```
src/lib/calc.ts       all money maths and validation — pure, no I/O
src/lib/data.ts       database reads and monthly aggregation
src/lib/actions.ts    server actions (save an entry, unlock/lock records)
src/lib/auth.ts       the records password and its cookie
src/lib/share.ts      WhatsApp message text
supabase/schema.sql   the database
tests/calc.test.ts    the maths, checked against the old workbook
```
