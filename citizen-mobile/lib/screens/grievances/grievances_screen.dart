import 'package:flutter/material.dart';
import '../../models/application_model.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../widgets/dg_text_field.dart';

const _kCategories = {
  'DELAYED_PROCESSING':       'Delayed Processing',
  'DOCUMENT_REJECTION':       'Document Rejected',
  'WRONG_INFORMATION':        'Wrong Information',
  'CERTIFICATE_NOT_RECEIVED': 'Certificate Not Received',
  'SCHEME_ELIGIBILITY':       'Eligibility Dispute',
  'BENEFIT_NOT_RECEIVED':     'Benefit Not Credited',
  'TECHNICAL_ISSUE':          'Technical Issue',
  'OFFICER_CONDUCT':          'Officer Conduct',
  'SERVICE_DELAY':            'Service Delay',
  'OTHER':                    'Other',
};

const _kPriorityOptions = [
  ('LOW',    'Low — not time-sensitive'),
  ('NORMAL', 'Normal — standard processing'),
  ('HIGH',   'High — needs attention soon'),
  ('URGENT', 'Urgent — immediate attention required'),
];

const _kStatusLabel = {
  'OPEN':         'Awaiting Response',
  'ACKNOWLEDGED': 'Under Review',
  'QUERY_RAISED': 'Officer Query',
  'RESOLVED':     'Closed',
};

class GrievancesScreen extends StatefulWidget {
  final CitizenProfile profile;
  const GrievancesScreen({super.key, required this.profile});

  @override
  State<GrievancesScreen> createState() => _GrievancesScreenState();
}

class _GrievancesScreenState extends State<GrievancesScreen> {
  List<Map<String, dynamic>> _grievances = [];
  List<AppRecord> _apps = [];
  bool _loading = true;
  String _statusFilter = 'ALL';
  String _sortField = 'createdAt';
  String _sortDir  = 'desc';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final results = await Future.wait([
      fetchGrievances(widget.profile.aadhaarRef),
      fetchAllApplications(widget.profile.aadhaarRef),
    ]);
    if (mounted) setState(() {
      _grievances = results[0] as List<Map<String, dynamic>>;
      _apps       = results[1] as List<AppRecord>;
      _loading    = false;
    });
  }

  List<Map<String, dynamic>> get _displayed {
    var list = _grievances.where((g) {
      if (_statusFilter != 'ALL') return g['status'] == _statusFilter;
      return true;
    }).toList();

    final mul = _sortDir == 'asc' ? 1 : -1;
    const priorityOrder = {'URGENT': 0, 'HIGH': 1, 'NORMAL': 2, 'LOW': 3};
    list.sort((a, b) {
      if (_sortField == 'priority') {
        final ao = priorityOrder[a['priority']] ?? 9;
        final bo = priorityOrder[b['priority']] ?? 9;
        return mul * ao.compareTo(bo);
      }
      if (_sortField == 'status') {
        return mul * (a['status'] as String? ?? '').compareTo(b['status'] as String? ?? '');
      }
      final ta = DateTime.tryParse(a['createdAt'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
      final tb = DateTime.tryParse(b['createdAt'] as String? ?? '')?.millisecondsSinceEpoch ?? 0;
      return mul * ta.compareTo(tb);
    });
    return list;
  }

  void _openRaiseForm() {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => _RaiseComplaintPage(
        profile: widget.profile,
        apps: _apps,
        onSubmitted: (ref) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('✅ Complaint $ref submitted'), backgroundColor: const Color(0xFF16A34A)),
          );
          _load();
        },
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayed = _displayed;
    return Column(children: [
      // ── Toolbar ────────────────────────────────────────────────
      Container(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
        color: Theme.of(context).colorScheme.surface,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text('${_grievances.length} Grievances',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF64748B))),
            const Spacer(),
            FilledButton.icon(
              onPressed: _openRaiseForm,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Raise Complaint'),
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  textStyle: const TextStyle(fontSize: 13)),
            ),
          ]),
          const SizedBox(height: 10),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              for (final (value, label) in [
                ('ALL',           'All'),
                ('OPEN',          'Awaiting Response'),
                ('ACKNOWLEDGED',  'Under Review'),
                ('QUERY_RAISED',  'Officer Query'),
                ('RESOLVED',      'Closed'),
              ]) ...[
                FilterChip(
                  label: Text(label, style: const TextStyle(fontSize: 11)),
                  selected: _statusFilter == value,
                  onSelected: (_) => setState(() => _statusFilter = value),
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 0),
                  visualDensity: VisualDensity.compact,
                ),
                const SizedBox(width: 6),
              ],
              const SizedBox(width: 8),
              PopupMenuButton<String>(
                tooltip: 'Sort',
                icon: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.sort, size: 16, color: Color(0xFF64748B)),
                  SizedBox(width: 4),
                  Text('Sort', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
                ]),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'createdAt_desc', child: Text('Date (newest first)')),
                  PopupMenuItem(value: 'createdAt_asc',  child: Text('Date (oldest first)')),
                  PopupMenuItem(value: 'priority_asc',   child: Text('Priority (urgent first)')),
                  PopupMenuItem(value: 'status_asc',     child: Text('Status (A–Z)')),
                ],
                onSelected: (v) {
                  final parts = v.split('_');
                  setState(() { _sortField = parts[0]; _sortDir = parts[1]; });
                },
              ),
            ]),
          ),
          const SizedBox(height: 8),
        ]),
      ),

      Expanded(child: _loading
          ? const Center(child: CircularProgressIndicator())
          : displayed.isEmpty
              ? _emptyState()
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: displayed.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (ctx, i) => _GrievanceCard(
                      g: displayed[i],
                      onTap: () => _showDetail(ctx, displayed[i]),
                    ),
                  ),
                )),
    ]);
  }

  void _showDetail(BuildContext ctx, Map<String, dynamic> g) {
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _GrievanceDetailSheet(g: g, profile: widget.profile, onRefresh: _load),
    );
  }

  Widget _emptyState() {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(children: [
        const SizedBox(height: 80),
        Column(children: [
          Text(_statusFilter == 'ALL' ? '📭' : '🔍', style: const TextStyle(fontSize: 48)),
          const SizedBox(height: 12),
          Text(_statusFilter == 'ALL' ? 'No grievances yet' : 'No match for this filter',
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 4),
          Text(_statusFilter == 'ALL' ? 'Tap "Raise Complaint" to file one' : 'Try clearing the filter',
              style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
          if (_statusFilter == 'ALL') ...[
            const SizedBox(height: 20),
            FilledButton.icon(onPressed: _openRaiseForm,
                icon: const Icon(Icons.add, size: 16), label: const Text('Raise Complaint')),
          ],
        ]),
      ]),
    );
  }
}

