class AppRecord {
  final String engineRef;
  final String? applicationNo;
  final String service;
  final String status;
  final String? createdAt;
  final String? updatedAt;
  final String? officerNote;

  const AppRecord({
    required this.engineRef,
    required this.service,
    required this.status,
    this.applicationNo,
    this.createdAt,
    this.updatedAt,
    this.officerNote,
  });

  factory AppRecord.fromJson(Map<String, dynamic> j, String service) {
    return AppRecord(
      engineRef: j['engineRef'] as String? ?? j['id'] as String? ?? '',
      applicationNo: j['applicationNo'] as String?,
      service: service,
      status: j['status'] as String? ?? 'PENDING',
      createdAt: j['createdAt'] as String?,
      updatedAt: j['updatedAt'] as String?,
      officerNote: j['officerNote'] as String? ?? j['remarks'] as String?,
    );
  }

  String get displayNo {
    if (applicationNo != null && applicationNo!.isNotEmpty) return applicationNo!;
    const prefix = {
      'caste': 'CAS',
      'pension': 'PEN',
      'scheme': 'SCH',
      'marriage': 'MAR',
      'familyMb': 'FAM',
    };
    final raw = engineRef.replaceAll(RegExp(r'^FLW-|^DGT-', caseSensitive: false), '').replaceAll('-', '');
    return '${prefix[service] ?? 'APP'}-${raw.substring(0, raw.length.clamp(0, 6)).toUpperCase()}';
  }

  String get serviceLabel {
    const labels = {
      'caste': 'Caste Certificate',
      'pension': 'Pension Application',
      'scheme': 'Scheme Application',
      'marriage': 'Marriage Certificate',
      'familyMb': 'Family Member Change',
    };
    return labels[service] ?? service;
  }
}

class AppSources {
  static const all = [
    _AppSource('caste', 'caste-certificate-service'),
    _AppSource('pension', 'pension-service'),
    _AppSource('scheme', 'scheme-application-service'),
    _AppSource('marriage', 'marriage-certificate-service'),
    _AppSource('familyMb', 'family-member-service'),
  ];
}

class _AppSource {
  final String key;
  final String path;
  const _AppSource(this.key, this.path);
}
