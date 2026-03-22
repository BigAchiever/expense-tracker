import 'package:gsheets/gsheets.dart';
import 'package:intl/intl.dart';
import '../config/sheets_config.dart';
import '../models/expense_entry.dart';

/// Service for interacting with Google Sheets.
class SheetsService {
  static SheetsService? _instance;
  GSheets? _gsheets;
  Spreadsheet? _spreadsheet;

  /// The date format used in the spreadsheet.
  /// Common formats: 'dd-MM-yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy', 'MMMM d, yyyy'
  final String dateFormat = 'dd-MMM-yyyy';

  SheetsService._();

  /// Gets the singleton instance of SheetsService.
  static SheetsService get instance {
    _instance ??= SheetsService._();
    return _instance!;
  }

  /// Initializes the Google Sheets connection.
  /// Call this once at app startup.
  Future<void> init() async {
    if (_gsheets != null) return;

    _gsheets = GSheets(SheetsConfig.credentials);
    _spreadsheet = await _gsheets!.spreadsheet(SheetsConfig.spreadsheetId);
  }

  /// Gets the worksheet for a specific month.
  /// If it doesn't exist, it creates it and adds headers.
  Future<Worksheet> getMonthlySheet(DateTime date) async {
    if (_spreadsheet == null) {
      await init();
    }

    final sheetName = DateFormat('MMMM yyyy').format(date);
    var worksheet = _spreadsheet!.worksheetByTitle(sheetName);
    if (worksheet == null) {
      worksheet = await _spreadsheet!.addWorksheet(sheetName);
      await worksheet.values.insertRow(1, [
        'Date', 'Offline Receiv.', 'Uolo Receiv.', 'A/S Recieve',
        'Total Receiv.', 'Online Receiv.', 'Bank Deposit', 'Cash Expense', 'Cash Inhand', 'Reason of Expense'
      ]);
    }
    return worksheet;
  }

  /// Parses a date string flexibly from the sheet.
  DateTime? _parseDateSafely(String dateStr) {
    dateStr = dateStr.trim();
    if (dateStr.isEmpty) return null;

    final formats = [
      'dd-MMM-yyyy',
      'd-MMM-yyyy',
      'dd-MM-yyyy',
      'd-MM-yyyy',
      'dd/MM/yyyy',
      'yyyy-MM-dd',
      'MM/dd/yyyy',
    ];

    for (final format in formats) {
      try {
        return DateFormat(format).parseStrict(dateStr);
      } catch (_) {}
    }
    return null;
  }

  /// Fetches an entry for a specific date.
  /// Returns null if the date doesn't exist in the sheet.
  Future<ExpenseEntry?> getEntryByDate(DateTime date) async {
    final worksheet = await getMonthlySheet(date);
    final rows = await worksheet.values.allRows();
    if (rows.isEmpty) return null;

    final dateFormatter = DateFormat(dateFormat);
    final targetDate = dateFormatter.format(date).toLowerCase();

    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isEmpty || row[0].isEmpty) continue;

      final cellDateStr = row[0].trim();

      // 1. Case-insensitive string match
      if (cellDateStr.toLowerCase() == targetDate) {
        return ExpenseEntry.fromRow(row, date, i + 1);
      }

