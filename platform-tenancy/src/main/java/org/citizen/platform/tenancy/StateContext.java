package org.citizen.platform.tenancy;

import java.util.regex.Pattern;

/** The state (tenant) the current request serves, e.g. "TG", "TN". Empty means "the default state". */
public final class StateContext {

    private static final Pattern VALID = Pattern.compile("[A-Z]{2}");
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();

    private StateContext() {}

    public static boolean isValid(String code) {
        return code != null && VALID.matcher(code).matches();
    }

    public static void set(String code) {
        if (isValid(code)) {
            CURRENT.set(code);
        } else {
            CURRENT.remove();
        }
    }

    /** @return the state code, or null when the request did not carry one. */
    public static String get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
