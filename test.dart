void main() {
  final text = "₹1,500";
  print("Text: $text");
  final cleaned = text.replaceAll(RegExp(r'[^0-9]'), '');
  print("Cleaned: '$cleaned'");
  final parsed = double.tryParse(cleaned) ?? 0;
  print("Parsed: $parsed");

  final text2 = "1500";
  final cleaned2 = text2.replaceAll(RegExp(r'[^0-9]'), '');
  print("Parsed2: ${double.tryParse(cleaned2) ?? 0}");
}
