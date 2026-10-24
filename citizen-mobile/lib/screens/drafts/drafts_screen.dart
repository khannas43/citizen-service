import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../services/draft_service.dart';
import '../apply/caste_form_screen.dart';
import '../apply/pension_form_screen.dart';
import '../apply/scheme_form_screen.dart';

class DraftsScreen extends StatefulWidget {
  final CitizenProfile profile;
  const DraftsScreen({super.key, required this.profile});

  @override
  State<DraftsScreen> createState() => _DraftsScreenState();
}

class _DraftsScreenState extends State<DraftsScreen> {
  List<DraftRecord> _drafts = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    setState(() => _drafts = DraftService.listDrafts(widget.profile.aadhaarRef));
  }

  void _delete(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Draft?'),
        content: const Text('This draft will be permanently removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed == true) {
      DraftService.deleteDraft(id);
      _load();
    }
  }

  void _submit(DraftRecord draft) {
    Widget screen;
    switch (draft.service) {
      case 'caste':
        screen = CasteFormScreen(profile: widget.profile, draftFields: draft.fields);
        break;
      case 'pension':
        screen = PensionFormScreen(profile: widget.profile, draftFields: draft.fields);
        break;
      case 'scheme':
        screen = SchemeFormScreen(profile: widget.profile, draftFields: draft.fields);
        break;
      default:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Cannot resume ${draft.service} draft')),
        );
        return;
    }

    Navigator.push(context, MaterialPageRoute(builder: (_) => screen)).then((_) => _load());
  }

  @override
  Widget build(BuildContext context) {
    if (_drafts.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('📝', style: TextStyle(fontSize: 48)),
            SizedBox(height: 12),
            Text('No saved drafts', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
            SizedBox(height: 4),
            Text('Drafts appear here when you save offline', style: TextStyle(fontSize: 13, color: Color(0xFF94A3B8))),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFFFBEB),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFFDE68A)),
          ),
          child: const Row(
            children: [
              Icon(Icons.offline_bolt, color: Color(0xFFD97706), size: 18),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'These applications were saved while offline. Tap "Submit Now" when connected.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF92400E)),
                ),
              ),
            ],
          ),
        ),

        ..._drafts.map((d) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: _serviceColor(d.service).withAlpha(25),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Center(child: Text(_serviceIcon(d.service), style: const TextStyle(fontSize: 20))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(_serviceLabel(d.service), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        Text(d.profileName, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                        const SizedBox(height: 2),
                        Text(_formatDate(d.createdAt), style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8))),
                        // Show summary of saved fields
                        if (d.fields.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            d.fields.entries.map((e) => '${e.key}: ${e.value}').join(', '),
                            style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                    ),
                  ),
                  Column(
                    children: [
                      FilledButton(
                        onPressed: () => _submit(d),
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text('Submit Now', style: TextStyle(fontSize: 12)),
                      ),
                      const SizedBox(height: 6),
                      OutlinedButton(
                        onPressed: () => _delete(d.id),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          foregroundColor: const Color(0xFFDC2626),
                          side: const BorderSide(color: Color(0xFFFCA5A5)),
                        ),
                        child: const Text('Delete', style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        )),
      ],
    );
  }

  String _serviceIcon(String s) {
    switch (s) {
      case 'caste': return '📜';
      case 'pension': return '🧓';
      case 'scheme': return '🏛';
      default: return '📋';
    }
  }

  String _serviceLabel(String s) {
    switch (s) {
      case 'caste': return 'Caste Certificate';
      case 'pension': return 'Pension Application';
      case 'scheme': return 'Scheme Application';
      default: return s;
    }
  }

  Color _serviceColor(String s) {
    switch (s) {
      case 'caste': return const Color(0xFF2563EB);
      case 'pension': return const Color(0xFF16A34A);
      case 'scheme': return const Color(0xFF7C3AED);
      default: return const Color(0xFF94A3B8);
    }
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso.substring(0, iso.length.clamp(0, 10));
    }
  }
}
