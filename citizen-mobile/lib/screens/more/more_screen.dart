import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../models/application_model.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../l10n/app_strings.dart';
import '../../services/locale_service.dart';
import '../../widgets/dg_chatbot.dart';
import '../../widgets/language_toggle.dart';
import '../../utils/app_ref_utils.dart';
import '../../widgets/dg_text_field.dart';
import '../../config.dart';
import '../apply/common_application_form.dart';

class MoreScreen extends StatelessWidget {
  final CitizenProfile profile;
  const MoreScreen({super.key, required this.profile});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: LocaleService.instance,
      builder: (context, _) {
    final tiles = [
      _MoreTile(icon: '👨‍👩‍👧‍👦', label: S.t(context, 'myFamily'),        color: const Color(0xFF2563EB), onTap: () => _push(context, _FamilyScreen(profile: profile))),
      _MoreTile(icon: '🔔',        label: S.t(context, 'nav.notifications'), color: const Color(0xFFD97706), onTap: () => _push(context, _NotificationsScreen(profile: profile))),
      _MoreTile(icon: '📄',        label: S.t(context, 'nav.certificates'),  color: const Color(0xFF7C3AED), onTap: () => _push(context, _CertificatesScreen(profile: profile))),
      _MoreTile(icon: '🤖',        label: S.t(context, 'nav.chatbot'),       color: const Color(0xFF0891B2), onTap: () => _push(context, DgChatbotScreen(profile: profile))),
      _MoreTile(icon: '🗂',        label: S.t(context, 'nav.myData'),        color: const Color(0xFF059669), onTap: () => _push(context, _MyDataScreen(profile: profile))),
      _MoreTile(icon: '📞',        label: S.t(context, 'nav.contact'),       color: const Color(0xFF475569), onTap: () => _push(context, _ContactScreen())),
      _MoreTile(icon: '💳',        label: S.t(context, 'nav.payments'),       color: const Color(0xFF16A34A), onTap: () => _push(context, _PaymentsScreen(profile: profile))),
      _MoreTile(icon: '🎓',        label: S.t(context, 'nav.tutorials'),      color: const Color(0xFFEA580C), onTap: () => _push(context, _TutorialScreen())),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Profile card
        Container(
          padding: const EdgeInsets.all(16),
          margin: const EdgeInsets.only(bottom: 20),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE8EDF3)),
          ),
          child: Row(children: [
            CircleAvatar(
              radius: 28,
              backgroundColor: profile.avatarColor,
              child: Text(profile.initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18)),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(profile.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              Text('${profile.category} · ${profile.district}', style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              Text(profile.aadhaarRef, style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontFamily: 'monospace')),
            ])),
          ]),
        ),

        const SizedBox(height: 16),
        const LanguagePickerTile(),
        const SizedBox(height: 16),

        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 4,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 0.85,
          children: tiles,
        ),
      ],
    );
      },
    );
  }

  void _push(BuildContext context, Widget screen) {
    Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
  }
}

class _MoreTile extends StatelessWidget {
  final String icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _MoreTile({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE8EDF3)),
        ),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(color: color.withAlpha(20), borderRadius: BorderRadius.circular(12)),
            child: Center(child: Text(icon, style: const TextStyle(fontSize: 20))),
          ),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF1E293B)), textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}

// ── My Family ────────────────────────────────────────────────────────────────

class _FamilyScreen extends StatefulWidget {
  final CitizenProfile profile;
  const _FamilyScreen({required this.profile});
  @override State<_FamilyScreen> createState() => _FamilyScreenState();
}

class _FamilyScreenState extends State<_FamilyScreen> {
  Map<String, dynamic>? _family;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final data = await fetchFamily(widget.profile.familyId);
    if (mounted) setState(() { _family = data; _loading = false; });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My Family'), centerTitle: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _family == null
              ? const Center(child: Text('Family data unavailable'))
              : ListView(padding: const EdgeInsets.all(16), children: [
                  _SectionCard(title: '🏠 Family Details', children: [
                    _DataRow('Ration Card Number', _family!['rationCardNumber'] as String? ?? widget.profile.rationCardNumber, mono: true),
                    _DataRow('Address', _family!['address'] as String? ?? '—'),
                    _DataRow('Village', _family!['village'] as String? ?? '—'),
                    _DataRow('Taluka', _family!['taluka'] as String? ?? '—'),
                    _DataRow('District', _family!['district'] as String? ?? '—'),
                  ]),
                  const SizedBox(height: 12),
                  if (_family!['members'] is List) ...[
                    _SectionCard(title: '👨‍👩‍👧 Members', children: [
                      ...(_family!['members'] as List).map((m) => _MemberTile(m: m as Map<String, dynamic>)),
                    ]),
                  ],
                ]),
    );
  }
}

class _MemberTile extends StatelessWidget {
  final Map<String, dynamic> m;
  const _MemberTile({required this.m});
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
      child: Row(children: [
        CircleAvatar(radius: 18, backgroundColor: const Color(0xFFEEF2FF),
          child: Text((m['name'] as String? ?? '?').substring(0, 1), style: const TextStyle(color: Color(0xFF3730A3), fontWeight: FontWeight.w700))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(m['name'] as String? ?? '—', style: const TextStyle(fontWeight: FontWeight.w600)),
          Text('${m['relationship'] ?? m['relationshipToHead'] ?? ''} · ${m['gender'] ?? ''}'.trim().replaceAll(RegExp(r'^·\s*|·$'), ''), style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ])),
      ]),
    );
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────

