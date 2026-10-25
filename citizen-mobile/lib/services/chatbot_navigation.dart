import 'package:flutter/material.dart';
import '../models/citizen_profile.dart';
import '../screens/apply/common_application_form.dart';
import '../screens/family/family_screen.dart';
import '../screens/grievances/grievances_screen.dart';
import '../screens/more/more_screen.dart';

/// Mirrors citizen-portal ChatWidget.jsx navigation intents.
const kChatNavIntents = <(String keyword, String route)>[
  ('apply bpl', '/apply/caf'),
  ('bpl ration', '/apply/caf'),
  ('ration card', '/apply/caf'),
  ('apply ration', '/apply/caf'),
  ('common application form', '/apply/caf'),
  ('apply for scheme', '/apply/caf'),
  ('welfare scheme', '/apply/caf'),
  ('apply caste', '/apply/caste'),
  ('apply pension', '/apply/pension'),
  ('apply marriage', '/apply/marriage'),
  ('apply scheme', '/apply/scheme'),
  ('apply family member', '/apply/family-member'),
  ('go to payments', '/payments'),
  ('payments & benefits', '/payments'),
  ('payments page', '/payments'),
  ('go to certificates', '/certificates'),
  ('certificates section', '/certificates'),
  ('my certificates page', '/certificates'),
  ('certificates page', '/certificates'),
  ('go to notifications', '/notifications'),
  ('go to grievances', '/grievances'),
  ('file a grievance', '/grievances'),
  ('grievances page', '/grievances'),
  ('go to my family', '/my-family'),
  ('family registry', '/my-family'),
  ('go to contact', '/contact'),
  ('my data & consent', '/my-consents'),
  ('data export', '/my-consents'),
];

const kChatNavLabelsEn = <String, String>{
  '/payments': 'Go to Payments →',
  '/certificates': 'Go to Certificates →',
  '/notifications': 'Go to Notifications →',
  '/contact': 'Go to Contact Centre →',
  '/my-consents': 'Go to My Data & Consent →',
  '/grievances': 'Go to Grievances →',
  '/apply/caste': 'Apply for Caste Certificate →',
  '/apply/pension': 'Apply for Pension →',
  '/apply/marriage': 'Apply for Marriage Certificate →',
  '/apply/scheme': 'Apply for Scheme →',
  '/apply/caf': 'Apply via Common Application Form →',
  '/apply/family-member': 'Apply for Family Member Change →',
  '/my-family': 'Go to My Family →',
};

const kChatNavLabelsGu = <String, String>{
  '/payments': 'ચૂકવણી અને લાભ →',
  '/certificates': 'પ્રમાણપત્ર →',
  '/notifications': 'સૂચનાઓ →',
  '/contact': 'સંપર્ક કેન્દ્ર →',
  '/my-consents': 'મારો ડેટા અને સંમતિ →',
  '/grievances': 'ફરિયાદ / ગ્રીવન્સ →',
  '/apply/caste': 'જ્ઞાતિ પ્રમાણપત્ર અરજી →',
  '/apply/pension': 'પેન્શન અરજી →',
  '/apply/marriage': 'લગ્ન પ્રમાણપત્ર અરજી →',
  '/apply/scheme': 'સ્કીમ અરજી →',
  '/apply/caf': 'CAF અરજી ફોર્મ →',
  '/apply/family-member': 'કુટુંબ સભ્ય બદલાવ અરજી →',
  '/my-family': 'મારું કુટુંબ →',
};

String? detectChatNavigateRoute(String replyText) {
  final trimmed = replyText.trim();
  if (RegExp(r'^welcome to citizen services', caseSensitive: false).hasMatch(trimmed)) return null;
  if (trimmed.startsWith('ડિજિટલ ગુજરાતમાં સ્વાગત')) return null;
  final lower = replyText.toLowerCase();
  for (final (keyword, route) in kChatNavIntents) {
    if (lower.contains(keyword)) return route;
  }
  return null;
}

String? chatNavLabel(String route, String lang) {
  final map = lang == 'gu' ? kChatNavLabelsGu : kChatNavLabelsEn;
  return map[route];
}

/// Navigate to the screen matching a web-portal chat route.
void openChatbotRoute(BuildContext context, CitizenProfile profile, String route) {
  Widget screen;
  switch (route) {
    case '/payments':
      screen = PaymentsBenefitsScreen(profile: profile);
    case '/certificates':
      screen = CitizenCertificatesScreen(profile: profile);
    case '/notifications':
      screen = CitizenNotificationsScreen(profile: profile);
    case '/contact':
      screen = const ContactUsScreen();
    case '/my-consents':
      screen = MyDataConsentsScreen(profile: profile);
    case '/grievances':
      screen = GrievancesScreen(profile: profile);
    case '/apply/caste':
      screen = CommonApplicationForm(profile: profile, preselectedService: 'caste');
    case '/apply/pension':
      screen = CommonApplicationForm(profile: profile, preselectedService: 'pension');
    case '/apply/scheme':
      screen = CommonApplicationForm(profile: profile, preselectedService: 'scheme');
    case '/apply/caf':
      screen = CommonApplicationForm(profile: profile);
    case '/apply/marriage':
      screen = CommonApplicationForm(profile: profile, preselectedService: 'marriage');
    case '/apply/family-member':
      screen = CommonApplicationForm(profile: profile, preselectedService: 'family-member');
    case '/my-family':
      screen = Scaffold(
        appBar: AppBar(title: const Text('My Family'), centerTitle: false),
        body: FamilyScreen(profile: profile),
      );
    default:
      return;
  }
  Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
}
