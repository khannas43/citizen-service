import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../apply/common_application_form.dart';

class FamilyScreen extends StatefulWidget {
  final CitizenProfile profile;
  const FamilyScreen({super.key, required this.profile});
  @override
  State<FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends State<FamilyScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  Map<String, dynamic>? _family;
  Map<String, dynamic>? _income;
  List<Map<String, dynamic>> _beneficiaries = [];
  bool _loading = true;

  static const _relOrder = {'HEAD': 0, 'SPOUSE': 1, 'FATHER': 2, 'MOTHER': 3, 'MOTHER_IN_LAW': 3, 'SON': 4, 'DAUGHTER': 5, 'OTHER': 6};

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        fetchFamily(widget.profile.familyId),
        fetchFamilyIncome(widget.profile.familyId),
        fetchFamilyBeneficiaries(widget.profile.familyId),
      ]);
      if (!mounted) return;
      setState(() {
        _family = results[0] as Map<String, dynamic>? ?? {
          'id': widget.profile.familyId,
          'village': widget.profile.village,
          'taluka': widget.profile.taluka,
          'district': widget.profile.district,
          'members': <Map<String, dynamic>>[],
        };
        _income = results[1] as Map<String, dynamic>?;
        final raw = results[2];
        _beneficiaries = raw is List
            ? raw.whereType<Map<String, dynamic>>().toList()
            : <Map<String, dynamic>>[];
        _loading = false;
      });
    } catch (e, st) {
      debugPrint('[Family] load ERROR: $e\n$st');
      if (mounted) {
        setState(() {
          _family ??= {
            'id': widget.profile.familyId,
            'village': widget.profile.village,
            'taluka': widget.profile.taluka,
            'district': widget.profile.district,
            'members': <Map<String, dynamic>>[],
          };
          _loading = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> get _sortedMembers {
    final raw = (_family?['members'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    return [...raw]..sort((a, b) {
      final ao = _relOrder[a['relationshipToHead']] ?? 99;
      final bo = _relOrder[b['relationshipToHead']] ?? 99;
      return ao.compareTo(bo);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_family == null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const SizedBox(height: 120),
            const Center(
              child: Text('Family data unavailable', style: TextStyle(color: Color(0xFF94A3B8))),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
              ),
            ),
          ],
        ),
      );
    }

    final f = _family!;
    final subtitle = '${f['village'] ?? widget.profile.village}, ${f['taluka'] ?? widget.profile.taluka}, ${f['district'] ?? widget.profile.district}';

    return Column(children: [
      // Family summary header
      Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        color: Theme.of(context).colorScheme.surface,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.profile.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          Text(subtitle, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          const SizedBox(height: 8),
          TabBar(controller: _tabs, tabs: const [
            Tab(text: '👥 Members'),
            Tab(text: '💰 Income'),
            Tab(text: '🏛 Schemes'),
          ]),
        ]),
      ),
      Expanded(
        child: TabBarView(controller: _tabs, children: [
          _MembersTab(
            members: _sortedMembers,
            selfAadhaar: widget.profile.aadhaarRef,
            beneficiaries: _beneficiaries,
          ),
          _IncomeTab(income: _income, members: _sortedMembers),
          _SchemesTab(beneficiaries: _beneficiaries, profile: widget.profile),
        ]),
      ),
    ]);
  }
}

// ── Members Tab ───────────────────────────────────────────────────────────────