class _NotificationsScreen extends StatefulWidget {
  final CitizenProfile profile;
  const _NotificationsScreen({required this.profile});
  @override State<_NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<_NotificationsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  // Preferences state
  final _channels = [
    {'key': 'inapp',      'label': 'In-App Notifications',   'locked': true,  'active': true,  'unconfigured': false},
    {'key': 'sms_status', 'label': 'SMS — Status Updates',   'locked': false, 'active': true,  'unconfigured': false},
    {'key': 'sms_disb',   'label': 'SMS — Disbursements',    'locked': false, 'active': true,  'unconfigured': false},
    {'key': 'whatsapp',   'label': 'WhatsApp',                'locked': false, 'active': false, 'unconfigured': true},
    {'key': 'email',      'label': 'Email',                   'locked': false, 'active': true,  'unconfigured': false},
  ];
  String _notifLang = 'en';
  String _notifFreq = 'immediate';

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _load();
  }

  @override void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    final data = await fetchNotificationsApi(widget.profile.aadhaarRef);
    if (mounted) setState(() { _items = data; _loading = false; });
  }

  Future<void> _markRead(dynamic id) async {
    try {
      await http.post(Uri.parse('$kNotifApi/v1/notifications/$id/read'), headers: {'Content-Type': 'application/json'});
      setState(() {
        _items = _items.map((n) => n['id'] == id ? {...n, 'isRead': true} : n).toList();
      });
    } catch (_) {}
  }

  static String _typeIcon(Map<String, dynamic> n) {
    final txt = '${n['title'] ?? ''} ${n['message'] ?? ''}'.toLowerCase();
    if (txt.contains('approved')) return '✅';
    if (txt.contains('disburs') || txt.contains('credit') || txt.contains('payment')) return '💰';
    if (txt.contains('clarif') || txt.contains('action required')) return '⚠️';
    if (txt.contains('scheme') || txt.contains('eligible')) return '🔔';
    return '⏳';
  }

  static bool _isActionRequired(Map<String, dynamic> n) {
    final txt = '${n['title'] ?? ''} ${n['message'] ?? ''}'.toLowerCase();
    return txt.contains('action required') || txt.contains('clarif') || txt.contains('additional information');
  }

  static String _timeAgo(String? iso) {
    if (iso == null) return '';
    try {
      final diff = DateTime.now().difference(DateTime.parse(iso));
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inHours < 1) return '${diff.inMinutes}m ago';
      if (diff.inDays < 1) return '${diff.inHours}h ago';
      if (diff.inDays == 1) return 'yesterday';
      return '${diff.inDays}d ago';
    } catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }

  @override
  Widget build(BuildContext context) {
    final unread = _items.where((n) => !(n['isRead'] as bool? ?? false)).length;
    final alerts = _items.where(_isActionRequired).length;

    return Scaffold(
      appBar: AppBar(title: const Text('🔔 Notifications'), centerTitle: false, bottom: TabBar(
        controller: _tabs,
        tabs: [
          Tab(child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Text('All'),
            if (unread > 0) ...[const SizedBox(width: 4), _NotifBadge(unread)],
          ])),
          const Tab(text: 'Preferences'),
          Tab(child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Text('Alerts'),
            if (alerts > 0) ...[const SizedBox(width: 4), _NotifBadge(alerts)],
          ])),
        ],
      )),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(controller: _tabs, children: [
              _allTab(),
              _prefsTab(),
              _alertsTab(),
            ]),
    );
  }

  Widget _allTab() {
    if (_items.isEmpty) return const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text('🔔', style: TextStyle(fontSize: 48)), SizedBox(height: 12),
      Text('No notifications yet', style: TextStyle(fontWeight: FontWeight.w600)),
    ]));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final n = _items[i];
          final read = n['isRead'] as bool? ?? false;
          return InkWell(
            onTap: () { if (!read) _markRead(n['id']); },
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: read ? Colors.white : const Color(0xFFF5F3FF),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: read ? const Color(0xFFE8EDF3) : const Color(0xFFDDD6FE)),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_typeIcon(n), style: const TextStyle(fontSize: 20)),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (n['title'] != null) Text(n['title'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                  Text(n['message'] as String? ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF475569))),
                  const SizedBox(height: 2),
                  Text(_timeAgo(n['createdAt'] as String?), style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                ])),
                if (!read) Container(width: 8, height: 8, decoration: const BoxDecoration(color: Color(0xFF7C3AED), shape: BoxShape.circle)),
              ]),
            ),
          );
        },
      ),
    );
  }

  Widget _prefsTab() {
    return ListView(padding: const EdgeInsets.all(16), children: [
      const _SectionLabel('NOTIFICATION CHANNELS'),
      const SizedBox(height: 8),
      ..._channels.map((ch) {
        final locked = ch['locked'] as bool;
        final active = ch['active'] as bool;
        final unconfigured = ch['unconfigured'] as bool;
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: Row(children: [
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(ch['label'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
              if (locked) const Text('Always On 🔒', style: TextStyle(fontSize: 10, color: Color(0xFF2563EB)))
              else if (unconfigured && !active) const Text('Not configured', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8)))
              else if (active) const Text('Active', style: TextStyle(fontSize: 10, color: Color(0xFF16A34A))),
            ])),
            if (locked) const Icon(Icons.lock_outline, size: 18, color: Color(0xFF94A3B8))
            else Switch(
              value: active,
              onChanged: (_) => setState(() => ch['active'] = !active),
            ),
          ]),
        );
      }),
      const SizedBox(height: 16),
      const _SectionLabel('NOTIFICATION LANGUAGE'),
      const SizedBox(height: 8),
      for (final (val, label) in [('en', 'English'), ('gu', 'ગુજરાતી')]) RadioListTile<String>(
        value: val, groupValue: _notifLang, title: Text(label),
        onChanged: (v) => setState(() => _notifLang = v!),
        contentPadding: EdgeInsets.zero, dense: true,
      ),
      const SizedBox(height: 12),
      const _SectionLabel('DELIVERY FREQUENCY'),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(
        value: _notifFreq,
        decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12)),
        items: const [
          DropdownMenuItem(value: 'immediate', child: Text('Immediate — as they happen')),
          DropdownMenuItem(value: 'daily',     child: Text('Daily Digest — once a day')),
        ],
        onChanged: (v) => setState(() => _notifFreq = v!),
      ),
    ]);
  }

  Widget _alertsTab() {
    final alerts = _items.where(_isActionRequired).toList();
    if (alerts.isEmpty) return const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Text('✅', style: TextStyle(fontSize: 48)), SizedBox(height: 12),
      Text('No action items', style: TextStyle(fontWeight: FontWeight.w600)),
      SizedBox(height: 4),
      Text('You\'re all caught up!', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
    ]));
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: alerts.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final n = alerts[i];
        final read = n['isRead'] as bool? ?? false;
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFFDE68A)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Text('⚠️', style: TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Expanded(child: Text(n['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
              Text(_timeAgo(n['createdAt'] as String?), style: const TextStyle(fontSize: 10, color: Color(0xFF92400E))),
            ]),
            const SizedBox(height: 6),
            Text(n['message'] as String? ?? '', style: const TextStyle(fontSize: 12, color: Color(0xFF78350F))),
            if (!read) ...[
              const SizedBox(height: 10),
              TextButton(onPressed: () => _markRead(n['id']), child: const Text('Mark as Read')),
            ],
          ]),
        );
      },
    );
  }
}

class _NotifBadge extends StatelessWidget {
  final int count;
  const _NotifBadge(this.count);
  @override Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
    decoration: BoxDecoration(color: const Color(0xFFDC2626), borderRadius: BorderRadius.circular(999)),
    child: Text('$count', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
  );
}

// ── Certificates ─────────────────────────────────────────────────────────────

// Static certs always shown — mirrors web portal STATIC_CERTS
const _kStaticCerts = [
  {
    'type': 'Income Certificate',
    'certNumber': 'CERT-INCOME-2026-04412',
    'issuedBy': 'Mamlatdar Office, Bavla',
    'issueDate': '10 Jan 2026',
    'validUntil': '09 Jan 2027',
    'status': 'APPROVED',
  },
  {
    'type': 'Domicile Certificate',
    'certNumber': 'CERT-DOM-2026-01183',
    'issuedBy': 'Mamlatdar Office, Bavla',
    'issueDate': '15 Feb 2026',
    'validUntil': 'Lifetime',
    'status': 'APPROVED',
  },
  {
    'type': 'Marriage Certificate',
    'certNumber': '—',
    'issuedBy': 'Bavla Taluka Office',
    'issueDate': '—',
    'validUntil': 'Lifetime',
    'status': 'PENDING',
  },
];

class _CertificatesScreen extends StatefulWidget {
  final CitizenProfile profile;
  const _CertificatesScreen({required this.profile});
  @override State<_CertificatesScreen> createState() => _CertificatesScreenState();
}

