import 'package:flutter/material.dart';
import '../../models/application_model.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../widgets/status_badge.dart';

class TrackScreen extends StatefulWidget {
  final CitizenProfile profile;
  const TrackScreen({super.key, required this.profile});

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<AppRecord> _apps = [];
  List<Map<String, dynamic>> _grievances = [];
  bool _loadingApps = true;
  bool _loadingGrv = true;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _loadApps();
    _loadGrievances();
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _loadApps() async {
    setState(() => _loadingApps = true);
    final apps = await fetchAllApplications(widget.profile.aadhaarRef);
    if (mounted) setState(() { _apps = apps; _loadingApps = false; });
  }

  Future<void> _loadGrievances() async {
    setState(() => _loadingGrv = true);
    final grv = await fetchGrievances(widget.profile.aadhaarRef);
    if (mounted) setState(() { _grievances = grv; _loadingGrv = false; });
  }

  Future<void> _refresh() async {
    if (_tabs.index == 0) {
      await _loadApps();
    } else {
      await _loadGrievances();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      children: [
        Container(
          color: cs.surface,
          child: TabBar(
            controller: _tabs,
            tabs: [
              Tab(text: 'Applications (${_apps.length})'),
              Tab(text: 'Grievances (${_grievances.length})'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabs,
            children: [
              _ApplicationsList(
                apps: _apps,
                loading: _loadingApps,
                onRefresh: _loadApps,
              ),
              _GrievancesList(
                grievances: _grievances,
                loading: _loadingGrv,
                onRefresh: _loadGrievances,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Applications Tab ─────────────────────────────────────────────────────────

class _ApplicationsList extends StatelessWidget {
  final List<AppRecord> apps;
  final bool loading;
  final Future<void> Function() onRefresh;
  const _ApplicationsList({required this.apps, required this.loading, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (apps.isEmpty) return _emptyState('📋', 'No applications yet', 'Apply for services to see them here', onRefresh);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: apps.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (ctx, i) => _AppCard(app: apps[i]),
      ),
    );
  }
}

class _AppCard extends StatelessWidget {
  final AppRecord app;
  const _AppCard({required this.app});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => AppDetailScreen(app: app))),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Expanded(child: Text(app.displayNo, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 14))),
                StatusBadge(app.status),
              ]),
              const SizedBox(height: 6),
              Text(app.serviceLabel, style: const TextStyle(fontSize: 13, color: Color(0xFF1E293B), fontWeight: FontWeight.w600)),
              if (app.createdAt != null) ...[
                const SizedBox(height: 4),
                Text(_fmt(app.createdAt!), style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
              ],
              if (app.officerNote != null && app.officerNote!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFFBEB),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFFDE68A)),
                  ),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('💬 ', style: TextStyle(fontSize: 12)),
                    Expanded(child: Text(app.officerNote!, style: const TextStyle(fontSize: 12, color: Color(0xFF92400E)))),
                  ]),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  String _fmt(String iso) {
    try { final dt = DateTime.parse(iso); return '${dt.day}/${dt.month}/${dt.year}'; } catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }
}

// ── Grievances Tab ────────────────────────────────────────────────────────────

class _GrievancesList extends StatelessWidget {
  final List<Map<String, dynamic>> grievances;
  final bool loading;
  final Future<void> Function() onRefresh;
  const _GrievancesList({required this.grievances, required this.loading, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (grievances.isEmpty) return _emptyState('🔔', 'No grievances filed', 'Raise a grievance from the Apply tab', onRefresh);
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: grievances.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (ctx, i) => _GrievanceCard(g: grievances[i]),
      ),
    );
  }
}

class _GrievanceCard extends StatelessWidget {
  final Map<String, dynamic> g;
  const _GrievanceCard({required this.g});

  @override
  Widget build(BuildContext context) {
    final ref = g['grievanceRef'] as String? ?? g['id']?.toString() ?? '—';
    final status = g['status'] as String? ?? 'OPEN';
    final category = g['category'] as String? ?? '';
    final priority = g['priority'] as String? ?? '';
    final text = g['complaintText'] as String? ?? '';
    final createdAt = g['createdAt'] as String? ?? g['submittedAt'] as String? ?? '';

    final priorityColor = priority == 'HIGH'
        ? const Color(0xFFDC2626)
        : priority == 'MEDIUM'
            ? const Color(0xFFD97706)
            : const Color(0xFF64748B);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(ref, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 13))),
            StatusBadge(status == 'OPEN' ? 'PENDING' : status == 'RESOLVED' ? 'APPROVED' : status),
          ]),
          const SizedBox(height: 6),
          Row(children: [
            if (category.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(999)),
                child: Text(category, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF475569))),
              ),
              const SizedBox(width: 6),
            ],
            if (priority.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: priorityColor.withAlpha(20), borderRadius: BorderRadius.circular(999)),
                child: Text(priority, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: priorityColor)),
              ),
          ]),
          if (text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13, color: Color(0xFF334155))),
          ],
          if (createdAt.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(_fmt(createdAt), style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ],
        ]),
      ),
    );
  }

  String _fmt(String iso) {
    try { final dt = DateTime.parse(iso); return '${dt.day}/${dt.month}/${dt.year}'; } catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }
}

