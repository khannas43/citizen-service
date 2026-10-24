import 'package:flutter/material.dart';
import '../l10n/app_strings.dart';
import '../services/locale_service.dart';

/// EN | ગુ toggle — matches citizen-portal header.
class LanguageToggle extends StatelessWidget {
  final EdgeInsetsGeometry? padding;
  const LanguageToggle({super.key, this.padding});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: LocaleService.instance,
      builder: (context, _) {
        return TextButton(
          onPressed: () => LocaleService.instance.toggle(),
          style: TextButton.styleFrom(
            padding: padding ?? const EdgeInsets.symmetric(horizontal: 10),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(
            S.t(context, 'langToggle'),
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          ),
        );
      },
    );
  }
}

/// Language picker row for More screen / settings-style UI.
class LanguagePickerTile extends StatelessWidget {
  const LanguagePickerTile({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: LocaleService.instance,
      builder: (context, _) {
        final current = LocaleService.instance.code;
        return Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE8EDF3)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Text('🌐', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 10),
                Text(
                  S.t(context, 'language.title'),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
              ]),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: _LangChip(
                    label: S.t(context, 'language.english'),
                    selected: current == 'en',
                    onTap: () => LocaleService.instance.setLanguage('en'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _LangChip(
                    label: S.t(context, 'language.gujarati'),
                    selected: current == 'gu',
                    onTap: () => LocaleService.instance.setLanguage('gu'),
                  ),
                ),
              ]),
            ],
          ),
        );
      },
    );
  }
}

class _LangChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _LangChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? const Color(0xFFEEF2FF) : const Color(0xFFF8FAFC),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? const Color(0xFF3730A3) : const Color(0xFFE2E8F0),
              width: selected ? 1.5 : 1,
            ),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: selected ? const Color(0xFF3730A3) : const Color(0xFF64748B),
            ),
          ),
        ),
      ),
    );
  }
}
