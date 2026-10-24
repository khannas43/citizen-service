import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config.dart';
import '../models/application_model.dart';
import '../models/citizen_profile.dart';
import '../models/scheme_model.dart';

const _kTimeout = Duration(seconds: 30);

Map<String, String> get _headers => {'Content-Type': 'application/json'};

// ── Profile ───────────────────────────────────────────────────────
Future<Map<String, dynamic>?> fetchProfile(String aadhaarRef) async {
  try {
    final uri = Uri.parse('$kFamilyApi/v1/persons/search?aadhaar=${Uri.encodeComponent(aadhaarRef)}');
    debugPrint('[API] fetchProfile $uri');
    final res = await http.get(uri).timeout(_kTimeout);
    debugPrint('[API] fetchProfile status=${res.statusCode}');
    if (!res.ok) return null;
    final body = jsonDecode(res.body);
    final list = (body is List) ? body : (body['results'] as List<dynamic>? ?? []);
    if (list.isEmpty) return null;
    return (list.first as Map<String, dynamic>);
  } catch (e) {
    debugPrint('[API] fetchProfile ERROR: $e');
    return null;
  }
}

/// Overlay hardcoded demo defaults with live family-registry fields (income, caste, ration card).
Future<CitizenProfile> hydrateCitizenProfile(CitizenProfile base) async {
  final live = await fetchProfile(base.aadhaarRef);
  var next = live == null ? base : base.withLiveData(live);
  final family = await fetchFamily(next.familyId);
  final rc = family?['rationCardNumber']?.toString();
  if (rc != null && rc.isNotEmpty) {
    next = next.withLiveData({'rationCardNumber': rc});
  }
  return next;
}

// ── Applications ──────────────────────────────────────────────────
Future<List<AppRecord>> fetchAllApplications(String aadhaarRef) async {
  final futures = AppSources.all.map((src) async {
    try {
      final uri = Uri.parse(
        '$kApiBase/${src.path}/v1/applications?aadhaar=${Uri.encodeComponent(aadhaarRef)}',
      );
      debugPrint('[API] apps ${src.key} $uri');
      final res = await http.get(uri).timeout(_kTimeout);
      debugPrint('[API] apps ${src.key} status=${res.statusCode}');
      if (!res.ok) return <AppRecord>[];
      final list = jsonDecode(res.body) as List<dynamic>;
      return list.map((j) => AppRecord.fromJson(j as Map<String, dynamic>, src.key)).toList();
    } catch (e) {
      debugPrint('[API] apps ${src.key} ERROR: $e');
      return <AppRecord>[];
    }
  });
  final results = await Future.wait(futures);
  final all = results.expand((r) => r).toList();
  all.sort((a, b) {
    final ta = a.createdAt != null ? DateTime.tryParse(a.createdAt!)?.millisecondsSinceEpoch ?? 0 : 0;
    final tb = b.createdAt != null ? DateTime.tryParse(b.createdAt!)?.millisecondsSinceEpoch ?? 0 : 0;
    return tb.compareTo(ta);
  });
  return all;
}

// ── Submit applications ───────────────────────────────────────────
Future<Map<String, dynamic>> submitCasteApp({
  required String name,
  required String aadhaarRef,
  required String casteCategory,
  required String purpose,
  String? documentBase64,
  String? documentName,
}) async {
  final body = <String, dynamic>{
    'applicantName': name,
    'casteCode': casteCategory,
    'aadhaarRef': aadhaarRef,
    'purpose': purpose,
    'tenantId': 'pg',
  };
  if (documentBase64 != null) {
    body['attachments'] = [
      {'fileName': documentName ?? 'document.jpg', 'data': documentBase64, 'docType': 'Supporting Document'},
    ];
  }
  final res = await http
      .post(Uri.parse('$kCasteApi/v1/applications'), headers: _headers, body: jsonEncode(body))
      .timeout(_kTimeout);
  if (!res.ok) throw Exception('Submit failed (${res.statusCode})');
  return jsonDecode(res.body) as Map<String, dynamic>;
}

