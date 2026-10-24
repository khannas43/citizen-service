import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:uuid/uuid.dart';

const _kBox = 'dg20_drafts';
const _uuid = Uuid();

class DraftRecord {
  final String id;
  final String service;
  final String profileAadhaar;
  final String profileName;
  final Map<String, dynamic> fields;
  final String createdAt;

  const DraftRecord({
    required this.id,
    required this.service,
    required this.profileAadhaar,
    required this.profileName,
    required this.fields,
    required this.createdAt,
  });

  factory DraftRecord.fromJson(Map<String, dynamic> j) => DraftRecord(
    id: j['id'] as String,
    service: j['service'] as String,
    profileAadhaar: j['profileAadhaar'] as String,
    profileName: j['profileName'] as String,
    fields: (j['fields'] as Map<String, dynamic>?) ?? {},
    createdAt: j['createdAt'] as String? ?? '',
  );
}

class DraftService {
  static Box<String> get _b => Hive.box<String>(_kBox);

  static String saveDraft({
    required String service,
    required String profileAadhaar,
    required String profileName,
    required Map<String, dynamic> fields,
  }) {
    final id = _uuid.v4();
    final draft = {
      'id': id,
      'service': service,
      'profileAadhaar': profileAadhaar,
      'profileName': profileName,
      'fields': fields,
      'createdAt': DateTime.now().toIso8601String(),
    };
    _b.put(id, jsonEncode(draft));
    return id;
  }

  static List<DraftRecord> listDrafts([String? aadhaarRef]) {
    final all = _b.values
        .map((v) {
          try {
            return jsonDecode(v) as Map<String, dynamic>;
          } catch (_) {
            return null;
          }
        })
        .whereType<Map<String, dynamic>>();

    final filtered = aadhaarRef != null
        ? all.where((d) => d['profileAadhaar'] == aadhaarRef)
        : all;

    final records = filtered.map(DraftRecord.fromJson).toList();
    records.sort((a, b) {
      final ta = DateTime.tryParse(a.createdAt) ?? DateTime(0);
      final tb = DateTime.tryParse(b.createdAt) ?? DateTime(0);
      return tb.compareTo(ta);
    });
    return records;
  }

  static DraftRecord? getDraft(String id) {
    final raw = _b.get(id);
    if (raw == null) return null;
    try {
      return DraftRecord.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static void deleteDraft(String id) => _b.delete(id);

  static int count([String? aadhaarRef]) {
    if (aadhaarRef == null) return _b.length;
    return listDrafts(aadhaarRef).length;
  }
}
