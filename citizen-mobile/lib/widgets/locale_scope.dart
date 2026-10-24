import 'package:flutter/widgets.dart';
import '../services/locale_service.dart';

class LocaleScope extends InheritedNotifier<LocaleService> {
  const LocaleScope({
    super.key,
    required LocaleService notifier,
    required super.child,
  }) : super(notifier: notifier);

  static LocaleService of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<LocaleScope>();
    assert(scope != null, 'LocaleScope not found in widget tree');
    return scope!.notifier!;
  }

  static String lang(BuildContext context) => of(context).code;
}
