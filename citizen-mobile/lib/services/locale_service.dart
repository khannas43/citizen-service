import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists app language — same key as citizen-portal (`lang`).
class LocaleService extends ChangeNotifier {
  LocaleService._();
  static final LocaleService instance = LocaleService._();

  static const prefKey = 'lang';

  String _code = 'en';
  String get code => _code;
  bool get isGu => _code == 'gu';

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(prefKey);
    _code = saved == 'gu' ? 'gu' : 'en';
  }

  Future<void> setLanguage(String code) async {
    final next = code == 'gu' ? 'gu' : 'en';
    if (_code == next) return;
    _code = next;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(prefKey, _code);
  }

  Future<void> toggle() => setLanguage(_code == 'en' ? 'gu' : 'en');
}
