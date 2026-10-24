class SchemeItem {
  final String id;
  final String name;
  final String? description;

  const SchemeItem({required this.id, required this.name, this.description});

  factory SchemeItem.fromJson(Map<String, dynamic> j) => SchemeItem(
    id: j['id'] as String,
    name: j['name'] as String,
    description: j['description'] as String?,
  );
}

class SchemeRecommendation {
  final String schemeId;
  final String schemeName;
  final String? explanation;
  final List<String> eligibilityReasons;
  final String? personName;

  const SchemeRecommendation({
    required this.schemeId,
    required this.schemeName,
    this.explanation,
    this.eligibilityReasons = const [],
    this.personName,
  });

  factory SchemeRecommendation.fromJson(Map<String, dynamic> j) =>
      SchemeRecommendation(
        schemeId: j['scheme_id'] as String? ?? '',
        schemeName: j['scheme_name'] as String? ?? '',
        explanation: j['explanation'] as String?,
        eligibilityReasons: (j['eligibility_reasons'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
        personName: j['person_name'] as String?,
      );
}

class SchemeApplicationCheckItem {
  final String code;
  final String level;
  final String title;
  final String detail;

  const SchemeApplicationCheckItem({
    required this.code,
    required this.level,
    required this.title,
    required this.detail,
  });

  factory SchemeApplicationCheckItem.fromJson(Map<String, dynamic> j) =>
      SchemeApplicationCheckItem(
        code: j['code'] as String? ?? '',
        level: (j['level'] as String? ?? 'ok').toLowerCase(),
        title: j['title'] as String? ?? '',
        detail: j['detail'] as String? ?? '',
      );
}

class SchemeApplicationCheckResult {
  final String outcome;
  final bool blocked;
  final String summary;
  final String schemeId;
  final String schemeName;
  final List<SchemeApplicationCheckItem> items;

  const SchemeApplicationCheckResult({
    required this.outcome,
    required this.blocked,
    required this.summary,
    required this.schemeId,
    required this.schemeName,
    this.items = const [],
  });

  factory SchemeApplicationCheckResult.fromJson(Map<String, dynamic> j) {
    final outcome = (j['outcome'] as String? ?? 'CLEAR').toUpperCase();
    return SchemeApplicationCheckResult(
      outcome: outcome,
      blocked: j['blocked'] == true || outcome == 'BLOCK',
      summary: j['summary'] as String? ?? '',
      schemeId: j['schemeId'] as String? ?? '',
      schemeName: j['schemeName'] as String? ?? '',
      items: (j['items'] as List<dynamic>?)
              ?.whereType<Map<String, dynamic>>()
              .map(SchemeApplicationCheckItem.fromJson)
              .toList() ??
          [],
    );
  }
}
