package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.domain.FormDefinitionStatus;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C2/C3 pure unit tests for {@link FormDefinitionQueryService}.
 */
class FormDefinitionQueryServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final FormDefinitionStore store = mock(FormDefinitionStore.class);
    private final FormDefinitionQueryService queryService = new FormDefinitionQueryService(store);

    @Test
    void missingDefinitionThrowsNotFound() {
        when(store.findSnapshot(eq("svc"), eq(1))).thenReturn(Optional.empty());

        assertThatThrownBy(() -> queryService.getExact("svc", "1"))
                .isInstanceOf(FormDefinitionNotFoundException.class);

        verify(store).findSnapshot("svc", 1);
    }

    @Test
    void storeAdmissionFailureOnLoadIsTranslatedToStoredDefinitionCorrupt() {
        when(store.findSnapshot(eq("svc"), eq(1)))
                .thenThrow(new FormDefinitionAdmissionException("persisted definition coordinates are invalid"));

        assertThatThrownBy(() -> queryService.getExact("svc", "1"))
                .isInstanceOf(StoredDefinitionCorruptException.class);
    }

    @Test
    void foundDefinitionIsReturned() {
        ObjectNode doc = mapper.createObjectNode().put("serviceId", "svc").put("version", 1);
        when(store.findSnapshot(eq("svc"), eq(1)))
                .thenReturn(
                        Optional.of(
                                new FormDefinitionSnapshot(
                                        doc, 3L, FormDefinitionStatus.draft, Instant.parse("2026-01-01T00:00:00Z"))));

        FormDefinitionSnapshot result = queryService.getExact("svc", "1");

        assertThat(result.definition()).isEqualTo(doc);
        assertThat(result.revision()).isEqualTo(3L);
    }

    @Test
    void invalidQueryCoordinatesRejectedBeforeReachingStore() {
        assertThatThrownBy(() -> queryService.getExact("  padded  ", "1"))
                .isInstanceOf(FormDefinitionAdmissionException.class);
        assertThatThrownBy(() -> queryService.getExact("svc", "01"))
                .isInstanceOf(FormDefinitionAdmissionException.class);

        org.mockito.Mockito.verifyNoInteractions(store);
    }
}