// ── Grievance Card ────────────────────────────────────────────────────────────

class _GrievanceCard extends StatelessWidget {
  final Map<String, dynamic> g;
  final VoidCallback onTap;
  const _GrievanceCard({required this.g, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final status      = g['status']       as String? ?? 'OPEN';
    final priority    = g['priority']     as String? ?? 'NORMAL';
    final ref         = g['grievanceRef'] as String? ?? '—';
    final category    = _kCategories[g['category']] ?? g['category'] ?? '—';
    final text        = g['complaintText'] as String? ?? '';
    final trackingRef = g['trackingRef']  as String?;
    final createdAt   = g['createdAt']    as String? ?? '';
    final officerNotes = g['officerNotes'] as String?;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(ref, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 13))),
              _Chip(label: priority, color: _priorityColor(priority)),
              const SizedBox(width: 6),
              _Chip(label: _kStatusLabel[status] ?? status, color: _statusColor(status)),
            ]),
            const SizedBox(height: 6),
            Text(category, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF475569))),
            if (text.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12, color: Color(0xFF334155))),
            ],
            if (trackingRef != null && trackingRef.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('App ref: $trackingRef', style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF94A3B8))),
            ],
            if (officerNotes != null && officerNotes.isNotEmpty) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFFDE68A))),
                child: Text('💬 $officerNotes', style: const TextStyle(fontSize: 11, color: Color(0xFF92400E))),
              ),
            ],
            if (createdAt.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(_fmtDate(createdAt), style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
            ],
          ]),
        ),
      ),
    );
  }

  static Color _statusColor(String s) {
    switch (s) {
      case 'OPEN':         return const Color(0xFFDC2626);
      case 'ACKNOWLEDGED': return const Color(0xFFD97706);
      case 'QUERY_RAISED': return const Color(0xFFEA580C);
      case 'RESOLVED':     return const Color(0xFF16A34A);
      default:             return const Color(0xFF64748B);
    }
  }

  static Color _priorityColor(String p) {
    switch (p) {
      case 'URGENT': return const Color(0xFFDC2626);
      case 'HIGH':   return const Color(0xFFD97706);
      case 'NORMAL': return const Color(0xFF2563EB);
      default:       return const Color(0xFF64748B);
    }
  }

  static String _fmtDate(String iso) {
    try { final dt = DateTime.parse(iso); return '${dt.day}/${dt.month}/${dt.year}'; }
    catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }
}

