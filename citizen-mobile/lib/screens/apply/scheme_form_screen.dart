import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../models/scheme_model.dart';
import '../../services/api_service.dart';
import '../../services/draft_service.dart';
import '../../widgets/readonly_field.dart';
import '../../widgets/scheme_application_check.dart';
import '_form_success_screen.dart';

class SchemeFormScreen extends StatefulWidget {
  final CitizenProfile profile;
  final String? preselectedSchemeId;
  final String? preselectedSchemeName;
  final Map<String, dynamic>? draftFields;

  const SchemeFormScreen({
    super.key,
    required this.profile,
    this.preselectedSchemeId,
    this.preselectedSchemeName,
    this.draftFields,
  });

  @override
  State<SchemeFormScreen> createState() => _SchemeFormScreenState();
}

class _SchemeFormScreenState extends State<SchemeFormScreen> {
  List<SchemeItem> _schemes = [];
  bool _loading = true;
  String? _selectedId;
  String? _selectedName;
  bool _submitting = false;
  String? _error;
  bool _blocked = false;

  @override
  void initState() {
    super.initState();
    _selectedId = widget.preselectedSchemeId ?? widget.draftFields?['schemeId'] as String?;
    _selectedName = widget.preselectedSchemeName ?? widget.draftFields?['schemeName'] as String?;
    _loadSchemes();
  }

  Future<void> _loadSchemes() async {
    final schemes = await fetchSchemes();
    if (mounted) {
      setState(() {
        _schemes = schemes;
        _loading = false;
        if (_selectedId != null) {
          final match = schemes.where((s) => s.id == _selectedId).toList();
          if (match.isNotEmpty) _selectedName = match.first.name;
        }
      });
    }
  }

  Future<void> _submit() async {
    if (_selectedId == null) {
      setState(() => _error = 'Please select a scheme');
      return;
    }
    if (_blocked) {
      setState(() => _error = 'This application cannot be submitted.');
      return;
    }

    final conn = await Connectivity().checkConnectivity();
    if (conn.contains(ConnectivityResult.none)) {
      DraftService.saveDraft(
        service: 'scheme',
        profileAadhaar: widget.profile.aadhaarRef,
        profileName: widget.profile.name,
        fields: {'schemeId': _selectedId!, 'schemeName': _selectedName ?? ''},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No internet — draft saved.'), backgroundColor: Color(0xFFD97706)),
        );
        Navigator.pop(context);
      }
      return;
    }

    setState(() { _submitting = true; _error = null; });
    try {
      final result = await submitSchemeApp(
        aadhaarRef: widget.profile.aadhaarRef,
        familyId: widget.profile.familyId,
        schemeId: _selectedId!,
        schemeName: _selectedName ?? '',
        annualIncome: widget.profile.annualIncome,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => FormSuccessScreen(result: result, service: 'Scheme Application')),
      );
    } catch (e) {
      setState(() { _error = e.toString(); _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scheme Application'), centerTitle: false),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ReadonlyField(label: 'Aadhaar Ref', value: widget.profile.aadhaarRef),
          const SizedBox(height: 12),
          ReadonlyField(label: 'Ration Card Number', value: widget.profile.rationCardNumber.isNotEmpty ? widget.profile.rationCardNumber : widget.profile.familyId),
          const SizedBox(height: 12),
          ReadonlyField(
            label: 'Annual Income',
            value: '₹${widget.profile.annualIncome.toString().replaceAllMapped(RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]},')}',
          ),
          const SizedBox(height: 20),

          const Text('Select Scheme', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 8),

          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(20), child: CircularProgressIndicator()))
          else if (_schemes.isEmpty)
            const Text('No schemes available', style: TextStyle(color: Color(0xFF94A3B8)))
          else
            DropdownButtonFormField<String>(
              value: _selectedId,
              hint: const Text('Choose a scheme'),
              decoration: const InputDecoration(),
              items: _schemes
                  .map((s) => DropdownMenuItem(value: s.id, child: Text(s.name, overflow: TextOverflow.ellipsis)))
                  .toList(),
              onChanged: (v) {
                final scheme = _schemes.firstWhere((s) => s.id == v);
                setState(() { _selectedId = v; _selectedName = scheme.name; _blocked = false; _error = null; });
              },
            ),

          if (_selectedId != null)
            SchemeApplicationCheckCard(
              schemeId: _selectedId,
              familyId: widget.profile.familyId,
              aadhaarRef: widget.profile.aadhaarRef,
              onBlockedChanged: (blocked) {
                if (mounted) setState(() => _blocked = blocked);
              },
            ),

          if (_error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFFEF2F2), borderRadius: BorderRadius.circular(10)),
              child: Text(_error!, style: const TextStyle(color: Color(0xFFDC2626), fontSize: 13)),
            ),
          ],

          const SizedBox(height: 28),
          FilledButton(
            onPressed: (_submitting || _loading || _blocked) ? null : _submit,
            child: _submitting
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Submit Application'),
          ),
        ],
      ),
    );
  }
}