      // 2. Fallback to robust parsing
      final cellDate = _parseDateSafely(cellDateStr);
      if (cellDate != null &&
          cellDate.year == date.year &&
          cellDate.month == date.month &&
          cellDate.day == date.day) {
        return ExpenseEntry.fromRow(row, date, i + 1);
      }
    }

    return null;
  }

  /// Checks if an entry exists for the given date.
  Future<bool> checkDateExists(DateTime date) async {
    final entry = await getEntryByDate(date);
    return entry != null;
  }

  /// Creates a new entry in the sheet.
  /// Throws if entry already exists for that date.
  Future<bool> createEntry(ExpenseEntry entry) async {
    // Check if entry already exists
    if (await checkDateExists(entry.date)) {
      throw Exception(
        'Entry already exists for ${DateFormat(dateFormat).format(entry.date)}',
      );
    }

    final worksheet = await getMonthlySheet(entry.date);

    // Find the correct row based on date order
    final rows = await worksheet.values.allRows();
    int insertRowIndex = rows.length + 1; // Default: append at end

    // Find the correct position (dates should be in order)
    final dateFormatter = DateFormat(dateFormat);
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isNotEmpty) {
        try {
          final rowDate = dateFormatter.parse(row[0]);
          if (entry.date.isBefore(rowDate)) {
            insertRowIndex = i + 1;
            break;
          }
        } catch (_) {
          // Skip rows with invalid dates
        }
      }
    }

    // Insert the row
    final rowData = entry.toRow(dateFormat);
    return await worksheet.values.insertRow(insertRowIndex, rowData);
  }

  /// Updates an existing entry in the sheet.
  Future<bool> updateEntry(ExpenseEntry entry) async {
    if (!entry.existsInSheet || entry.rowNumber == null) {
      throw Exception('Entry does not exist in sheet or row number unknown');
    }

    final worksheet = await getMonthlySheet(entry.date);

    // Update only the editable columns
    final dateFormatter = DateFormat(dateFormat);

    // Update each editable cell individually to preserve formulas
    final updates = <Future<bool>>[];

    // Date (column A)
    updates.add(
      worksheet.values.insertValue(
        dateFormatter.format(entry.date),
        column: 1,
        row: entry.rowNumber!,
      ),
    );

    // Offline Receiving (column B - 2)
    updates.add(
      worksheet.values.insertValue(
        entry.offlineReceiving > 0 ? entry.offlineReceiving.toString() : '',
        column: 2,
        row: entry.rowNumber!,
      ),
    );

    // Uolo Receiving (column C - 3)
    updates.add(
      worksheet.values.insertValue(
        entry.uoloReceiving > 0 ? entry.uoloReceiving.toString() : '',
        column: 3,
        row: entry.rowNumber!,
      ),
    );

    // A/S Receiving (column D - 4)
    updates.add(
      worksheet.values.insertValue(
        entry.asReceiving > 0 ? entry.asReceiving.toString() : '',
        column: 4,
        row: entry.rowNumber!,
      ),
    );

    // Total Receiving (column E - 5)
    updates.add(
      worksheet.values.insertValue(
        entry.totalReceiving > 0 ? entry.totalReceiving.toString() : '',
        column: 5,
        row: entry.rowNumber!,
      ),
    );

    // Online Receiving (column F - 6)
    updates.add(
      worksheet.values.insertValue(
        entry.onlineReceiving > 0 ? entry.onlineReceiving.toString() : '',
        column: 6,
        row: entry.rowNumber!,
      ),
    );

    // Bank Deposit (column G)
    updates.add(
      worksheet.values.insertValue(
        entry.bankDeposit > 0 ? entry.bankDeposit.toString() : '',
        column: 7,
        row: entry.rowNumber!,
      ),
    );

    // Cash Expense (column H)
    updates.add(
      worksheet.values.insertValue(
        entry.cashExpense > 0 ? entry.cashExpense.toString() : '',
        column: 8,
        row: entry.rowNumber!,
      ),
    );

    // Cash Inhand (column I - 9)
    updates.add(
      worksheet.values.insertValue(
        entry.cashInhand != 0 ? entry.cashInhand.toString() : '',
        column: 9,
        row: entry.rowNumber!,
      ),
    );

    // Reason of Expense (column J)
    updates.add(
      worksheet.values.insertValue(
        entry.reasonOfExpense,
        column: 10,
        row: entry.rowNumber!,
      ),
    );

    final results = await Future.wait(updates);
    return results.every((result) => result);
  }

  /// Gets all entries for a specific month.
  Future<List<ExpenseEntry>> getMonthlyEntries(DateTime monthDate) async {
    final worksheet = await getMonthlySheet(monthDate);

    final rows = await worksheet.values.allRows();
    if (rows.length <= 1) return []; // Only header or empty

    final entries = <ExpenseEntry>[];

    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isNotEmpty && row[0].trim().isNotEmpty) {
        final date = _parseDateSafely(row[0]);
        if (date != null) {
          entries.add(ExpenseEntry.fromRow(row, date, i + 1));
        }
      }
    }

    return entries;
  }

  /// Gets the previous day's entry for balance calculations.
  /// Handles month boundaries by checking the previous month's sheet.
  Future<ExpenseEntry?> getPreviousDayEntry(DateTime date) async {
    final previousDay = date.subtract(const Duration(days: 1));

    try {
      return await getEntryByDate(previousDay);
    } catch (_) {
      // Previous month sheet might not exist
      return null;
    }
  }
}
