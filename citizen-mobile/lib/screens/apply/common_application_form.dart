import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../models/scheme_model.dart';
import '../../services/api_service.dart';
import '../../widgets/document_picker_widget.dart';
import '../../widgets/scheme_application_check.dart';

// Services available in Phase-1 CAF (mirrors web CAF_PHASE1_SERVICES)
const _kServices = ['caste', 'pension', 'scheme'];

const _kPensionTypes = {
  'OLD_AGE':    'Old Age',
  'WIDOW':      'Widow',
  'DISABILITY': 'Disability',
};

const _kStepLabels = ['Common Profile', 'Select Services', 'Service Details', 'Documents', 'Review & Submit'];

// ── Entry point ───────────────────────────────────────────────────────────────

void openSchemeCaf(
  BuildContext context, {
  required CitizenProfile profile,
  String? schemeId,
  String? schemeName,
}) {
  Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => CommonApplicationForm(
        profile: profile,
        preselectedService: 'scheme',
        preselectedSchemeId: schemeId,
        preselectedSchemeName: schemeName,
      ),
    ),
  );
}

class CommonApplicationForm extends StatefulWidget {
  final CitizenProfile profile;
  final String? preselectedService;
  final String? preselectedSchemeId;
  final String? preselectedSchemeName;

  const CommonApplicationForm({
    super.key,
    required this.profile,
    this.preselectedService,
    this.preselectedSchemeId,
    this.preselectedSchemeName,
  });

  @override
  State<CommonApplicationForm> createState() => _CommonApplicationFormState();
}

class _CommonApplicationFormState extends State<CommonApplicationForm> {
  int _step = 0; // 0-indexed: 0=profile, 1=services, 2=details, 3=docs, 4=review

  // Step 1 — services
  final Set<String> _selected = {};
  // Step 2 — details per service
  String _pensionType = 'WIDOW';
  String _schemeId    = '';
  String _schemeName  = '';
  String _castePurpose = 'Employment'; // caste has no extra field in web CAF, but we keep purpose
  // Step 3 — docs
  String? _docBase64;
  String? _docName;
  List<SchemeItem> _schemes = [];
  bool _schemesLoading = false;

  String? _stepError;
  bool _submitting = false;
  List<Map<String, dynamic>>? _results;
  bool _schemeBlocked = false;

  bool get _pensionAgeBlocked =>
      _selected.contains('pension') && oldAgePensionBlocked(widget.profile.age, _pensionType);

  List<String> get _submittableServices => _selected.where((svc) {
    if (svc == 'scheme' && _schemeBlocked) return false;
    if (svc == 'pension' && _pensionAgeBlocked) return false;
    return true;
  }).toList();

  @override
  void initState() {
    super.initState();
    if (widget.preselectedService != null && _kServices.contains(widget.preselectedService)) {
      _selected.add(widget.preselectedService!);
    }
    final sid = widget.preselectedSchemeId?.trim() ?? '';
    final sname = widget.preselectedSchemeName?.trim() ?? '';
    if (sid.isNotEmpty || sname.isNotEmpty) {
      _selected.add('scheme');
      _schemeId = sid;
      _schemeName = sname;
      _step = 2; // Service Details — matches web CAF step 3
      _loadSchemes();
    }
  }

  // ── Validation ───────────────────────────────────────────────────────────────

