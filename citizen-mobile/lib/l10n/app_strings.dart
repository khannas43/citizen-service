import 'package:flutter/widgets.dart';
import '../services/locale_service.dart';
import '../widgets/locale_scope.dart';

/// Mobile UI strings aligned with citizen-portal en.json / gu.json.
class S {
  S._();

  static String t(BuildContext context, String key) {
    final lang = LocaleScope.lang(context);
    return _map[key]?[lang] ?? _map[key]?['en'] ?? key;
  }

  static String tl(String lang, String key) =>
      _map[key]?[lang] ?? _map[key]?['en'] ?? key;

  static const _map = <String, Map<String, String>>{
    'langToggle': {'en': 'EN | ગુ', 'gu': 'EN | ગુ'},
    'myApplications': {'en': 'My Applications', 'gu': 'મારી અરજીઓ'},
    'myFamily': {'en': 'My Family', 'gu': 'મારું કુટુંબ'},
    'nav.apply': {'en': 'Apply', 'gu': 'અરજી'},
    'nav.grievances': {'en': 'Grievances', 'gu': 'ફરિયાદ'},
    'nav.more': {'en': 'More', 'gu': 'વધુ'},
    'nav.applications': {'en': 'Applications', 'gu': 'અરજીઓ'},
    'nav.notifications': {'en': 'Notifications', 'gu': 'સૂચના'},
    'nav.certificates': {'en': 'Certificates', 'gu': 'પ્રમાણપત્ર'},
    'nav.contact': {'en': 'Contact', 'gu': 'સંપર્ક'},
    'nav.myData': {'en': 'My Data', 'gu': 'મારો ડેટા'},
    'nav.payments': {'en': 'Payments', 'gu': 'ચુકવણી'},
    'nav.tutorials': {'en': 'Tutorial', 'gu': 'ટ્યુટોરિયલ'},
    'nav.chatbot': {'en': 'Chatbot', 'gu': 'ચેટબોટ'},
    'login.selectProfile': {'en': 'Select your profile', 'gu': 'તમારી પ્રોફાઇલ પસંદ કરો'},
    'login.chooseHint': {'en': 'Choose a citizen profile to continue', 'gu': 'આગળ વધવા નાગરિક પ્રોફાઇલ પસંદ કરો'},
    'login.platform': {'en': 'Gujarat Welfare Platform', 'gu': 'ગુજરાત કલ્યાણ મંચ'},
    'shell.switchProfile': {'en': 'Switch Profile?', 'gu': 'પ્રોફાઇલ બદલો?'},
    'shell.switchHint': {'en': 'Return to the profile selection screen.', 'gu': 'પ્રોફાઇલ પસંદગી સ્ક્રીન પર પાછા જાઓ.'},
    'common.cancel': {'en': 'Cancel', 'gu': 'રદ કરો'},
    'common.switch': {'en': 'Switch', 'gu': 'બદલો'},
    'common.offlineDrafts': {'en': 'Offline Drafts', 'gu': 'ઑફલાઇન ડ્રાફ્ટ'},
    'common.savedDrafts': {'en': 'Saved Drafts', 'gu': 'સાચવેલા ડ્રાફ્ટ'},
    'chatbot.title': {'en': '🤖 Digital Gujarat Assistant', 'gu': '🤖 ડિજિટલ ગુજરાત સહાયક'},
    'chatbot.online': {'en': 'Online', 'gu': 'ઑનલાઇન'},
    'chatbot.reset': {'en': 'Reset', 'gu': 'રીસેટ'},
    'language.title': {'en': 'App Language', 'gu': 'એપ ભાષા'},
    'language.english': {'en': 'English', 'gu': 'English'},
    'language.gujarati': {'en': 'ગુજરાતી', 'gu': 'ગુજરાતી'},
    'home.greetingMorning': {'en': 'Good morning', 'gu': 'સુપ્રભાત'},
    'home.greetingAfternoon': {'en': 'Good afternoon', 'gu': 'શુભ બપોર'},
    'home.greetingEvening': {'en': 'Good evening', 'gu': 'શુભ સંધ્યા'},
    'home.quickActions': {'en': 'Quick Actions', 'gu': 'ઝડપી ક્રિયાઓ'},
    'home.kpiPending': {'en': 'Pending', 'gu': 'પ્રક્રિયાધીન'},
    'home.kpiApproved': {'en': 'Approved', 'gu': 'મંજૂર'},
    'home.kpiTotal': {'en': 'Total', 'gu': 'કુલ'},
    'home.quickCaste': {'en': 'Caste Cert', 'gu': 'જ્ઞાતિ પ્રમાણ'},
    'home.quickPension': {'en': 'Pension', 'gu': 'પેન્શન'},
    'home.quickScheme': {'en': 'Scheme', 'gu': 'યોજના'},
    'home.quickGrievance': {'en': 'Grievance', 'gu': 'ફરિયાદ'},
    'home.myApplications': {'en': 'My Applications', 'gu': 'મારી અરજીઓ'},
    'home.shown': {'en': 'shown', 'gu': 'બતાવેલ'},
    'home.filterAll': {'en': 'All', 'gu': 'બધા'},
    'home.filterPending': {'en': 'Pending', 'gu': 'પ્રક્રિયાધીન'},
    'home.filterApproved': {'en': 'Approved', 'gu': 'મંજૂર'},
    'home.filterRejected': {'en': 'Rejected', 'gu': 'નામંજૂર'},
    'home.noAppsYet': {'en': 'No applications yet', 'gu': 'હજી સુધી કોઈ અરજી નથી'},
    'home.tapApply': {'en': 'Tap Apply to get started', 'gu': 'શરૂ કરવા અરજી ટૅબ ટૅપ કરો'},
    'home.applyNow': {'en': 'Apply Now', 'gu': 'હવે અરજી કરો'},
    'home.noFilterMatch': {'en': 'No matching applications', 'gu': 'આ ફિલ્ટર સાથે કોઈ અરજી નથી'},
    'home.clearFilter': {'en': 'Clear filter', 'gu': 'ફિલ્ટર દૂર કરો'},
    'home.tapDetails': {'en': 'Tap for details', 'gu': 'વિગતો માટે ટૅપ કરો'},
  };
}

/// Shorthand when BuildContext is unavailable.
String appLang() => LocaleService.instance.code;
