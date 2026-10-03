/// Configuration for Google Sheets integration.
library;

import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../models/school.dart';

class SheetsConfig {
  /// Returns the spreadsheet ID for the given school.
  static String spreadsheetIdFor(SchoolType school) {
    switch (school) {
      case SchoolType.higher:
        return dotenv.env['SPREADSHEET_ID_HIGHER']!;
      case SchoolType.senior:
        return dotenv.env['SPREADSHEET_ID_SENIOR']!;
    }
  }

  /// Service account credentials JSON — shared across all schools.
  static String get credentials => dotenv.env['GOOGLE_SHEETS_CREDENTIALS']!;

  /// Master sheet name used to log all daily records in a single continuous sheet.
  static const String masterWorksheetTitle = 'Daily Records';

  /// Standard column headers in order (1-indexed in Google Sheets: A to N).
  static const List<String> standardHeaders = [
    'Date',                          // Col A (0)
    'Uolo Fees',                     // Col B (1)
    'Offline Fees',                  // Col C (2)
    'Principal / Director',          // Col D (3)
    'Total Collected',               // Col E (4) - Calculated
    'Online (Paytm/UPI)',            // Col F (5)
    'Cash Received',                 // Col G (6) - Calculated
    'Bank Deposit',                  // Col H (7)
    'Expense (Daily In-Hand Cash)',  // Col I (8) - Reduces Cash in Hand
    'Expense (Bank / Online)',       // Col J (9) - From Bank Account
    'Expense (External Cash)',       // Col K (10) - From Outside Money
    'Total Expense',                 // Col L (11) - Calculated
    'Cash to Hand Over',             // Col M (12) - Calculated
    'Reason of Expense',             // Col N (13)
  ];
}
