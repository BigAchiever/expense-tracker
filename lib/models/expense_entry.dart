import 'package:intl/intl.dart';

/// Represents a single day's expense entry from the Google Sheet.
class ExpenseEntry {
  /// The date for this entry.
  final DateTime date;

  /// Online Receiving amount (editable).
  final double onlineReceiving;

  /// Offline Receiving amount (editable).
  final double offlineReceiving;

  /// Uolo Receiving amount (editable).
  final double uoloReceiving;

  /// A/S Receiving amount (editable).
  final double asReceiving;

  /// Total Receiving (calculated: sum of all receivings).
  final double totalReceiving;

  /// Bank Deposit amount (editable).
  final double bankDeposit;

  /// Cash Expense amount (editable).
  final double cashExpense;

  /// Cash In Hand (calculated based on previous day).
  final double cashInhand;

  /// Reason of Expense (editable).
  final String reasonOfExpense;

  /// Whether this entry already exists in the sheet.
  final bool existsInSheet;

  /// The row number in the sheet (1-indexed, including header).
  final int? rowNumber;

  const ExpenseEntry({
    required this.date,
    this.onlineReceiving = 0,
    this.offlineReceiving = 0,
    this.uoloReceiving = 0,
    this.asReceiving = 0,
    this.totalReceiving = 0,
    this.bankDeposit = 0,
    this.cashExpense = 0,
    this.cashInhand = 0,
    this.reasonOfExpense = '',
    this.existsInSheet = false,
    this.rowNumber,
  });

  /// Creates a copy with updated values.
  ExpenseEntry copyWith({
    DateTime? date,
    double? onlineReceiving,
    double? offlineReceiving,
    double? uoloReceiving,
    double? asReceiving,
    double? totalReceiving,
    double? bankDeposit,
    double? cashExpense,
    double? cashInhand,
    String? reasonOfExpense,
    bool? existsInSheet,
    int? rowNumber,
  }) {
    return ExpenseEntry(
      date: date ?? this.date,
      onlineReceiving: onlineReceiving ?? this.onlineReceiving,
      offlineReceiving: offlineReceiving ?? this.offlineReceiving,
      uoloReceiving: uoloReceiving ?? this.uoloReceiving,
      asReceiving: asReceiving ?? this.asReceiving,
      totalReceiving: totalReceiving ?? this.totalReceiving,
      bankDeposit: bankDeposit ?? this.bankDeposit,
      cashExpense: cashExpense ?? this.cashExpense,
      cashInhand: cashInhand ?? this.cashInhand,
      reasonOfExpense: reasonOfExpense ?? this.reasonOfExpense,
      existsInSheet: existsInSheet ?? this.existsInSheet,
      rowNumber: rowNumber ?? this.rowNumber,
    );
  }

  /// Creates an ExpenseEntry from a sheet row.
  factory ExpenseEntry.fromRow(List<String> row, DateTime date, int rowNumber) {
    return ExpenseEntry(
      date: date,
      offlineReceiving: _parseDouble(row.length > 1 ? ((row[1] as dynamic) ?? '') : ''),
      uoloReceiving: _parseDouble(row.length > 2 ? ((row[2] as dynamic) ?? '') : ''),
      asReceiving: _parseDouble(row.length > 3 ? ((row[3] as dynamic) ?? '') : ''),
      totalReceiving: _parseDouble(row.length > 4 ? ((row[4] as dynamic) ?? '') : ''),
      onlineReceiving: _parseDouble(row.length > 5 ? ((row[5] as dynamic) ?? '') : ''),
      bankDeposit: _parseDouble(row.length > 6 ? ((row[6] as dynamic) ?? '') : ''),
      cashExpense: _parseDouble(row.length > 7 ? ((row[7] as dynamic) ?? '') : ''),
      cashInhand: _parseDouble(row.length > 8 ? ((row[8] as dynamic) ?? '') : ''),
      reasonOfExpense: row.length > 9 ? ((row[9] as dynamic) ?? '') : '',
      existsInSheet: true,
      rowNumber: rowNumber,
    );
  }

  /// Converts the entry to a list of strings for the sheet.
  /// Only includes editable values - calculated fields use sheet formulas.
  List<String> toRow(String dateFormat) {
    final dateFormatter = DateFormat(dateFormat);
    return [
      dateFormatter.format(date),
      _formatDouble(offlineReceiving),
      _formatDouble(uoloReceiving),
      _formatDouble(asReceiving),
      _formatDouble(totalReceiving), // Total Receiving
      _formatDouble(onlineReceiving),
      _formatDouble(bankDeposit),
      _formatDouble(cashExpense),
      _formatDouble(cashInhand), // Cash Inhand
      reasonOfExpense, // Reason of Expense
    ];
  }

  /// Parses a string to double, handling empty/invalid values.
  static double _parseDouble(String value) {
    if (value.isEmpty) return 0;
    final cleaned = value.replaceAll(',', '').trim();
    return double.tryParse(cleaned) ?? 0;
  }

  /// Formats a double for display/storage.
  static String _formatDouble(double value) {
    if (value == 0) return '';
    // Remove trailing zeros
    return value.toStringAsFixed(2).replaceAll(RegExp(r'\.?0+$'), '');
  }

  /// Calculates the total receiving from editable fields.
  double get calculatedTotalReceiving =>
      offlineReceiving + uoloReceiving + asReceiving;

  @override
  String toString() {
    return 'ExpenseEntry(date: $date, online: $onlineReceiving, offline: $offlineReceiving, '
        'uolo: $uoloReceiving, as: $asReceiving, total: $totalReceiving, '
        'deposit: $bankDeposit, expense: $cashExpense, cash: $cashInhand, reason: $reasonOfExpense)';
  }
}
