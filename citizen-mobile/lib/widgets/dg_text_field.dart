import 'package:flutter/material.dart';

/// Isolated input — parent setState must not recreate this widget's [key].
class DgTextField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode? focusNode;
  final String? hintText;
  final int minLines;
  final int? maxLines;
  final int? maxLength;
  final bool enabled;
  final TextInputType? keyboardType;
  final TextCapitalization textCapitalization;
  final TextInputAction? textInputAction;
  final bool autocorrect;
  final ValueChanged<String>? onSubmitted;
  final ValueChanged<String>? onChanged;
  final EdgeInsets scrollPadding;

  const DgTextField({
    super.key,
    required this.controller,
    this.focusNode,
    this.hintText,
    this.minLines = 1,
    this.maxLines,
    this.maxLength,
    this.enabled = true,
    this.keyboardType,
    this.textCapitalization = TextCapitalization.none,
    this.textInputAction,
    this.autocorrect = true,
    this.onSubmitted,
    this.onChanged,
    this.scrollPadding = const EdgeInsets.all(20),
  });

  static InputDecoration decoration({String? hintText}) {
    return InputDecoration(
      hintText: hintText,
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF3730A3), width: 1.5),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lines = maxLines ?? (minLines > 1 ? null : 1);
    return TextField(
      controller: controller,
      focusNode: focusNode,
      enabled: enabled,
      minLines: minLines,
      maxLines: lines,
      maxLength: maxLength,
      keyboardType: keyboardType ?? (minLines > 1 ? TextInputType.multiline : TextInputType.text),
      textCapitalization: textCapitalization,
      textInputAction: textInputAction ?? (lines != null && lines > 1 ? TextInputAction.newline : TextInputAction.done),
      autocorrect: autocorrect,
      enableSuggestions: autocorrect,
      scrollPadding: scrollPadding,
      style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16, fontWeight: FontWeight.w400),
      cursorColor: const Color(0xFF3730A3),
      cursorWidth: 2,
      decoration: decoration(hintText: hintText),
      onSubmitted: onSubmitted,
      onChanged: onChanged,
    );
  }
}

class DgTextArea extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode? focusNode;
  final String? hintText;
  final int maxLines;
  final int? maxLength;
  final bool enabled;

  const DgTextArea({
    super.key,
    required this.controller,
    this.focusNode,
    this.hintText,
    this.maxLines = 8,
    this.maxLength,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return DgTextField(
      controller: controller,
      focusNode: focusNode,
      hintText: hintText,
      minLines: 4,
      maxLines: maxLines,
      maxLength: maxLength,
      enabled: enabled,
      autocorrect: true,
      textCapitalization: TextCapitalization.sentences,
      keyboardType: TextInputType.multiline,
      textInputAction: TextInputAction.newline,
    );
  }
}

/// Pinned bottom input bar — lives in [Scaffold.bottomNavigationBar], not inside scroll views.
class DgInputBar extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final String hintText;
  final bool sending;
  final VoidCallback onSend;
  final TextInputAction textInputAction;
  /// Optional hold-to-talk mic (GestureDetector callbacks).
  final VoidCallback? onMicStart;
  final VoidCallback? onMicEnd;
  final bool micRecording;
  final bool micBusy;
  final String? voiceStatus;

  const DgInputBar({
    super.key,
    required this.controller,
    required this.focusNode,
    required this.hintText,
    required this.sending,
    required this.onSend,
    this.textInputAction = TextInputAction.send,
    this.onMicStart,
    this.onMicEnd,
    this.micRecording = false,
    this.micBusy = false,
    this.voiceStatus,
  });

  @override
  Widget build(BuildContext context) {
    final showMic = onMicStart != null && onMicEnd != null;
    return Material(
      elevation: 8,
      color: Colors.white,
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (voiceStatus != null && voiceStatus!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
                child: Text(
                  voiceStatus!,
                  style: TextStyle(
                    fontSize: 12,
                    color: micRecording ? const Color(0xFFDC2626) : const Color(0xFF64748B),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (showMic) ...[
                    GestureDetector(
                      onLongPressStart: (_) {
                        if (!sending && !micBusy) onMicStart!();
                      },
                      onLongPressEnd: (_) {
                        if (micRecording) onMicEnd!();
                      },
                      onLongPressCancel: () {
                        // Gesture cancelled (e.g. scroll interrupts the hold) — still
                        // stop recording so _micRecording doesn't get stuck true.
                        if (micRecording) onMicEnd!();
                      },
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: micRecording
                              ? const Color(0xFFFEE2E2)
                              : micBusy
                                  ? const Color(0xFFF1F5F9)
                                  : const Color(0xFFEEF2FF),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: micRecording ? const Color(0xFFFECACA) : const Color(0xFFC7D2FE),
                          ),
                        ),
                        child: Icon(
                          micBusy ? Icons.hourglass_top : Icons.mic,
                          color: micRecording
                              ? const Color(0xFFDC2626)
                              : const Color(0xFF3730A3),
                          size: 22,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  Expanded(
                    child: DgTextField(
                      controller: controller,
                      focusNode: focusNode,
                      hintText: hintText,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: textInputAction,
                      onSubmitted: (_) => onSend(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: sending || micBusy ? null : onSend,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(48, 48),
                      padding: EdgeInsets.zero,
                      backgroundColor: const Color(0xFF3730A3),
                    ),
                    child: const Icon(Icons.send, size: 18),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Static decoration helper for legacy TextFormField call sites.
InputDecoration dgInputDecoration({String? hintText}) => DgTextField.decoration(hintText: hintText);
