import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';
import 'package:uuid/uuid.dart';
import '../models/citizen_profile.dart';
import '../services/api_service.dart';
import '../services/chatbot_navigation.dart';
import '../services/locale_service.dart';
import '../l10n/app_strings.dart';
import 'language_toggle.dart';
import '../utils/app_ref_utils.dart';
import 'dg_text_field.dart';

const _welcomeIntro = {
  'en': 'Welcome to Citizen Services! I can help you:',
  'gu': 'ડિજિટલ ગુજરાતમાં સ્વાગત! હું મદદ કરી શકું:',
};

const _welcomeBullets = {
  'en': [
    'Track applications & payment status',
    'Find schemes your family qualifies for',
    'Access certificates, consents & grievances',
  ],
  'gu': [
    'અરજી અને ચૂકવણીની સ્થિતિ ટ્રૅક',
    'પરિવાર માટે સ્કીમ શોધો',
    'પ્રમાણપત્ર, સંમતિ અને ફરિયાદ',
  ],
};

const _welcomeFooter = {
  'en': 'Type, hold mic to talk, or tap a shortcut below.',
  'gu': 'લખો, માઇક દબાવીને બોલો, અથવા નીચે ટૅપ કરો.',
};

const _resetLabel = {'en': 'Reset', 'gu': 'રીસેટ'};

const _quickActions = {
  'en': [
    ('Check application status', 'Check application status'),
    ('Find eligible schemes', 'What schemes am I eligible for'),
    ('Apply for Caste Certificate', 'Apply for Caste Certificate'),
    ('Check my payments & benefits', 'Show my payments and benefits'),
    ('Download my certificates', 'Show my certificates'),
    ('Submit a complaint / grievance', 'I want to file a grievance'),
  ],
  'gu': [
    ('અરજીની સ્થિતિ ચેક', 'અરજીની સ્થિતિ'),
    ('પાત્ર સ્કીમ શોધો', 'કઈ સ્કીમ માટે પાત્ર છું'),
    ('જ્ઞાતિ પ્રમાણપત્ર અરજી', 'જ્ઞાતિ પ્રમાણ પત્ર'),
    ('ચૂકવણી અને લાભ', 'મારી ચૂકવણી'),
    ('મારા પ્રમાણપત્ર', 'પ્રમાણપત્ર જુઓ'),
    ('ફરિયાદ/ગ્રીવન્સ', 'ફરિયાદ નોંધાવવી'),
  ],
};

class _ChatMessage {
  final bool isBot;
  final bool isWelcome;
  final String? text;
  final String? route;
  final String? navLabel;

  const _ChatMessage({
    required this.isBot,
    this.isWelcome = false,
    this.text,
    this.route,
    this.navLabel,
  });

  factory _ChatMessage.welcome() => const _ChatMessage(isBot: true, isWelcome: true);
}

/// Full-screen chatbot matching citizen-portal ChatWidget.jsx.
class DgChatbotScreen extends StatefulWidget {
  final CitizenProfile profile;
  const DgChatbotScreen({super.key, required this.profile});

  @override
  State<DgChatbotScreen> createState() => _DgChatbotScreenState();
}

class _DgChatbotScreenState extends State<DgChatbotScreen> {
  final _ctrl = TextEditingController();
  final _focusNode = FocusNode();
  final _scroll = ScrollController();
  final _uuid = const Uuid();
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();

  late String _sessionId;
  late List<_ChatMessage> _msgs;
  bool _sending = false;
  int _resetNonce = 0;
  bool _micRecording = false;
  bool _micBusy = false;
  String? _voiceStatus;
  String? _recordPath;
  Timer? _micTimer;

  static const _maxRecordDuration = Duration(seconds: 60);

  @override
  void initState() {
    super.initState();
    _sessionId = _uuid.v4();
    _msgs = [_ChatMessage.welcome()];
  }

