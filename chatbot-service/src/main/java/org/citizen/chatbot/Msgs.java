package org.citizen.chatbot;

import java.util.Map;

public final class Msgs {

    public static final String WELCOME = "WELCOME";
    public static final String CASTE_START = "CASTE_START";
    public static final String CASTE_START_PREFILLED = "CASTE_START_PREFILLED";
    public static final String ASK_CASTE_CODE = "ASK_CASTE_CODE";
    public static final String INVALID_CASTE = "INVALID_CASTE";
    public static final String ASK_AADHAAR = "ASK_AADHAAR";
    public static final String CASTE_SUCCESS = "CASTE_SUCCESS";
    public static final String SUBMIT_ERROR = "SUBMIT_ERROR";
    public static final String CASTE_ALREADY_ISSUED = "CASTE_ALREADY_ISSUED";
    public static final String CASTE_ALREADY_PENDING = "CASTE_ALREADY_PENDING";
    public static final String PENSION_START = "PENSION_START";
    public static final String ASK_AADHAAR_PENSION = "ASK_AADHAAR_PENSION";
    public static final String ASK_NAME = "ASK_NAME";
    public static final String PENSION_SUCCESS = "PENSION_SUCCESS";
    public static final String STATUS_START = "STATUS_START";
    public static final String STATUS_RESULT = "STATUS_RESULT";
    public static final String STATUS_NOT_FOUND = "STATUS_NOT_FOUND";
    public static final String ELIGIBILITY_START = "ELIGIBILITY_START";
    public static final String ELIGIBILITY_NONE = "ELIGIBILITY_NONE";
    public static final String ELIGIBILITY_FOUND = "ELIGIBILITY_FOUND";
    public static final String FALLBACK = "FALLBACK";
    public static final String LOOKUP_ERROR = "LOOKUP_ERROR";
    public static final String APPLY_MENU = "APPLY_MENU";
    public static final String STATUS_AUTO_HEADER = "STATUS_AUTO_HEADER";
    public static final String STATUS_AUTO_NONE = "STATUS_AUTO_NONE";
    public static final String PAYMENTS_REDIRECT = "PAYMENTS_REDIRECT";
    public static final String CERTIFICATES_REDIRECT = "CERTIFICATES_REDIRECT";
    public static final String GRIEVANCES_REDIRECT = "GRIEVANCES_REDIRECT";
    public static final String APPLY_SCHEME_REDIRECT = "APPLY_SCHEME_REDIRECT";

