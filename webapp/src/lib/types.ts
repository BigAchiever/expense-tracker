export type Lang = "en" | "hi";

/**
 * Where the money for an expense actually came from.
 *
 * This is the column the old spreadsheet was missing. Without it there is no
 * way to tell a ₹50,000 construction payment out of months of accumulated cash
 * apart from a ₹50,000 payment out of today's fees — so the sheet ended up
 * showing impossible figures like -23,700 "cash in hand".
 */
export type PaidFrom = "cash" | "bank" | "external";

export const PAID_FROM: { value: PaidFrom; en: string; hi: string; hint_en: string; hint_hi: string }[] = [
  {
    value: "cash",
    en: "Cash box",
    hi: "नकद (कैश बॉक्स)",
    hint_en: "Paid with cash on hand — reduces the cash box",
    hint_hi: "हाथ के नकद से दिया — कैश बॉक्स से घटेगा",
  },
  {
    value: "bank",
    en: "Bank / online",
    hi: "बैंक / ऑनलाइन",
    hint_en: "Paid from the bank account — cash box untouched",
    hint_hi: "बैंक खाते से दिया — कैश बॉक्स पर असर नहीं",
  },
  {
    value: "external",
    en: "Outside money",
    hi: "बाहर के पैसे से",
    hint_en: "Paid by Sir / someone else personally — recorded only",
    hint_hi: "सर या किसी और ने अपने पैसे से दिया — सिर्फ़ रिकॉर्ड",
  },
];

export const CATEGORIES: { value: string; en: string; hi: string }[] = [
  { value: "salary", en: "Salary / Wages", hi: "वेतन / मज़दूरी" },
  { value: "tea", en: "Tea & Refreshments", hi: "चाय / नाश्ता" },
  { value: "labour", en: "Labour", hi: "लेबर" },
  { value: "maintenance", en: "Repairs & Maintenance", hi: "मरम्मत" },
  { value: "construction", en: "Construction", hi: "निर्माण कार्य" },
  { value: "advertisement", en: "Advertisement", hi: "विज्ञापन" },
  { value: "supplies", en: "Stationery & Supplies", hi: "स्टेशनरी / सामान" },
  { value: "utilities", en: "Utilities & Bills", hi: "बिजली / बिल" },
  { value: "transport", en: "Transport", hi: "आना-जाना" },
  { value: "fee_refund", en: "Fees Refund", hi: "फीस वापसी" },
  { value: "welfare", en: "Welfare / Donation", hi: "कल्याण / दान" },
  // Not really an expense — cash physically handed over. It still has to leave
  // the cash box, and the old sheet had nowhere to put it.
  { value: "handover", en: "Cash handed to Principal/Director", hi: "प्रिंसिपल/डायरेक्टर को दिया नकद" },
  { value: "other", en: "Other", hi: "अन्य" },
];

export interface School {
  id: string;
  code: string;
  name: string;
  name_hi: string;
  /** Logging start date. Only decides which unfilled days get flagged. */
  opening_date: string;
  sort_order: number;
}

export interface ExpenseItem {
  id?: string;
  amount: number;
  reason: string;
  category: string;
  paidFrom: PaidFrom;
}

/** The raw numbers a teacher types for one day. */
export interface DayInput {
  offlineReceiving: number;
  uoloReceiving: number;
  principalReceiving: number;
  onlineReceiving: number;
  bankDeposit: number;
  expenses: ExpenseItem[];
  noActivity?: boolean;
}

export interface DayEntry extends DayInput {
  id: string;
  schoolId: string;
  entryDate: string;
  bankReference: string | null;
  note: string | null;
  enteredBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
