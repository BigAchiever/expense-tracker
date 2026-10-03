import 'package:intl/intl.dart';

/// Represents a single day's expense entry in the Google Sheet.
class ExpenseEntry {
  /// The date for this entry.
  final DateTime date;

  /// Uolo Receiving amount.
  final double uoloReceiving;

  /// Offline Receiving amount.
  final double offlineReceiving;

  /// Principal / Director Receiving amount.
  final double asReceiving;

  /// Total Collected (calculated: Uolo + Offline + Principal).
  final double totalReceiving;

  /// Online Receiving amount (Paytm / UPI).
  final double onlineReceiving;

  /// Cash Received (calculated: Total Collected - Online Receiving).
  final double cashReceived;

  /// Bank Deposit amount.
  final double bankDeposit;

  /// Expense paid from daily in-hand cash (Cash Box) - reduces cash in hand.
  final double cashExpense;

  /// Expense paid from bank account / online transfer - does NOT reduce cash in hand.
  final double bankExpense;

  /// Expense paid from external cash (Sir / personal / outside) - does NOT reduce cash in hand.
  final double externalExpense;

  /// Total Expense across all payment sources (calculated: cash + bank + external).
  final double totalExpense;

  /// Cash to Hand Over (calculated: Cash Received - Bank Deposit - Cash Expense).
  final double cashInhand;

  /// Reason of Expense.
  final String reasonOfExpense;

  /// Whether this entry already exists in the sheet.
  final bool existsInSheet;

  /// The row number in the sheet (1-indexed, including header).
  final int? rowNumber;

  const ExpenseEntry({
    required this.date,
    this.uoloReceiving = 0,
    this.offlineReceiving = 0,
    this.asReceiving = 0,
    this.totalReceiving = 0,
    this.onlineReceiving = 0,
    this.cashReceived = 0,
    this.bankDeposit = 0,
    this.cashExpense = 0,
    this.bankExpense = 0,
    this.externalExpense = 0,
    this.totalExpense = 0,
    this.cashInhand = 0,
    this.reasonOfExpense = '',
    this.existsInSheet = false,
    this.rowNumber,
  });

  /// Creates a copy with updated values.
  ExpenseEntry copyWith({
    DateTime? date,
    double? uoloReceiving,
    double? offlineReceiving,
    double? asReceiving,
    double? totalReceiving,
    double? onlineReceiving,
    double? cashReceived,
    double? bankDeposit,
    double? cashExpense,
    double? bankExpense,
    double? externalExpense,
    double? totalExpense,
    double? cashInhand,
    String? reasonOfExpense,
    bool? existsInSheet,
    int? rowNumber,
  }) {
    return ExpenseEntry(
      date: date ?? this.date,
      uoloReceiving: uoloReceiving ?? this.uoloReceiving,
      offlineReceiving: offlineReceiving ?? this.offlineReceiving,
      asReceiving: asReceiving ?? this.asReceiving,
      totalReceiving: totalReceiving ?? this.totalReceiving,
      onlineReceiving: onlineReceiving ?? this.onlineReceiving,
      cashReceived: cashReceived ?? this.cashReceived,
      bankDeposit: bankDeposit ?? this.bankDeposit,
      cashExpense: cashExpense ?? this.cashExpense,
      bankExpense: bankExpense ?? this.bankExpense,
      externalExpense: externalExpense ?? this.externalExpense,
      totalExpense: totalExpense ?? this.totalExpense,
      cashInhand: cashInhand ?? this.cashInhand,
      reasonOfExpense: reasonOfExpense ?? this.reasonOfExpense,
      existsInSheet: existsInSheet ?? this.existsInSheet,
      rowNumber: rowNumber ?? this.rowNumber,
    );
  }

