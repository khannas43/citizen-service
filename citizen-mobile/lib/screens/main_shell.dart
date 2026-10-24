import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/citizen_profile.dart';
import '../services/api_service.dart';
import '../services/draft_service.dart';
import '../services/notification_service.dart';
import '../l10n/app_strings.dart';
import '../services/locale_service.dart';
import '../widgets/dg_chatbot.dart';
import '../widgets/language_toggle.dart';
import 'home/home_screen.dart';
import 'apply/apply_screen.dart';
import 'family/family_screen.dart';
import 'grievances/grievances_screen.dart';
import 'more/more_screen.dart';
import 'drafts/drafts_screen.dart';
import 'login/login_screen.dart';

// Nav tabs
enum _Tab { home, family, apply, grievances, more }

class MainShell extends StatefulWidget {
  final CitizenProfile profile;
  const MainShell({super.key, required this.profile});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  _Tab _tab = _Tab.home;
  late CitizenProfile _profile;

  @override
  void initState() {
    super.initState();
    _profile = widget.profile;
    WidgetsBinding.instance.addObserver(this);
    NotificationService.init();
    NotificationService.requestPermission();
    _refreshProfile();
  }

  Future<void> _refreshProfile() async {
    final next = await hydrateCitizenProfile(_profile);
    if (!mounted) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('citizen_profile', jsonEncode(next.toJson()));
    if (!mounted) return;
    setState(() => _profile = next);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      NotificationService.checkStatusChanges(_profile.aadhaarRef);
      _refreshProfile();
    }
  }

  void _switchTab(int idx) => setState(() => _tab = _Tab.values[idx]);

  Future<void> _logout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(S.t(context, 'shell.switchProfile')),
        content: Text(S.t(context, 'shell.switchHint')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(S.t(context, 'common.cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(S.t(context, 'common.switch'))),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('citizen_profile');
      if (mounted) {
        Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
      }
    }
  }

  void _openChatbot() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => DgChatbotScreen(profile: _profile)),
    );
  }

  String _title(BuildContext context) {
    switch (_tab) {
      case _Tab.home: return S.t(context, 'myApplications');
      case _Tab.family: return S.t(context, 'myFamily');
      case _Tab.apply: return S.t(context, 'nav.apply');
      case _Tab.grievances: return S.t(context, 'nav.grievances');
      case _Tab.more: return S.t(context, 'nav.more');
    }
  }

  @override
  Widget build(BuildContext context) {
    final draftCount = DraftService.count(_profile.aadhaarRef);

    return ListenableBuilder(
      listenable: LocaleService.instance,
      builder: (context, _) {
        return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          const Text('🏛 ', style: TextStyle(fontSize: 18)),
          Text(_title(context), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        ]),
        centerTitle: false,
        actions: [
          const LanguageToggle(),
          if (draftCount > 0)
            Stack(alignment: Alignment.topRight, children: [
              IconButton(
                icon: const Icon(Icons.drafts_outlined),
                tooltip: S.t(context, 'common.offlineDrafts'),
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => Scaffold(
                  appBar: AppBar(title: Text(S.t(context, 'common.savedDrafts')), centerTitle: false),
                  body: DraftsScreen(profile: _profile),
                ))).then((_) => setState(() {})),
              ),
              Positioned(right: 8, top: 8, child: Container(
                width: 16, height: 16,
                decoration: const BoxDecoration(color: Color(0xFFD97706), shape: BoxShape.circle),
                child: Center(child: Text('$draftCount', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800))),
              )),
            ]),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: _profile.avatarColor,
              child: Text(_profile.initials, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
            ),
            tooltip: 'Switch Profile',
            onPressed: _logout,
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: IndexedStack(
        index: _tab.index,
        sizing: StackFit.expand,
        children: [
          HomeScreen(profile: _profile, onSwitchTab: _switchTab),
          FamilyScreen(profile: _profile),
          ApplyScreen(profile: _profile),
          GrievancesScreen(profile: _profile),
          MoreScreen(profile: _profile),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _openChatbot,
        tooltip: 'DG Assist Chatbot',
        mini: true,
        backgroundColor: const Color(0xFF3730A3),
        child: const Text('🤖', style: TextStyle(fontSize: 20)),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab.index,
        onDestinationSelected: _switchTab,
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined),      selectedIcon: const Icon(Icons.home),      label: S.t(context, 'nav.applications')),
          NavigationDestination(icon: const Icon(Icons.people_outlined),    selectedIcon: const Icon(Icons.people),    label: S.t(context, 'myFamily')),
          NavigationDestination(icon: const Icon(Icons.add_circle_outline), selectedIcon: const Icon(Icons.add_circle),label: S.t(context, 'nav.apply')),
          NavigationDestination(icon: const Icon(Icons.warning_amber_outlined), selectedIcon: const Icon(Icons.warning_amber), label: S.t(context, 'nav.grievances')),
          NavigationDestination(icon: const Icon(Icons.grid_view_outlined), selectedIcon: const Icon(Icons.grid_view), label: S.t(context, 'nav.more')),
        ],
      ),
    );
      },
    );
  }
}