class _CertificatesScreenState extends State<_CertificatesScreen> {
  List<Map<String, String>> _certs = [];
  bool _loading = true;

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final apps = await fetchAllApplications(widget.profile.aadhaarRef);
    final fromApi = apps
        .where((a) => a.status == 'APPROVED' && a.service == 'caste')
        .take(1)
        .map((a) => {
              'type': 'Caste Certificate',
              'certNumber': a.displayNo,
              'issuedBy': 'Mamlatdar Office, ${widget.profile.taluka}',
              'issueDate': a.updatedAt?.substring(0, 10) ?? a.createdAt?.substring(0, 10) ?? '—',
              'validUntil': 'Lifetime',
              'status': 'APPROVED',
            })
        .toList();
    if (mounted) setState(() {
      _certs = [...fromApi, ..._kStaticCerts.map((c) => c.cast<String, String>())];
      _loading = false;
    });
  }

  void _showDownload(BuildContext ctx, Map<String, String> c) {
    showDialog(context: ctx, builder: (_) => AlertDialog(
      title: Text('⬇ ${c['type']}'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFF0F4FF), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFBFDBFE))),
          child: Column(children: [
            const Text('🏛', style: TextStyle(fontSize: 32)),
            const SizedBox(height: 8),
            const Text('Government of Gujarat', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            Text(c['type']!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Color(0xFF1B3C74))),
            const SizedBox(height: 8),
            Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6), border: Border.all(color: const Color(0xFF1B3C74))),
              child: Text(c['certNumber']!, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 1, color: Color(0xFF1B3C74)))),
          ]),
        ),
        const SizedBox(height: 12),
        _CertRow('Issued By', c['issuedBy']!),
        _CertRow('Issue Date', c['issueDate']!),
        _CertRow('Valid Until', c['validUntil']!),
        const SizedBox(height: 4),
        const Text('Verify at: verify.digitalgujarat.gov.in', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        FilledButton.icon(
          icon: const Icon(Icons.download_outlined, size: 16),
          label: const Text('Save as PDF'),
          onPressed: () {
            Navigator.pop(ctx);
            ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('📥 PDF saved to Downloads')));
          },
        ),
      ],
    ));
  }

  void _showShare(BuildContext ctx, Map<String, String> c) {
    final link = 'https://share.digitalgujarat.gov.in/cert/${c['certNumber']}?expires=7d';
    showDialog(context: ctx, builder: (_) => AlertDialog(
      title: const Text('🔗 Share Certificate'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Anyone with this link can verify the certificate for 7 days:', style: TextStyle(fontSize: 13, color: Color(0xFF64748B))),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: Text(link, style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Color(0xFF3730A3))),
        ),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
        FilledButton.icon(
          icon: const Icon(Icons.copy, size: 16),
          label: const Text('Copy Link'),
          onPressed: () async {
            Navigator.pop(ctx);
            ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('📋 Link copied to clipboard')));
          },
        ),
      ],
    ));
  }

  void _showVerify(BuildContext ctx, Map<String, String> c) {
    showDialog(context: ctx, builder: (_) => AlertDialog(
      title: const Text('✅ Verify Certificate'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        // QR mockup
        Container(
          width: 120, height: 120,
          decoration: BoxDecoration(border: Border.all(color: const Color(0xFF1B3C74), width: 2), borderRadius: BorderRadius.circular(8)),
          child: GridView.count(crossAxisCount: 5, physics: const NeverScrollableScrollPhysics(), shrinkWrap: true,
            children: List.generate(25, (i) {
              final pattern = [0,0,0,0,0, 0,1,0,1,0, 0,0,1,0,0, 0,1,0,1,0, 0,0,0,0,0];
              return Container(margin: const EdgeInsets.all(1), color: pattern[i] == 1 ? const Color(0xFF1B3C74) : Colors.white);
            }),
          ),
        ),
        const SizedBox(height: 12),
        Text(c['certNumber']!, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF1B3C74))),
        const SizedBox(height: 8),
        const Text('Scan QR or visit:', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        const Text('verify.digitalgujarat.gov.in', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Close')),
      ],
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('📄 Certificates'), centerTitle: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _certs.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (ctx, i) {
                final c = _certs[i];
                final isPending = c['status'] == 'PENDING';
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Text(c['type'] == 'Caste Certificate' ? '📜' : c['type'] == 'Income Certificate' ? '📋' : '📄', style: const TextStyle(fontSize: 22)),
                        const SizedBox(width: 10),
                        Expanded(child: Text(c['type']!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(color: isPending ? const Color(0xFFFEF3C7) : const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(999)),
                          child: Text(isPending ? '⏳ Pending' : '✅ Issued',
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isPending ? const Color(0xFF92400E) : const Color(0xFF166534))),
                        ),
                      ]),
                      const SizedBox(height: 10),
                      _CertRow('Certificate No', c['certNumber']!, mono: true),
                      _CertRow('Issued By',      c['issuedBy']!),
                      _CertRow('Issue Date',     c['issueDate']!),
                      _CertRow('Valid Until',    c['validUntil']!),
                      if (!isPending) ...[
                        const SizedBox(height: 12),
                        Wrap(spacing: 8, runSpacing: 8, children: [
                          OutlinedButton.icon(
                            onPressed: () => _showDownload(ctx, c),
                            icon: const Icon(Icons.download_outlined, size: 14),
                            label: const Text('Download PDF'),
                            style: OutlinedButton.styleFrom(textStyle: const TextStyle(fontSize: 12), padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6)),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => _showShare(ctx, c),
                            icon: const Icon(Icons.share_outlined, size: 14),
                            label: const Text('Share'),
                            style: OutlinedButton.styleFrom(textStyle: const TextStyle(fontSize: 12), padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6)),
                          ),
                          OutlinedButton.icon(
                            onPressed: () => _showVerify(ctx, c),
                            icon: const Icon(Icons.verified_outlined, size: 14),
                            label: const Text('Verify'),
                            style: OutlinedButton.styleFrom(textStyle: const TextStyle(fontSize: 12), padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6)),
                          ),
                        ]),
                      ],
                    ]),
                  ),
                );
              },
            ),
    );
  }
}

class _CertRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;
  const _CertRow(this.label, this.value, {this.mono = false});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        SizedBox(width: 100, child: Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)))),
        Expanded(child: Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, fontFamily: mono ? 'monospace' : null))),
      ]),
    );
  }
}

// ── My Data (tabbed: My Data + My Consents) ───────────────────────────────────

class _MyDataScreen extends StatefulWidget {
  final CitizenProfile profile;
  const _MyDataScreen({required this.profile});
  @override State<_MyDataScreen> createState() => _MyDataScreenState();
}

class _MyDataScreenState extends State<_MyDataScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Data & Consents'),
        centerTitle: false,
        bottom: TabBar(controller: _tabs, tabs: const [
          Tab(text: '👤 My Data'),
          Tab(text: '🔗 My Consents'),
        ]),
      ),
      body: TabBarView(controller: _tabs, children: [
        _MyDataTab(profile: widget.profile),
        _MyConsentsTab(profile: widget.profile),
      ]),
    );
  }
}

