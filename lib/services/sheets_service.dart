import 'package:gsheets/gsheets.dart';
import 'package:intl/intl.dart';
import '../config/sheets_config.dart';
import '../models/expense_entry.dart';
import '../models/school.dart';

/// Service for interacting with Google Sheets.
/// Supports multiple schools (spreadsheets) via per-school caching.
class SheetsService {
  /// Shared GSheets instance (credentials are the same for all schools).
  static GSheets? _gsheets;

  /// Cache: one Spreadsheet object per school, lazily initialised.
  static final Map<SchoolType, Spreadsheet?> _spreadsheets = {};

  /// The date format used in the spreadsheet.
  final String dateFormat = 'dd-MMM-yyyy';

  /// The school this service instance is scoped to.
  final SchoolType school;

  SheetsService({required this.school});

  /// Initialises the Google Sheets connection for this school.
  Future<void> init() async {
    _gsheets ??= GSheets(SheetsConfig.credentials);
    if (_spreadsheets[school] == null) {
      _spreadsheets[school] = await _gsheets!
          .spreadsheet(SheetsConfig.spreadsheetIdFor(school));
    }
  }

  Spreadsheet get _spreadsheet {
    final s = _spreadsheets[school];
    if (s == null) throw Exception('SheetsService.init() not called for $school');
    return s;
  }

  /// Gets the worksheet for a specific month.
  /// If it doesn't exist, it creates it and adds headers.
  Future<Worksheet> getMonthlySheet(DateTime date) async {
    if (_spreadsheets[school] == null) await init();

    final sheetName = DateFormat('MMMM yyyy').format(date);
    var worksheet = _spreadsheet.worksheetByTitle(sheetName);
    if (worksheet == null) {
      worksheet = await _spreadsheet.addWorksheet(sheetName);
      await worksheet.values.insertRow(1, [
        'Date', 'Offline Receiv.', 'Uolo Receiv.', 'A/S Recieve',
        'Total Receiv.', 'Online Receiv.', 'Bank Deposit', 'Cash Expense',
        'Cash Inhand', 'Reason of Expense',
      ]);
    }
    return worksheet;
  }

  /// Parses a date string flexibly from the sheet.
  /// Handles many formats: dd-MMM-yyyy, dd/MM/yyyy, dd-MM-yyyy, etc.
  /// Also handles native Google Sheets serial dates (like "46103").
  /// Falls back to extracting 3 numbers from the string.
  DateTime? _parseDateSafely(String dateStr) {
    dateStr = dateStr.trim();
    if (dateStr.isEmpty) return null;

    // 1. Check if it's a Google Sheets serial date (e.g. "46103")
    // Sheets dates are counted as days since December 30, 1899.
    final serialNum = int.tryParse(dateStr);
    if (serialNum != null && serialNum > 30000 && serialNum < 80000) {
      // Create date at UTC to avoid timezone/daylight savings shifts on boundaries
      final date = DateTime.utc(1899, 12, 30).add(Duration(days: serialNum));
      return DateTime(date.year, date.month, date.day);
    }

    // 2. Try standard DateFormat patterns
    const formats = [
      'dd-MMM-yyyy',
      'd-MMM-yyyy',
      'dd-MM-yyyy',
      'd-MM-yyyy',
      'dd/MM/yyyy',
      'd/MM/yyyy',
      'dd/M/yyyy',
      'd/M/yyyy',
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'M/d/yyyy',
      'dd.MM.yyyy',
      'dd MMM yyyy',
      'd MMM yyyy',
    ];

    for (final format in formats) {
      try {
        final parsed = DateFormat(format, 'en_US').parseLoose(dateStr);
        return parsed;
      } catch (_) {}
    }

    // Fallback: extract day/month/year via regex from strings like "22/03/2026"
    final numericMatch = RegExp(r'(\d{1,2})[/\-\.](\d{1,2}|[a-zA-Z]{3,})[/\-\.](\d{4})').firstMatch(dateStr);
    if (numericMatch != null) {
      final d = int.tryParse(numericMatch.group(1)!);
      final mStr = numericMatch.group(2)!;
      final y = int.tryParse(numericMatch.group(3)!);
      
      int? m = int.tryParse(mStr);
      if (m == null) {
        // Try to parse month name
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        m = months.indexOf(mStr.toLowerCase().substring(0, 3)) + 1;
        if (m == 0) m = null;
      }

      if (d != null && m != null && y != null && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return DateTime(y, m, d);
      }
    }

    print('[SheetsService] _parseDateSafely FAILED to parse: "$dateStr"');
    return null;
  }