  String? _validate() {
    switch (_step) {
      case 1:
        if (_selected.isEmpty) return 'Select at least one service to continue.';
        break;
      case 2:
        if (_selected.contains('pension') && _pensionType.isEmpty) return 'Pension type is required.';
        if (_selected.contains('scheme') && _schemeId.isEmpty) return 'Scheme selection is required.';
        break;
      case 4:
        if (_submittableServices.isEmpty) {
          if (_schemeBlocked && _selected.contains('scheme')) {
            return 'This application cannot be submitted.';
          }
          if (_pensionAgeBlocked) {
            return oldAgePensionBlockedMessage(name: widget.profile.name, age: widget.profile.age);
          }
        }
        break;
    }
    return null;
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  void _goNext() {
    final err = _validate();
    if (err != null) { setState(() => _stepError = err); return; }
    setState(() { _stepError = null; _step++; });
    // Load schemes when entering details if scheme selected
    if (_step == 2 && _selected.contains('scheme') && _schemes.isEmpty) _loadSchemes();
  }

  void _goBack() {
    if (_step == 0) { Navigator.pop(context); return; }
    setState(() { _step--; _stepError = null; });
  }

  Future<void> _loadSchemes() async {
    setState(() => _schemesLoading = true);
    final s = await fetchSchemes();
    if (!mounted) return;
    var id = _schemeId;
    var name = _schemeName;
    SchemeItem? match;
    if (id.isNotEmpty) {
      final byId = s.where((x) => x.id == id);
      if (byId.isNotEmpty) match = byId.first;
    }
    if (match == null && name.isNotEmpty) {
      final byName = s.where((x) => x.name == name);
      if (byName.isNotEmpty) match = byName.first;
    }
    if (match != null) {
      id = match.id;
      name = match.name;
    }
    setState(() {
      _schemes = s;
      _schemeId = id;
      _schemeName = name;
      _schemesLoading = false;
    });
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  Future<void> _submitAll() async {
    final toSubmit = _submittableServices;
    if (toSubmit.isEmpty) {
      setState(() {
        _stepError = _schemeBlocked && _selected.contains('scheme')
            ? 'This application cannot be submitted.'
            : _pensionAgeBlocked
                ? oldAgePensionBlockedMessage(name: widget.profile.name, age: widget.profile.age)
                : 'No services can be submitted.';
      });
      return;
    }

    setState(() { _submitting = true; _stepError = null; });

    final results = <Map<String, dynamic>>[];

    for (final svc in toSubmit) {
      try {
        Map<String, dynamic> result;
        if (svc == 'caste') {
          result = await submitCasteApp(
            name: widget.profile.name,
            aadhaarRef: widget.profile.aadhaarRef,
            casteCategory: widget.profile.category,
            purpose: _castePurpose,
            documentBase64: _docBase64,
            documentName: _docName,
          );
        } else if (svc == 'pension') {
          result = await submitPensionApp(
            name: widget.profile.name,
            aadhaarRef: widget.profile.aadhaarRef,
            familyId: widget.profile.familyId,
            pensionType: _pensionType,
            documentBase64: _docBase64,
            documentName: _docName,
          );
        } else if (svc == 'scheme') {
          result = await submitSchemeApp(
            aadhaarRef: widget.profile.aadhaarRef,
            familyId: widget.profile.familyId,
            schemeId: _schemeId,
            schemeName: _schemeName,
            annualIncome: widget.profile.annualIncome,
          );
        } else {
          continue;
        }
        results.add({'service': svc, 'ok': true, 'data': result});
      } catch (e) {
        results.add({'service': svc, 'ok': false, 'error': e.toString()});
      }
    }

    if (mounted) setState(() { _results = results; _submitting = false; });
  }

  // ── Service label helpers ─────────────────────────────────────────────────────

  static String _serviceLabel(String svc) {
    switch (svc) {
      case 'caste':  return 'Caste Certificate';
      case 'pension': return 'Pension Application';
      case 'scheme': return 'Scheme Application';
      default: return svc;
    }
  }

  static String _serviceIcon(String svc) {
    switch (svc) {
      case 'caste':  return '📜';
      case 'pension': return '🧓';
      case 'scheme': return '🏛';
      default: return '📋';
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // Show results screen after successful submit
    if (_results != null) return _ResultsScreen(results: _results!, profile: widget.profile);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Common Application Form'),
        centerTitle: false,
        leading: IconButton(icon: const Icon(Icons.arrow_back), onPressed: _goBack),
      ),
      body: Column(children: [
        // ── Step indicator ─────────────────────────────────────────────
        _StepBar(currentStep: _step, labels: _kStepLabels),

        if (_stepError != null)
          Container(
            width: double.infinity,
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(8)),
            child: Text(_stepError!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 12)),
          ),

        // ── Step content ───────────────────────────────────────────────
        Expanded(child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _buildStepContent(),
        )),

        // ── Navigation buttons ─────────────────────────────────────────
        Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0xFFE8EDF3)))),
          child: Row(children: [
            if (_step > 0) ...[
              Expanded(child: OutlinedButton(
                onPressed: _submitting ? null : _goBack,
                child: const Text('← Previous'),
              )),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: (_submitting || (_step == 4 && _submittableServices.isEmpty))
                    ? null
                    : (_step == 4 ? _submitAll : _goNext),
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                child: _submitting
                    ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(_step == 4 ? 'Submit All Applications' : 'Continue →',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
              ),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _buildStepContent() {
    switch (_step) {
      case 0: return _buildProfileStep();
      case 1: return _buildServicesStep();
      case 2: return _buildDetailsStep();
      case 3: return _buildDocumentsStep();
      case 4: return _buildReviewStep();
      default: return const SizedBox.shrink();
    }
  }

  // ── Step 0: Common Profile ────────────────────────────────────────────────────

  Widget _buildProfileStep() {
    final p = widget.profile;
    final income = p.annualIncome > 0 ? '₹${_fmtIncome(p.annualIncome)}' : null;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFF0F4FF), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFBFDBFE))),
        child: const Row(children: [
          Text('🔒 ', style: TextStyle(fontSize: 16)),
          Expanded(child: Text('All fields below are from your family registry and cannot be changed here.',
              style: TextStyle(fontSize: 12, color: Color(0xFF1E40AF)))),
        ]),
      ),
      const SizedBox(height: 20),
      _LockedField('Full Name',     p.name),
      _LockedField('Aadhaar Ref',   p.aadhaarRef),
      _LockedField('Ration Card Number', p.rationCardNumber.isNotEmpty ? p.rationCardNumber : p.familyId),
      _LockedField('District',      p.district),
      _LockedField('Taluka',        p.taluka),
      _LockedField('Caste Category', p.category),
      if (income != null) _LockedField('Annual Income (family)', income, hint: 'From family registry'),
    ]);
  }

  // ── Step 1: Select Services ───────────────────────────────────────────────────

  Widget _buildServicesStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Select one or more services for this application.',
          style: TextStyle(fontSize: 13, color: Color(0xFF64748B))),
      const SizedBox(height: 16),
      ..._kServices.map((key) {
        final isSelected = _selected.contains(key);
        return GestureDetector(
          onTap: () => setState(() {
            isSelected ? _selected.remove(key) : _selected.add(key);
            _stepError = null;
          }),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFFEEF2FF) : Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isSelected ? const Color(0xFF3730A3) : const Color(0xFFE8EDF3),
                width: isSelected ? 2 : 1,
              ),
            ),
            child: Row(children: [
              Text(_serviceIcon(key), style: const TextStyle(fontSize: 28)),
              const SizedBox(width: 14),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(_serviceLabel(key), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14,
                    color: isSelected ? const Color(0xFF3730A3) : const Color(0xFF1E293B))),
                Text(_serviceDesc(key), style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ])),
              if (isSelected)
                Container(width: 24, height: 24,
                  decoration: const BoxDecoration(color: Color(0xFF3730A3), shape: BoxShape.circle),
                  child: const Icon(Icons.check, size: 16, color: Colors.white))
              else
                Container(width: 24, height: 24,
                  decoration: BoxDecoration(border: Border.all(color: const Color(0xFFCBD5E1)), shape: BoxShape.circle)),
            ]),
          ),
        );
      }),
    ]);
  }

  static String _serviceDesc(String svc) {
    switch (svc) {
      case 'caste':  return 'OBC / SC / ST category certificate for employment, education or legal use';
      case 'pension': return 'Old age, widow or disability pension from state government';
      case 'scheme': return 'Apply for welfare and social benefit schemes';
      default: return '';
    }
  }

  // ── Step 2: Service Details ───────────────────────────────────────────────────

  Widget _buildDetailsStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      ..._selected.map((key) {
        return Container(
          margin: const EdgeInsets.only(bottom: 20),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_serviceIcon(key)} ${_serviceLabel(key)}',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: Color(0xFF1E293B))),
            const Divider(height: 20),
            if (key == 'caste') _buildCasteDetails(),
            if (key == 'pension') _buildPensionDetails(),
            if (key == 'scheme') _buildSchemeDetails(),
          ]),
        );
      }),
    ]);
  }

  Widget _buildCasteDetails() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    _LockedField('Name',           widget.profile.name),
    _LockedField('Aadhaar Ref',    widget.profile.aadhaarRef),
    _LockedField('Caste Category', widget.profile.category),
    Container(margin: const EdgeInsets.only(top: 8), padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: const Color(0xFFFFFBEB), borderRadius: BorderRadius.circular(8)),
      child: const Text('Caste category is taken from your family record and cannot be changed here.',
          style: TextStyle(fontSize: 11, color: Color(0xFF92400E)))),
  ]);

  Widget _buildPensionDetails() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    _LockedField('Name',       widget.profile.name),
    _LockedField('Ration Card Number', widget.profile.rationCardNumber.isNotEmpty ? widget.profile.rationCardNumber : widget.profile.familyId),
    const SizedBox(height: 12),
    const Text('Pension Type *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
    const SizedBox(height: 8),
    DropdownButtonFormField<String>(
      value: _pensionType,
      isExpanded: true,
      decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12)),
      items: _kPensionTypes.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
      onChanged: (v) => setState(() => _pensionType = v!),
    ),
    if (_pensionAgeBlocked) ...[
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))),
        child: Text(
          oldAgePensionBlockedMessage(name: widget.profile.name, age: widget.profile.age),
          style: const TextStyle(fontSize: 12, color: Color(0xFF991B1B), height: 1.4),
        ),
      ),
    ],
  ]);

  Widget _buildSchemeDetails() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    _LockedField('Ration Card Number', widget.profile.rationCardNumber.isNotEmpty ? widget.profile.rationCardNumber : widget.profile.familyId),
    _LockedField('Declared Income',  widget.profile.annualIncome > 0 ? '₹${_fmtIncome(widget.profile.annualIncome)}' : '—'),
    const SizedBox(height: 12),
    const Text('Scheme *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
    const SizedBox(height: 8),
    if (_schemesLoading)
      const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator()))
    else DropdownButtonFormField<String>(
      value: _schemes.any((s) => s.id == _schemeId) ? _schemeId : null,
      isExpanded: true,
      decoration: const InputDecoration(contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12)),
      hint: const Text('— Select a scheme —'),
      items: _schemes.map((s) => DropdownMenuItem(value: s.id, child: Text(s.name, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: (v) {
        final s = _schemes.firstWhere((x) => x.id == v!, orElse: () => SchemeItem(id: v!, name: ''));
        setState(() { _schemeId = v!; _schemeName = s.name; _schemeBlocked = false; });
      },
    ),
    if (_schemeId.isNotEmpty)
      SchemeApplicationCheckCard(
        schemeId: _schemeId,
        familyId: widget.profile.familyId,
        aadhaarRef: widget.profile.aadhaarRef,
        onBlockedChanged: (blocked) {
          if (mounted) setState(() => _schemeBlocked = blocked);
        },
      ),
  ]);

  // ── Step 3: Documents ─────────────────────────────────────────────────────────

  Widget _buildDocumentsStep() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFEFF6FF), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFBFDBFE))),
        child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('📂 ', style: TextStyle(fontSize: 18)),
          Expanded(child: Text(
            'Documents are fetched automatically from your Aadhaar authentication and DigiLocker and auto-attached. Upload additional documents only if required by an officer.',
            style: TextStyle(fontSize: 12, color: Color(0xFF1E40AF)))),
        ]),
      ),
      const SizedBox(height: 20),

      // Auto-attached docs
      _SectionHeader('VERIFIED DOCUMENTS (AUTO-ATTACHED)'),
      const SizedBox(height: 10),
      for (final svc in _selected) Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFBBF7D0))),
        child: Row(children: [
          const Text('🔒', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_serviceLabel(svc)} — Aadhaar eKYC', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12)),
            const Text('Auto-attached via UIDAI', style: TextStyle(fontSize: 11, color: Color(0xFF166534))),
          ])),
          const Icon(Icons.verified, size: 18, color: Color(0xFF16A34A)),
        ]),
      ),

      const SizedBox(height: 20),
      _SectionHeader('ADDITIONAL DOCUMENT (OPTIONAL)'),
      const SizedBox(height: 8),
      const Text('Attach only if specifically requested by the processing officer.',
          style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
      const SizedBox(height: 10),
      DocumentPickerWidget(
        label: _docName != null ? '📎 $_docName' : 'Attach Additional Document',
        onPicked: (b64, name) => setState(() { _docBase64 = b64; _docName = name; }),
        onRemoved: () => setState(() { _docBase64 = null; _docName = null; }),
      ),
    ]);
  }

  // ── Step 4: Review ────────────────────────────────────────────────────────────

  Widget _buildReviewStep() {
    final income = widget.profile.annualIncome > 0 ? '₹${_fmtIncome(widget.profile.annualIncome)}' : '—';
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Profile summary
      _SectionHeader('COMMON PROFILE'),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: const Color(0xFFE8EDF3))),
        child: Column(children: [
          _DataRowSmall('Name',             widget.profile.name),
          _DataRowSmall('Caste Category',   widget.profile.category),
          _DataRowSmall('Location',         '${widget.profile.taluka}, ${widget.profile.district}'),
          _DataRowSmall('Annual Income',    income),
        ]),
      ),
      const SizedBox(height: 20),

      // Per-service summary
      _SectionHeader('SERVICES TO SUBMIT'),
      const SizedBox(height: 10),
      ..._selected.map((svc) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFEEF2FF), borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFC7D2FE)),
        ),
        child: Row(children: [
          Text(_serviceIcon(svc), style: const TextStyle(fontSize: 24)),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_serviceLabel(svc), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF3730A3))),
            Text(_summaryLine(svc), style: const TextStyle(fontSize: 12, color: Color(0xFF4338CA))),
          ])),
          const Icon(Icons.check_circle, color: Color(0xFF4338CA), size: 20),
        ]),
      )),

      if (_schemeBlocked && _selected.contains('scheme')) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))),
          child: const Text('This scheme application cannot be submitted.',
              style: TextStyle(fontSize: 12, color: Color(0xFF991B1B))),
        ),
      ],
      if (_pensionAgeBlocked) ...[
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFFECACA))),
          child: Text(oldAgePensionBlockedMessage(name: widget.profile.name, age: widget.profile.age),
              style: const TextStyle(fontSize: 12, color: Color(0xFF991B1B))),
        ),
      ],

      const SizedBox(height: 16),
      _SectionHeader('DOCUMENTS'),
      const SizedBox(height: 8),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFE8EDF3))),
        child: Text(
          '${_selected.length} verified document${_selected.length != 1 ? 's' : ''} auto-attached via Aadhaar eKYC'
          '${_docName != null ? ' · 1 additional upload ($_docName)' : ''}.',
          style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
        ),
      ),
    ]);
  }

  String _summaryLine(String svc) {
    if (svc == 'caste')  return '${widget.profile.name} · ${widget.profile.category}';
    if (svc == 'pension') return '${widget.profile.name} · ${_kPensionTypes[_pensionType] ?? _pensionType}';
    if (svc == 'scheme') return _schemeName.isNotEmpty ? _schemeName : '— select scheme —';
    return '';
  }

  static String _fmtIncome(int n) => n.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},');
}

