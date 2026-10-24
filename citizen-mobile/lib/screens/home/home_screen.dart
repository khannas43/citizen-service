import 'package:flutter/material.dart';
import '../../models/application_model.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../services/locale_service.dart';
import '../../l10n/app_strings.dart';
import '../../widgets/status_badge.dart';
import '../track/track_screen.dart';

// New tab indices: 0=Home, 1=Family, 2=Apply, 3=Grievances, 4=More
const _kApplyTab     = 2;
const _kGrievanceTab = 3;

class HomeScreen extends StatefulWidget {
  final CitizenProfile profile;
  final void Function(int tab) onSwitchTab;

  const HomeScreen({super.key, required this.profile, required this.onSwitchTab});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<AppRecord> _apps = [];
  bool _loading = true;
  String _statusFilter = 'ALL';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final apps = await fetchAllApplications(widget.profile.aadhaarRef);
    if (mounted) setState(() { _apps = apps; _loading = false; });
  }

  String _greeting(BuildContext context) {
    final h = DateTime.now().hour;
    if (h < 12) return S.t(context, 'home.greetingMorning');
    if (h < 17) return S.t(context, 'home.greetingAfternoon');
    return S.t(context, 'home.greetingEvening');
  }

  List<AppRecord> get _displayed {
    if (_statusFilter == 'ALL') return _apps;
    return _apps.where((a) => a.status == _statusFilter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: LocaleService.instance,
      builder: (context, _) {
    final cs = Theme.of(context).colorScheme;
    final pending  = _apps.where((a) => a.status == 'PENDING').length;
    final approved = _apps.where((a) => a.status == 'APPROVED').length;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
        children: [

          // ── Welcome card ─────────────────────────────────────────
          Container(
            margin: const EdgeInsets.only(top: 8, bottom: 16),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [cs.primary, const Color(0xFF1E3A8A)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${_greeting(context)},', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                Text(widget.profile.name.split(' ').first, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white.withAlpha(30), borderRadius: BorderRadius.circular(999)),
                  child: Text('${widget.profile.category} · ${widget.profile.district}',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ])),
              CircleAvatar(
                radius: 28,
                backgroundColor: Colors.white.withAlpha(40),
                child: Text(widget.profile.initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
              ),
            ]),
          ),

          // ── KPI row ───────────────────────────────────────────────
          Row(children: [
            _KpiCard(label: S.t(context, 'home.kpiPending'),  value: '$pending',       color: const Color(0xFF2563EB), icon: Icons.pending_actions),
            const SizedBox(width: 10),
            _KpiCard(label: S.t(context, 'home.kpiApproved'), value: '$approved',      color: const Color(0xFF16A34A), icon: Icons.check_circle_outline),
            const SizedBox(width: 10),
            _KpiCard(label: S.t(context, 'home.kpiTotal'),    value: '${_apps.length}', color: const Color(0xFF7C3AED), icon: Icons.folder_open),
          ]),

          const SizedBox(height: 20),

          // ── Quick Actions ─────────────────────────────────────────
          _SectionHeader(S.t(context, 'home.quickActions')),
          const SizedBox(height: 10),
          GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: 3,
            mainAxisSpacing: 10, crossAxisSpacing: 10,
            childAspectRatio: 0.9,
            children: [
              _QuickAction(icon: '📜', label: S.t(context, 'home.quickCaste'),     onTap: () => widget.onSwitchTab(_kApplyTab)),
              _QuickAction(icon: '🧓', label: S.t(context, 'home.quickPension'),    onTap: () => widget.onSwitchTab(_kApplyTab)),
              _QuickAction(icon: '🏛', label: S.t(context, 'home.quickScheme'),     onTap: () => widget.onSwitchTab(_kApplyTab)),
              _QuickAction(icon: '⚠️', label: S.t(context, 'home.quickGrievance'),  onTap: () => widget.onSwitchTab(_kGrievanceTab)),
              _QuickAction(icon: '👨‍👩‍👧', label: S.t(context, 'myFamily'),         onTap: () => widget.onSwitchTab(1)),
              _QuickAction(icon: '⋯',  label: S.t(context, 'nav.more'),            onTap: () => widget.onSwitchTab(4)),
            ],
          ),

          const SizedBox(height: 24),

          // ── My Applications ──────────────────────────────────────
          Row(children: [
            Expanded(child: _SectionHeader(S.t(context, 'home.myApplications'))),
            if (!_loading && _apps.isNotEmpty)
              Text('${_displayed.length} ${S.t(context, 'home.shown')}', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ]),
          const SizedBox(height: 10),

          // Status filter chips
          if (!_loading && _apps.isNotEmpty) ...[
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                for (final (value, labelKey) in [
                  ('ALL',      'home.filterAll'),
                  ('PENDING',  'home.filterPending'),
                  ('APPROVED', 'home.filterApproved'),
                  ('REJECTED', 'home.filterRejected'),
                ]) ...[
                  FilterChip(
                    label: Text(S.t(context, labelKey), style: const TextStyle(fontSize: 11)),
                    selected: _statusFilter == value,
                    onSelected: (_) => setState(() => _statusFilter = value),
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                    visualDensity: VisualDensity.compact,
                  ),
                  const SizedBox(width: 6),
                ],
              ]),
            ),
            const SizedBox(height: 12),
          ],

          // Application list
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
          else if (_apps.isEmpty)
            _emptyApps(context)
          else if (_displayed.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(children: [
                const Text('🔍', style: TextStyle(fontSize: 36)),
                const SizedBox(height: 8),
                Text(S.t(context, 'home.noFilterMatch'), style: const TextStyle(fontWeight: FontWeight.w600)),
                TextButton(onPressed: () => setState(() => _statusFilter = 'ALL'), child: Text(S.t(context, 'home.clearFilter'))),
              ]),
            )
          else
            ...(_displayed.map((app) => _AppTile(app: app))),
        ],
      ),
    );
      },
    );
  }

  Widget _emptyApps(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(16), border: Border.all(color: const Color(0xFFE8EDF3))),
      child: Column(children: [
        const Text('📋', style: TextStyle(fontSize: 32)),
        const SizedBox(height: 8),
        Text(S.t(context, 'home.noAppsYet'), style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(S.t(context, 'home.tapApply'), style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: () => widget.onSwitchTab(_kApplyTab),
          icon: const Icon(Icons.add, size: 16),
          label: Text(S.t(context, 'home.applyNow')),
        ),
      ]),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label, value;
  final Color color;
  final IconData icon;
  const _KpiCard({required this.label, required this.value, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE8EDF3)),
          boxShadow: const [BoxShadow(color: Color(0x08000000), blurRadius: 8, offset: Offset(0, 2))],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 6),
          Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color, letterSpacing: -0.5)),
          Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
        ]),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);
  @override
  Widget build(BuildContext context) {
    return Text(text.toUpperCase(), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8));
  }
}

