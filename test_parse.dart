import 'package:intl/intl.dart';

void main() {
  String dateStr = '22-Mar-2026';
  print("Testing string: '\$dateStr'");
  
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

  DateTime? parsed;
  for (final format in formats) {
    try {
      parsed = DateFormat(format).parseStrict(dateStr);
      print("Matched format '\$format' -> \$parsed");
      break;
    } catch (e) {
      // ignore
    }
  }
  
  if (parsed == null) {
    print("All DateFormats failed.");
    final numericMatch = RegExp(r'(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})').firstMatch(dateStr);
    if (numericMatch != null) {
      print("Regex matched!");
    } else {
      print("Regex failed too.");
    }
  }
}