Future<Map<String, dynamic>> submitPensionApp({
  required String name,
  required String aadhaarRef,
  required String familyId,
  required String pensionType,
  String? documentBase64,
  String? documentName,
}) async {
  final body = <String, dynamic>{
    'applicantName': name,
    'pensionType': pensionType,
    'aadhaarRef': aadhaarRef,
    'familyId': familyId,
    'tenantId': 'pg',
  };
  if (documentBase64 != null) {
    body['attachments'] = [
      {'fileName': documentName ?? 'document.jpg', 'data': documentBase64, 'docType': 'Supporting Document'},
    ];
  }
  final res = await http
      .post(Uri.parse('$kPensionApi/v1/applications'), headers: _headers, body: jsonEncode(body))
      .timeout(_kTimeout);
  if (!res.ok) throw Exception('Submit failed (${res.statusCode})');
  return jsonDecode(res.body) as Map<String, dynamic>;
}

Future<Map<String, dynamic>> submitSchemeApp({
  required String aadhaarRef,
  required String familyId,
  required String schemeId,
  required String schemeName,
  required int annualIncome,
}) async {
  final body = {
    'schemeId': schemeId,
    'schemeName': schemeName,
    'familyId': familyId,
    'aadhaarRef': aadhaarRef,
    'declaredIncome': annualIncome,
    'tenantId': 'pg',
  };
  final res = await http
      .post(Uri.parse('$kSchemeAppApi/v1/applications'), headers: _headers, body: jsonEncode(body))
      .timeout(_kTimeout);
  if (!res.ok) throw Exception('Submit failed (${res.statusCode})');
  return jsonDecode(res.body) as Map<String, dynamic>;
}

// ── Schemes ───────────────────────────────────────────────────────
Future<List<SchemeItem>> fetchSchemes() async {
  try {
    final res = await http.get(Uri.parse('$kSchemeEngine/v1/schemes')).timeout(_kTimeout);
    if (!res.ok) return [];
    final list = jsonDecode(res.body) as List<dynamic>;
    return list.map((j) => SchemeItem.fromJson(j as Map<String, dynamic>)).toList();
  } catch (_) {
    return [];
  }
}

/// Citizen-safe counterpart of officer fraud signals.
/// GET /v1/schemes/{id}/application-check?familyId=&aadhaar=
Future<SchemeApplicationCheckResult?> fetchSchemeApplicationCheck({
  required String schemeId,
  required String familyId,
  required String aadhaar,
}) async {
  if (schemeId.isEmpty || familyId.isEmpty) return null;
  try {
    final uri = Uri.parse('$kSchemeEngine/v1/schemes/${Uri.encodeComponent(schemeId)}/application-check')
        .replace(queryParameters: {
      'familyId': familyId,
      if (aadhaar.isNotEmpty) 'aadhaar': aadhaar,
    });
    final res = await http.get(uri).timeout(_kTimeout);
    if (!res.ok) return null;
    return SchemeApplicationCheckResult.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
  } catch (_) {
    return null;
  }
}

Future<List<SchemeRecommendation>> fetchRecommendations({
  required String aadhaarRef,
  required String casteCategory,
  required int annualIncome,
  required int age,
  List<String> enrolledSchemes = const [],
}) async {
  try {
    final body = jsonEncode({
      'profile': {
        'aadhaarRef': aadhaarRef,
        'casteCategory': casteCategory,
        'annualIncome': annualIncome,
        'age': age,
      },
      'enrolled_scheme_names': enrolledSchemes,
      'top_k': 4,
    });
    final url = '$kAiBase/v1/recommendations';
    debugPrint('[API] recs url=$url');
    final res = await http
        .post(Uri.parse(url), headers: _headers, body: body)
        .timeout(const Duration(seconds: 35));
    debugPrint('[API] recs status=${res.statusCode}');
    if (!res.ok) return [];
    final list = jsonDecode(res.body) as List<dynamic>;
    debugPrint('[API] recs n=${list.length}');
    return list.map((j) => SchemeRecommendation.fromJson(j as Map<String, dynamic>)).toList();
  } catch (e) {
    debugPrint('[API] recs ERROR: $e');
    return [];
  }
}

