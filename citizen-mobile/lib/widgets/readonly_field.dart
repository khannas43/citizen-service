import 'package:flutter/material.dart';

class ReadonlyField extends StatelessWidget {
  final String label;
  final String value;
  const ReadonlyField({super.key, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Color(0xFF64748B))),
        const SizedBox(height: 4),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: const Color(0xFFF1F5F9),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFE2E8F0)),
          ),
          child: Row(
            children: [
              const Icon(Icons.lock_outline, size: 14, color: Color(0xFF94A3B8)),
              const SizedBox(width: 8),
              Text(value, style: const TextStyle(fontSize: 14, color: Color(0xFF334155))),
            ],
          ),
        ),
      ],
    );
  }
}
