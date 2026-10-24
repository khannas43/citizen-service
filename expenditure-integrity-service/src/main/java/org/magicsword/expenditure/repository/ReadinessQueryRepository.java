package org.magicsword.expenditure.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.magicsword.expenditure.entity.MasterChangeLog;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public class ReadinessQueryRepository {

    @PersistenceContext
    private EntityManager em;

    public long countUnitsMissingTalukaOrVillage() {
        return singleLong("""
                SELECT COUNT(u) FROM EntitlementUnit u
                WHERE u.taluka IS NULL OR TRIM(u.taluka) = '' OR u.village IS NULL OR TRIM(u.village) = ''
                """);
    }

    public long countUnits() {
        return singleLong("SELECT COUNT(u) FROM EntitlementUnit u");
    }

    public long countUnitsMissingIncomeOrAge() {
        return singleLong("SELECT COUNT(u) FROM EntitlementUnit u WHERE u.incomeSnapshot IS NULL OR u.ageSnapshot IS NULL");
    }

    public long countActiveUnits() {
        return singleLong("SELECT COUNT(u) FROM EntitlementUnit u WHERE UPPER(u.status) = 'ACTIVE'");
    }

    public long countActiveUnitsWithoutRecentSettlement(LocalDate since) {
        return singleLong("""
                SELECT COUNT(u) FROM EntitlementUnit u
                WHERE UPPER(u.status) = 'ACTIVE' AND NOT EXISTS (
                  SELECT 1 FROM PaymentSettlement p
                  WHERE p.unitId = u.id AND p.periodEnd >= :since
                )
                """, "since", since);
    }

    public Optional<LocalDate> maxUnitPeriodEnd() {
        return optionalDate("SELECT MAX(u.periodEnd) FROM EntitlementUnit u");
    }

    public long countSettlements() {
        return singleLong("SELECT COUNT(p) FROM PaymentSettlement p");
    }

    public long countSettlementsMissingBankToken() {
        return singleLong("SELECT COUNT(p) FROM PaymentSettlement p WHERE p.bankToken IS NULL OR TRIM(p.bankToken) = ''");
    }

    public long countSettlementsMissingTransactionRef() {
        return singleLong("SELECT COUNT(p) FROM PaymentSettlement p WHERE p.transactionRef IS NULL OR TRIM(p.transactionRef) = ''");
    }

    public Optional<LocalDate> maxSettlementPeriodEnd() {
        return optionalDate("SELECT MAX(p.periodEnd) FROM PaymentSettlement p");
    }

    public long countDistinctBeneficiaryPeople() {
        return singleLong("""
                SELECT COUNT(DISTINCT u.personId) FROM EntitlementUnit u
                WHERE u.personId IS NOT NULL AND TRIM(u.personId) <> ''
                """);
    }

    public long countPeopleWithoutVerificationEvent() {
        return singleLong("""
                SELECT COUNT(DISTINCT u.personId) FROM EntitlementUnit u
                WHERE u.personId IS NOT NULL AND TRIM(u.personId) <> ''
                AND NOT EXISTS (SELECT 1 FROM VerificationEvent v WHERE v.personId = u.personId)
                """);
    }

    public Optional<LocalDate> maxVerificationEventDate() {
        return optionalDate("SELECT MAX(v.eventDate) FROM VerificationEvent v");
    }

    public long countBankTokenChanges() {
        return singleLong("SELECT COUNT(m) FROM MasterChangeLog m WHERE LOWER(m.fieldName) = 'bank_token'");
    }

    public long countBankChangesWithoutApproval() {
        return singleLong("""
                SELECT COUNT(m) FROM MasterChangeLog m
                WHERE LOWER(m.fieldName) = 'bank_token'
                AND (m.approvalRef IS NULL OR TRIM(m.approvalRef) = '')
                """);
    }

    public long countMasterChanges() {
        return singleLong("SELECT COUNT(m) FROM MasterChangeLog m");
    }

    public Optional<LocalDateTime> maxMasterChangeAt() {
        return optionalDateTime("SELECT MAX(m.changedAt) FROM MasterChangeLog m");
    }

    public long countEmployees() {
        return singleLong("SELECT COUNT(e) FROM EmployeeIdentity e");
    }

    public long countEmployeesWithoutServiceEvent() {
        return singleLong("""
                SELECT COUNT(e) FROM EmployeeIdentity e
                WHERE NOT EXISTS (SELECT 1 FROM ServiceEvent s WHERE s.employeeCode = e.employeeCode)
                """);
    }

    public long countEmployeesMissingPersonLink() {
        return singleLong("SELECT COUNT(e) FROM EmployeeIdentity e WHERE e.personId IS NULL OR TRIM(e.personId) = ''");
    }

    public long countEmployeesMissingDistrict() {
        return singleLong("SELECT COUNT(e) FROM EmployeeIdentity e WHERE e.district IS NULL OR TRIM(e.district) = ''");
    }

    public Optional<LocalDate> maxEmployeeStatusSince() {
        return optionalDate("SELECT MAX(e.statusSince) FROM EmployeeIdentity e");
    }

    public Optional<LocalDate> maxServiceEventDate() {
        return optionalDate("SELECT MAX(s.effectiveDate) FROM ServiceEvent s");
    }

    public long countPayrollRows() {
        return singleLong("SELECT COUNT(p) FROM PayrollSettlement p");
    }

    public long countPayrollMissingTransactionRef() {
        return singleLong("SELECT COUNT(p) FROM PayrollSettlement p WHERE p.transactionRef IS NULL OR TRIM(p.transactionRef) = ''");
    }

    public Optional<LocalDate> maxPayrollPeriodEnd() {
        return optionalDate("SELECT MAX(p.periodEnd) FROM PayrollSettlement p");
    }

    public long countPensioners() {
        return singleLong("SELECT COUNT(DISTINCT pa.employeeCode) FROM PensionAuthorisation pa");
    }

    public long countPensionersWithoutLifeCertificate() {
        return singleLong("""
                SELECT COUNT(DISTINCT pa.employeeCode) FROM PensionAuthorisation pa
                WHERE NOT EXISTS (
                  SELECT 1 FROM MasterChangeLog m
                  WHERE m.personId = pa.employeeCode
                  AND LOWER(m.fieldName) = :field
                )
                """, "field", MasterChangeLog.LIFE_CERTIFICATE_FIELD.toLowerCase());
    }

    public Optional<LocalDate> maxPensionEffectiveFrom() {
        return optionalDate("SELECT MAX(pa.effectiveFrom) FROM PensionAuthorisation pa");
    }

    public long countPensionPayrollWithoutAuthorisation() {
        return singleLong("""
                SELECT COUNT(p) FROM PayrollSettlement p
                WHERE UPPER(p.component) = 'PENSION'
                AND NOT EXISTS (SELECT 1 FROM PensionAuthorisation pa WHERE pa.employeeCode = p.employeeCode)
                """);
    }

    public long countPensionPayrollRows() {
        return singleLong("SELECT COUNT(p) FROM PayrollSettlement p WHERE UPPER(p.component) = 'PENSION'");
    }

    private long singleLong(String jpql) {
        Long n = em.createQuery(jpql, Long.class).getSingleResult();
        return n == null ? 0L : n;
    }

    private long singleLong(String jpql, String param, Object value) {
        Long n = em.createQuery(jpql, Long.class).setParameter(param, value).getSingleResult();
        return n == null ? 0L : n;
    }

    private Optional<LocalDate> optionalDate(String jpql) {
        LocalDate d = em.createQuery(jpql, LocalDate.class).getSingleResult();
        return Optional.ofNullable(d);
    }

    private Optional<LocalDateTime> optionalDateTime(String jpql) {
        LocalDateTime d = em.createQuery(jpql, LocalDateTime.class).getSingleResult();
        return Optional.ofNullable(d);
    }
}