// ── Grievances ────────────────────────────────────────────────────
Future<List<Map<String, dynamic>>> fetchGrievances(String aadhaarRef) async {
  try {
    final res = await http
        .get(Uri.parse('$kGrievanceApi/v1/grievances?aadhaar=${Uri.encodeComponent(aadhaarRef)}'))
        .timeout(_kTimeout);
    if (!res.ok) return [];
    return (jsonDecode(res.body) as List<dynamic>).cast<Map<String, dynamic>>();
  } catch (_) {
    return [];
  }
}

Future<Map<String, dynamic>> submitGrievance({
  required String aadhaarRef,
  required String citizenName,
  required String complaintText,
  required String category,
  String priority = 'MEDIUM',
  String? trackingRef,
  List<Map<String, String>> attachments = const [],
}) async {
  final body = jsonEncode({
    'aadhaarRef': aadhaarRef,
    'citizenName': citizenName,
    'trackingRef': trackingRef ?? '',
    'complaintText': complaintText,
    'category': category,
    'priority': priority,
    'attachments': attachments,
  });
  final res = await http
      .post(Uri.parse('$kGrievanceApi/v1/grievances'), headers: _headers, body: body)
      .timeout(_kTimeout);
  if (!res.ok) throw Exception('Submit failed (${res.statusCode})');
  return jsonDecode(res.body) as Map<String, dynamic>;
}

// ── Family ────────────────────────────────────────────────────────
Future<Map<String, dynamic>?> fetchFamily(String familyId) async {
  final url = '$kFamilyApi/v1/families/$familyId';
  debugPrint('[API] fetchFamily url=$url');
  try {
    final res = await http
        .get(Uri.parse(url))
        .timeout(_kTimeout);
    debugPrint('[API] fetchFamily status=${res.statusCode}');
    if (!res.ok) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  } catch (e) {
    debugPrint('[API] fetchFamily ERROR: $e');
    return null;
  }
}

// ── Notifications ─────────────────────────────────────────────────
Future<List<Map<String, dynamic>>> fetchNotificationsApi(String aadhaarRef) async {
  try {
    final res = await http
        .get(Uri.parse('$kNotifApi/v1/notifications?aadhaar=${Uri.encodeComponent(aadhaarRef)}'))
        .timeout(_kTimeout);
    if (!res.ok) return [];
    final body = jsonDecode(res.body);
    final list = (body is List) ? body : (body['content'] as List<dynamic>? ?? []);
    return list.cast<Map<String, dynamic>>();
  } catch (_) {
    return [];
  }
}

// ── Grievance comment ─────────────────────────────────────────────
Future<void> addGrievanceComment(String grievanceId, String authorName, String text) async {
  final body = jsonEncode({'authorName': authorName, 'authorType': 'CITIZEN', 'commentText': text});
  await http.post(Uri.parse('$kGrievanceApi/v1/grievances/$grievanceId/comments'), headers: _headers, body: body).timeout(_kTimeout);
}

// ── Family income + beneficiaries ────────────────────────────────
Future<Map<String, dynamic>?> fetchFamilyIncome(String familyId) async {
  final url = '$kFamilyApi/v1/families/$familyId/income';
  debugPrint('[API] fetchFamilyIncome url=$url');
  try {
    final res = await http.get(Uri.parse(url)).timeout(_kTimeout);
    debugPrint('[API] fetchFamilyIncome status=${res.statusCode}');
    if (!res.ok) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  } catch (e) {
    debugPrint('[API] fetchFamilyIncome ERROR: $e');
    return null;
  }
}

Future<List<Map<String, dynamic>>> fetchFamilyBeneficiaries(String familyId) async {
  final url = '$kSchemeEngine/v1/beneficiaries/family/$familyId';
  debugPrint('[API] fetchFamilyBeneficiaries url=$url');
  try {
    final res = await http.get(Uri.parse(url)).timeout(_kTimeout);
    debugPrint('[API] beneficiaries status=${res.statusCode} body=${res.body.substring(0, res.body.length.clamp(0, 100))}');
    if (!res.ok) return [];
    final body = jsonDecode(res.body);
    final list = (body is List) ? body : (body['content'] as List<dynamic>? ?? []);
    debugPrint('[API] beneficiaries list.length=${list.length}');
    return list.cast<Map<String, dynamic>>();
  } catch (e) {
    debugPrint('[API] beneficiaries ERROR: $e');
    return [];
  }
}