// ── My Data tab ───────────────────────────────────────────────────

class _MyDataTab extends StatefulWidget {
  final CitizenProfile profile;
  const _MyDataTab({required this.profile});
  @override State<_MyDataTab> createState() => _MyDataTabState();
}

class _MyDataTabState extends State<_MyDataTab> {
  Map<String, dynamic>? _person;
  Map<String, dynamic>? _family;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final personFuture = fetchProfile(widget.profile.aadhaarRef);
    final familyFuture = fetchFamily(widget.profile.familyId);
    final results = await Future.wait([personFuture, familyFuture]);
    if (mounted) setState(() {
      _person = results[0];
      _family = results[1];
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final p = _person ?? {};
    final f = _family ?? {};

    final personalRows = [
      ('Full Name', p['name'] as String? ?? widget.profile.name, false),
      ('Aadhaar Ref', p['aadhaarRef'] as String? ?? widget.profile.aadhaarRef, true),
      ('Date of Birth', _fmtDate(p['dob'] as String?), false),
      ('Gender', p['gender'] as String? ?? widget.profile.gender, false),
      ('Mobile', p['mobile'] as String? ?? widget.profile.phone, false),
      ('Occupation', p['occupation'] as String? ?? '—', false),
      ('Annual Income', p['annualIncome'] != null ? '₹${(p['annualIncome'] as num).toInt().toLocaleString()}' : '₹${widget.profile.annualIncome}', false),
      ('Caste Category', p['casteCategory'] as String? ?? widget.profile.category, false),
      ('Education', p['educationLevel'] as String? ?? '—', false),
      ('Marital Status', p['maritalStatus'] as String? ?? '—', false),
      ('Employment', p['employmentStatus'] as String? ?? '—', false),
      ('Ration Card Number', f['rationCardNumber'] as String? ?? widget.profile.rationCardNumber, true),
    ];

    final addressRows = [
      ('Address', f['address'] as String? ?? '—'),
      ('Village', f['village'] as String? ?? widget.profile.village),
      ('Taluka', f['taluka'] as String? ?? widget.profile.taluka),
      ('District', f['district'] as String? ?? widget.profile.district),
      ('State', f['state'] as String? ?? 'Gujarat'),
    ];

    final members = f['members'] as List<dynamic>? ?? [];

    return ListView(padding: const EdgeInsets.all(16), children: [
      // Personal info card
      _SectionCard(title: '👤 Personal Information', children: [
        ...personalRows.map((r) => _DataRow(r.$1, r.$2, mono: r.$3)),
      ]),
      const SizedBox(height: 12),

      // Address card
      _SectionCard(title: '🏠 Address', children: [
        ...addressRows.map((r) => _DataRow(r.$1, r.$2)),
      ]),
      const SizedBox(height: 12),

      // Family members
      if (members.isNotEmpty)
        _SectionCard(title: '👨‍👩‍👧 Family Members', children: [
          ...members.map((m) {
            final member = m as Map<String, dynamic>;
            final alive = member['isAlive'] as bool? ?? true;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: alive ? const Color(0xFFF8FAFC) : const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE8EDF3)),
              ),
              child: Row(children: [
                CircleAvatar(radius: 16, backgroundColor: const Color(0xFFEEF2FF),
                  child: Text((member['name'] as String? ?? '?').substring(0, 1),
                    style: TextStyle(color: const Color(0xFF3730A3), fontWeight: FontWeight.w700, fontSize: alive ? 13 : 11))),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text(member['name'] as String? ?? '—', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: alive ? const Color(0xFF1E293B) : const Color(0xFF94A3B8))),
                    if (!alive) const Text('  (deceased)', style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
                  ]),
                  Text(
                    '${_relLabel(member['relationshipToHead'] as String?)} · ${member['gender'] as String? ?? ''}'.trim().replaceAll(RegExp(r'^·\s*|·$'), ''),
                    style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                ])),
                if (member['dob'] != null)
                  Text(_fmtDate(member['dob'] as String?), style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
              ]),
            );
          }),
        ]),
    ]);
  }

  static String _fmtDate(String? iso) {
    if (iso == null) return '—';
    try {
      final dt = DateTime.parse(iso);
      final months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${dt.day} ${months[dt.month - 1]} ${dt.year}';
    } catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }

  static String _relLabel(String? r) {
    const map = {'HEAD': 'Head', 'SPOUSE': 'Spouse', 'SON': 'Son', 'DAUGHTER': 'Daughter', 'FATHER': 'Father', 'MOTHER': 'Mother', 'MOTHER_IN_LAW': 'Mother-in-law', 'OTHER': 'Other'};
    return map[r] ?? r ?? '—';
  }
}

extension on int {
  String toLocaleString() {
    final s = toString();
    if (s.length <= 3) return s;
    final last3 = s.substring(s.length - 3);
    final rest = s.substring(0, s.length - 3);
    final groups = <String>[];
    var i = rest.length;
    while (i > 0) {
      groups.insert(0, rest.substring(i < 2 ? 0 : i - 2, i));
      i -= 2;
    }
    return '${groups.join(',')},$last3';
  }
}

// ── My Consents tab ──────────────────────────────────────────────

class _MyConsentsTab extends StatefulWidget {
  final CitizenProfile profile;
  const _MyConsentsTab({required this.profile});
  @override State<_MyConsentsTab> createState() => _MyConsentsTabState();
}

class _MyConsentsTabState extends State<_MyConsentsTab> {
  List<Map<String, dynamic>> _consents = [];
  bool _loading = true;
  bool _downloading = false;
  int? _openRight;