  @override
  void dispose() {
    _micTimer?.cancel();
    _ctrl.dispose();
    _focusNode.dispose();
    _scroll.dispose();
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  String get _lang => LocaleService.instance.code;

  void _reset() {
    if (_sending || _micBusy || _micRecording) return;
    setState(() {
      _resetNonce++;
      _sessionId = _uuid.v4();
      _msgs = [_ChatMessage.welcome()];
      _ctrl.clear();
      _voiceStatus = null;
    });
  }

  Future<void> _startMic() async {
    if (_sending || _micBusy || _micRecording) return;
    final status = await Permission.microphone.request();
    if (!mounted) return;
    if (status.isPermanentlyDenied) {
      _showSettingsDialog();
      return;
    }
    if (!status.isGranted) {
      setState(() {
        _voiceStatus = _lang == 'gu'
            ? 'માઇક્રોફોન પરવાનગી જોઈએ.'
            : 'Microphone permission required.';
      });
      return;
    }
    try {
      final dir = await getTemporaryDirectory();
      _recordPath = '${dir.path}/dg_voice_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, sampleRate: 16000, numChannels: 1),
        path: _recordPath!,
      );
      setState(() {
        _micRecording = true;
        _voiceStatus = _lang == 'gu' ? 'રેકોર્ડિંગ… છોડો ત્યારે મોકલાશે' : 'Recording… release to transcribe';
      });
      _micTimer?.cancel();
      _micTimer = Timer(_maxRecordDuration, _stopMic);
    } catch (_) {
      setState(() {
        _micRecording = false;
        _voiceStatus = _lang == 'gu' ? 'રેકોર્ડિંગ શરૂ ન થયું.' : 'Could not start recording.';
      });
    }
  }

