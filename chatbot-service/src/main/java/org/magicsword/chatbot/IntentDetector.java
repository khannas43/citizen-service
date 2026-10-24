package org.magicsword.chatbot;

import java.util.regex.Pattern;

public final class IntentDetector {

    public static String detect(String input) {
        if (input == null || input.isBlank()) {
            return "DISCOVER";
        }
        String lower = input.toLowerCase();

        if (containsAny(lower,
                "સ્થિતિ", "ટ્રેક", "status", "track", "flw-", "dgt-",
                "cas-", "mar-", "pen-", "fam-", "sch-", "grv-", "check", "where")) {
            return "CHECK_STATUS";
        }
        if (containsAny(lower,
                "payment", "payments", "chukavani", "ચૂકવણી", "disbursement", "payout",
                "benefits timeline", "payments and benefits", "show my payments", "my payments")) {
            return "PAYMENTS";
        }
        if (isViewCertificates(lower)) {
            return "VIEW_CERTIFICATES";
        }
        if (containsAny(lower,
                "grievance", "grievances", "file a grievance", "file grievance",
                "submit a complaint", "submit complaint", "lodge complaint", "register complaint",
                "complaint", "complaints", "ફરિયાદ", "ગ્રીવન્સ", "ફરિયાદ નોંધાવ")) {
            return "FILE_GRIEVANCE";
        }
        if (containsAny(lower,
                "સ્કીમ", "યોજના", "scheme", "schemes", "yojana", "eligible", "scholarship",
                "પ્રધાન", "મુખ્ય", "પાત્ર", "મળ", "પરિવાર")) {
            return "ELIGIBILITY";
        }
        if (containsAny(lower,
                "caste certificate", "caste cert", "apply caste", "apply for caste",
                "જ્ઞાતિ પ્રમાણ", "જ્ઞાતિ", "gnati", "jnati", "caste")
                || containsWord(lower, "obc", "sc", "st", "nt")) {
            return "APPLY_CASTE";
        }
        if (containsAny(lower,
                "પેન્શન", "pension", "old age", "widow", "વૃદ્ધ", "વિધવા", "disability", "વિકલ")) {
            return "APPLY_PENSION";
        }
        if (containsAny(lower,
                "bpl", "ration card", "ration", "rashan", "rasan", "rashan card", "food card", "અનાજ", "રેશન")
                || (lower.contains("apply") && containsAny(lower,
                "scheme", "scholarship", "yojana", "welfare", "bpl", "ration"))) {
            return "APPLY_SCHEME";
        }
        if (containsAny(lower,
                "government service", "government services", "apply for government",
                "apply for a service", "apply for service", "સરકારી સેવા", "સરકારી")) {
            return "APPLY_MENU";
        }
        return "DISCOVER";
    }

    private static boolean isViewCertificates(String lower) {
        if (containsAny(lower,
                "show my certificate", "download my certificate", "view my certificate",
                "my certificate", "list certificate", "certificates page", "my certificates",
                "issued certificate", "go to certificates", "certificates section",
                "પ્રમાણપત્ર જુઓ", "મારા પ્રમાણપત્ર", "પ્રમાણપત્ર ડાઉનલોડ", "પ્રમાણપત્ર જોવા")) {
            return true;
        }
        // "show/download/view certificates" without "apply" or "caste"
        if (lower.contains("certificate") && containsAny(lower, "show", "download", "view", "list", "my")) {
            return !containsAny(lower, "apply", "caste", "obc", "application");
        }
        return false;
    }

    private static boolean containsAny(String text, String... keywords) {
        for (String kw : keywords) {
            if (text.contains(kw)) {
                return true;
            }
        }
        return false;
    }

    private static boolean containsWord(String text, String... words) {
        for (String word : words) {
            if (Pattern.compile("\\b" + Pattern.quote(word) + "\\b").matcher(text).find()) {
                return true;
            }
        }
        return false;
    }

    private IntentDetector() {}
}
