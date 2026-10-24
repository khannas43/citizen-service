import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'models/citizen_profile.dart';
import 'screens/login/login_screen.dart';
import 'screens/main_shell.dart';
import 'services/api_service.dart';
import 'services/locale_service.dart';
import 'theme.dart' show appTheme;
import 'widgets/locale_scope.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox<String>('dg20_drafts');
  await LocaleService.instance.init();
  runApp(const DG20App());
}

class DG20App extends StatelessWidget {
  const DG20App({super.key});

  @override
  Widget build(BuildContext context) {
    return LocaleScope(
      notifier: LocaleService.instance,
      child: MaterialApp(
        title: 'DG 2.0 — Citizen',
        theme: appTheme(),
        debugShowCheckedModeBanner: false,
        home: const _Splash(),
      ),
    );
  }
}

class _Splash extends StatefulWidget {
  const _Splash();

  @override
  State<_Splash> createState() => _SplashState();
}

class _SplashState extends State<_Splash> {
  @override
  void initState() {
    super.initState();
    _resolve();
  }

  Future<void> _resolve() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('citizen_profile');

    if (!mounted) return;

    if (raw != null) {
      try {
        var profile = CitizenProfile.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        profile = await hydrateCitizenProfile(profile);
        await prefs.setString('citizen_profile', jsonEncode(profile.toJson()));
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => MainShell(profile: profile)),
        );
        return;
      } catch (_) {
        // Corrupt stored profile — fall through to login
        await prefs.remove('citizen_profile');
      }
    }

    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                color: const Color(0xFF3730A3),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Center(
                child: Text('🏛', style: TextStyle(fontSize: 40)),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'DG 2.0',
              style: TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Color(0xFF1E293B), letterSpacing: -0.5),
            ),
            const SizedBox(height: 4),
            const Text(
              'Gujarat Welfare Platform',
              style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
            const SizedBox(height: 32),
            const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2)),
          ],
        ),
      ),
    );
  }
}