  void _showSettingsDialog() {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_lang == 'gu' ? 'માઇક્રોફોન પરવાનગી' : 'Microphone permission'),
        content: Text(_lang == 'gu'
            ? 'વૉઇસ સુવિધા વાપરવા માટે સેટિંગ્સમાં માઇક્રોફોન પરવાનગી ચાલુ કરો.'
            : 'Microphone access is blocked. Enable it in Settings to use voice input.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(_lang == 'gu' ? 'રદ કરો' : 'Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              openAppSettings();
            },
            child: Text(_lang == 'gu' ? 'સેટિંગ્સ ખોલો' : 'Open Settings'),
          ),
        ],
      ),
    );
  }

  Future<void> _stopMic() async {
    _micTimer?.cancel();
    if (!_micRecording) return;
    setState(() {
      _micRecording = false;
      _micBusy = true;
      _voiceStatus = _lang == 'gu' ? 'સમજી રહ્યા છીએ…' : 'Transcribing…';
    });
    try {
      final path = await _recorder.stop() ?? _recordPath;
      if (path == null) {
        setState(() {
          _micBusy = false;
          _voiceStatus = _lang == 'gu' ? 'ઓડિયો મળ્યો નહીં.' : 'No audio captured.';
        });
        return;
      }
      final bytes = await File(path).readAsBytes();
      try {
        await File(path).delete();
      } catch (_) {}
      if (bytes.isEmpty) {
        setState(() {
          _micBusy = false;
          _voiceStatus = _lang == 'gu' ? 'ઓડિયો ખાલી છે.' : 'Empty recording.';
        });
        return;
      }
      final text = await speechToText(
        audioBytes: bytes,
        filename: 'voice.m4a',
        language: _lang,
      );
      if (!mounted) return;
      if (text == null || text.isEmpty) {
        setState(() {
          _micBusy = false;
          _voiceStatus = _lang == 'gu'
              ? 'કંઈ સંભળાયું નહીં — ફરી પ્રયાસ કરો.'
              : 'No speech captured — try again.';
        });
        return;
      }
      _ctrl.text = text;
      _ctrl.selection = TextSelection.collapsed(offset: text.length);
      setState(() {
        _micBusy = false;
        _voiceStatus = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _micBusy = false;
        _voiceStatus = _lang == 'gu' ? 'વૉઇસ સેવા ઉપલબ્ધ નથી.' : 'Voice service unavailable.';
      });
    }
  }

  Future<void> _speak(String text) async {
    if (text.trim().isEmpty) return;
    final bytes = await textToSpeech(text: text, language: _lang);
    if (bytes == null || !mounted) return;
    try {
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/dg_tts_${DateTime.now().millisecondsSinceEpoch}.mp3';
      await File(path).writeAsBytes(Uint8List.fromList(bytes));
      await _player.stop();
      await _player.play(DeviceFileSource(path));
    } catch (_) {}
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send([String? textOverride]) async {
    final raw = (textOverride ?? _ctrl.text).trim();
    if (raw.isEmpty || _sending) return;
    final text = looksLikeApplicationRef(raw) ? normalizeApplicationRef(raw) : raw;
    _ctrl.clear();
    setState(() {
      _msgs.add(_ChatMessage(isBot: false, text: raw));
      _sending = true;
    });
    _scrollDown();

    final res = await sendChatMessage(
      sessionId: _sessionId,
      message: text,
      language: _lang,
      aadhaarRef: widget.profile.aadhaarRef,
    );

    if (!mounted) return;

    if (res == null) {
      setState(() {
        _msgs.add(_ChatMessage(
          isBot: true,
          text: _lang == 'gu'
              ? 'કનેક્ટ કરી શક્યા નહીં. ફરી પ્રયાસ કરો.'
              : 'Could not connect. Please try again.',
        ));
        _sending = false;
      });
    } else {
      final route = res.navigateTo ?? detectChatNavigateRoute(res.reply);
      final label = route != null ? chatNavLabel(route, _lang) : null;
      setState(() {
        _msgs.add(_ChatMessage(
          isBot: true,
          text: res.reply,
          route: route,
          navLabel: label,
        ));
        _sending = false;
      });
    }
    _scrollDown();
  }

  bool get _showQuickChips => _msgs.length <= 1 && !_sending && !_focusNode.hasFocus;

  @override
  Widget build(BuildContext context) {
    final lang = _lang;
    return Scaffold(
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: Text(S.tl(lang, 'chatbot.title'), style: const TextStyle(fontSize: 16)),
        centerTitle: false,
        actions: [
          TextButton(
            onPressed: _reset,
            child: Text('↺ ${S.tl(lang, 'chatbot.reset')}',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
          const LanguageToggle(),
        ],
      ),
      body: ListView(
        key: ValueKey('msgs-$_resetNonce-$lang'),
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.manual,
        children: [
          for (final msg in _msgs)
            _Bubble(
              msg: msg,
              lang: lang,
              onNavigate: (route) => openChatbotRoute(context, widget.profile, route),
              onSpeak: msg.isBot && !(msg.isWelcome) && (msg.text?.isNotEmpty ?? false)
                  ? () => _speak(msg.text!)
                  : null,
            ),
          if (_sending) const _TypingDots(),
          if (_showQuickChips) _buildQuickChips(lang),
        ],
      ),
      bottomNavigationBar: DgInputBar(
        key: const ValueKey('chatbot-input-bar'),
        controller: _ctrl,
        focusNode: _focusNode,
        hintText: lang == 'gu' ? 'સંદેશ લખો…' : 'Type a message…',
        sending: _sending,
        onSend: () => _send(),
        onMicStart: _startMic,
        onMicEnd: _stopMic,
        micRecording: _micRecording,
        micBusy: _micBusy,
        voiceStatus: _voiceStatus,
      ),
    );
  }

  Widget _buildQuickChips(String lang) {
    final actions = _quickActions[lang] ?? _quickActions['en']!;
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final (label, send) in actions)
            ActionChip(
              label: Text(label, style: const TextStyle(fontSize: 11, color: Color(0xFF3730A3), fontWeight: FontWeight.w600)),
              backgroundColor: const Color(0xFFEEF2FF),
              side: const BorderSide(color: Color(0xFFC7D2FE)),
              onPressed: _sending ? null : () => _send(send),
            ),
        ],
      ),
    );
  }
}

