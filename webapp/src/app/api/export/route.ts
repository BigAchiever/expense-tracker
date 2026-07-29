import ExcelJS from "exceljs";
import { recordsUnlocked } from "@/lib/auth";
import { getMonth, getSchools } from "@/lib/data";
import { expensesByCategory } from "@/lib/calc";
import { formatMonth, isValidISOMonth, monthOf, todayISO } from "@/lib/format";
import { CATEGORIES, PAID_FROM } from "@/lib/types";

export const dynamic = "force-dynamic";

const label = (list: { value: string; en: string }[], v: string) =>
  list.find((x) => x.value === v)?.en ?? v;

/**
 * Monthly workbook download. The Ledger sheet keeps the column order people
 * already know from the old spreadsheet, with the two additions that fix it:
 * an opening/closing cash pair per row, and expenses split by payment source.
 */
export async function GET(request: Request) {
  // The export is part of the records section, so it needs the same password.
  if (!(await recordsUnlocked())) {
    return new Response("Unlock the records section first.", { status: 401 });
  }

  const url = new URL(request.url);
  const rawMonth = url.searchParams.get("month") ?? "";
  const month = isValidISOMonth(rawMonth) ? rawMonth : monthOf(todayISO());

  const schools = await getSchools();
  const requested = url.searchParams.get("school");

  // Falls back to the first school so a bare /api/export never 404s.
  const school = schools.find((s) => s.id === requested) ?? schools[0];

  if (!school) return new Response("School not found.", { status: 404 });

  const view = await getMonth(school.id, month);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Expense Manager";
  wb.created = new Date();

  // ---- Ledger --------------------------------------------------------------
  const ws = wb.addWorksheet("Ledger", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Offline Receiv.", key: "offline", width: 15 },
    { header: "Uolo Receiv.", key: "uolo", width: 14 },
    { header: "Principal Receiv.", key: "principal", width: 16 },
    { header: "Total Receiv.", key: "total", width: 14 },
    { header: "Non-cash Receiv. (online)", key: "online", width: 22 },
    { header: "Cash Received", key: "cashIn", width: 14 },
    { header: "Bank Deposit", key: "deposit", width: 14 },
    { header: "Cash Expense", key: "cashExp", width: 14 },
    { header: "Bank Expense", key: "bankExp", width: 14 },
    { header: "Outside-paid Expense", key: "extExp", width: 19 },
    { header: "Cash In Hand", key: "cashInHand", width: 14 },
    { header: "Reason of Expense", key: "reason", width: 46 },
    { header: "Entered by", key: "by", width: 16 },
  ];

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };

  for (const { entry, totals } of view.rows) {
    ws.addRow({
      date: entry.entryDate,
      offline: entry.offlineReceiving,
      uolo: entry.uoloReceiving,
      principal: entry.principalReceiving,
      total: totals.totalReceiving,
      online: totals.onlineReceiving,
      cashIn: totals.cashReceived,
      deposit: totals.bankDeposit,
      cashExp: totals.cashExpense,
      bankExp: totals.bankExpense,
      extExp: totals.externalExpense,
      cashInHand: totals.cashInHand,
      reason: entry.noActivity
        ? "— no activity —"
        : entry.expenses.map((e) => `${e.amount} ${e.reason} (${e.paidFrom})`).join("; "),
      by: entry.enteredBy ?? "",
    });
  }

  const t = view.totals;
  const totalRow = ws.addRow({
    date: "TOTAL",
    offline: t.offlineReceiving,
    uolo: t.uoloReceiving,
    principal: t.principalReceiving,
    total: t.totalReceiving,
    online: t.onlineReceiving,
    cashIn: t.cashReceived,
    deposit: t.bankDeposit,
    cashExp: t.cashExpense,
    bankExp: t.bankExpense,
    extExp: t.externalExpense,
    cashInHand: t.cashInHand,
  });
  totalRow.font = { bold: true };
  totalRow.border = { top: { style: "double" } };

  ws.eachRow((row, i) => {
    if (i === 1) return;
    for (let c = 2; c <= 12; c++) row.getCell(c).numFmt = "#,##0.00";
  });

  // ---- Expenses ------------------------------------------------------------
  const ex = wb.addWorksheet("Expenses", { views: [{ state: "frozen", ySplit: 1 }] });
  ex.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Amount", key: "amount", width: 13 },
    { header: "Reason", key: "reason", width: 44 },
    { header: "Category", key: "category", width: 22 },
    { header: "Paid from", key: "paidFrom", width: 16 },
  ];
  ex.getRow(1).font = { bold: true };
  ex.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };

  for (const { entry } of view.rows) {
    for (const e of entry.expenses) {
      ex.addRow({
        date: entry.entryDate,
        amount: e.amount,
        reason: e.reason,
        category: label(CATEGORIES, e.category),
        paidFrom: label(PAID_FROM, e.paidFrom),
      });
    }
  }
  ex.eachRow((row, i) => {
    if (i > 1) row.getCell(2).numFmt = "#,##0.00";
  });

  // ---- Summary -------------------------------------------------------------
  const sum = wb.addWorksheet("Summary");
  sum.columns = [
    { header: "", key: "k", width: 34 },
    { header: "", key: "v", width: 18 },
  ];

  const put = (k: string, v: string | number, bold = false) => {
    const r = sum.addRow({ k, v });
    if (bold) r.font = { bold: true };
    if (typeof v === "number") r.getCell(2).numFmt = "#,##0.00";
    return r;
  };

  put(school.name, formatMonth(month), true);
  sum.addRow({});
  put("MONEY IN", "", true);
  put("Uolo fees", t.uoloReceiving);
  put("Offline fees (manual receipt)", t.offlineReceiving);
  put("Principal / Director", t.principalReceiving);
  put("Total collected", t.totalReceiving, true);
  put("   of which non-cash (online)", t.onlineReceiving);
  put("   received as cash", t.cashReceived);
  sum.addRow({});
  put("MONEY OUT", "", true);
  put("Deposited in bank", t.bankDeposit);
  put("Paid from cash box", t.cashExpense);
  put("Paid from bank", t.bankExpense);
  put("Paid with outside money", t.externalExpense);
  put("Total expenses", t.totalExpense, true);
  sum.addRow({});
  put("Cash handed over", t.cashHandedOver, true);
  if (t.broughtInFromOutside > 0) {
    put("Brought in from outside", t.broughtInFromOutside);
    put("Days needing outside money", t.shortDays);
  }
  sum.addRow({});
  put("RECORD QUALITY", "", true);
  put("Days logged", t.days);
  put("Days not logged", view.missingDays.length);
  if (view.missingDays.length) put("Missing dates", view.missingDays.join(", "));
  sum.addRow({});
  put("EXPENSES BY CATEGORY", "", true);
  for (const c of expensesByCategory(view.rows.map((r) => r.entry))) {
    put(label(CATEGORIES, c.category), c.total);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${school.name.replace(/\s+/g, "-")}-${month}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
