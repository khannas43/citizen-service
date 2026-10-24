import 'dart:convert';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';

const _kStatusKey = 'dg20_app_statuses';
const _kChannelId = 'dg20_status';
const _kChannelName = 'Application Status';

class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _plugin.initialize(
      const InitializationSettings(android: android),
    );

    // Create notification channel
    final channel = AndroidNotificationChannel(
      _kChannelId,
      _kChannelName,
      description: 'Updates on your welfare application statuses',
      importance: Importance.high,
    );
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  static Future<void> requestPermission() async {
    await _plugin
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  }

  /// Called every time app returns to foreground.
  /// Compares current application statuses against stored ones.
  static Future<void> checkStatusChanges(String aadhaarRef) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final storedRaw = prefs.getString(_kStatusKey) ?? '{}';
      final stored = jsonDecode(storedRaw) as Map<String, dynamic>;

      final apps = await fetchAllApplications(aadhaarRef);
      final now = <String, dynamic>{};
      var changed = false;

      for (final app in apps) {
        now[app.engineRef] = app.status;
        final prev = stored[app.engineRef] as String?;
        if (prev != null && prev != app.status) {
          changed = true;
          await _show(
            id: app.engineRef.hashCode,
            title: 'Application Update',
            body: '${app.serviceLabel}: $prev → ${app.status}',
          );
        }
      }

      if (changed || stored.length != now.length) {
        await prefs.setString(_kStatusKey, jsonEncode(now));
      }
    } catch (_) {
      // silent — polling is best-effort
    }
  }

  static Future<void> _show({
    required int id,
    required String title,
    required String body,
  }) async {
    await _plugin.show(
      id,
      title,
      body,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          _kChannelId,
          _kChannelName,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
    );
  }
}
