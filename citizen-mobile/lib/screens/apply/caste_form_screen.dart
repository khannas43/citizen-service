import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../services/draft_service.dart';
import '../../widgets/document_picker_widget.dart';
import '../../widgets/readonly_field.dart';
import '_form_success_screen.dart';

const _kPurposes = ['Employment', 'Education', 'Government Scheme', 'Legal Proceedings', 'Other'];

class CasteFormScreen extends StatefulWidget {
  final CitizenProfile profile;
  final Map<String, dynamic>? draftFields;

  const CasteFormScreen({super.key, required this.profile, this.draftFields});

  @override
  State<CasteFormScreen> createState() => _CasteFormScreenState();
}

class _CasteFormScreenState extends State<CasteFormScreen> {
  final _formKey = GlobalKey<FormState>();
  String _purpose = _kPurposes[0];
  String? _docBase64;
  String? _docName;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.draftFields != null) {
      _purpose = widget.draftFields!['purpose'] as String? ?? _kPurposes[0];
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    // Offline check
    final conn = await Connectivity().checkConnectivity();
    if (conn.contains(ConnectivityResult.none)) {
      DraftService.saveDraft(
        service: 'caste',
        profileAadhaar: widget.profile.aadhaarRef,
        profileName: widget.profile.name,
        fields: {'purpose': _purpose},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No internet — draft saved. Submit from Drafts when back online.'),
            backgroundColor: Color(0xFFD97706),
          ),
        );
        Navigator.pop(context);
      }
      return;
    }

    setState(() { _submitting = true; _error = null; });
    try {
      final result = await submitCasteApp(
        name: widget.profile.name,
        aadhaarRef: widget.profile.aadhaarRef,
        casteCategory: widget.profile.category,
        purpose: _purpose,
        documentBase64: _docBase64,
        documentName: _docName,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => FormSuccessScreen(result: result, service: 'Caste Certificate')),
      );
    } catch (e) {
      setState(() { _error = e.toString(); _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Caste Certificate'), centerTitle: false),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            ReadonlyField(label: 'Full Name', value: widget.profile.name),
            const SizedBox(height: 12),
            ReadonlyField(label: 'Aadhaar Ref', value: widget.profile.aadhaarRef),
            const SizedBox(height: 12),
            ReadonlyField(label: 'Caste Category', value: widget.profile.category),
            const SizedBox(height: 20),

            const Text('Purpose of Certificate', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _purpose,
              decoration: const InputDecoration(),
              items: _kPurposes.map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
              onChanged: (v) => setState(() => _purpose = v!),
            ),
            const SizedBox(height: 20),

            const Text('Supporting Document (optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 4),
            const Text('Photo of relevant document', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8))),
            const SizedBox(height: 10),
            DocumentPickerWidget(
              label: 'Attach Document',
              onPicked: (b64, name) => setState(() { _docBase64 = b64; _docName = name; }),
              onRemoved: () => setState(() { _docBase64 = null; _docName = null; }),
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
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Submit Application'),
            ),
          ],
        ),
      ),
    );
  }
}