class _Chip extends StatelessWidget {
  final String label;
  final Color color;
  const _Chip({required this.label, required this.color});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(color: color.withAlpha(20), borderRadius: BorderRadius.circular(6)),
    child: Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color)),
  );
}

// ── Grievance Detail Sheet ─────────────────────────────────────────────────────

class _GrievanceDetailSheet extends StatefulWidget {
  final Map<String, dynamic> g;
  final CitizenProfile profile;
  final VoidCallback onRefresh;
  const _GrievanceDetailSheet({required this.g, required this.profile, required this.onRefresh});
  @override State<_GrievanceDetailSheet> createState() => _GrievanceDetailSheetState();
}

class _GrievanceDetailSheetState extends State<_GrievanceDetailSheet> {
  final _followUpCtrl = TextEditingController();
  bool _sending = false;
  @override void dispose() { _followUpCtrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final g           = widget.g;
    final status      = g['status']          as String? ?? 'OPEN';
    final resolved    = status == 'RESOLVED';
    final ref         = g['grievanceRef']    as String? ?? '—';
    final category    = _kCategories[g['category']] ?? g['category'] ?? '—';
    final priority    = g['priority']        as String? ?? 'NORMAL';
    final text        = g['complaintText']   as String? ?? '';
    final officerNotes = g['officerNotes']   as String?;
    final trackingRef  = g['trackingRef']    as String?;

    return Container(
      height: MediaQuery.of(context).size.height * 0.8,
      decoration: const BoxDecoration(color: Color(0xFFF8FAFC), borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      child: Column(children: [
        Container(width: 40, height: 4, margin: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(color: const Color(0xFFCBD5E1), borderRadius: BorderRadius.circular(2))),
        Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 20), children: [
          Row(children: [
            Expanded(child: Text(ref, style: const TextStyle(fontWeight: FontWeight.w800, fontFamily: 'monospace', fontSize: 16, color: Color(0xFF3730A3)))),
            IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
          ]),
          const SizedBox(height: 4),
          Text(category, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Row(children: [
            _Chip(label: _kStatusLabel[status] ?? status, color: _statusColor(status)),
            const SizedBox(width: 8),
            _Chip(label: priority, color: _priorityColor(priority)),
          ]),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Original Complaint', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
              const SizedBox(height: 6),
              Text(text, style: const TextStyle(fontSize: 13)),
              if (trackingRef != null && trackingRef.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text('App ref: $trackingRef', style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF94A3B8))),
              ],
            ]),
          ),
          const SizedBox(height: 12),
          if (officerNotes != null && officerNotes.isNotEmpty) Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFFDE68A))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Officer Response', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF92400E))),
              const SizedBox(height: 6),
              Text(officerNotes, style: const TextStyle(fontSize: 13, color: Color(0xFF78350F))),
            ]),
          ),
          const SizedBox(height: 16),
          if (!resolved) ...[
            const Text('ADD FOLLOW-UP', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
            const SizedBox(height: 8),
            TextField(
              controller: _followUpCtrl,
              maxLines: 3,
              decoration: const InputDecoration(hintText: 'Add a follow-up comment…', contentPadding: EdgeInsets.all(12)),
            ),
            const SizedBox(height: 10),
            SizedBox(width: double.infinity, child: FilledButton(
              onPressed: _sending ? null : _sendFollowUp,
              child: Text(_sending ? 'Sending…' : 'Send Follow-up'),
            )),
          ] else Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10)),
            child: const Text('This complaint is resolved.', style: TextStyle(fontSize: 12, color: Color(0xFF166534))),
          ),
        ])),
      ]),
    );
  }

  Future<void> _sendFollowUp() async {
    final text = _followUpCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      await addGrievanceComment(widget.g['id'].toString(), widget.profile.name, text);
      _followUpCtrl.clear();
      widget.onRefresh();
      if (mounted) Navigator.pop(context);
    } finally { if (mounted) setState(() => _sending = false); }
  }

  static Color _statusColor(String s) {
    switch (s) {
      case 'OPEN':         return const Color(0xFFDC2626);
      case 'ACKNOWLEDGED': return const Color(0xFFD97706);
      case 'RESOLVED':     return const Color(0xFF16A34A);
      default:             return const Color(0xFF64748B);
    }
  }

  static Color _priorityColor(String p) {
    switch (p) {
      case 'URGENT': return const Color(0xFFDC2626);
      case 'HIGH':   return const Color(0xFFD97706);
      case 'NORMAL': return const Color(0xFF2563EB);
      default:       return const Color(0xFF64748B);
    }
  }
}