    private static final Map<String, String> EN = Map.ofEntries(
            Map.entry(WELCOME,
                    "Welcome to Digital Gujarat! I can help you:\n" +
                    "• Apply for government services\n" +
                    "• Check your application status\n" +
                    "• Find schemes your family qualifies for\n\nWhat would you like to do?"),
            Map.entry(CASTE_START,
                    "I can help you apply for a Caste Certificate. What is your full name?"),
            Map.entry(CASTE_START_PREFILLED,
                    "I'll apply for a Caste Certificate for {0}. What is your caste category? (SC / ST / OBC / NT / General)"),
            Map.entry(ASK_CASTE_CODE,
                    "What is your caste category? (SC / ST / OBC / NT / General)"),
            Map.entry(INVALID_CASTE,
                    "Please enter one of: SC, ST, OBC, NT, or General."),
            Map.entry(ASK_AADHAAR,
                    "What is your Aadhaar reference number? (format: XXXX-XXXX-NNNN)"),
            Map.entry(CASTE_SUCCESS,
                    "Application submitted! Your application number is: {0}\n\nType your application number anytime to check its status."),
            Map.entry(SUBMIT_ERROR,
                    "Sorry, there was an error submitting your application. Please try again or visit your nearest service centre."),
            Map.entry(CASTE_ALREADY_ISSUED,
                    "You already have an approved Caste Certificate ({0}). You do not need to apply again — download it from the Certificates section or use it for scheme applications."),
            Map.entry(CASTE_ALREADY_PENDING,
                    "You already have a Caste Certificate application in progress ({0}). Check My Applications on the home page, or type the application number here for status."),
            Map.entry(PENSION_START,
                    "I can help with a pension application. What type of pension? (Old Age / Widow / Disability)"),
            Map.entry(ASK_AADHAAR_PENSION,
                    "What is your Aadhaar reference number? (format: XXXX-XXXX-NNNN)"),
            Map.entry(ASK_NAME,
                    "What is your full name?"),
            Map.entry(PENSION_SUCCESS,
                    "Pension application submitted! Application number: {0}"),
            Map.entry(STATUS_START,
                    "Please share your application number (e.g. CAS-2606-000001, PEN-2606-000001)."),
            Map.entry(STATUS_RESULT,
                    "Application {0} is currently: {1}{2}"),
            Map.entry(STATUS_NOT_FOUND,
                    "No application found for tracking number {0}. Please check and try again."),
            Map.entry(ELIGIBILITY_START,
                    "I will check which schemes your family qualifies for. Please share your Aadhaar reference number (format: XXXX-XXXX-NNNN)."),
            Map.entry(ELIGIBILITY_NONE,
                    "Based on your family profile, no active schemes are currently identified. This may change as new schemes are added."),
            Map.entry(ELIGIBILITY_FOUND,
                    "Your family qualifies for {0} scheme(s):\n\n{1}\nType 'apply caste' or 'apply pension' to start an application."),
            Map.entry(FALLBACK,
                    "I did not understand that. You can ask me about:\n• Caste Certificate • Pension • Status check • Eligible schemes"),
            Map.entry(LOOKUP_ERROR,
                    "I am having trouble connecting right now. Please try again in a moment."),
            Map.entry(APPLY_MENU,
                    "Which service would you like to apply for?\n" +
                    "• Caste Certificate\n" +
                    "• Pension\n" +
                    "• Marriage Certificate\n" +
                    "• Scheme Application\n" +
                    "• Family Member Change\n\n" +
                    "Type the service name or tap a shortcut below."),
            Map.entry(STATUS_AUTO_HEADER,
                    "Here are your applications:\n\n{0}\n\nType an application number (e.g. CAS-2606-000001) for details."),
            Map.entry(STATUS_AUTO_NONE,
                    "No applications found for your account yet. Tap 'Apply for Caste Certificate' or another service to get started."),
            Map.entry(PAYMENTS_REDIRECT,
                    "View your payment history, benefit disbursements, and scheme payouts on the Payments & Benefits page."),
            Map.entry(CERTIFICATES_REDIRECT,
                    "View your issued certificates and download PDFs on the My Certificates page."),
            Map.entry(GRIEVANCES_REDIRECT,
                    "Submit a complaint or track an existing grievance on the Grievances page."),
            Map.entry(APPLY_SCHEME_REDIRECT,
                    "Apply for BPL Ration Card and other welfare schemes using the Common Application Form (CAF). Tap below to start your application.")
    );

