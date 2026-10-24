package org.magicsword.schemeapp.model;

import java.util.List;
import java.util.Map;

public record ApplicationStatsResponse(
        Map<String, Long> statusCounts,
        double avgTurnaroundHours,
        double medianTurnaroundHours,
        List<StageStat> stageBreakdown,
        List<AssigneeBacklog> backlogByAssignee
) {
    public record StageStat(String stage, double avgHours, long count) {}

    public record AssigneeBacklog(String assignee, long pending) {}
}