// ── Raise Complaint — Full Page (NOT bottom sheet) ────────────────────────────

class _RaiseComplaintPage extends StatefulWidget {
  final CitizenProfile profile;
  // apps is intentionally ignored — we reload fresh inside the page
  final List<AppRecord> apps;
  final void Function(String ref) onSubmitted;
  const _RaiseComplaintPage({required this.profile, required this.apps, required this.onSubmitted});
  @override State<_RaiseComplaintPage> createState() => _RaiseComplaintPageState();
}

class _RaiseComplaintPageState extends State<_RaiseComplaintPage> {
  final _textCtrl = TextEditingController();
  final _textFocus = FocusNode();
  String? _selectedAppRef;
  String _category = _kCategories.keys.first;
  String _priority = 'NORMAL';
  bool _submitting = false;
  String? _error;

  // Use the parent's already-loaded list directly — no async fetch, no setState
  // rebuild that would break the autofocus text input connection.
  late List<AppRecord> _apps;

  @override
  void initState() {
    super.initState();
    _apps = widget.apps; // synchronous — no future, no rebuild
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    _textFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final text = _textCtrl.text.trim();
    if (text.length < 10) {
      setState(() => _error = 'Please describe the issue in at least 10 characters.');
      return;
    }
    setState(() { _submitting = true; _error = null; });
    try {
      final result = await submitGrievance(
        aadhaarRef:    widget.profile.aadhaarRef,
        citizenName:   widget.profile.name,
        complaintText: text,
        category:      _category,
        priority:      _priority,
        trackingRef:   _selectedAppRef,
      );
      final ref = result['grievanceRef'] as String? ?? result['id']?.toString() ?? '—';
      if (mounted) {
        Navigator.pop(context);
        widget.onSubmitted(ref);
      }
    } catch (e) {
      setState(() { _error = 'Submission failed. Please check your connection and try again.'; _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Raise a Complaint'),
        centerTitle: false,
        actions: [
          TextButton(
            onPressed: _submitting ? null : _submit,
            child: _submitting
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Submit', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      resizeToAvoidBottomInset: true,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            // ── Related Application ────────────────────────────────
            const _Label('Related Application (optional)'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String?>(
              value: _selectedAppRef,
              isExpanded: true,
              decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14)),
              items: [
                const DropdownMenuItem<String?>(value: null, child: Text('— None / General complaint —')),
                ..._apps.map((a) => DropdownMenuItem<String?>(
                  value: a.engineRef,
                  child: Text('${a.displayNo} — ${a.serviceLabel} (${a.status})', overflow: TextOverflow.ellipsis),
                )),
              ],
              onChanged: (v) => setState(() => _selectedAppRef = v),
            ),
            const SizedBox(height: 20),

            // ── Category ──────────────────────────────────────────
            const _Label('Category *'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _category,
              isExpanded: true,
              decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14)),
              items: _kCategories.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: (v) => setState(() => _category = v!),
            ),
            const SizedBox(height: 20),

            // ── Priority ──────────────────────────────────────────
            const _Label('Priority'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _priority,
              isExpanded: true,
              decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 14)),
              items: _kPriorityOptions
                  .map((p) => DropdownMenuItem(value: p.$1, child: Text(p.$2)))
                  .toList(),
              onChanged: (v) => setState(() => _priority = v!),
            ),
            const SizedBox(height: 20),

            // ── Description ───────────────────────────────────────
            const _Label('Describe Your Issue *'),
            const SizedBox(height: 8),
            DgTextArea(
              key: const ValueKey('grievance-description'),
              controller: _textCtrl,
              focusNode: _textFocus,
              maxLines: 6,
              maxLength: 500,
              hintText: 'E.g. My caste certificate application has been pending for 5 days without any update…',
            ),
            const SizedBox(height: 20),

            if (_error != null) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 12)),
              ),
            ],

            const SizedBox(height: 28),

            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Submit Complaint', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: _submitting ? null : () => Navigator.pop(context),
                style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                child: const Text('Cancel'),
              ),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF1E293B)));
}