class _MembersTab extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  final String selfAadhaar;
  final List<Map<String, dynamic>> beneficiaries;
  const _MembersTab({required this.members, required this.selfAadhaar, required this.beneficiaries});

  @override
  Widget build(BuildContext context) {
    if (members.isEmpty) {
      return const Center(child: Text('No members found', style: TextStyle(color: Color(0xFF94A3B8))));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: members.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (ctx, i) {
        final m = members[i];
        final isSelf = m['aadhaarRef'] == selfAadhaar;
        final alive = m['isAlive'] as bool? ?? true;
        final rel = _relLabel(m['relationshipToHead'] as String?);
        final age = _age(m['dob'] as String?);
        final income = m['annualIncome'];
        final personSchemes = beneficiaries.where((b) => b['personId'] == m['id'] || b['personName'] == m['name']).toList();

        return InkWell(
          onTap: () => _showMemberDetail(ctx, m, personSchemes),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: alive ? Colors.white : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE8EDF3)),
            ),
            child: Row(children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: alive ? const Color(0xFFEEF2FF) : const Color(0xFFE2E8F0),
                child: Text(
                  (m['name'] as String? ?? '?').substring(0, 1),
                  style: TextStyle(color: alive ? const Color(0xFF3730A3) : const Color(0xFF94A3B8), fontWeight: FontWeight.w800, fontSize: 16),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Flexible(child: Text(
                    m['name'] as String? ?? '—',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, decoration: alive ? null : TextDecoration.lineThrough, color: alive ? const Color(0xFF1E293B) : const Color(0xFF94A3B8)),
                  )),
                  if (isSelf) Container(
                    margin: const EdgeInsets.only(left: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: const Color(0xFF3730A3), borderRadius: BorderRadius.circular(999)),
                    child: const Text('You', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700)),
                  ),
                ]),
                const SizedBox(height: 2),
                Text(
                  '$rel${age != null ? ' · $age yrs' : ''}${m['occupation'] != null ? ' · ${m['occupation']}' : ''}',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                ),
              ])),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                if (income != null) Text('₹${(income as num).toInt()}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: alive ? const Color(0xFFDCFCE7) : const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    alive ? 'Active' : 'Deceased',
                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: alive ? const Color(0xFF166534) : const Color(0xFF94A3B8)),
                  ),
                ),
              ]),
              const SizedBox(width: 8),
              const Icon(Icons.chevron_right, size: 18, color: Color(0xFFCBD5E1)),
            ]),
          ),
        );
      },
    );
  }

  void _showMemberDetail(BuildContext context, Map<String, dynamic> m, List<Map<String, dynamic>> schemes) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _MemberDetailSheet(member: m, schemes: schemes),
    );
  }

  static String _relLabel(String? r) {
    const map = {'HEAD': 'Head', 'SPOUSE': 'Spouse', 'SON': 'Son', 'DAUGHTER': 'Daughter', 'FATHER': 'Father', 'MOTHER': 'Mother', 'MOTHER_IN_LAW': 'Mother-in-law', 'OTHER': 'Other'};
    return map[r] ?? r ?? '—';
  }

  static int? _age(String? dob) {
    if (dob == null) return null;
    try {
      final dt = DateTime.parse(dob);
      final now = DateTime.now();
      int age = now.year - dt.year;
      if (now.month < dt.month || (now.month == dt.month && now.day < dt.day)) age--;
      return age;
    } catch (_) { return null; }
  }
}

// ── Member Detail Bottom Sheet ────────────────────────────────────────────────

class _MemberDetailSheet extends StatelessWidget {
  final Map<String, dynamic> member;
  final List<Map<String, dynamic>> schemes;
  const _MemberDetailSheet({required this.member, required this.schemes});

  static String _relLabel(String? r) {
    const map = {'HEAD': 'Head', 'SPOUSE': 'Spouse', 'SON': 'Son', 'DAUGHTER': 'Daughter', 'FATHER': 'Father', 'MOTHER': 'Mother', 'MOTHER_IN_LAW': 'Mother-in-law', 'OTHER': 'Other'};
    return map[r] ?? r ?? '—';
  }

  static String _fmtDate(String? iso) {
    if (iso == null) return '—';
    try { final dt = DateTime.parse(iso); final m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; return '${dt.day} ${m[dt.month-1]} ${dt.year}'; }
    catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }

  static String _mask(String? s) {
    if (s == null || s.length < 4) return '****';
    return '*' * (s.length - 4) + s.substring(s.length - 4);
  }