  /// Creates an ExpenseEntry from a sheet row with dynamic column mapping support.
  factory ExpenseEntry.fromRow(
    List<String> row,
    DateTime date,
    int rowNumber, {
    Map<String, int>? columnMap,
  }) {
    double getCol(String key, int defaultIdx) {
      final idx = columnMap?[key] ?? defaultIdx;
      if (idx < row.length) {
        return _parseDouble(row[idx]);
      }
      return 0.0;
    }

    String getStrCol(String key, int defaultIdx) {
      final idx = columnMap?[key] ?? defaultIdx;
      if (idx < row.length) {
        return (row[idx] as dynamic)?.toString() ?? '';
      }
      return '';
    }

    final hasDetailedExpenses = columnMap != null &&
        (columnMap.containsKey('bank_expense') || columnMap.containsKey('external_expense'));

    final uolo = getCol('uolo', 1);
    final offline = getCol('offline', 2);
    final asRec = getCol('principal', 3);
    final online = getCol('online', 5);
    final deposit = getCol('deposit', 7);

    final cashExp = getCol('expense', 8);
    final bankExp = getCol('bank_expense', 9);
    final extExp = getCol('external_expense', 10);
    final inHand = getCol('inhand', hasDetailedExpenses ? 12 : 9);
    final reason = getStrCol('reason', hasDetailedExpenses ? 13 : (row.length - 1));

    final total = uolo + offline + asRec;
    final cashRec = total - online;
    final totalExp = cashExp + bankExp + extExp;

    return ExpenseEntry(
      date: date,
      uoloReceiving: uolo,
      offlineReceiving: offline,
      asReceiving: asRec,
      totalReceiving: total,
      onlineReceiving: online,
      cashReceived: cashRec,
      bankDeposit: deposit,
      cashExpense: cashExp,
      bankExpense: bankExp,
      externalExpense: extExp,
      totalExpense: totalExp,
      cashInhand: inHand != 0 ? inHand : (cashRec - deposit - cashExp),
      reasonOfExpense: reason,
      existsInSheet: true,
      rowNumber: rowNumber,
    );
  }

  /// Converts the entry to the standard 14-column list for Google Sheets.
  List<String> toRow(String dateFormat) {
    final dateFormatter = DateFormat(dateFormat);
    return [
      dateFormatter.format(date),              // Col A (0): Date
      _formatDouble(uoloReceiving),            // Col B (1): Uolo Fees
      _formatDouble(offlineReceiving),         // Col C (2): Offline Fees
      _formatDouble(asReceiving),              // Col D (3): Principal / Director
      _formatDouble(calculatedTotalReceiving), // Col E (4): Total Collected
      _formatDouble(onlineReceiving),          // Col F (5): Online (Paytm/UPI)
      _formatDouble(calculatedCashReceived),   // Col G (6): Cash Received
      _formatDouble(bankDeposit),              // Col H (7): Bank Deposit
      _formatDouble(cashExpense),              // Col I (8): Expense (Daily In-Hand Cash)
      _formatDouble(bankExpense),              // Col J (9): Expense (Bank / Online)
      _formatDouble(externalExpense),          // Col K (10): Expense (External Cash)
      _formatDouble(calculatedTotalExpense),   // Col L (11): Total Expense
      _formatDouble(calculatedCashInHand),     // Col M (12): Cash to Hand Over
      reasonOfExpense,                         // Col N (13): Reason of Expense
    ];
  }

  /// Parses a string to double, handling empty/invalid/currency values.
  static double _parseDouble(String value) {
    if (value.isEmpty) return 0;
    final cleaned = value.replaceAll(',', '').replaceAll('₹', '').trim();
    return double.tryParse(cleaned) ?? 0;
  }

  /// Formats a double for display/storage without trailing zeros.
  static String _formatDouble(double value) {
    if (value == 0) return '';
    return value.toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '');
  }

  /// Total receiving = Uolo + Offline + Principal.
  double get calculatedTotalReceiving =>
      uoloReceiving + offlineReceiving + asReceiving;

  /// Cash received = Total - Online.
  double get calculatedCashReceived =>
      calculatedTotalReceiving - onlineReceiving;

  /// Total expense = Daily Cash Expense + Bank Expense + External Expense.
  double get calculatedTotalExpense =>
      cashExpense + bankExpense + externalExpense;

  /// Cash in hand = Cash Received - Bank Deposit - Daily Cash Expense.
  /// (Bank Expense and External Expense do NOT reduce physical cash in hand).
  double get calculatedCashInHand =>
      calculatedCashReceived - bankDeposit - cashExpense;

  @override
  String toString() {
    return 'ExpenseEntry(date: $date, uolo: $uoloReceiving, offline: $offlineReceiving, '
        'as: $asReceiving, total: $totalReceiving, online: $onlineReceiving, '
        'cashReceived: $cashReceived, deposit: $bankDeposit, '
        'cashExpense: $cashExpense, bankExpense: $bankExpense, externalExpense: $externalExpense, '
        'totalExpense: $totalExpense, cashInhand: $cashInhand, reason: $reasonOfExpense)';
  }
}