// ── Results screen (mirrors web submit-results view) ─────────────────────────

class _ResultsScreen extends StatelessWidget {
  final List<Map<String, dynamic>> results;
  final CitizenProfile profile;
  const _ResultsScreen({required this.results, required this.profile});

  @override
  Widget build(BuildContext context) {
    final successCount = results.where((r) => r['ok'] == true).length;
    final allOk = successCount == results.length;

    return Scaffold(
      appBar: AppBar(title: const Text('Application Submitted'), centerTitle: false, automaticallyImplyLeading: false),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        Center(child: Column(children: [
          Text(allOk ? '✅' : '⚠️', style: const TextStyle(fontSize: 48)),
          const SizedBox(height: 8),
          Text('$successCount of ${results.length} Service${results.length != 1 ? 's' : ''} Submitted',
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 4),
          Text('$successCount submitted successfully out of ${results.length} total.',
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ])),
        const SizedBox(height: 24),

        ...results.map((r) {
          final ok = r['ok'] as bool;
          final svc = r['service'] as String;
          final data = r['data'] as Map<String, dynamic>?;
          final err  = r['error'] as String?;
          final appNo = data?['applicationNo'] as String? ?? data?['engineRef'] as String? ?? '—';

          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: ok ? const Color(0xFFF0FDF4) : const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: ok ? const Color(0xFFBBF7D0) : const Color(0xFFFECACA)),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(ok ? '✓' : '✗', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ok ? const Color(0xFF16A34A) : const Color(0xFFDC2626))),
                const SizedBox(width: 8),
                Expanded(child: Text(_serviceLabel(svc), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
              ]),
              if (ok) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(6), border: Border.all(color: const Color(0xFFBBF7D0))),
                  child: Text(appNo, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w800, fontSize: 13, color: Color(0xFF16A34A))),
                ),
                const SizedBox(height: 4),
                const Text('Status: PENDING', style: TextStyle(fontSize: 11, color: Color(0xFF64748B))),
              ] else ...[
                const SizedBox(height: 6),
                Text(err ?? 'Submission failed.', style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626))),
              ],
            ]),
          );
        }),

        const SizedBox(height: 24),
        FilledButton.icon(
          icon: const Icon(Icons.track_changes),
          label: const Text('Track My Applications'),
          style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
          onPressed: () {
            Navigator.of(context).popUntil((route) => route.isFirst);
          },
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
          child: const Text('Back to Home'),
        ),
      ]),
    );
  }

  static String _serviceLabel(String svc) {
    switch (svc) {
      case 'caste':  return 'Caste Certificate';
      case 'pension': return 'Pension Application';
      case 'scheme': return 'Scheme Application';
      default: return svc;
    }
  }
}