  static const _dpdpRights = [
    ('Right to Access', 'You can request a copy of all personal data we hold about you at any time.'),
    ('Right to Correction', 'You may request correction of inaccurate or incomplete data through the My Data tab.'),
    ('Right to Erasure', 'You may request deletion of personal data that is no longer necessary for the purpose it was collected.'),
    ('Right to Portability', 'Download your data in machine-readable JSON format using the button below.'),
    ('Right to Withdraw Consent', 'You may revoke consent for any specific purpose at any time. Revocation does not affect prior lawful processing.'),
  ];

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final data = await fetchConsents(widget.profile.aadhaarRef);
    if (mounted) setState(() { _consents = data; _loading = false; });
  }

  Future<void> _revoke(Map<String, dynamic> consent) async {
    final updated = await revokeConsent(widget.profile.aadhaarRef, consent['id'].toString());
    if (updated != null && mounted) {
      setState(() { _consents = _consents.map((c) => c['id'] == consent['id'] ? updated : c).toList(); });
    }
  }

  Future<void> _restore(Map<String, dynamic> consent) async {
    final updated = await restoreConsent(widget.profile.aadhaarRef, consent['id'].toString());
    if (updated != null && mounted) {
      setState(() { _consents = _consents.map((c) => c['id'] == consent['id'] ? updated : c).toList(); });
    }
  }

  Future<void> _download() async {
    setState(() => _downloading = true);
    await fetchDataExport(widget.profile.aadhaarRef);
    setState(() => _downloading = false);
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Data export prepared — JSON downloaded'), backgroundColor: Color(0xFF16A34A)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());

    final active  = _consents.where((c) => c['status'] != 'REVOKED').toList();
    final revoked = _consents.where((c) => c['status'] == 'REVOKED').toList();

    return ListView(padding: const EdgeInsets.all(16), children: [
      // Summary strip
      Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          _ConsentStat(_consents.map((c) => c['department']).toSet().length.toString(), 'Depts'),
          _ConsentStat(active.length.toString(), 'Active'),
          _ConsentStat(revoked.length.toString(), 'Revoked'),
        ]),
      ),

      if (active.isEmpty && revoked.isEmpty)
        const Center(child: Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Text('No consent records', style: TextStyle(color: Color(0xFF94A3B8))))),

      if (active.isNotEmpty) ...[
        const _SectionLabel('Active Consents'),
        const SizedBox(height: 8),
        ...active.map((c) => _ConsentCard(consent: c, onRevoke: () => _revoke(c), onRestore: null)),
        const SizedBox(height: 16),
      ],

      if (revoked.isNotEmpty) ...[
        const _SectionLabel('Revoked Consents'),
        const SizedBox(height: 8),
        ...revoked.map((c) => _ConsentCard(consent: c, onRevoke: null, onRestore: () => _restore(c))),
        const SizedBox(height: 16),
      ],

      // DPDP Rights accordion
      const _SectionLabel('Your Data Rights (DPDP Act)'),
      const SizedBox(height: 8),
      Container(
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
        child: Column(
          children: _dpdpRights.asMap().entries.map((e) {
            final isOpen = _openRight == e.key;
            final isLast = e.key == _dpdpRights.length - 1;
            return Column(children: [
              InkWell(
                onTap: () => setState(() => _openRight = isOpen ? null : e.key),
                borderRadius: BorderRadius.vertical(
                  top: e.key == 0 ? const Radius.circular(12) : Radius.zero,
                  bottom: isLast && !isOpen ? const Radius.circular(12) : Radius.zero,
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(children: [
                    Expanded(child: Text(e.value.$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
                    Icon(isOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down, size: 18, color: const Color(0xFF64748B)),
                  ]),
                ),
              ),
              if (isOpen)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Text(e.value.$2, style: const TextStyle(fontSize: 12, color: Color(0xFF475569))),
                ),
              if (!isLast) const Divider(height: 1, color: Color(0xFFE8EDF3)),
            ]);
          }).toList(),
        ),
      ),
      const SizedBox(height: 16),

      // Download my data
      Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
        child: Column(children: [
          const Text('📥', style: TextStyle(fontSize: 36)),
          const SizedBox(height: 8),
          const Text('Download My Data', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 4),
          const Text('Get a copy of all your personal data stored in this system in JSON format.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          const SizedBox(height: 12),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Text('Format: ', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
            const Text('JSON', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
            const SizedBox(width: 16),
            const Text('Size: ', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
            const Text('~12 KB', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _downloading ? null : _download,
              icon: const Icon(Icons.download_outlined, size: 16),
              label: Text(_downloading ? 'Preparing…' : 'Download My Data'),
            ),
          ),
        ]),
      ),
      const SizedBox(height: 24),
    ]);
  }
}

class _ConsentStat extends StatelessWidget {
  final String value;
  final String label;
  const _ConsentStat(this.value, this.label);
  @override
  Widget build(BuildContext context) {
    return Expanded(child: Column(children: [
      Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: Color(0xFF3730A3))),
      Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF64748B))),
    ]));
  }
}

class _ConsentCard extends StatelessWidget {
  final Map<String, dynamic> consent;
  final VoidCallback? onRevoke;
  final VoidCallback? onRestore;
  const _ConsentCard({required this.consent, required this.onRevoke, required this.onRestore});

  static String _fmtDate(String? iso) {
    if (iso == null) return '—';
    try { final dt = DateTime.parse(iso); return '${dt.day}/${dt.month}/${dt.year}'; } catch (_) { return iso.substring(0, 10); }
  }

  @override
  Widget build(BuildContext context) {
    final isRevoked = consent['status'] == 'REVOKED';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: isRevoked ? const Color(0xFFF8FAFC) : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isRevoked ? const Color(0xFFE8EDF3) : const Color(0xFFDDD6FE)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Text('🏛 ', style: TextStyle(fontSize: 16)),
          Expanded(child: Text(consent['department'] as String? ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: isRevoked ? const Color(0xFFFEF3C7) : const Color(0xFFDCFCE7), borderRadius: BorderRadius.circular(999)),
            child: Text(isRevoked ? 'Revoked' : '● Active', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isRevoked ? const Color(0xFF92400E) : const Color(0xFF166534))),
          ),
        ]),
        const SizedBox(height: 8),
        _DataRow('Data Shared', consent['dataCategory'] as String? ?? '—'),
        _DataRow('Purpose', consent['purpose'] as String? ?? '—'),
        _DataRow('Consent Given', _fmtDate(consent['grantedAt'] as String?)),
        if (isRevoked && consent['revokedAt'] != null)
          _DataRow('Revoked On', _fmtDate(consent['revokedAt'] as String?)),
        const SizedBox(height: 8),
        if (!isRevoked && onRevoke != null)
          OutlinedButton(
            onPressed: onRevoke,
            style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFDC2626), side: const BorderSide(color: Color(0xFFDC2626)), padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), textStyle: const TextStyle(fontSize: 12)),
            child: const Text('Revoke Consent'),
          )
        else if (isRevoked && onRestore != null)
          OutlinedButton(
            onPressed: onRestore,
            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), textStyle: const TextStyle(fontSize: 12)),
            child: const Text('Restore Consent'),
          ),
      ]),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) {
    return Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.6));
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SectionCard({required this.title, required this.children});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF1E293B))),
        const SizedBox(height: 12),
        const Divider(height: 1, color: Color(0xFFE8EDF3)),
        const SizedBox(height: 10),
        ...children,
      ]),
    );
  }
}

class _DataRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;
  const _DataRow(this.label, this.value, {this.mono = false});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 120, child: Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)))),
        Expanded(child: Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, fontFamily: mono ? 'monospace' : null))),
      ]),
    );
  }
}

// ── Contact ───────────────────────────────────────────────────────────────────

class _ContactScreen extends StatelessWidget {
  const _ContactScreen();