  /// Fetches an entry for a specific date.
  /// Returns null if the date doesn't exist in the sheet.
  Future<ExpenseEntry?> getEntryByDate(DateTime date) async {
    final worksheet = await getMonthlySheet(date);
    final rows = await worksheet.values.allRows();
    if (rows.isEmpty) return null;

    // We'll only compare parsed DateTime objects (year, month, day)
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isEmpty || row[0].isEmpty) continue;

      final cellDateStr = row[0].trim();
      final cellDate = _parseDateSafely(cellDateStr);

      if (cellDate == null) {
        print('[SheetsService] Skipping row ${i+1}: could not parse date "$cellDateStr"');
        continue;
      }

      if (cellDate.year == date.year &&
          cellDate.month == date.month &&
          cellDate.day == date.day) {
        print('[SheetsService] Found existing entry for ${date.toIso8601String()} at row ${i + 1} (cell: "$cellDateStr")');
        return ExpenseEntry.fromRow(row, date, i + 1);
      } else {
        print('[SheetsService] Row ${i+1} Date mismatch: sheet=${cellDate.toIso8601String()} target=${date.toIso8601String()}');
      }
    }

    print('[SheetsService] No entry found for ${date.toIso8601String()} (checked ${rows.length - 1} rows)');
    return null;
  }

  /// Checks if an entry exists for the given date.
  Future<bool> checkDateExists(DateTime date) async {
    final entry = await getEntryByDate(date);
    return entry != null;
  }

  /// Creates a new entry in the sheet, sorted by date.
  Future<bool> createEntry(ExpenseEntry entry) async {
    if (await checkDateExists(entry.date)) {
      throw Exception(
        'Entry already exists for ${DateFormat(dateFormat).format(entry.date)}',
      );
    }

    final worksheet = await getMonthlySheet(entry.date);
    final rows = await worksheet.values.allRows();
    int insertRowIndex = rows.length + 1;

    // Find the correct position (dates should be in order)
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isNotEmpty) {
        final rowDate = _parseDateSafely(row[0]);
        if (rowDate != null && entry.date.isBefore(rowDate)) {
          insertRowIndex = i + 1;
          break;
        }
      }
    }

    print('[SheetsService] Creating entry for ${entry.date.toIso8601String()} at row $insertRowIndex');
    final rowData = entry.toRow(dateFormat);
    return await worksheet.values.insertRow(insertRowIndex, rowData);
  }

  /// Updates an existing entry in the sheet.
  Future<bool> updateEntry(ExpenseEntry entry) async {
    if (!entry.existsInSheet || entry.rowNumber == null) {
      throw Exception('Entry does not exist in sheet or row number unknown');
    }

    final worksheet = await getMonthlySheet(entry.date);
    final dateFormatter = DateFormat(dateFormat);

    final updates = <Future<bool>>[];

    updates.add(worksheet.values.insertValue(
      dateFormatter.format(entry.date), column: 1, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.offlineReceiving > 0 ? entry.offlineReceiving.toString() : '',
      column: 2, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.uoloReceiving > 0 ? entry.uoloReceiving.toString() : '',
      column: 3, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.asReceiving > 0 ? entry.asReceiving.toString() : '',
      column: 4, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.totalReceiving > 0 ? entry.totalReceiving.toString() : '',
      column: 5, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.onlineReceiving > 0 ? entry.onlineReceiving.toString() : '',
      column: 6, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.bankDeposit > 0 ? entry.bankDeposit.toString() : '',
      column: 7, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.cashExpense > 0 ? entry.cashExpense.toString() : '',
      column: 8, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.cashInhand != 0 ? entry.cashInhand.toString() : '',
      column: 9, row: entry.rowNumber!));
    updates.add(worksheet.values.insertValue(
      entry.reasonOfExpense, column: 10, row: entry.rowNumber!));

    final results = await Future.wait(updates);
    return results.every((r) => r);
  }

  /// Gets all entries for a specific month.
  Future<List<ExpenseEntry>> getMonthlyEntries(DateTime monthDate) async {
    final worksheet = await getMonthlySheet(monthDate);
    final rows = await worksheet.values.allRows();
    if (rows.length <= 1) return [];

    final entries = <ExpenseEntry>[];
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isNotEmpty && row[0].trim().isNotEmpty) {
        final date = _parseDateSafely(row[0]);
        if (date != null) entries.add(ExpenseEntry.fromRow(row, date, i + 1));
      }
    }
    return entries;
  }

  /// Gets the previous day's entry for balance calculations.
  Future<ExpenseEntry?> getPreviousDayEntry(DateTime date) async {
    final previousDay = date.subtract(const Duration(days: 1));
    try {
      return await getEntryByDate(previousDay);
    } catch (_) {
      return null;
    }
  }
}
