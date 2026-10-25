package org.citizen.expenditure.service;

/** A CSV import was refused as a whole; {@code line} is the 1-based line in the uploaded file (0 when not about one line). */
public class CsvImportException extends RuntimeException {

    private final int line;

    public CsvImportException(int line, String message) {
        super(line > 0 ? "Line " + line + ": " + message : message);
        this.line = line;
    }

    public int getLine() {
        return line;
    }
}