/// Reusable chat panel (body only) — deprecated; use [DgChatbotScreen].
class DgChatbotPanel extends StatelessWidget {
  final CitizenProfile profile;
  final String lang;
  const DgChatbotPanel({super.key, required this.profile, this.lang = 'en', bool showHeader = false, VoidCallback? onReset});

  @override
  Widget build(BuildContext context) => DgChatbotScreen(profile: profile);
}

class _Bubble extends StatelessWidget {
  final _ChatMessage msg;
  final String lang;
  final void Function(String route) onNavigate;
  final VoidCallback? onSpeak;

  const _Bubble({
    required this.msg,
    required this.lang,
    required this.onNavigate,
    this.onSpeak,
  });

  @override
  Widget build(BuildContext context) {
    final isBot = msg.isBot;
    return Align(
      alignment: isBot ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.82),
        decoration: BoxDecoration(
          color: isBot ? const Color(0xFFF1F5F9) : const Color(0xFF3730A3),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isBot ? 4 : 16),
            bottomRight: Radius.circular(isBot ? 16 : 4),
          ),
        ),
        child: DefaultTextStyle(
          style: TextStyle(fontSize: 13, color: isBot ? const Color(0xFF1E293B) : Colors.white, height: 1.45),
          child: isBot ? _botContent() : Text(msg.text ?? ''),
        ),
      ),
    );
  }

  Widget _botContent() {
    if (msg.isWelcome) {
      final bullets = _welcomeBullets[lang] ?? _welcomeBullets['en']!;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_welcomeIntro[lang] ?? _welcomeIntro['en']!),
          const SizedBox(height: 6),
          for (final b in bullets)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('• ', style: TextStyle(fontSize: 13)),
                  Expanded(child: Text(b)),
                ],
              ),
            ),
          const SizedBox(height: 4),
          Text(_welcomeFooter[lang] ?? _welcomeFooter['en']!, style: const TextStyle(fontSize: 12, color: Color(0xFF64748B))),
        ],
      );
    }

    final text = msg.text ?? '';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...text.split('\n').map((line) => Padding(padding: const EdgeInsets.only(bottom: 2), child: Text(line))),
        Row(
          children: [
            if (onSpeak != null)
              IconButton(
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                onPressed: onSpeak,
                icon: const Icon(Icons.volume_up, size: 18, color: Color(0xFF3730A3)),
                tooltip: lang == 'gu' ? 'સાંભળો' : 'Listen',
              ),
            if (msg.route != null && msg.navLabel != null) ...[
              const SizedBox(width: 4),
              Flexible(child: _NavButton(label: msg.navLabel!, onTap: () => onNavigate(msg.route!))),
            ],
          ],
        ),
      ],
    );
  }
}

class _NavButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _NavButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFEEF2FF),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: const Color(0xFF818CF8)),
          ),
          child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF3730A3))),
        ),
      ),
    );
  }
}

class _TypingDots extends StatelessWidget {
  const _TypingDots();

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 10, left: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: const [
            _Dot(delay: 0),
            SizedBox(width: 4),
            _Dot(delay: 150),
            SizedBox(width: 4),
            _Dot(delay: 300),
          ],
        ),
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  final int delay;
  const _Dot({required this.delay});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(vsync: this, duration: const Duration(milliseconds: 600))..repeat(reverse: true);
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _ac.forward();
    });
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _ac,
      child: Container(
        width: 7,
        height: 7,
        decoration: const BoxDecoration(color: Color(0xFF94A3B8), shape: BoxShape.circle),
      ),
    );
  }
}
