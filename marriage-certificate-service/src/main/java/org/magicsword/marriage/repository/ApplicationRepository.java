package org.magicsword.marriage.repository;

import org.magicsword.marriage.model.ApplicationResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Repository
public class ApplicationRepository {

    private static final RowMapper<ApplicationResponse> ROW_MAPPER = (rs, rowNum) -> {
        Timestamp created = rs.getTimestamp("created_at");
        String createdAt = created != null ? created.toInstant().toString() : null;
        return new ApplicationResponse(
                rs.getString("engine_ref"),
                rs.getString("application_no"),
                rs.getString("status"),
                rs.getString("current_task"),
                rs.getString("assignee"),
                rs.getString("candidate_groups"),
                rs.getString("applicant_name"),
                rs.getString("spouse_name"),
                rs.getString("tenant_id"),
                createdAt,
                rs.getString("aadhaar_ref")
        );
    };

    private final JdbcTemplate jdbc;

    public ApplicationRepository(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    public void insert(ApplicationResponse app, String businessId, String workflowId) {
        jdbc.update("""
                INSERT INTO applications
                    (engine_ref, application_no, business_id, workflow_id, applicant_name, spouse_name,
                     tenant_id, status, current_task, assignee, candidate_groups, aadhaar_ref)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                app.engineRef(),
                app.applicationNo(),
                businessId,
                workflowId,
                app.applicantName(),
                app.casteCode(),
                app.tenantId(),
                app.status(),
                app.currentTask(),
                app.assignee(),
                app.candidateGroups(),
                app.aadhaarRef()
        );
    }

    public List<ApplicationResponse> findByAadhaarRef(String aadhaarRef) {
        return jdbc.query(
                "SELECT * FROM applications WHERE aadhaar_ref = ? ORDER BY created_at DESC",
                ROW_MAPPER,
                aadhaarRef
        );
    }

    public Optional<ApplicationResponse> findByApplicationNo(String applicationNo) {
        List<ApplicationResponse> rows = jdbc.query(
                "SELECT * FROM applications WHERE application_no = ?",
                ROW_MAPPER,
                applicationNo
        );
        return rows.stream().findFirst();
    }

    public Optional<ApplicationResponse> findByEngineRef(String engineRef) {
        List<ApplicationResponse> rows = jdbc.query(
                "SELECT * FROM applications WHERE engine_ref = ?",
                ROW_MAPPER,
                engineRef
        );
        return rows.stream().findFirst();
    }

    public Optional<ApplicationRecord> findRecordByEngineRef(String engineRef) {
        List<ApplicationRecord> rows = jdbc.query(
                "SELECT engine_ref, business_id, workflow_id, status FROM applications WHERE engine_ref = ?",
                (rs, rowNum) -> new ApplicationRecord(
                        rs.getString("engine_ref"),
                        rs.getString("business_id"),
                        rs.getString("workflow_id"),
                        rs.getString("status")
                ),
                engineRef
        );
        return rows.stream().findFirst();
    }

    public List<ApplicationResponse> findPending() {
        return jdbc.query(
                "SELECT * FROM applications WHERE status = 'PENDING' ORDER BY created_at ASC",
                ROW_MAPPER
        );
    }

    public void updateStatus(String engineRef, String status, String currentTask) {
        jdbc.update(
                "UPDATE applications SET status = ?, current_task = ?, updated_at = NOW() WHERE engine_ref = ?",
                status,
                currentTask,
                engineRef
        );
    }

    public Map<String, Long> countsByStatus() {
        Map<String, Long> counts = new java.util.LinkedHashMap<>();
        jdbc.query("SELECT status, COUNT(*) AS cnt FROM applications GROUP BY status", rs -> {
            counts.put(rs.getString("status"), rs.getLong("cnt"));
        });
        return counts;
    }

    public List<Long> turnaroundHours() {
        return jdbc.query(
                "SELECT EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 AS hours " +
                        "FROM applications WHERE status <> 'PENDING'",
                (rs, rowNum) -> rs.getLong("hours")
        );
    }

    public List<AssigneeCount> backlogByAssignee() {
        return jdbc.query(
                "SELECT COALESCE(assignee, 'unassigned') AS assignee, COUNT(*) AS cnt " +
                        "FROM applications WHERE status = 'PENDING' GROUP BY assignee",
                (rs, rowNum) -> new AssigneeCount(rs.getString("assignee"), rs.getLong("cnt"))
        );
    }

    public record ApplicationRecord(
            String engineRef,
            String businessId,
            String workflowId,
            String status
    ) {}

    public record AssigneeCount(String assignee, long pending) {}
}
