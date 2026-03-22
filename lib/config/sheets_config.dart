/// Configuration for Google Sheets integration.
///
/// SETUP INSTRUCTIONS:
/// 1. Go to Google Cloud Console (https://console.cloud.google.com)
/// 2. Create a new project or select an existing one
/// 3. Enable the Google Sheets API
/// 4. Create a Service Account (APIs & Services > Credentials > Create Credentials)
/// 5. Download the JSON key file
/// 6. Copy the contents of the JSON file and paste them in [credentials] below
/// 7. Share your Google Sheet with the service account email (found in the JSON)
/// 8. Update [spreadsheetId] with your sheet's ID from the URL
library;

import 'package:flutter_dotenv/flutter_dotenv.dart';

class SheetsConfig {
  /// The spreadsheet ID from your Google Sheets URL.
  /// Load from .env file
  static String get spreadsheetId => dotenv.env['SPREADSHEET_ID']!;

  /// Service account credentials JSON.
  /// Load from .env file
  static String get credentials => dotenv.env['GOOGLE_SHEETS_CREDENTIALS']!;

  /// Column indices for the spreadsheet (0-indexed).
  static const int colDate = 0; // A: Date
  static const int colOnlineReceiving = 1; // B: Online Receiv.
  static const int colOfflineReceiving = 2; // C: Offline Receiv.
  static const int colUoloReceiving = 3; // D: Uolo Receiv.
  static const int colAsReceiving = 4; // E: A/S Receiv.
  static const int colTotalReceiving = 5; // F: Total Receiv. (formula)
  static const int colBankDeposit = 6; // G: Bank Deposit
  static const int colCashExpense = 7; // H: Cash Expense
  static const int colCashInhand = 8; // I: Cash Inhand (formula)
  static const int colAsCash = 9; // J: A/S Cash (formula)

  /// Total number of columns to read/write.
  static const int totalColumns = 10;

  /// List of editable column indices (user can input values).
  static const List<int> editableColumns = [
    colOnlineReceiving,
    colOfflineReceiving,
    colUoloReceiving,
    colAsReceiving,
    colBankDeposit,
    colCashExpense,
  ];

  /// List of calculated column indices (formula-based, read-only).
  static const List<int> calculatedColumns = [
    colTotalReceiving,
    colCashInhand,
    colAsCash,
  ];
}
