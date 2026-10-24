import 'package:flutter/material.dart';

class FormSuccessScreen extends StatelessWidget {
  final Map<String, dynamic> result;
  final String service;

  const FormSuccessScreen({super.key, required this.result, required this.service});

  @override
  Widget build(BuildContext context) {
    final appNo = result['applicationNo'] as String? ??
        result['engineRef'] as String? ??
        result['id']?.toString() ??
        'Submitted';

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF0FDF4),
                    borderRadius: BorderRadius.circular(40),
                    border: Border.all(color: const Color(0xFF16A34A), width: 2),
                  ),
                  child: const Center(child: Text('✓', style: TextStyle(fontSize: 36, color: Color(0xFF16A34A)))),
                ),
                const SizedBox(height: 20),
                Text(
                  '$service Submitted',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Color(0xFF1E293B)),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: [
                      const Text('Application Number', style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontWeight: FontWeight.w600)),
                      const SizedBox(height: 4),
                      Text(
                        appNo,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, fontFamily: 'monospace', color: Color(0xFF3730A3)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'An officer will review your application. You can track the status in the Track tab.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).popUntil((r) => r.isFirst),
                        child: const Text('Go Home'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
