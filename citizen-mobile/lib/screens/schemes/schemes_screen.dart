import 'package:flutter/material.dart';
import '../../models/citizen_profile.dart';
import '../../models/scheme_model.dart';
import '../../services/api_service.dart';
import '../apply/common_application_form.dart';

class SchemesScreen extends StatefulWidget {
  final CitizenProfile profile;
  const SchemesScreen({super.key, required this.profile});

  @override
  State<SchemesScreen> createState() => _SchemesScreenState();
}

class _SchemesScreenState extends State<SchemesScreen> {
  List<SchemeRecommendation> _recs = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final recs = await fetchRecommendations(
        aadhaarRef: widget.profile.aadhaarRef,
        casteCategory: widget.profile.category,
        annualIncome: widget.profile.annualIncome,
        age: widget.profile.age,
      );
      if (mounted) setState(() { _recs = recs; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: _loading
          ? const Center(child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(height: 16),
                Text('AI is finding your best schemes...', style: TextStyle(color: Color(0xFF64748B), fontSize: 13)),
              ],
            ))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('⚠️', style: TextStyle(fontSize: 32)),
                  const SizedBox(height: 8),
                  Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B), fontSize: 13)),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: _load, child: const Text('Retry')),
                ]))
              : _recs.isEmpty
                  ? ListView(children: const [
                      SizedBox(height: 80),
                      Center(child: Column(children: [
                        Text('🤖', style: TextStyle(fontSize: 48)),
                        SizedBox(height: 12),
                        Text('No recommendations found', style: TextStyle(fontWeight: FontWeight.w600)),
                        SizedBox(height: 4),
                        Text('Your profile may already be enrolled in all eligible schemes', style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
                      ])),
                    ])
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        // AI attribution banner
                        Container(
                          margin: const EdgeInsets.only(bottom: 16),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [Color(0xFFF5F3FF), Color(0xFFEDE9FE)],
                            ),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFDDD6FE)),
                          ),
                          child: Row(
                            children: [
                              const Text('✨', style: TextStyle(fontSize: 18)),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      'AI-Powered Recommendations',
                                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: Color(0xFF4C1D95)),
                                    ),
                                    Text(
                                      '${_recs.length} schemes matched for ${widget.profile.name.split(' ').first} · Powered by Gemma 4 on-premise LLM',
                                      style: const TextStyle(fontSize: 11, color: Color(0xFF6D28D9)),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        ..._recs.asMap().entries.map((e) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _RecCard(rec: e.value, rank: e.key + 1, profile: widget.profile),
                        )),
                      ],
                    ),
    );
  }
}

class _RecCard extends StatefulWidget {
  final SchemeRecommendation rec;
  final int rank;
  final CitizenProfile profile;
  const _RecCard({required this.rec, required this.rank, required this.profile});

  @override
  State<_RecCard> createState() => _RecCardState();
}

class _RecCardState extends State<_RecCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 32, height: 32,
                    decoration: BoxDecoration(
                      color: const Color(0xFF7C3AED),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Center(
                      child: Text(
                        '#${widget.rank}',
                        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.rec.schemeName,
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: Color(0xFF1E293B)),
                        ),
                        if (widget.rec.eligibilityReasons.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 6, runSpacing: 4,
                            children: widget.rec.eligibilityReasons.take(3).map((r) => Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFFF0FDF4),
                                borderRadius: BorderRadius.circular(999),
                                border: Border.all(color: const Color(0xFFBBF7D0)),
                              ),
                              child: Text(r, style: const TextStyle(fontSize: 10, color: Color(0xFF15803D), fontWeight: FontWeight.w600)),
                            )).toList(),
                          ),
                        ],
                      ],
                    ),
                  ),
                  Icon(
                    _expanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                    color: const Color(0xFF94A3B8),
                  ),
                ],
              ),
            ),
          ),

          if (_expanded) ...[
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Gemma explanation
                  if ((widget.rec.explanation ?? '').isNotEmpty) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5F3FF),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFDDD6FE)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              Text('✨ ', style: TextStyle(fontSize: 13)),
                              Text(
                                'Gemma 4 Explanation',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Color(0xFF6D28D9)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            widget.rec.explanation ?? '',
                            style: const TextStyle(fontSize: 13, color: Color(0xFF1E293B), height: 1.5),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            '✨ Explanation by Gemma 4 · on-premise LLM',
                            style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  FilledButton.icon(
                    onPressed: () => openSchemeCaf(
                      context,
                      profile: widget.profile,
                      schemeId: widget.rec.schemeId.isEmpty ? null : widget.rec.schemeId,
                      schemeName: widget.rec.schemeName,
                    ),
                    icon: const Icon(Icons.send, size: 16),
                    label: const Text('Apply Now'),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
