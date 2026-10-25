package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.sql.SQLException;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.persistence.FormDefinitionInsertAdapter;
import org.citizen.formdefinition.persistence.FormDefinitionRepository;
import org.springframework.dao.DataIntegrityViolationException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import jakarta.persistence.EntityManager;

class FormDefinitionCoordinateAndInsertUnitTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parseDocumentRejectsFloatingWholeVersion() {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", "svc");
        doc.put("version", 1.0);
        doc.put("status", "draft");
        assertThatThrownBy(() -> FormDefinitionCoordinateParser.parseDocument(doc))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }

    @Test
    void uniqueViolationDetectionUsesSqlStateOnly() {
        SQLException unique = new SQLException("duplicate", "23505");
        SQLException check = new SQLException("check", "23514");
        DataIntegrityViolationException wrappedUnique =
                new DataIntegrityViolationException("wrap", unique);
        DataIntegrityViolationException wrappedCheck =
                new DataIntegrityViolationException("wrap", check);

        assertThat(FormDefinitionInsertAdapter.isUniqueViolation(wrappedUnique)).isTrue();
        assertThat(FormDefinitionInsertAdapter.isUniqueViolation(wrappedCheck)).isFalse();
        assertThat(FormDefinitionInsertAdapter.isUniqueViolation(new RuntimeException("nope"))).isFalse();

        SQLException chained = new SQLException("outer", "23000");
        chained.setNextException(new SQLException("inner-unique", "23505"));
        assertThat(FormDefinitionInsertAdapter.isUniqueViolation(
                        new DataIntegrityViolationException("wrap", chained)))
                .isTrue();
    }

    @Test
    void invalidFindArgumentsNeverTouchRepository() {
        FormDefinitionRepository repository = mock(FormDefinitionRepository.class);
        FormDefinitionInsertAdapter insertAdapter = mock(FormDefinitionInsertAdapter.class);
        EntityManager entityManager = mock(EntityManager.class);
        FormDefinitionStore store = new FormDefinitionStore(repository, insertAdapter, entityManager);

        assertThatThrownBy(() -> store.find(null, 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("  x  ", 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("ok", 0))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> store.find("a".repeat(257), 1))
                .isInstanceOf(FormDefinitionAdmissionException.class);

        verifyNoInteractions(repository, insertAdapter, entityManager);
    }
}