  static const _faqs = [
    ('How long does a Caste Certificate take?',
     'Caste Certificates are typically processed within 24–48 hours of submission. You will receive an SMS and in-app notification once approved.'),
    ('What documents are required for a Pension application?',
     'You will need: Aadhaar card, age proof (birth certificate or school leaving certificate), bank passbook (first page), income certificate, and a passport-sized photograph. Documents can be uploaded digitally during the application.'),
    ('Can I apply for multiple services simultaneously?',
     'Yes. Each service application is tracked independently with its own application number. You can submit multiple applications at the same time and track each one separately from your dashboard.'),
    ('How do I update my family member details?',
     'Go to My Family in the navigation menu. From there you can view all registered family members and submit a change request. Changes are verified by the Talati office within 3–5 working days.'),
    ('What if my application is rejected?',
     'You have the right to appeal within 30 days of rejection. Go to My Applications, open the rejected application, and tap "Raise Grievance". The grievance will be reviewed by a senior officer.'),
    ('Is my data safe on Digital Gujarat?',
     'Yes. All data is stored on government-secured infrastructure under the DPDP Act 2023. You can view what data is held about you, manage consent, and download a full copy at any time from My Data & Consents.'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(title: const Text('📞 Contact Us'), centerTitle: false),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
              children: [
                for (final item in [
                  {'icon': '📞', 'title': 'Helpline',         'body': '1800-XXX-XXXX\nMon–Sat · 9 AM – 6 PM · Hindi & Gujarati'},
                  {'icon': '💬', 'title': 'DG Assist (AI)',   'body': 'Tap the 🤖 button on any screen for instant AI assistance'},
                  {'icon': '🏢', 'title': 'Nearest JSK',      'body': 'Bavla Jan Seva Kendra · 2.3 km away'},
                ]) _ContactCard(item),
                const SizedBox(height: 20),
                const _SectionLabel('FREQUENTLY ASKED QUESTIONS'),
                const SizedBox(height: 8),
                _FaqAccordion(faqs: _faqs),
                const SizedBox(height: 16),
              ],
            ),
          ),
          Material(
            elevation: 6,
            color: Colors.white,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                child: _SectionCard(
                  title: '🔍 Track Application',
                  children: const [_TrackWidget()],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ContactCard extends StatelessWidget {
  final Map<String, String> item;
  const _ContactCard(this.item);
  @override Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 10),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
    child: Row(children: [
      Text(item['icon']!, style: const TextStyle(fontSize: 22)),
      const SizedBox(width: 14),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(item['title']!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        Text(item['body']!, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
      ])),
    ]),
  );
}

class _TrackWidget extends StatefulWidget {
  const _TrackWidget();
  @override State<_TrackWidget> createState() => _TrackWidgetState();
}

class _TrackWidgetState extends State<_TrackWidget> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  bool _loading = false;
  Map<String, dynamic>? _result;
  String? _error;

  static const _services = [
    ('CAS', 'caste-certificate-service',    'Caste Certificate'),
    ('PEN', 'pension-service',              'Pension'),
    ('MAR', 'marriage-certificate-service', 'Marriage Certificate'),
    ('SCH', 'scheme-application-service',   'Scheme Application'),
    ('FAM', 'family-member-service',        'Family Member'),
  ];

  @override void dispose() { _ctrl.dispose(); _focus.dispose(); super.dispose(); }

  Future<void> _track() async {
    final raw = _ctrl.text.trim();
    if (raw.isEmpty) return;
    final ref = normalizeApplicationRef(raw);
    setState(() { _loading = true; _result = null; _error = null; });
    try {
      final prefix = RegExp(r'^(CAS|PEN|MAR|SCH|FAM)-').firstMatch(ref)?.group(1);
      Map<String, dynamic>? found;
      if (prefix != null) {
        final svc = _services.firstWhere((s) => s.$1 == prefix, orElse: () => _services[0]);
        final res = await http.get(Uri.parse('$kApiBase/${svc.$2}/v1/applications/track/${Uri.encodeComponent(ref)}')).timeout(const Duration(seconds: 15));
        if (res.statusCode == 200) found = {...jsonDecode(res.body) as Map<String, dynamic>, 'serviceLabel': svc.$3};
      } else {
        for (final svc in _services) {
          try {
            final res = await http.get(Uri.parse('$kApiBase/${svc.$2}/v1/applications/track/${Uri.encodeComponent(ref)}')).timeout(const Duration(seconds: 8));
            if (res.statusCode == 200) { found = {...jsonDecode(res.body) as Map<String, dynamic>, 'serviceLabel': svc.$3}; break; }
          } catch (_) { continue; }
        }
      }
      setState(() {
        _result = found;
        _error = found == null
            ? 'No application found for "$raw". Use format e.g. SCH-2607-000003 (with dashes).'
            : null;
        _loading = false;
      });
    } catch (_) {
      setState(() { _error = 'Could not connect to the server. Please try again.'; _loading = false; });
    }
  }

  static Color _statusColor(String? s) {
    switch (s) {
      case 'APPROVED': return const Color(0xFF16A34A);
      case 'PENDING':  return const Color(0xFFD97706);
      case 'REJECTED': return const Color(0xFFDC2626);
      default:         return const Color(0xFF64748B);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Enter your application reference number to check status without logging in:', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
      const SizedBox(height: 10),
      DgTextField(
        key: const ValueKey('track-ref-input'),
        controller: _ctrl,
        focusNode: _focus,
        enabled: !_loading,
        textCapitalization: TextCapitalization.characters,
        keyboardType: TextInputType.text,
        autocorrect: false,
        hintText: 'e.g. CAS-2601-000001',
        textInputAction: TextInputAction.search,
        onSubmitted: (_) => _track(),
      ),
      const SizedBox(height: 10),
      SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: _loading ? null : _track,
          child: _loading
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Text('Track'),
        ),
      ),
      if (_error != null) ...[
        const SizedBox(height: 10),
        Text(_error!, style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626))),
      ],
      if (_result != null) ...[
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFBBF7D0))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _DataRow('Service',   _result!['serviceLabel'] as String? ?? '—'),
            _DataRow('Reference', _result!['applicationNo'] as String? ?? _result!['engineRef'] as String? ?? '—'),
            Row(children: [
              const Text('Status', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              const Spacer(),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: _statusColor(_result!['status'] as String?), borderRadius: BorderRadius.circular(6)),
                child: Text(_result!['status'] as String? ?? '—', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700))),
            ]),
            if (_result!['currentTask'] != null) _DataRow('Current Step', _result!['currentTask'] as String),
          ]),
        ),
      ],
    ]);
  }
}

class _FaqAccordion extends StatefulWidget {
  final List<(String, String)> faqs;
  const _FaqAccordion({required this.faqs});
  @override State<_FaqAccordion> createState() => _FaqAccordionState();
}

class _FaqAccordionState extends State<_FaqAccordion> {
  int? _open;
  @override
  Widget build(BuildContext context) {
    return Column(children: widget.faqs.asMap().entries.map((e) {
      final i = e.key;
      final (q, a) = e.value;
      final isOpen = _open == i;
      return Container(
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: isOpen ? const Color(0xFF3730A3) : const Color(0xFFE8EDF3))),
        child: Column(children: [
          InkWell(
            onTap: () => setState(() => _open = isOpen ? null : i),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                Expanded(child: Text(q, style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: isOpen ? const Color(0xFF3730A3) : const Color(0xFF1E293B)))),
                Icon(isOpen ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down, size: 20, color: const Color(0xFF94A3B8)),
              ]),
            ),
          ),
          if (isOpen) Container(
            width: double.infinity, padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
            child: Text(a, style: const TextStyle(fontSize: 12, color: Color(0xFF475569), height: 1.6)),
          ),
        ]),
      );
    }).toList());
  }
}

// ── Payments ──────────────────────────────────────────────────────────────────

