package org.citizen.platform.tenancy;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** State names, for code that must recognise "the whole state" as a scope (e.g. a scheme valid state-wide). */
public final class StateNames {

    private static final Map<String, String> BY_CODE = Map.of("GJ", "Gujarat", "TG", "Telangana", "TN", "Tamil Nadu");
    private static final String DEFAULT_CODE = "TG";
    private static final Set<String> NAMES = Set.of(
            "gujarat", "telangana", "tamil nadu", "tamilnadu",
            "ગુજરાત",            // Gujarati: Gujarat
            "తెలంగాణ",      // Telugu: Telangana
            "தமிழ்நாடு"); // Tamil: Tamil Nadu

    private StateNames() {}

    /** True when {@code scope} is the name of a state (English or local script), i.e. state-wide, not a single district. */
    public static boolean isStateWide(String scope) {
        return scope != null && NAMES.contains(scope.trim().toLowerCase(Locale.ROOT));
    }

    /** English name of the state for a code, e.g. "TG" gives "Telangana"; unknown codes give the default state's name. */
    public static String nameOf(String code) {
        return BY_CODE.getOrDefault(code == null ? DEFAULT_CODE : code, BY_CODE.get(DEFAULT_CODE));
    }

    /** English name of the state serving the current request (the default state when the request carries none). */
    public static String currentName() {
        return nameOf(StateContext.get());
    }
}
