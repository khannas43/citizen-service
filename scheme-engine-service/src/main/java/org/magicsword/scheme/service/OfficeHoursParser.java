package org.magicsword.scheme.service;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class OfficeHoursParser {

    private static final Pattern HOURS = Pattern.compile(
            "(\\d{1,2}):(\\d{2}).*?(\\d{1,2}):(\\d{2})", Pattern.CASE_INSENSITIVE);

    private OfficeHoursParser() {}

    /** Offices are in Gujarat; the server clock is UTC, so evaluate hours in India time. */
    private static final ZoneId OFFICE_ZONE = ZoneId.of("Asia/Kolkata");

    public static Boolean isOpenNow(String workingHours, String weeklyOff) {
        return isOpenNow(workingHours, weeklyOff, ZonedDateTime.now(OFFICE_ZONE));
    }

    public static Boolean isOpenNow(String workingHours, String weeklyOff, ZonedDateTime at) {
        if (workingHours == null || workingHours.isBlank()) return null;
        ZonedDateTime local = at.withZoneSameInstant(OFFICE_ZONE);
        DayOfWeek today = local.getDayOfWeek();
        if (weeklyOff != null && weeklyOff.toLowerCase(Locale.ROOT).contains(dayName(today).toLowerCase(Locale.ROOT))) {
            return false;
        }
        Matcher m = HOURS.matcher(workingHours);
        if (!m.find()) return null;
        try {
            LocalTime open = LocalTime.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)));
            LocalTime close = LocalTime.of(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(4)));
            LocalTime now = local.toLocalTime();
            return !now.isBefore(open) && now.isBefore(close);
        } catch (DateTimeParseException | NumberFormatException e) {
            return null;
        }
    }

    private static String dayName(DayOfWeek d) {
        return d.name().charAt(0) + d.name().substring(1).toLowerCase(Locale.ROOT);
    }
}
