import '../models/expense_entry.dart';
import '../models/school.dart';
import '../services/sheets_service.dart';

/// Repository for expense data operations.
/// Scoped to a specific [SchoolType]; create a new instance to switch schools.
class ExpenseRepository {
  final SheetsService _sheetsService;
  final SchoolType school;

  ExpenseRepository({required this.school})
      : _sheetsService = SheetsService(school: school);

  /// Initialises the repository and underlying services.
  Future<void> init() async {
    await _sheetsService.init();
  }

  /// Fetches an entry for a specific date.
  /// Returns a new empty entry if none exists.
  Future<ExpenseEntry> getEntry(DateTime date) async {
    final entry = await _sheetsService.getEntryByDate(date);
    return entry ?? ExpenseEntry(date: date, existsInSheet: false);
  }

  /// Saves an entry (creates or updates).
  /// Returns the saved entry with updated metadata.
  Future<ExpenseEntry> saveEntry(ExpenseEntry entry) async {
    _validateEntry(entry);

    if (entry.existsInSheet) {
      await _sheetsService.updateEntry(entry);
      return entry;
    } else {
      final exists = await _sheetsService.checkDateExists(entry.date);
      if (exists) {
        throw DuplicateEntryException(
          'An entry already exists for this date. Use edit mode instead.',
        );
      }
      await _sheetsService.createEntry(entry);
      return entry.copyWith(existsInSheet: true);
    }
  }

  /// Checks if an entry exists for the given date.
  Future<bool> entryExists(DateTime date) async {
    return await _sheetsService.checkDateExists(date);
  }

  /// Gets the previous day's balances for calculations.
  Future<({double cashInhand})> getPreviousDayBalances(DateTime date) async {
    final previousEntry = await _sheetsService.getPreviousDayEntry(date);
    if (previousEntry == null) return (cashInhand: 0.0);
    return (cashInhand: previousEntry.cashInhand);
  }

  /// Validates an entry before saving.
  void _validateEntry(ExpenseEntry entry) {
    if (entry.onlineReceiving < 0 ||
        entry.offlineReceiving < 0 ||
        entry.uoloReceiving < 0 ||
        entry.asReceiving < 0 ||
        entry.bankDeposit < 0 ||
        entry.cashExpense < 0) {
      throw ValidationException('Values cannot be negative');
    }

    final minDate = DateTime(2025, 12, 1);
    final maxDate = DateTime(2026, 12, 31);
    if (entry.date.isBefore(minDate) || entry.date.isAfter(maxDate)) {
      throw ValidationException(
        'Date must be between December 2025 and December 2026',
      );
    }
  }

  /// Gets all entries for a specific month.
  Future<List<ExpenseEntry>> getMonthlyEntries(DateTime monthDate) async {
    return await _sheetsService.getMonthlyEntries(monthDate);
  }
}

/// Exception thrown when trying to create a duplicate entry.
class DuplicateEntryException implements Exception {
  final String message;
  DuplicateEntryException(this.message);

  @override
  String toString() => message;
}

/// Exception thrown when validation fails.
class ValidationException implements Exception {
  final String message;
  ValidationException(this.message);

  @override
  String toString() => message;
}
