package org.citizen.expenditure.service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Predicate;

/** The CSV reading shared by the importers: header detection, quoted fields, and errors that name the line. */
final class CsvSupport {

    private CsvSupport() {}

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    /** One data row with helpers that report problems against its line number. */
    record Row(int line, String[] cols) {
        void require(boolean ok, String message) {
            if (!ok) throw new CsvImportException(line, message);
        }

        UUID uuid(String raw, String field) {
            try {
                return UUID.fromString(raw.trim());
            } catch (IllegalArgumentException e) {
                throw new CsvImportException(line, field + " '" + raw.trim() + "' is not a valid id");
            }
        }

        LocalDate date(String raw, String field) {
            try {
                return LocalDate.parse(raw.trim());
            } catch (DateTimeParseException e) {
                throw new CsvImportException(line, field + " '" + raw.trim() + "' is not a date (use YYYY-MM-DD)");
            }
        }

        BigDecimal amount(String raw, String field) {
            try {
                return new BigDecimal(raw.trim());
            } catch (NumberFormatException e) {
                throw new CsvImportException(line, field + " '" + raw.trim() + "' is not a number");
            }
        }
    }

    /**
     * Reads the data rows. The first line is a header and is skipped unless its first cell is a valid value for that
     * file ({@code firstCellIsData}): a header row says "unit_id", a data row holds an id.
     */
    static List<Row> readRows(InputStream in, Predicate<String> firstCellIsData) throws IOException {
        List<Row> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            int number = 0;
            boolean first = true;
            while ((line = reader.readLine()) != null) {
                number++;
                if (first) line = line.startsWith("\uFEFF") ? line.substring(1) : line;     // Excel's byte-order mark
                if (line.isBlank()) continue;
                String[] cols = splitCsvLine(line);
                if (first) {
                    first = false;
                    if (!firstCellIsData.test(cols[0].trim())) continue;
                }
                rows.add(new Row(number, cols));
            }
        }
        return rows;
    }

    static boolean looksLikeAmount(String s) {
        if (s == null || s.isBlank()) return false;
        try {
            new BigDecimal(s.trim());
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    static boolean looksLikeUuid(String s) {
        try {
            UUID.fromString(s);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /** Splits one CSV line: commas inside "double quotes" stay in the field, and "" inside quotes is a quote. */
    static String[] splitCsvLine(String line) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"') {
                    if (i + 1 < line.length() && line.charAt(i + 1) == '"') { cur.append('"'); i++; }
                    else quoted = false;
                } else {
                    cur.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                out.add(cur.toString());
                cur.setLength(0);
            } else {
                cur.append(ch);
            }
        }
        out.add(cur.toString());
        return out.toArray(new String[0]);
    }
}
