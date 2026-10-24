import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../services/draft_service.dart';
import '../../widgets/document_picker_widget.dart';
import '../../widgets/readonly_field.dart';
import '../../widgets/scheme_application_check.dart';
import '_form_success_screen.dart';

const _kPensionTypes = {
  'OLD_AGE': 'Old Age Pension',
  'WIDOW': 'Widow Pension',
  'DISABILITY': 'Disability Pension',
  'DESTITUTE': 'Destitute Pension',
};

class PensionFormScreen extends StatefulWidget {
  final CitizenProfile profile;
  final Map<String, dynamic>? draftFields;

  const PensionFormScreen({super.key, required this.profile, this.draftFields});

  @override
  State<PensionFormScreen> createState() => _PensionFormScreenState();
}

class _PensionFormScreenState extends State<PensionFormScreen> {
  String _pensionType = 'OLD_AGE';
  String? _docBase64;
  String? _docName;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.draftFields != null) {
      _pensionType = widget.draftFields!['pensionType'] as String? ?? 'OLD_AGE';
    } else if (widget.profile.age >= 60) {
      _pensionType = 'OLD_AGE';
    }
  }

  bool get _oldAgeBlocked => oldAgePensionBlocked(widget.profile.age, _pensionType);

  Future<void> _submit() async {
    if (_oldAgeBlocked) {
      setState(() => _error = oldAgePensionBlockedMessage(name: widget.profile.name, age: widget.profile.age));
      return;
    }
    final conn = await Connectivity().checkConnectivity();
    if (conn.contains(ConnectivityResult.none)) {
      DraftService.saveDraft(
        service: 'pension',
        profileAadhaar: widget.profile.aadhaarRef,
        profileName: widget.profile.name,
        fields: {'pensionType': _pensionType},
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
      final result = await submitPensionApp(
        name: widget.profile.name,
        aadhaarRef: widget.profile.aadhaarRef,
        familyId: widget.profile.familyId,
        pensionType: _pensionType,
        documentBase64: _docBase64,
        documentName: _docName,
      );
      if (!mounted) return;
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => FormSuccessScreen(result: result, service: 'Pension Application')),
      );
    } catch (e) {
      setState(() { _error = e.toString(); _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Pension Application'), centerTitle: false),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ReadonlyField(label: 'Full Name', value: widget.profile.name),
          const SizedBox(height: 12),
          ReadonlyField(label: 'Aadhaar Ref', value: widget.profile.aadhaarRef),
          const SizedBox(height: 12),
          ReadonlyField(label: 'Age', value: '${widget.profile.age} years'),
          const SizedBox(height: 20),

          const Text('Pension Type', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _pensionType,
            decoration: const InputDecoration(),
            items: _kPensionTypes.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                .toList(),
            onChanged: (v) => setState(() { _pensionType = v!; _error = null; }),
          ),
          if (_oldAgeBlocked) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: Text(
                oldAgePensionBlockedMessage(name: widget.profile.name, age: widget.profile.age),
                style: const TextStyle(fontSize: 13, color: Color(0xFF991B1B), height: 1.4),
              ),
            ),
          ],
          const SizedBox(height: 20),

          const Text('Supporting Document (optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 10),
          DocumentPickerWidget(
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
            onPressed: (_submitting || _oldAgeBlocked) ? null : _submit,
            child: _submitting
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Submit Application'),
          ),
        ],
      ),
    );
  }
}