    private static final Map<String, String> GU = Map.ofEntries(
            Map.entry(WELCOME,
                    "ડિજિટલ ગુજરાતમાં સ્વાગત! હું મદદ કરી શકું:\n" +
                    "• સરકારી સેવા માટે અરજી\n" +
                    "• અરજીની સ્થિતિ ચેક\n" +
                    "• પરિવાર માટે સ્કીમ શોધો\n\nશું કરવું છે?"),
            Map.entry(CASTE_START,
                    "હું જ્ઞાતિ પ્રમાણપત્ર અરજી માટે મદદ કરી શકું છું. આપનું પૂરું નામ શું છે?"),
            Map.entry(CASTE_START_PREFILLED,
                    "{0} ના માટે જ્ઞાતિ પ્રમાણપત્ર અરજી કરીશ. આપની જ્ઞાતિ શ્રેણી? (SC / ST / OBC / NT / General)"),
            Map.entry(ASK_CASTE_CODE,
                    "આપની જ્ઞાતિ શ્રેણી કઈ છે? (SC / ST / OBC / NT / General)"),
            Map.entry(INVALID_CASTE,
                    "કૃપા કરીને SC, ST, OBC, NT, અથવા General માંથી એક દાખલ કરો."),
            Map.entry(ASK_AADHAAR,
                    "આધાર સંદર્ભ નંબર આપો. (ફોર્મેટ: XXXX-XXXX-NNNN)"),
            Map.entry(CASTE_SUCCESS,
                    "અરજી સફળ! અરજી નંબર: {0}\n\nસ્થિતિ ચેક કરવા અરજી નંબર ટાઇપ કરો."),
            Map.entry(SUBMIT_ERROR,
                    "માફ કરશો, અરજી જમા કરવામાં ભૂલ થઈ. ફરી પ્રયાસ કરો."),
            Map.entry(CASTE_ALREADY_ISSUED,
                    "તમારી પાસે પહેલેથી મંજૂર જ્ઞાતિ પ્રમાણપત્ર ({0}) છે. ફરી અરજી કરવાની જરૂર નથી — પ્રમાણપત્ર વિભાગમાંથી ડાઉનલોડ કરો."),
            Map.entry(CASTE_ALREADY_PENDING,
                    "તમારી જ્ઞાતિ પ્રમાણપત્ર અરજી પહેલેથી ચાલુ છે ({0}). હોમ પેજ પર My Applications ચેક કરો."),
            Map.entry(PENSION_START,
                    "હું પેન્શન અરજી માટે મદદ કરી શકું. કઈ પ્રકારનું પેન્શન? (વૃદ્ધ / વિધવા / વિકલાંગ)"),
            Map.entry(ASK_AADHAAR_PENSION,
                    "આધાર સંદર્ભ નંબર આપો. (ફોર્મેટ: XXXX-XXXX-NNNN)"),
            Map.entry(ASK_NAME,
                    "આપનું પૂરું નામ શું છે?"),
            Map.entry(PENSION_SUCCESS,
                    "પેન્શન અરજી સફળ! અરજી નંબર: {0}"),
            Map.entry(STATUS_START,
                    "અરજી નંબર આપો (દા.ત. CAS-2606-000001, PEN-2606-000001)."),
            Map.entry(STATUS_RESULT,
                    "અરજી {0} ની સ્થિતિ {1}{2}"),
            Map.entry(STATUS_NOT_FOUND,
                    "ટ્રેકિંગ નંબર {0} માટે કોઈ અરજી મળી નહીં."),
            Map.entry(ELIGIBILITY_START,
                    "હું ચેક કરીશ કે આપના પરિવાર કઈ સ્કીમ મળી શકે. આધાર સંદર્ભ નંબર આપો (ફોર્મેટ: XXXX-XXXX-NNNN)."),
            Map.entry(ELIGIBILITY_NONE,
                    "આપના પરિવાર પ્રોફાઇલ અનુસાર, અત્યારે કોઈ સ્કીમ ઓળખાઈ નથી."),
            Map.entry(ELIGIBILITY_FOUND,
                    "આપના પરિવાર {0} સ્કીમ મળવા પાત્ર:\n\n{1}\n'apply caste' અથવા 'apply pension' ટાઇપ કરો."),
            Map.entry(FALLBACK,
                    "સમજ ન આવ્યું. આ વિષે પૂછો:\n• જ્ઞાતિ પ્રમાણપત્ર • પેન્શન • સ્થિતિ ચેક • સ્કીમ"),
            Map.entry(LOOKUP_ERROR,
                    "અત્યારે કનેક્ટ કરી શક્યા નહીં. ફરી પ્રયાસ કરો."),
            Map.entry(APPLY_MENU,
                    "કઈ સેવા માટે અરજી કરવી છે?\n" +
                    "• જ્ઞાતિ પ્રમાણપત્ર\n" +
                    "• પેન્શન\n" +
                    "• લગ્ન પ્રમાણપત્ર\n" +
                    "• સ્કીમ અરજી\n" +
                    "• કુટુંબ સભ્ય ફેરફાર\n\n" +
                    "સેવાનું નામ ટાઇપ કરો અથવા નીચે ટૅપ કરો."),
            Map.entry(STATUS_AUTO_HEADER,
                    "તમારી અરજીઓ:\n\n{0}\n\nવધુ વિગત માટે અરજી નંબર ટાઇપ કરો (દા.ત. CAS-2606-000001)."),
            Map.entry(STATUS_AUTO_NONE,
                    "તમારા ખાતામાં હજુ કોઈ અરજી નથી. 'જ્ઞાતિ પ્રમાણ પત્ર' અથવા અન્ય સેવા ટૅપ કરો."),
            Map.entry(PAYMENTS_REDIRECT,
                    "ચૂકવણી ઇતિહાસ, લાભ વિતરણ અને સ્કીમ payout 'ચૂકવણી અને લાભ' પેજ પર જુઓ."),
            Map.entry(CERTIFICATES_REDIRECT,
                    "તમારા જારી પ્રમાણપત્ર જુઓ અને PDF ડાઉનલોડ કરો — 'મારા પ્રમાણપત્ર' પેજ પર."),
            Map.entry(GRIEVANCES_REDIRECT,
                    "ફરિયાદ નોંધાવો અથવા હાલની ફરિયાદ ટ્રૅક કરો — 'ફરિયાદ / ગ્રીવન્સ' પેજ પર."),
            Map.entry(APPLY_SCHEME_REDIRECT,
                    "BPL રેશન કાર્ડ અને અન્ય કલ્યાણકારી સ્કીમ માટે CAF અરજી ફોર્મ ખોલો. નીચે ટૅપ કરી અરજી શરૂ કરો.")
    );

    public static String get(String key, String lang, String... args) {
        String template = "gu".equals(lang) ? GU.getOrDefault(key, key) : EN.getOrDefault(key, key);
        for (int i = 0; i < args.length; i++) {
            template = template.replace("{" + i + "}", args[i] != null ? args[i] : "");
        }
        return template;
    }

    private Msgs() {}
}