  @override
  Widget build(BuildContext context) {
    final alive = member['isAlive'] as bool? ?? true;
    final name = member['name'] as String? ?? '—';
    final rel = _relLabel(member['relationshipToHead'] as String?);
    final income = member['annualIncome'] as num?;

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF8FAFC),
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: ListView(controller: ctrl, padding: const EdgeInsets.all(20), children: [
          // Handle
          Center(child: Container(width: 40, height: 4, margin: const EdgeInsets.only(bottom: 16), decoration: BoxDecoration(color: const Color(0xFFCBD5E1), borderRadius: BorderRadius.circular(2)))),

          // Header
          Row(children: [
            CircleAvatar(
              radius: 26,
              backgroundColor: alive ? const Color(0xFF3730A3) : const Color(0xFF94A3B8),
              child: Text(name.substring(0, 1), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 20)),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
              Text('$rel · ${alive ? 'Active' : 'Deceased'}', style: TextStyle(fontSize: 12, color: alive ? const Color(0xFF64748B) : const Color(0xFF94A3B8))),
            ])),
            IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
          ]),

          const SizedBox(height: 20),

          // Identity section
          _DetailSection(title: '👤 Identity', rows: [
            ('Date of Birth', _fmtDate(member['dob'] as String?)),
            ('Gender', member['gender'] as String? ?? '—'),
            ('Aadhaar', _mask(member['aadhaarRef'] as String?)),
            ('Mobile', _mask(member['mobile'] as String?)),
            ('Status', alive ? 'Active' : 'Deceased'),
          ]),
          const SizedBox(height: 12),

          // Economic section
          _DetailSection(title: '💰 Economic', rows: [
            ('Occupation', member['occupation'] as String? ?? '—'),
            ('Annual Income', income != null ? '₹${income.toInt()}' : '—'),
            ('Caste Category', member['casteCategory'] as String? ?? '—'),
            ('Education', member['educationLevel'] as String? ?? '—'),
            ('Marital Status', member['maritalStatus'] as String? ?? '—'),
            ('Employment', member['employmentStatus'] as String? ?? '—'),
          ]),
          const SizedBox(height: 12),

          // Schemes section
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('🏛 Scheme Enrollments', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 10),
              if (schemes.isEmpty)
                const Text('No scheme enrollments', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)))
              else
                ...schemes.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    Expanded(child: Text(s['schemeName'] as String? ?? '—', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                    _StatusChip(s['status'] as String? ?? ''),
                  ]),
                )),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _DetailSection extends StatelessWidget {
  final String title;
  final List<(String, String)> rows;
  const _DetailSection({required this.title, required this.rows});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
        const SizedBox(height: 10),
        ...rows.map((r) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 110, child: Text(r.$1, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)))),
            Expanded(child: Text(r.$2, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
          ]),
        )),
      ]),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip(this.status);
  @override
  Widget build(BuildContext context) {
    final isActive = status == 'CONFIRMED' || status == 'ACTIVE';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isActive ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(status, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: isActive ? const Color(0xFF166534) : const Color(0xFF92400E))),
    );
  }
}

// ── Income Tab ────────────────────────────────────────────────────────────────

class _IncomeTab extends StatelessWidget {
  final Map<String, dynamic>? income;
  final List<Map<String, dynamic>> members;
  const _IncomeTab({required this.income, required this.members});