class _PaymentsScreen extends StatefulWidget {
  final CitizenProfile profile;
  const _PaymentsScreen({required this.profile});
  @override State<_PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<_PaymentsScreen> {
  List<Map<String, dynamic>> _beneficiaries = [];
  bool _loading = true;
  String? _error;
  String _statusFilter = 'ALL';

  static const _schemeAmounts = {
    'Old Age Pension': 1000,
    'Widow Pension': 1250,
    'Post-Matric OBC Scholarship': 25000,
    'BPL Ration Card': 850,
  };

  @override void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    debugPrint('[PAY] loading for familyId=${widget.profile.familyId}');
    try {
      final data = await fetchFamilyBeneficiaries(widget.profile.familyId);
      debugPrint('[PAY] got ${data.length} records');
      if (mounted) setState(() { _beneficiaries = data; _loading = false; });
    } catch (e) {
      debugPrint('[PAY] load failed: $e');
      if (mounted) setState(() {
        _beneficiaries = [];
        _loading = false;
        _error = 'Could not load benefits. Pull down to retry.';
      });
    }
  }

  int _amount(Map<String, dynamic> b) {
    final a = b['amount'];
    if (a != null && a is num && a > 0) return a.toInt();
    return _schemeAmounts[b['schemeName']] ?? 0;
  }

  static String _inferFrequency(String? name) {
    final n = (name ?? '').toLowerCase();
    if (n.contains('pension') || n.contains('ration')) return 'MONTHLY';
    if (n.contains('scholarship')) return 'ANNUAL';
    return 'ONE_TIME';
  }

  static String _nextCredit(String freq) {
    final now = DateTime.now();
    if (freq == 'MONTHLY') return '01 ${_monthName(now.month % 12 + 1)} ${now.month == 12 ? now.year + 1 : now.year}';
    if (freq == 'ANNUAL') return '01 Apr ${now.year + 1}';
    return '—';
  }

  static String _monthName(int m) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];

  static String _fmt(String? iso) {
    if (iso == null) return '—';
    try { final dt = DateTime.parse(iso); return '${dt.day} ${_monthName(dt.month)} ${dt.year}'; }
    catch (_) { return iso.substring(0, iso.length.clamp(0, 10)); }
  }

  // Build a flat display row with an explicit _status string.
  Map<String, dynamic> _row(Map<String, dynamic> b, String status) => {
    '_status':            status,
    'schemeName':         b['schemeName'],
    'personName':         b['personName'],
    'amount':             b['amount'],
    'disbursementStatus': b['disbursementStatus'],
    'disbursedAt':        b['disbursedAt'],
    'disbursementRef':    b['disbursementRef'],
    'eligibilityReason':  b['eligibilityReason'],
    'status':             b['status'],
    'schemeId':           b['schemeId'] ?? b['scheme_id'],
  };

  @override
  Widget build(BuildContext context) {
    // Partition into three buckets matching the web portal's logic
    final disbursed  = <Map<String, dynamic>>[];
    final processing = <Map<String, dynamic>>[];
    final eligible   = <Map<String, dynamic>>[];

    for (final b in _beneficiaries) {
      final st   = b['status']            as String? ?? '';
      final disb = b['disbursementStatus'] as String? ?? '';
      if (disb == 'DISBURSED') {
        disbursed.add(_row(b, 'CREDITED'));
      } else if (st == 'CONFIRMED' || st == 'ACTIVE') {
        processing.add(_row(b, 'PROCESSING'));
      } else if (st == 'IDENTIFIED') {
        eligible.add(_row(b, 'ELIGIBLE'));
      }
    }

    final totalReceived = disbursed.fold<int>(0, (s, b) => s + _amount(b));
    final activeCount   = processing.length;
    final nextPension   = processing.where((b) {
      final name = (b['schemeName'] as String? ?? '').toLowerCase();
      return name.contains('pension');
    }).firstOrNull;

    // Combine for the main timeline list
    final allRows = [...disbursed, ...processing];
    final List<Map<String, dynamic>> displayed;
    if (_statusFilter == 'ALL') {
      displayed = allRows;
    } else {
      displayed = allRows.where((r) => r['_status'] == _statusFilter).toList();
    }

    return Scaffold(
      appBar: AppBar(title: const Text('💰 Payments & Benefits'), centerTitle: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(16), children: [

                if (_error != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFECACA)),
                    ),
                    child: Text(_error!, style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626))),
                  ),
                ],

                // ── Summary strip ─────────────────────────────────
                Row(children: [
                  _SummaryTile('₹${_fmtAmount(totalReceived)}', 'Total Received', const Color(0xFF16A34A)),
                  const SizedBox(width: 10),
                  _SummaryTile('$activeCount', 'Active Benefits', const Color(0xFF2563EB)),
                  const SizedBox(width: 10),
                  _SummaryTile(
                    nextPension != null ? (nextPension['schemeName'] as String? ?? '—') : '—',
                    'Next Credit', const Color(0xFF7C3AED), small: true,
                  ),
                ]),
                if (nextPension != null) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(8), border: Border.all(color: const Color(0xFFBBF7D0))),
                    child: Text(
                      '₹${_fmtAmount(_amount(nextPension))} expected on ${_nextCredit(_inferFrequency(nextPension['schemeName'] as String?))}',
                      style: const TextStyle(fontSize: 12, color: Color(0xFF166534), fontWeight: FontWeight.w600)),
                  ),
                ],
                const SizedBox(height: 20),

                // ── Benefits Timeline (Credited + Processing) ─────
                const _SectionLabel('BENEFITS TIMELINE'),
                const SizedBox(height: 8),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final (v, l) in [('ALL', 'All'), ('CREDITED', '✅ Credited'), ('PROCESSING', '⏳ Processing')]) ...[
                      FilterChip(
                        label: Text(l, style: const TextStyle(fontSize: 11)),
                        selected: _statusFilter == v,
                        onSelected: (_) => setState(() => _statusFilter = v),
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        visualDensity: VisualDensity.compact,
                      ),
                      const SizedBox(width: 6),
                    ],
                  ]),
                ),
                const SizedBox(height: 10),

                if (displayed.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text('No credited or active benefit records yet.', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
                  )
                else
                  for (final b in displayed) _BenefitCard(b: b, amount: _amount(b), fmt: _fmt, fmtAmount: _fmtAmount, inferFrequency: _inferFrequency, nextCredit: _nextCredit),

                // ── Active Entitlements (mirrors web "Active Entitlements" section) ──
                if (processing.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  const _SectionLabel('ACTIVE ENTITLEMENTS'),
                  const SizedBox(height: 4),
                  const Text('Confirmed enrollments awaiting disbursement', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                  const SizedBox(height: 10),
                  for (final b in processing) _EntitlementCard(b: b, amount: _amount(b), fmtAmount: _fmtAmount, inferFrequency: _inferFrequency, nextCredit: _nextCredit),
                ],

                // ── Eligible (IDENTIFIED by scheme engine) ────────
                if (eligible.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  const _SectionLabel('SCHEME ELIGIBILITY'),
                  const SizedBox(height: 4),
                  const Text('Identified as eligible — pending officer confirmation', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                  const SizedBox(height: 10),
                  for (final b in eligible) _EligibleCard(b: b, profile: widget.profile),
                ],

                if (_beneficiaries.isEmpty) ...[
                  const Center(child: Padding(padding: EdgeInsets.symmetric(vertical: 32), child: Column(children: [
                    Text('💳', style: TextStyle(fontSize: 40)),
                    SizedBox(height: 8),
                    Text('No benefit records', style: TextStyle(fontWeight: FontWeight.w600)),
                    SizedBox(height: 4),
                    Text('Approved schemes will appear here after disbursement', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
                  ]))),
                ],

                const SizedBox(height: 24),
              ]),
            ),
    );
  }

  static String _fmtAmount(int n) {
    if (n >= 100000) return '${(n / 100000).toStringAsFixed(1)}L';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(n % 1000 == 0 ? 0 : 1)}K';
    return n.toString();
  }
}

