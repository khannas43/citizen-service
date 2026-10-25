import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../l10n/app_strings.dart';
import '../../services/locale_service.dart';
import '../../widgets/language_toggle.dart';
import '../main_shell.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  int? _loadingIdx;

  Future<void> _login(int idx) async {
    setState(() => _loadingIdx = idx);
    final profile = await hydrateCitizenProfile(kDemoProfiles[idx]);

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('citizen_profile', jsonEncode(profile.toJson()));

    if (!mounted) return;
    setState(() => _loadingIdx = null);
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => MainShell(profile: profile)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: LocaleService.instance,
          builder: (context, _) => ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: const LanguageToggle(),
            ),
            const SizedBox(height: 16),
            // Logo block
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [cs.primary, cs.primary.withBlue(220)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('🏛', style: TextStyle(fontSize: 36)),
                  const SizedBox(height: 12),
                  const Text(
                    'Citizen Services',
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -0.5),
                  ),
                  Text(
                    S.t(context, 'login.platform'),
                    style: const TextStyle(fontSize: 14, color: Colors.white70),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 36),
            Text(
              S.t(context, 'login.selectProfile'),
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF1E293B)),
            ),
            const SizedBox(height: 4),
            Text(
              S.t(context, 'login.chooseHint'),
              style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
            ),
            const SizedBox(height: 16),

            ...List.generate(kDemoProfiles.length, (i) {
              final p = kDemoProfiles[i];
              final isLoading = _loadingIdx == i;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _ProfileCard(
                  profile: p,
                  isLoading: isLoading,
                  onTap: _loadingIdx == null ? () => _login(i) : null,
                ),
              );
            }),

            const SizedBox(height: 24),
            const Center(
              child: Text(
                'Demo credentials — no real authentication',
                style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
              ),
            ),
          ],
        ),
        ),
      ),
    );
  }
}

class _ProfileCard extends StatelessWidget {
  final CitizenProfile profile;
  final bool isLoading;
  final VoidCallback? onTap;

  const _ProfileCard({required this.profile, required this.isLoading, this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                radius: 26,
                backgroundColor: profile.avatarColor,
                child: Text(
                  profile.initials,
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(profile.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(
                      '${profile.age} yrs · ${profile.gender} · ${profile.category}',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
                    ),
                    Text(
                      profile.district,
                      style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
              if (isLoading)
                const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              else
                const Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
            ],
          ),
        ),
      ),
    );
  }
}