class _QuickAction extends StatelessWidget {
  final String icon, label;
  final VoidCallback onTap;
  const _QuickAction({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(icon, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)), textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}

// Tappable — navigates to the full detail + timeline screen from track_screen.dart
class _AppTile extends StatelessWidget {
  final AppRecord app;
  const _AppTile({required this.app});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AppDetailScreen(app: app))),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(app.displayNo, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, fontFamily: 'monospace'))),
              StatusBadge(app.status),
            ]),
            const SizedBox(height: 4),
            Text(app.serviceLabel, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B), fontWeight: FontWeight.w600)),
            if (app.createdAt != null) ...[
              const SizedBox(height: 2),
              Text(_fmt(app.createdAt!), style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
            ],
            if (app.officerNote != null && app.officerNote!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFDE68A))),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('💬 ', style: TextStyle(fontSize: 12)),
                  Expanded(child: Text(app.officerNote!, style: const TextStyle(fontSize: 12, color: Color(0xFF92400E)))),
                ]),
              ),
            ],
            const SizedBox(height: 4),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              Builder(builder: (ctx) => Text(S.t(ctx, 'home.tapDetails'), style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)))),
              const Icon(Icons.chevron_right, size: 14, color: Color(0xFF94A3B8)),
            ]),
          ]),
        ),
      ),
    );
  }

  static String _fmt(String iso) {
    try { final dt = DateTime.parse(iso); return '${dt.day}/${dt.month}/${dt.year}'; }
    catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }
}
