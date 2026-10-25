package org.citizen.scheme.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OfficeHoursParserTest {

    @Test
    void parsesWorkingHoursOrNull() {
        assertNull(OfficeHoursParser.isOpenNow(null, null));
        assertNull(OfficeHoursParser.isOpenNow("By appointment", "Sunday"));
        assertNotNull(OfficeHoursParser.isOpenNow("Mon–Sat 00:00–23:59", null));
    }

    @Test
    void usesIndiaTimeNotServerTime() {
        // 08:45 UTC on a Tuesday is 14:15 in Gujarat: open for 10:30-18:10.
        java.time.ZonedDateTime utc = java.time.ZonedDateTime.of(2026, 10, 6, 8, 45, 0, 0, java.time.ZoneId.of("UTC"));
        assertEquals(Boolean.TRUE, OfficeHoursParser.isOpenNow("Mon–Sat 10:30–18:10", "Sunday", utc));
    }

    @Test
    void closedBeforeOpeningAndAfterClosingInIndiaTime() {
        // 04:00 UTC = 09:30 IST (before opening); 13:00 UTC = 18:30 IST (after closing).
        java.time.ZoneId utcZone = java.time.ZoneId.of("UTC");
        assertEquals(Boolean.FALSE, OfficeHoursParser.isOpenNow("Mon–Sat 10:30–18:10", "Sunday",
                java.time.ZonedDateTime.of(2026, 10, 6, 4, 0, 0, 0, utcZone)));
        assertEquals(Boolean.FALSE, OfficeHoursParser.isOpenNow("Mon–Sat 10:30–18:10", "Sunday",
                java.time.ZonedDateTime.of(2026, 10, 6, 13, 0, 0, 0, utcZone)));
    }

    @Test
    void weeklyOffUsesIndiaWeekday() {
        // 20:00 UTC Saturday is 01:30 IST Sunday: weekly off applies.
        java.time.ZonedDateTime satEveningUtc = java.time.ZonedDateTime.of(2026, 10, 3, 20, 0, 0, 0, java.time.ZoneId.of("UTC"));
        assertEquals(Boolean.FALSE, OfficeHoursParser.isOpenNow("Mon–Sat 00:00–23:59", "Sunday", satEveningUtc));
    }
}
