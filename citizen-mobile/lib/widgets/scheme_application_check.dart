import 'package:flutter/material.dart';
import '../models/scheme_model.dart';
import '../services/api_service.dart';

/// Live registry check against a scheme (citizen-safe wording).
class SchemeApplicationCheckCard extends StatefulWidget {
  final String? schemeId;
  final String familyId;
  final String aadhaarRef;
  final ValueChanged<bool>? onBlockedChanged;

  const SchemeApplicationCheckCard({
    super.key,
    required this.schemeId,
    required this.familyId,
    required this.aadhaarRef,
    this.onBlockedChanged,
  });

  @override
  State<SchemeApplicationCheckCard> createState() => _SchemeApplicationCheckCardState();
}

class _SchemeApplicationCheckCardState extends State<SchemeApplicationCheckCard> {
  SchemeApplicationCheckResult? _check;
  bool _loading = false;
  String? _error;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    _run();
  }

  @override
  void didUpdateWidget(covariant SchemeApplicationCheckCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.schemeId != widget.schemeId ||
        oldWidget.familyId != widget.familyId ||
        oldWidget.aadhaarRef != widget.aadhaarRef) {
      _run();
    }
  }

  Future<void> _run() async {
    final id = widget.schemeId?.trim() ?? '';
    if (id.isEmpty || widget.familyId.isEmpty) {
      _notifyBlocked(false);
      setState(() {
        _check = null;
        _error = null;
        _loading = false;
      });
      return;
    }

    final gen = ++_gen;
    _notifyBlocked(false);
    setState(() {
      _loading = true;
      _error = null;
      _check = null;
    });

    final result = await fetchSchemeApplicationCheck(
      schemeId: id,
      familyId: widget.familyId,
      aadhaar: widget.aadhaarRef,
    );
    if (!mounted || gen != _gen) return;

    if (result == null) {
      _notifyBlocked(false);
      setState(() {
        _loading = false;
        _error = 'Could not run the live check. You can still apply.';
      });
      return;
    }

    _notifyBlocked(result.blocked);
    setState(() {
      _loading = false;
      _check = result;
    });
  }

  void _notifyBlocked(bool blocked) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onBlockedChanged?.call(blocked);
    });
  }

  @override
  Widget build(BuildContext context) {
    final id = widget.schemeId?.trim() ?? '';
    if (id.isEmpty || widget.familyId.isEmpty) return const SizedBox.shrink();

    final outcome = (_check?.outcome ?? 'CLEAR').toUpperCase();
    final blocked = _check?.blocked == true || outcome == 'BLOCK';
    final colors = switch (outcome) {
      'BLOCK' => (const Color(0xFFFEF2F2), const Color(0xFFFECACA), const Color(0xFF991B1B), const Color(0xFFDC2626)),
      'REVIEW' => (const Color(0xFFFFFBEB), const Color(0xFFFDE68A), const Color(0xFF92400E), const Color(0xFFD97706)),
      'ADVICE' => (const Color(0xFFEFF6FF), const Color(0xFFBFDBFE), const Color(0xFF1E40AF), const Color(0xFF2563EB)),
      _ => (const Color(0xFFF0FDF4), const Color(0xFFBBF7D0), const Color(0xFF166534), const Color(0xFF16A34A)),
    };

    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.$1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.$2),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 8, height: 8,
              decoration: BoxDecoration(color: colors.$4, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            const Text('Live', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: Color(0xFF64748B))),
            const SizedBox(width: 8),
            const Expanded(
              child: Text('Application check', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: Color(0xFF1E293B))),
            ),
            if (!_loading && _check != null)
              Text(
                switch (outcome) {
                  'BLOCK' => 'Cannot apply',
                  'REVIEW' => 'Needs review',
                  'ADVICE' => 'Advice',
                  _ => 'Clear',
                },
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: colors.$3),
              ),
          ]),
          if (_loading) ...[
            const SizedBox(height: 10),
            const Text('Checking your family record against this scheme…',
                style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
          ],
          if (_error != null && !_loading) ...[
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(fontSize: 12, color: Color(0xFFB45309))),
          ],
          if (!_loading && _check != null) ...[
            const SizedBox(height: 8),
            Text(_check!.summary, style: TextStyle(fontSize: 12, color: colors.$3, height: 1.4)),
            if (_check!.items.isNotEmpty) ...[
              const SizedBox(height: 8),
              ..._check!.items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(
                    switch (item.level) {
                      'block' => '✕',
                      'warning' => '!',
                      'advice' => 'i',
                      _ => '✓',
                    },
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: colors.$4),
                  ),
                  const SizedBox(width: 8),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(item.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: Color(0xFF1E293B))),
                    if (item.detail.isNotEmpty)
                      Text(item.detail, style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), height: 1.35)),
                  ])),
                ]),
              )),
            ],
            const SizedBox(height: 4),
            Text(
              blocked
                  ? 'This application cannot be submitted.'
                  : 'Same registry checks officers use. This does not block your application.',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: blocked ? colors.$3 : const Color(0xFF64748B)),
            ),
          ],
        ],
      ),
    );
  }
}

const kOldAgePensionMin = 60;

bool oldAgePensionBlocked(int age, String pensionType) =>
    pensionType == 'OLD_AGE' && age < kOldAgePensionMin;

String oldAgePensionBlockedMessage({required String name, required int age}) =>
    '$name is $age years old. Old Age Pension is only for citizens aged $kOldAgePensionMin or above. This application cannot be submitted.';
