import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'screens/expense_entry_screen.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");
  runApp(const ExpenseTrackerApp());
}

class ExpenseTrackerApp extends StatelessWidget {
  const ExpenseTrackerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Symbiosis Expense Tracker',
      theme: AppTheme.lightTheme,
      debugShowCheckedModeBanner: false,
      home: const ExpenseEntryScreen(),
    );
  }
}