  @override
  Widget build(BuildContext context) {
    if (income == null) {
      return const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('💰', style: TextStyle(fontSize: 40)),
        SizedBox(height: 10),
        Text('Income data unavailable', style: TextStyle(color: Color(0xFF94A3B8))),
      ]));
    }

    final total = (income!['totalAnnualIncome'] as num?)?.toInt() ?? 0;
    final breakdown = (income!['breakdown'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();

    return ListView(padding: const EdgeInsets.all(16), children: [
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFF3730A3), Color(0xFF2563EB)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(children: [
          const Text('Total Annual Income', style: TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 8),
          Text('₹$total', style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w800)),
        ]),
      ),
      const SizedBox(height: 16),
      const Text('INCOME BREAKDOWN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
      const SizedBox(height: 10),
      if (breakdown.isEmpty)
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: const Text('No breakdown available', style: TextStyle(color: Color(0xFF94A3B8))),
        )
      else
        ...breakdown.map((row) {
          final personId = row['personId'];
          final memberAlive = members.firstWhere((m) => m['id'] == personId, orElse: () => {})['isAlive'] as bool? ?? true;
          final pIncome = (row['annualIncome'] as num?)?.toInt() ?? 0;
          final pctWidth = total > 0 ? (pIncome / total).clamp(0.0, 1.0) : 0.0;

          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: memberAlive ? Colors.white : const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE8EDF3)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(
                  row['name'] as String? ?? '—',
                  style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, decoration: memberAlive ? null : TextDecoration.lineThrough, color: memberAlive ? const Color(0xFF1E293B) : const Color(0xFF94A3B8)),
                )),
                Text('₹$pIncome', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF3730A3))),
              ]),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: pctWidth.toDouble(),
                  minHeight: 6,
                  backgroundColor: const Color(0xFFF1F5F9),
                  color: memberAlive ? const Color(0xFF3730A3) : const Color(0xFFCBD5E1),
                ),
              ),
            ]),
          );
        }),
    ]);
  }
}

// ── Schemes Tab ───────────────────────────────────────────────────────────────

class _SchemesTab extends StatelessWidget {
  final List<Map<String, dynamic>> beneficiaries;
  final CitizenProfile profile;
  const _SchemesTab({required this.beneficiaries, required this.profile});

  @override
  Widget build(BuildContext context) {
    final availing = beneficiaries.where((b) {
      final s = b['status'] as String? ?? '';
      return s == 'CONFIRMED' || s == 'ACTIVE';
    }).toList();
    final identified = beneficiaries.where((b) => (b['status'] as String? ?? '') == 'IDENTIFIED').toList();

    if (beneficiaries.isEmpty) {
      return const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('🏛', style: TextStyle(fontSize: 40)),
        SizedBox(height: 10),
        Text('No scheme data available', style: TextStyle(color: Color(0xFF94A3B8))),
      ]));
    }

    return ListView(padding: const EdgeInsets.all(16), children: [
      if (identified.isNotEmpty) ...[
        const Text('ELIGIBLE — APPLY NOW', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
        const SizedBox(height: 4),
        const Text('Identified as eligible — pending officer confirmation', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
        const SizedBox(height: 8),
        ...identified.map((b) => _SchemeRow(b: b, profile: profile, showApply: true)),
        const SizedBox(height: 16),
      ],
      const Text('AVAILING', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
      const SizedBox(height: 8),
      if (availing.isEmpty)
        const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: Text('Not currently availing any schemes', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))))
      else
        ...availing.map((b) => _SchemeRow(b: b, profile: profile)),
      const SizedBox(height: 16),
      const Text('ALL ENROLLMENTS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
      const SizedBox(height: 8),
      ...beneficiaries.map((b) => _SchemeRow(b: b, profile: profile)),
    ]);
  }
}

class _SchemeRow extends StatelessWidget {
  final Map<String, dynamic> b;
  final CitizenProfile profile;
  final bool showApply;
  const _SchemeRow({required this.b, required this.profile, this.showApply = false});
  @override
  Widget build(BuildContext context) {
    final reason = b['eligibilityReason'] as String? ?? '';
    final schemeName = b['schemeName'] as String? ?? b['scheme_name'] as String? ?? '—';
    final schemeId = (b['schemeId'] ?? b['scheme_id'])?.toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(schemeName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
          _StatusChip(b['status'] as String? ?? ''),
        ]),
        const SizedBox(height: 4),
        Text(b['personName'] as String? ?? '', style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
        if (reason.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(reason, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)), maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
        if (showApply) ...[
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              onPressed: () => openSchemeCaf(
                context,
                profile: profile,
                schemeId: schemeId,
                schemeName: schemeName == '—' ? null : schemeName,
              ),
              icon: const Icon(Icons.send, size: 14),
              label: const Text('Apply Now'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ]),
    );
  }
}
