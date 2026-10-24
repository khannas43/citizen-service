import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import 'common_application_form.dart';
import 'grievance_form_screen.dart';

class ApplyScreen extends StatelessWidget {
  final CitizenProfile profile;
  const ApplyScreen({super.key, required this.profile});

  void _openCaf(BuildContext context, {String? preselect}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CommonApplicationForm(profile: profile, preselectedService: preselect),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 4),

        // ── CAF banner ─────────────────────────────────────────────────────
        GestureDetector(
          onTap: () => _openCaf(context),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF3730A3), Color(0xFF1E3A8A)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('📋', style: TextStyle(fontSize: 36)),
              const SizedBox(height: 10),
              const Text('Common Application Form',
                  style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800, letterSpacing: -0.3)),
              const SizedBox(height: 6),
              const Text(
                'Fill common details once, select services, and submit together in one go.',
                style: TextStyle(color: Color(0xFFBFDBFE), fontSize: 13),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Row(children: [
                  Text('Start Application', style: TextStyle(color: Color(0xFF3730A3), fontWeight: FontWeight.w700, fontSize: 14)),
                  Spacer(),
                  Icon(Icons.arrow_forward, color: Color(0xFF3730A3), size: 18),
                ]),
              ),
            ]),
          ),
        ),

        const SizedBox(height: 20),

        // ── Quick service shortcuts ────────────────────────────────────────
        const _SectionHeader('QUICK APPLY'),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: _QuickTile(icon: '📜', label: 'Caste\nCertificate', color: const Color(0xFFEFF6FF), onTap: () => _openCaf(context, preselect: 'caste'))),
          const SizedBox(width: 10),
          Expanded(child: _QuickTile(icon: '🧓', label: 'Pension\nApplication', color: const Color(0xFFF0FDF4), onTap: () => _openCaf(context, preselect: 'pension'))),
          const SizedBox(width: 10),
          Expanded(child: _QuickTile(icon: '🏛', label: 'Scheme\nApplication', color: const Color(0xFFF5F3FF), onTap: () => _openCaf(context, preselect: 'scheme'))),
        ]),

        const SizedBox(height: 20),

        // ── Grievance (separate flow — not part of CAF) ───────────────────
        const _SectionHeader('SUPPORT'),
        const SizedBox(height: 12),
        Card(
          child: InkWell(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => GrievanceFormScreen(profile: profile))),
            borderRadius: BorderRadius.circular(16),
            child: const Padding(
              padding: EdgeInsets.all(16),
              child: Row(children: [
                Text('🔔', style: TextStyle(fontSize: 28)),
                SizedBox(width: 14),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Raise a Grievance', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                  SizedBox(height: 2),
                  Text('Report a problem or service complaint', style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                ])),
                Icon(Icons.chevron_right, color: Color(0xFF94A3B8)),
              ]),
            ),
          ),
        ),

        const SizedBox(height: 20),

        // ── CAF steps info ─────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: const Color(0xFFF8FAFC), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('HOW IT WORKS', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF64748B), letterSpacing: 0.8)),
            const SizedBox(height: 12),
            for (final (step, label, desc) in [
              ('1', 'Common Profile',   'Your verified details from the family registry'),
              ('2', 'Select Services',  'Choose one or more services — caste, pension, scheme'),
              ('3', 'Service Details',  'Fill specific details for each selected service'),
              ('4', 'Documents',        'Auto-attached from Aadhaar eKYC + optional upload'),
              ('5', 'Review & Submit',  'Confirm and submit all selected applications at once'),
            ]) Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Container(
                  width: 22, height: 22,
                  decoration: const BoxDecoration(color: Color(0xFF3730A3), shape: BoxShape.circle),
                  child: Center(child: Text(step, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700))),
                ),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                  Text(desc, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                ])),
              ]),
            ),
          ]),
        ),
        const SizedBox(height: 8),
      ],
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

class _QuickTile extends StatelessWidget {
  final String icon, label;
  final Color color;
  final VoidCallback onTap;
  const _QuickTile({required this.icon, required this.label, required this.color, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0xFFE8EDF3))),
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(icon, style: const TextStyle(fontSize: 26)),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF1E293B)), textAlign: TextAlign.center),
        ]),
      ),
    );
  }
}