// ── Consents ──────────────────────────────────────────────────────
Future<List<Map<String, dynamic>>> fetchConsents(String aadhaarRef) async {
  try {
    final res = await http
        .get(Uri.parse('$kFamilyApi/v1/persons/${Uri.encodeComponent(aadhaarRef)}/consents'))
        .timeout(_kTimeout);
    if (!res.ok) return [];
    final body = jsonDecode(res.body);
    final list = (body is List) ? body : (body['content'] as List<dynamic>? ?? []);
    return list.cast<Map<String, dynamic>>();
  } catch (_) {
    return [];
  }
}

Future<Map<String, dynamic>?> revokeConsent(String aadhaarRef, String consentId) async {
  try {
    final res = await http
        .post(Uri.parse('$kFamilyApi/v1/persons/${Uri.encodeComponent(aadhaarRef)}/consents/$consentId/revoke'), headers: _headers)
        .timeout(_kTimeout);
    if (!res.ok) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }
}

Future<Map<String, dynamic>?> restoreConsent(String aadhaarRef, String consentId) async {
  try {
    final res = await http
        .post(Uri.parse('$kFamilyApi/v1/persons/${Uri.encodeComponent(aadhaarRef)}/consents/$consentId/restore'), headers: _headers)
        .timeout(_kTimeout);
    if (!res.ok) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }
}

Future<Map<String, dynamic>?> fetchDataExport(String aadhaarRef) async {
  try {
    final res = await http
        .get(Uri.parse('$kFamilyApi/v1/persons/${Uri.encodeComponent(aadhaarRef)}/data-export'))
        .timeout(_kTimeout);
    if (!res.ok) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  } catch (_) {
    return null;
  }
}

// ── Chatbot ───────────────────────────────────────────────────────

class ChatReply {
  final String reply;
  final String? navigateTo;
  const ChatReply({required this.reply, this.navigateTo});
}

Future<ChatReply?> sendChatMessage({
  required String sessionId,
  required String message,
  required String language,
  required String aadhaarRef,
  String currentPage = '/mobile',
}) async {
  try {
    final body = jsonEncode({
      'sessionId': sessionId,
      'message': message,
      'language': language,
      'aadhaarRef': aadhaarRef,
      'currentPage': currentPage,
    });
    final res = await http
        .post(Uri.parse('$kChatbotApi/v1/chat'), headers: _headers, body: body)
        .timeout(const Duration(seconds: 40));
    if (!res.ok) return null;
    final decoded = jsonDecode(res.body) as Map<String, dynamic>;
    final reply = decoded['reply'] as String? ??
        decoded['message'] as String? ??
        decoded['response'] as String?;
    if (reply == null) return null;
    return ChatReply(
      reply: reply,
      navigateTo: decoded['navigateTo'] as String?,
    );
  } catch (_) {
    return null;
  }
}

/// Speech-to-text via ai-intelligence-service (faster-whisper).
Future<String?> speechToText({
  required List<int> audioBytes,
  required String filename,
  required String language,
}) async {
  try {
    final req = http.MultipartRequest('POST', Uri.parse('$kSpeechApi/v1/speech/stt'));
    req.fields['language'] = language;
    req.files.add(http.MultipartFile.fromBytes('audio', audioBytes, filename: filename));
    final streamed = await req.send().timeout(const Duration(seconds: 90));
    final res = await http.Response.fromStream(streamed);
    if (!res.ok) return null;
    final decoded = jsonDecode(res.body) as Map<String, dynamic>;
    final text = (decoded['text'] as String?)?.trim();
    return (text == null || text.isEmpty) ? null : text;
  } catch (_) {
    return null;
  }
}

/// Text-to-speech via gTTS — returns MP3 bytes.
Future<List<int>?> textToSpeech({
  required String text,
  required String language,
}) async {
  try {
    final res = await http
        .post(
          Uri.parse('$kSpeechApi/v1/speech/tts'),
          headers: _headers,
          body: jsonEncode({'text': text, 'language': language}),
        )
        .timeout(const Duration(seconds: 40));
    if (!res.ok) return null;
    return res.bodyBytes;
  } catch (_) {
    return null;
  }
}

extension _ResponseExt on http.Response {
  bool get ok => statusCode >= 200 && statusCode < 300;
}
