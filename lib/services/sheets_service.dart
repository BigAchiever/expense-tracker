import 'package:gsheets/gsheets.dart';
import 'package:intl/intl.dart';
import '../config/sheets_config.dart';
import '../models/expense_entry.dart';
import '../models/school.dart';

/// Service for interacting with Google Sheets using a Single Master Sheet per school.
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

  /// Gets or creates the single master worksheet.
  Future<Worksheet> getMasterSheet() async {
    if (_spreadsheets[school] == null) await init();

    // 1. Check for dedicated master sheet name
    var worksheet = _spreadsheet.worksheetByTitle(SheetsConfig.masterWorksheetTitle);

    // 2. If not found, check first worksheet (or create one)
    if (worksheet == null) {
      if (_spreadsheet.sheets.isNotEmpty) {
        worksheet = _spreadsheet.sheets.first;
      } else {
        worksheet = await _spreadsheet.addWorksheet(SheetsConfig.masterWorksheetTitle);
      }
    }

    // Ensure headers exist
    final rowCount = (await worksheet.values.allRows()).length;
    if (rowCount == 0) {
      await worksheet.values.insertRow(1, SheetsConfig.standardHeaders);
    }

    return worksheet;
  }

  /// Maps header strings to 0-based column indices dynamically.
  Map<String, int> _buildColumnMap(List<String> headerRow) {
    final map = <String, int>{};
    for (int i = 0; i < headerRow.length; i++) {
      final h = headerRow[i].trim().toLowerCase();
      if (h.isEmpty) continue;

      if (h.contains('date')) {
        map['date'] = i;
      } else if (h.contains('offline')) {
        map['offline'] = i;
      } else if (h.contains('uolo')) {
        map['uolo'] = i;
      } else if (h.contains('online') || h.contains('paytm')) {
        map['online'] = i;
      } else if (h.contains('bank') && h.contains('deposit')) {
        map['deposit'] = i;
      } else if (h.contains('bank') && h.contains('expense')) {
        map['bank_expense'] = i;
      } else if ((h.contains('external') || h.contains('outside')) && h.contains('expense')) {
        map['external_expense'] = i;
      } else if (h.contains('total') && h.contains('expense')) {
        map['total_expense'] = i;
      } else if (h.contains('expense')) {
        map['expense'] = i; // Daily in-hand cash expense
      } else if (h.contains('reason')) {
        map['reason'] = i;
      } else if (h.contains('cash') && (h.contains('inhand') || h.contains('hand') || h.contains('over'))) {
        map['inhand'] = i;
      } else if (h.contains('cash') && h.contains('received')) {
        map['cash_received'] = i;
      } else if (h.contains('total')) {
        map['total'] = i;
      } else if ((h.contains('principal') || h.contains('director') || h.contains('a/s') || h.contains('sir')) && !h.contains('cash')) {
        map['principal'] = i;
      }
    }
    return map;
  }

  /// Parses a date string flexibly from the sheet.
  DateTime? _parseDateSafely(String dateStr) {
    dateStr = dateStr.trim();
    if (dateStr.isEmpty) return null;

    // 1. Google Sheets serial date (e.g. "46103")
    final serialNum = int.tryParse(dateStr);
    if (serialNum != null && serialNum > 30000 && serialNum < 80000) {
      final date = DateTime.utc(1899, 12, 30).add(Duration(days: serialNum));
      return DateTime(date.year, date.month, date.day);
    }

    // 2. Standard DateFormat patterns
    const formats = [
      'dd-MMM-yyyy',
      'd-MMM-yyyy',
      'dd-MM-yyyy',
      'd-MM-yyyy',
      'dd/MM/yyyy',
      'd/MM/yyyy',
      'yyyy-MM-dd',
      'dd.MM.yyyy',
      'dd MMM yyyy',
      'd MMM yyyy',
    ];

    for (final format in formats) {
      try {
        final parsed = DateFormat(format, 'en_US').parseLoose(dateStr);
        return DateTime(parsed.year, parsed.month, parsed.day);
      } catch (_) {}
    }

    // 3. Fallback numeric regex
    final numericMatch = RegExp(r'(\d{1,2})[/\-\.](\d{1,2}|[a-zA-Z]{3,})[/\-\.](\d{4})').firstMatch(dateStr);
    if (numericMatch != null) {
      final d = int.tryParse(numericMatch.group(1)!);
      final mStr = numericMatch.group(2)!;
      final y = int.tryParse(numericMatch.group(3)!);
      
      int? m = int.tryParse(mStr);
      if (m == null) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        m = months.indexOf(mStr.toLowerCase().substring(0, 3)) + 1;
        if (m == 0) m = null;
      }

      if (d != null && m != null && y != null && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return DateTime(y, m, d);
      }
    }

    return null;
  }

  /// Fetches an entry for a specific date from the master sheet.
  Future<ExpenseEntry?> getEntryByDate(DateTime date) async {
    final worksheet = await getMasterSheet();
    final rows = await worksheet.values.allRows();
    if (rows.length <= 1) return null;

    final columnMap = _buildColumnMap(rows[0]);
    final dateColIdx = columnMap['date'] ?? 0;

    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isEmpty || dateColIdx >= row.length || row[dateColIdx].isEmpty) continue;

      final cellDateStr = row[dateColIdx].trim();
      final cellDate = _parseDateSafely(cellDateStr);
      if (cellDate == null) continue;

      if (cellDate.year == date.year &&
          cellDate.month == date.month &&
          cellDate.day == date.day) {
        return ExpenseEntry.fromRow(row, date, i + 1, columnMap: columnMap);
      }
    }

    return null;
  }

  /// Checks if an entry exists for the given date.
  Future<bool> checkDateExists(DateTime date) async {
    final entry = await getEntryByDate(date);
    return entry != null;
  }

  /// Creates a new entry in the master sheet, placed in chronological date order.
  Future<bool> createEntry(ExpenseEntry entry) async {
    if (await checkDateExists(entry.date)) {
      throw Exception(
        'Entry already exists for ${DateFormat(dateFormat).format(entry.date)}',
      );
    }

    final worksheet = await getMasterSheet();
    final rows = await worksheet.values.allRows();
    int insertRowIndex = rows.length + 1;

    final dateColIdx = rows.isNotEmpty ? (_buildColumnMap(rows[0])['date'] ?? 0) : 0;

    // Find the correct position to maintain date sort order
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isNotEmpty && dateColIdx < row.length) {
        final rowDate = _parseDateSafely(row[dateColIdx]);
        if (rowDate != null && entry.date.isBefore(rowDate)) {
          insertRowIndex = i + 1;
          break;
        }
      }
    }

    final rowData = entry.toRow(dateFormat);
    return await worksheet.values.insertRow(insertRowIndex, rowData);
  }

  /// Updates an existing entry in the master sheet.
  Future<bool> updateEntry(ExpenseEntry entry) async {
    if (!entry.existsInSheet || entry.rowNumber == null) {
      throw Exception('Entry does not exist in sheet or row number unknown');
    }

    final worksheet = await getMasterSheet();
    final rowData = entry.toRow(dateFormat);

    final updates = <Future<bool>>[];
    for (int col = 0; col < rowData.length; col++) {
      updates.add(worksheet.values.insertValue(
        rowData[col],
        column: col + 1,
        row: entry.rowNumber!,
      ));
    }

    final results = await Future.wait(updates);
    return results.every((r) => r);
  }

  /// Gets all entries for a specific month from the master sheet.
  Future<List<ExpenseEntry>> getMonthlyEntries(DateTime monthDate) async {
    final worksheet = await getMasterSheet();
    final rows = await worksheet.values.allRows();
    if (rows.length <= 1) return [];

    final columnMap = _buildColumnMap(rows[0]);
    final dateColIdx = columnMap['date'] ?? 0;

    final entries = <ExpenseEntry>[];
    for (int i = 1; i < rows.length; i++) {
      final row = rows[i];
      if (row.isNotEmpty && dateColIdx < row.length && row[dateColIdx].trim().isNotEmpty) {
        final date = _parseDateSafely(row[dateColIdx]);
        if (date != null &&
            date.year == monthDate.year &&
            date.month == monthDate.month) {
          entries.add(ExpenseEntry.fromRow(row, date, i + 1, columnMap: columnMap));
        }
      }
    }

    entries.sort((a, b) => a.date.compareTo(b.date));
    return entries;
  }

  /// Gets the previous day's entry for balance references if needed.
  Future<ExpenseEntry?> getPreviousDayEntry(DateTime date) async {
    final previousDay = date.subtract(const Duration(days: 1));
    try {
      return await getEntryByDate(previousDay);
    } catch (_) {
      return null;
    }
  }
}
