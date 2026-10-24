package org.magicsword.expenditure.service;

import org.magicsword.expenditure.entity.IntegrityAlert;

import java.util.ArrayList;
import java.util.List;

/** Per-run settings and, in dry-run mode, findings collected instead of persisting alerts. */
final class DetectionRunContext {

    enum Mode { PERSIST, COLLECT }

    private final Mode mode;
    private final DetectionSettings settings;
    private final List<CollectedFinding> findings = new ArrayList<>();
    private final List<IntegrityAlert> sessionAlerts = new ArrayList<>();

    private DetectionRunContext(Mode mode, DetectionSettings settings) {
        this.mode = mode;
        this.settings = settings;
    }

    static DetectionRunContext persist(DetectionSettings settings) {
        return new DetectionRunContext(Mode.PERSIST, settings);
    }

    static DetectionRunContext collect(DetectionSettings settings) {
        return new DetectionRunContext(Mode.COLLECT, settings);
    }

    DetectionSettings settings() {
        return settings;
    }

    boolean isCollecting() {
        return mode == Mode.COLLECT;
    }

    void record(IntegrityAlert alert) {
        sessionAlerts.add(alert);
        findings.add(CollectedFinding.fromAlert(alert));
    }

    List<CollectedFinding> findings() {
        return List.copyOf(findings);
    }

    List<IntegrityAlert> sessionAlerts() {
        return List.copyOf(sessionAlerts);
    }
}