// ── Empty state helper ────────────────────────────────────────────────────────

Widget _emptyState(String emoji, String title, String subtitle, Future<void> Function() onRefresh) {
  return RefreshIndicator(
    onRefresh: onRefresh,
    child: ListView(children: [
      const SizedBox(height: 100),
      Center(child: Column(children: [
        Text(emoji, style: const TextStyle(fontSize: 48)),
        const SizedBox(height: 12),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(height: 4),
        Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
      ])),
    ]),
  );
}

// ── App Detail Screen ─────────────────────────────────────────────────────────

class AppDetailScreen extends StatelessWidget {
  final AppRecord app;
  const AppDetailScreen({super.key, required this.app});

  @override
  Widget build(BuildContext context) {
    final timeline = _buildTimeline(app);
    return Scaffold(
      appBar: AppBar(title: Text(app.serviceLabel), centerTitle: false),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(app.displayNo, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 16, color: Color(0xFF3730A3))),
            const SizedBox(height: 8),
            Row(children: [const Text('Status: ', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)), StatusBadge(app.status)]),
            if (app.createdAt != null) ...[
              const SizedBox(height: 4),
              Text('Submitted: ${app.createdAt!.substring(0, 10)}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            ],
          ]),
        ),
        const SizedBox(height: 24),
        const Text('APPLICATION TIMELINE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
        const SizedBox(height: 14),
        ...timeline.asMap().entries.map((e) => _TimelineRow(step: e.value, isLast: e.key == timeline.length - 1)),
        if (app.officerNote != null && app.officerNote!.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('OFFICER NOTE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFDE68A))),
            child: Text(app.officerNote!, style: const TextStyle(fontSize: 13, color: Color(0xFF78350F))),
          ),
        ],
      ]),
    );
  }

  List<_TimelineStep> _buildTimeline(AppRecord app) {
    final steps = [
      _TimelineStep(label: 'Submitted', done: true, date: app.createdAt),
      _TimelineStep(label: 'Under Review', done: app.status != 'PENDING'),
    ];
    if (app.status == 'APPROVED') steps.add(_TimelineStep(label: 'Approved', done: true, date: app.updatedAt));
    else if (app.status == 'REJECTED') steps.add(_TimelineStep(label: 'Rejected', done: true, date: app.updatedAt, isRejected: true));
    else if (app.status == 'ESCALATED') steps.add(_TimelineStep(label: 'Escalated', done: true, date: app.updatedAt, isWarning: true));
    else steps.add(_TimelineStep(label: 'Decision Pending', done: false));
    return steps;
  }
}

class _TimelineStep {
  final String label; final bool done; final String? date; final bool isRejected; final bool isWarning;
  const _TimelineStep({required this.label, required this.done, this.date, this.isRejected = false, this.isWarning = false});
}

class _TimelineRow extends StatelessWidget {
  final _TimelineStep step; final bool isLast;
  const _TimelineRow({required this.step, required this.isLast});
  @override
  Widget build(BuildContext context) {
    final dotColor = step.isRejected ? const Color(0xFFDC2626) : step.isWarning ? const Color(0xFFD97706) : step.done ? const Color(0xFF16A34A) : const Color(0xFFCBD5E1);
    return IntrinsicHeight(
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Column(children: [
          Container(width: 20, height: 20, decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
            child: step.done ? const Icon(Icons.check, size: 12, color: Colors.white) : null),
          if (!isLast) Expanded(child: Container(width: 2, color: const Color(0xFFE2E8F0), margin: const EdgeInsets.symmetric(vertical: 2))),
        ]),
        const SizedBox(width: 14),
        Expanded(child: Padding(
          padding: EdgeInsets.only(bottom: isLast ? 0 : 18),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(step.label, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: step.done ? const Color(0xFF1E293B) : const Color(0xFF94A3B8))),
            if (step.date != null) Text(step.date!.substring(0, step.date!.length.clamp(0, 10)), style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
          ]),
        )),
      ]),
    );
  }
}