// ── Shared widgets ────────────────────────────────────────────────────────────

class _StepBar extends StatelessWidget {
  final int currentStep;
  final List<String> labels;
  const _StepBar({required this.currentStep, required this.labels});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFF8FAFC),
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      child: Row(children: labels.asMap().entries.map((e) {
        final i = e.key;
        final done   = i < currentStep;
        final active = i == currentStep;
        return Expanded(child: Row(mainAxisSize: MainAxisSize.min, children: [
          Expanded(child: Column(children: [
            Container(
              width: 28, height: 28,
              decoration: BoxDecoration(
                color: done ? const Color(0xFF16A34A) : active ? const Color(0xFF3730A3) : const Color(0xFFE2E8F0),
                shape: BoxShape.circle,
              ),
              child: Center(child: done
                  ? const Icon(Icons.check, size: 14, color: Colors.white)
                  : Text('${i + 1}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800,
                      color: active ? Colors.white : const Color(0xFF94A3B8)))),
            ),
            const SizedBox(height: 4),
            Text(e.value, style: TextStyle(fontSize: 8, fontWeight: FontWeight.w600,
                color: active ? const Color(0xFF3730A3) : done ? const Color(0xFF16A34A) : const Color(0xFF94A3B8)),
                textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.visible),
          ])),
          if (i < labels.length - 1)
            Container(height: 1.5, width: 8, color: done ? const Color(0xFF16A34A) : const Color(0xFFE2E8F0)),
        ]));
      }).toList()),
    );
  }
}

class _LockedField extends StatelessWidget {
  final String label;
  final String value;
  final String? hint;
  const _LockedField(this.label, this.value, {this.hint});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF64748B))),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(color: const Color(0xFFF1F5F9), borderRadius: BorderRadius.circular(8)),
          child: Row(children: [
            const Text('🔒 ', style: TextStyle(fontSize: 12)),
            Expanded(child: Text(value, style: const TextStyle(fontSize: 13, color: Color(0xFF334155), fontWeight: FontWeight.w500))),
          ]),
        ),
        if (hint != null) Padding(
          padding: const EdgeInsets.only(top: 3, left: 4),
          child: Text(hint!, style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8))),
        ),
      ]),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);
  @override
  Widget build(BuildContext context) =>
      Text(text, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8));
}

class _DataRowSmall extends StatelessWidget {
  final String label;
  final String value;
  const _DataRowSmall(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      Expanded(flex: 2, child: Text(label, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)))),
      Expanded(flex: 3, child: Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600), textAlign: TextAlign.end)),
    ]),
  );
}
