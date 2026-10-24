/// Normalizes citizen application reference numbers to PREFIX-YYMM-NNNNNN.
/// Accepts common typos: missing dashes, short sequence padding.
/// e.g. SCH-260700003 → SCH-2607-000003, SCH-2607-00002 → SCH-2607-000002
String normalizeApplicationRef(String raw) {
  var s = raw.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');

  final canonical = RegExp(r'^(CAS|PEN|MAR|SCH|FAM|GRV)-(\d{4})-(\d+)$').firstMatch(s);
  if (canonical != null) {
    final seq = int.parse(canonical.group(3)!);
    return '${canonical.group(1)}-${canonical.group(2)!}-${seq.toString().padLeft(6, '0')}';
  }

  final oneDash = RegExp(r'^(CAS|PEN|MAR|SCH|FAM|GRV)-(\d{7,})$').firstMatch(s);
  if (oneDash != null) {
    final digits = oneDash.group(2)!;
    final seq = int.parse(digits.substring(4));
    return '${oneDash.group(1)}-${digits.substring(0, 4)}-${seq.toString().padLeft(6, '0')}';
  }

  final compact = RegExp(r'^(CAS|PEN|MAR|SCH|FAM|GRV)(\d{7,})$').firstMatch(s.replaceAll('-', ''));
  if (compact != null) {
    final digits = compact.group(2)!;
    final seq = int.parse(digits.substring(4));
    return '${compact.group(1)}-${digits.substring(0, 4)}-${seq.toString().padLeft(6, '0')}';
  }

  return s;
}

bool looksLikeApplicationRef(String raw) {
  final s = raw.trim().toUpperCase();
  return RegExp(r'^(CAS|PEN|MAR|SCH|FAM|GRV)').hasMatch(s);
}
