/// Represents the two school entities each with their own Google Sheet.
enum SchoolType {
  higher,
  senior;

  /// Human-readable display name (English)
  String get displayNameEn {
    switch (this) {
      case SchoolType.higher:
        return 'Higher Secondary';
      case SchoolType.senior:
        return 'Senior Secondary';
    }
  }

  /// Human-readable display name (Hindi)
  String get displayNameHi {
    switch (this) {
      case SchoolType.higher:
        return 'उच्च माध्यम';
      case SchoolType.senior:
        return 'वरिष्ठ माध्यम';
    }
  }

  /// Short label for chip/toggle display
  String get shortLabel {
    switch (this) {
      case SchoolType.higher:
        return 'Higher';
      case SchoolType.senior:
        return 'Senior';
    }
  }
}
