package org.citizen.formdefinition.persistence;

import java.sql.SQLException;

import org.citizen.formdefinition.application.DuplicateFormDefinitionException;
import org.citizen.formdefinition.domain.FormDefinitionEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;

/**
 * Create-only persistence adapter (FB-C0.1). Uses {@link EntityManager#persist} so new
 * definitions are always INSERT — never Spring Data {@code save}/{@code merge}.
 */
@Repository
public class FormDefinitionInsertAdapter {

    private static final String UNIQUE_VIOLATION = "23505";

    private final EntityManager entityManager;

    public FormDefinitionInsertAdapter(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /**
     * Persist a new entity and flush. The database PK is the authoritative duplicate guard.
     */
    public void insertNew(FormDefinitionEntity entity) {
        String serviceId = entity.getId().getServiceId();
        int version = entity.getId().getVersion();
        try {
            entityManager.persist(entity);
            entityManager.flush();
        } catch (DataIntegrityViolationException ex) {
            if (isUniqueViolation(ex)) {
                throw new DuplicateFormDefinitionException(serviceId, version, ex);
            }
            throw ex;
        } catch (PersistenceException ex) {
            if (isUniqueViolation(ex)) {
                throw new DuplicateFormDefinitionException(serviceId, version, ex);
            }
            throw ex;
        }
    }

    /**
     * Translate only PostgreSQL SQLSTATE 23505 into a duplicate signal.
     * Walks nested causes and {@link SQLException#getNextException()} chains.
     */
    public static boolean isUniqueViolation(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof SQLException sqlException) {
                if (UNIQUE_VIOLATION.equals(sqlException.getSQLState())) {
                    return true;
                }
                SQLException next = sqlException.getNextException();
                while (next != null) {
                    if (UNIQUE_VIOLATION.equals(next.getSQLState())) {
                        return true;
                    }
                    next = next.getNextException();
                }
            }
            current = current.getCause();
        }
        return false;
    }
}