// ── Benefit card widgets ──────────────────────────────────────────────────────

class _BenefitCard extends StatelessWidget {
  final Map<String, dynamic> b;
  final int amount;
  final String Function(String?) fmt;
  final String Function(int) fmtAmount;
  final String Function(String?) inferFrequency;
  final String Function(String) nextCredit;
  const _BenefitCard({required this.b, required this.amount, required this.fmt, required this.fmtAmount, required this.inferFrequency, required this.nextCredit});

  @override
  Widget build(BuildContext context) {
    final isCredited = b['_status'] == 'CREDITED';
    final disbRef = b['disbursementRef'] as String? ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(b['schemeName'] as String? ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: isCredited ? const Color(0xFFDCFCE7) : const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              isCredited ? '✅ Credited' : '⏳ Processing',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: isCredited ? const Color(0xFF166534) : const Color(0xFF92400E)),
            ),
          ),
        ]),
        if ((b['personName'] as String?) != null) ...[
          const SizedBox(height: 2),
          Text(b['personName'] as String, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ],
        const SizedBox(height: 8),
        Row(children: [
          Text('₹${fmtAmount(amount)}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: Color(0xFF2563EB))),
          const Spacer(),
          if (isCredited)
            Text(fmt(b['disbursedAt'] as String?), style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8)))
          else
            Text('Next: ${nextCredit(inferFrequency(b['schemeName'] as String?))}', style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
        ]),
        if (disbRef.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text('Ref: $disbRef', style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Color(0xFF94A3B8))),
        ],
      ]),
    );
  }
}

class _EntitlementCard extends StatelessWidget {
  final Map<String, dynamic> b;
  final int amount;
  final String Function(int) fmtAmount;
  final String Function(String?) inferFrequency;
  final String Function(String) nextCredit;
  const _EntitlementCard({required this.b, required this.amount, required this.fmtAmount, required this.inferFrequency, required this.nextCredit});

  @override
  Widget build(BuildContext context) {
    final freq = inferFrequency(b['schemeName'] as String?);
    final freqLabel = freq == 'MONTHLY' ? 'Monthly' : freq == 'ANNUAL' ? 'Annual' : 'One-time';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF0FDF4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFBBF7D0)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(b['schemeName'] as String? ?? '—', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF166534))),
        if ((b['personName'] as String?) != null) Text(b['personName'] as String, style: const TextStyle(fontSize: 12, color: Color(0xFF4ADE80))),
        const SizedBox(height: 6),
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(999)),
            child: Text(freqLabel, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF166534))),
          ),
          const Spacer(),
          Text('₹${fmtAmount(amount)}/cycle · Next: ${nextCredit(freq)}', style: const TextStyle(fontSize: 11, color: Color(0xFF166534))),
        ]),
      ]),
    );
  }
}

class _EligibleCard extends StatelessWidget {
  final Map<String, dynamic> b;
  final CitizenProfile profile;
  const _EligibleCard({required this.b, required this.profile});

  @override
  Widget build(BuildContext context) {
    final reason = b['eligibilityReason'] as String? ?? '';
    final schemeName = b['schemeName'] as String? ?? '—';
    final schemeId = (b['schemeId'] ?? b['scheme_id'])?.toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE8EDF3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(schemeName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(999)),
            child: const Text('🔍 Eligible', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF3730A3))),
          ),
        ]),
        if ((b['personName'] as String?) != null) Text(b['personName'] as String, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        if (reason.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(reason.split('|').take(2).join(' · '), style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
        ],
        const SizedBox(height: 8),
        FilledButton.icon(
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
      ]),
    );
  }
}

class _SummaryTile extends StatelessWidget {
  final String value, label;
  final Color color;
  final bool small;
  const _SummaryTile(this.value, this.label, this.color, {this.small = false});
  @override Widget build(BuildContext context) => Expanded(child: Container(
    padding: const EdgeInsets.all(10),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value, style: TextStyle(fontSize: small ? 11 : 16, fontWeight: FontWeight.w800, color: color), maxLines: 2, overflow: TextOverflow.ellipsis),
      Text(label, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
    ]),
  ));
}

// ── Tutorial ──────────────────────────────────────────────────────────────────

class _TutorialScreen extends StatelessWidget {
  const _TutorialScreen();
  final _steps = const [
    ['📋', 'Apply for Services', 'Go to Apply tab → choose Caste Certificate, Pension, or Scheme and fill the form.'],
    ['📍', 'Track Your Application', 'Go to Track tab to see real-time status of all submitted applications.'],
    ['🤖', 'AI Scheme Recommendations', 'Tap AI Schemes to get personalised scheme suggestions powered by Gemma AI.'],
    ['🔔', 'Grievances', 'Raise a complaint from Apply → Raise Grievance. View it in Track → Grievances tab.'],
    ['📄', 'Certificates', 'Once approved, download your certificate from More → Certificates.'],
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tutorial'), centerTitle: false),
      body: ListView.separated(
        padding: const EdgeInsets.all(20),
        itemCount: _steps.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(10)),
              child: Center(child: Text(_steps[i][0], style: const TextStyle(fontSize: 18))),
            ),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Step ${i + 1} · ${_steps[i][1]}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              const SizedBox(height: 4),
              Text(_steps[i][2], style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
            ])),
          ]),
        ),
      ),
    );
  }
}

// Public wrappers for chatbot deep-link navigation
class PaymentsBenefitsScreen extends StatelessWidget {
  final CitizenProfile profile;
  const PaymentsBenefitsScreen({super.key, required this.profile});
  @override
  Widget build(BuildContext context) => _PaymentsScreen(profile: profile);
}

class CitizenCertificatesScreen extends StatelessWidget {
  final CitizenProfile profile;
  const CitizenCertificatesScreen({super.key, required this.profile});
  @override
  Widget build(BuildContext context) => _CertificatesScreen(profile: profile);
}

class CitizenNotificationsScreen extends StatelessWidget {
  final CitizenProfile profile;
  const CitizenNotificationsScreen({super.key, required this.profile});
  @override
  Widget build(BuildContext context) => _NotificationsScreen(profile: profile);
}

class ContactUsScreen extends StatelessWidget {
  const ContactUsScreen({super.key});
  @override
  Widget build(BuildContext context) => const _ContactScreen();
}

class MyDataConsentsScreen extends StatelessWidget {
  final CitizenProfile profile;
  const MyDataConsentsScreen({super.key, required this.profile});
  @override
  Widget build(BuildContext context) => _MyDataScreen(profile: profile);
}

