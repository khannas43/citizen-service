package org.magicsword.chatbot.util;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class AppRefNormalizer {

    private static final Pattern CANONICAL =
            Pattern.compile("^(CAS|PEN|MAR|SCH|FAM|GRV)-(\\d{4})-(\\d+)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern ONE_DASH =
            Pattern.compile("^(CAS|PEN|MAR|SCH|FAM|GRV)-(\\d{7,})$", Pattern.CASE_INSENSITIVE);
    private static final Pattern COMPACT =
            Pattern.compile("^(CAS|PEN|MAR|SCH|FAM|GRV)(\\d{7,})$", Pattern.CASE_INSENSITIVE);

    private AppRefNormalizer() {}

    /** PREFIX-YYMM-NNNNNN — pads sequence, inserts missing dashes. */
    public static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String s = raw.trim().toUpperCase().replaceAll("\\s+", "");

        Matcher m = CANONICAL.matcher(s);
        if (m.matches()) {
            return m.group(1) + "-" + m.group(2) + "-" + String.format("%06d", Integer.parseInt(m.group(3)));
        }

        Matcher o = ONE_DASH.matcher(s);
        if (o.matches()) {
            String digits = o.group(2);
            int seq = Integer.parseInt(digits.substring(4));
            return o.group(1) + "-" + digits.substring(0, 4) + "-" + String.format("%06d", seq);
        }

        Matcher c = COMPACT.matcher(s.replace("-", ""));
        if (c.matches()) {
            String digits = c.group(2);
            int seq = Integer.parseInt(digits.substring(4));
            return c.group(1) + "-" + digits.substring(0, 4) + "-" + String.format("%06d", seq);
        }

        return s;
    }
}
