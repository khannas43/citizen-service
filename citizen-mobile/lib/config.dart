// Android emulator: 10.0.2.2 → host machine localhost (K8s NodePort :30074).
// Physical device on same WiFi: --dart-define=API_BASE=http://<your-mac-ip>:30074
const String kApiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'http://10.0.2.2:30074',
);
// Same host as kApiBase (citizen-portal nginx) so the emulator only needs :30074.
const String kAiBase = String.fromEnvironment(
  'AI_BASE',
  defaultValue: '$kApiBase/ai-intelligence-service',
);

// All routed through citizen-portal nginx (single base)
const kCasteApi      = '$kApiBase/caste-certificate-service';
const kPensionApi    = '$kApiBase/pension-service';
const kSchemeAppApi  = '$kApiBase/scheme-application-service';
const kMarriageApi   = '$kApiBase/marriage-certificate-service';
const kFamilyMbApi   = '$kApiBase/family-member-service';
const kFamilyApi     = '$kApiBase/family-registry-service';
const kSchemeEngine  = '$kApiBase/scheme-engine-service';
const kGrievanceApi  = '$kApiBase/grievance-service';
const kNotifApi      = '$kApiBase/notifications-service';
const kChatbotApi    = '$kApiBase/chatbot-service';
// Speech STT/TTS via portal nginx → ai-intelligence-service
const kSpeechApi     = '$kApiBase/ai-intelligence-service';
