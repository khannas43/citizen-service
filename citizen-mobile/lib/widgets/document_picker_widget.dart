import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

class DocumentPickerWidget extends StatefulWidget {
  final void Function(String base64, String fileName) onPicked;
  final VoidCallback? onRemoved;
  final String label;

  const DocumentPickerWidget({
    super.key,
    required this.onPicked,
    this.onRemoved,
    this.label = 'Attach Document',
  });

  @override
  State<DocumentPickerWidget> createState() => _DocumentPickerWidgetState();
}

class _DocumentPickerWidgetState extends State<DocumentPickerWidget> {
  XFile? _file;
  final _picker = ImagePicker();

  Future<void> _pick(ImageSource source) async {
    try {
      final file = await _picker.pickImage(
        source: source,
        imageQuality: 70,
        maxWidth: 1200,
      );
      if (file == null) return;
      final bytes = await file.readAsBytes();
      final b64 = base64Encode(bytes);
      setState(() => _file = file);
      widget.onPicked(b64, file.name);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not pick image: $e')),
        );
      }
    }
  }

  void _remove() {
    setState(() => _file = null);
    widget.onRemoved?.call();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    if (_file != null) {
      return Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.file(
              File(_file!.path),
              width: 64,
              height: 64,
              fit: BoxFit.cover,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_file!.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const Text('Document attached', style: TextStyle(fontSize: 11, color: Color(0xFF16A34A))),
              ],
            ),
          ),
          IconButton(icon: const Icon(Icons.close), onPressed: _remove, tooltip: 'Remove'),
        ],
      );
    }

    return Row(
      children: [
        Expanded(
          child: OutlinedButton.icon(
            icon: const Icon(Icons.camera_alt_outlined, size: 18),
            label: const Text('Camera'),
            onPressed: () => _pick(ImageSource.camera),
            style: OutlinedButton.styleFrom(
              foregroundColor: cs.primary,
              side: BorderSide(color: cs.primary.withAlpha(120)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            icon: const Icon(Icons.photo_library_outlined, size: 18),
            label: const Text('Gallery'),
            onPressed: () => _pick(ImageSource.gallery),
            style: OutlinedButton.styleFrom(
              foregroundColor: cs.primary,
              side: BorderSide(color: cs.primary.withAlpha(120)),
            ),
          ),
        ),
      ],
    );
  }
}
