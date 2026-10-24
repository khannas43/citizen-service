import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../services/api_service.dart';
import '../../widgets/document_picker_widget.dart';
import '../../widgets/dg_text_field.dart';

const _kCategories = ['Service Delivery', 'Officer Conduct', 'Document Issue', 'Payment Delay', 'Other'];
const _kPriorities = ['LOW', 'MEDIUM', 'HIGH'];

class GrievanceFormScreen extends StatefulWidget {
  final CitizenProfile profile;
  const GrievanceFormScreen({super.key, required this.profile});

  @override
  State<GrievanceFormScreen> createState() => _GrievanceFormScreenState();
}

class _GrievanceFormScreenState extends State<GrievanceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _textCtrl = TextEditingController();
  final _refCtrl = TextEditingController();
  String _category = _kCategories[0];
  String _priority = 'MEDIUM';
  String? _docBase64;
  String? _docName;
  bool _submitting = false;
  String? _error;
  bool _done = false;
  String? _grievanceRef;

  @override
  void dispose() {
    _textCtrl.dispose();
    _refCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    final conn = await Connectivity().checkConnectivity();
    if (conn.contains(ConnectivityResult.none)) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No internet — please try again when connected.'), backgroundColor: Color(0xFFDC2626)),
        );
      }
      return;
    }

    setState(() { _submitting = true; _error = null; });
    try {
      final attachments = _docBase64 != null
          ? [{'fileName': _docName ?? 'attachment.jpg', 'data': _docBase64!, 'docType': 'Evidence'}]
          : <Map<String, String>>[];

      final result = await submitGrievance(
        aadhaarRef: widget.profile.aadhaarRef,
        citizenName: widget.profile.name,
        complaintText: _textCtrl.text.trim(),
        category: _category,
        priority: _priority,
        trackingRef: _refCtrl.text.trim().isEmpty ? null : _refCtrl.text.trim(),
        attachments: attachments,
      );
      setState(() {
        _done = true;
        _grievanceRef = result['grievanceRef'] as String? ?? result['id']?.toString();
        _submitting = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return Scaffold(
        appBar: AppBar(title: const Text('Grievance Submitted')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('✅', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 16),
                const Text('Grievance Submitted', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                if (_grievanceRef != null) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(color: const Color(0xFFF0FDF4), borderRadius: BorderRadius.circular(10)),
                    child: Text(_grievanceRef!, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700)),
                  ),
                ],
                const SizedBox(height: 12),
                const Text('An officer will review your grievance shortly.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF64748B))),
                const SizedBox(height: 28),
                FilledButton(onPressed: () => Navigator.pop(context), child: const Text('Done')),
              ],
            ),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Raise Grievance'), centerTitle: false),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('Category', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(),
              items: _kCategories.map((c) => DropdownMenuItem(value: c, child: Text(c))).toList(),
              onChanged: (v) => setState(() => _category = v!),
            ),
            const SizedBox(height: 16),

            const Text('Priority', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: _kPriorities.map((p) => ButtonSegment(value: p, label: Text(p))).toList(),
              selected: {_priority},
              onSelectionChanged: (s) => setState(() => _priority = s.first),
            ),
            const SizedBox(height: 16),

            const Text('Application Ref (optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _refCtrl,
              style: const TextStyle(color: Color(0xFF1E293B), fontSize: 15),
              cursorColor: const Color(0xFF3730A3),
              decoration: dgInputDecoration(hintText: 'e.g. CAS-2601-000001'),
            ),
            const SizedBox(height: 16),

            const Text('Describe Your Issue *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 8),
            TextFormField(
              controller: _textCtrl,
              minLines: 4,
              maxLines: 8,
              keyboardType: TextInputType.multiline,
              textCapitalization: TextCapitalization.sentences,
              style: const TextStyle(color: Color(0xFF1E293B), fontSize: 15),
              cursorColor: const Color(0xFF3730A3),
              scrollPadding: const EdgeInsets.only(bottom: 120),
              decoration: dgInputDecoration(hintText: 'Describe your complaint in detail...'),
              validator: (v) => (v == null || v.trim().length < 20) ? 'Please enter at least 20 characters' : null,
            ),
            const SizedBox(height: 16),

            const Text('Evidence / Attachment (optional)', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 10),
            DocumentPickerWidget(
              label: 'Attach Evidence',
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
                  : const Text('Submit Grievance'),
            ),
          ],
        ),
      ),
    );
  }
}
