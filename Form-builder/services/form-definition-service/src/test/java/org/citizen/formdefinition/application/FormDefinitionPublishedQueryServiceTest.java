package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.validation.ValidationResult;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C5 pure Mockito unit tests for {@link FormDefinitionPublishedQueryService}: release-head
 * policy, retired suppression, and the two independent corrupt-data defences (document/column
 * status mismatch and C1 re-validation failure).
 */
class FormDefinitionPublishedQueryServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final FormDefinitionStore store = mock(FormDefinitionStore.class);
    private final FormDefinitionValidationService validationService =
            mock(FormDefinitionValidationService.class);
    private final FormDefinitionPublishedQueryService service =
            new FormDefinitionPublishedQueryService(store, validationService);

    private ObjectNode document(String serviceId, int version, FormDefinitionStatus status) {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", serviceId);
        doc.put("version", version);
        doc.put("status", status.name());
        return doc;
    }

    private FormDefinitionSnapshot snapshot(String serviceId, int version, FormDefinitionStatus status) {
        return new FormDefinitionSnapshot(
                document(serviceId, version, status), 1L, status, Instant.parse("2026-01-01T00:00:00Z"));
    }

    @Test
    void publishedReleaseHeadIsReturnedAfterC1Revalidation() {
        FormDefinitionSnapshot published = snapshot("svc", 3, FormDefinitionStatus.published);
        when(store.findReleaseHead("svc")).thenReturn(Optional.of(published));
        when(validationService.validate(any())).thenReturn(new ValidationResult(true, List.of()));

        FormDefinitionSnapshot result = service.getLatestPublished("svc");

        assertThat(result.status()).isEqualTo(FormDefinitionStatus.published);
        assertThat(result.definition().get("version").asInt()).isEqualTo(3);
        verify(validationService).validate(any());
    }

    @Test
    void higherDraftIsIgnoredWhenStoreReleaseHeadIsThePublishedRow() {
        // The store contract already excludes draft/submitted/approved from the release-head
        // query; simulate that here by returning the published row even though a higher draft
        // conceptually exists for the same service.
        FormDefinitionSnapshot published = snapshot("svc-with-higher-draft", 2, FormDefinitionStatus.published);
        when(store.findReleaseHead("svc-with-higher-draft")).thenReturn(Optional.of(published));
        when(validationService.validate(any())).thenReturn(new ValidationResult(true, List.of()));

        FormDefinitionSnapshot result = service.getLatestPublished("svc-with-higher-draft");

        assertThat(result.definition().get("version").asInt()).isEqualTo(2);
    }

    @Test
    void noReleaseHeadThrowsPublishedNotFound() {
        when(store.findReleaseHead("missing-svc")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getLatestPublished("missing-svc"))
                .isInstanceOf(PublishedFormDefinitionNotFoundException.class);
    }

    @Test
    void retiredReleaseHeadThrowsPublishedNotFoundWithoutValidation() {
        FormDefinitionSnapshot retired = snapshot("retired-svc", 5, FormDefinitionStatus.retired);
        when(store.findReleaseHead("retired-svc")).thenReturn(Optional.of(retired));

        assertThatThrownBy(() -> service.getLatestPublished("retired-svc"))
                .isInstanceOf(PublishedFormDefinitionNotFoundException.class);

        verify(validationService, never()).validate(any());
    }

    @Test
    void c1InvalidPublishedDocumentThrowsStoredDefinitionCorrupt() {
        FormDefinitionSnapshot published = snapshot("bad-doc-svc", 1, FormDefinitionStatus.published);
        when(store.findReleaseHead("bad-doc-svc")).thenReturn(Optional.of(published));
        when(validationService.validate(any()))
                .thenReturn(
                        new ValidationResult(
                                false,
                                List.of(
                                        new org.citizen.formdefinition.validation.ValidationIssue(
                                                "structure.bad",
                                                "bad",
                                                org.citizen.formdefinition.validation.ValidationSeverity.error,
                                                null))));

        assertThatThrownBy(() -> service.getLatestPublished("bad-doc-svc"))
                .isInstanceOf(StoredDefinitionCorruptException.class);
    }

    @Test
    void documentStatusColumnMismatchThrowsStoredDefinitionCorruptWithoutRevalidation() {
        // Column status is `published`, but the embedded document still says `draft` —
        // this must never be surfaced as a legitimate published lookup.
        ObjectNode mismatched = document("mismatch-svc", 1, FormDefinitionStatus.draft);
        FormDefinitionSnapshot inconsistent =
                new FormDefinitionSnapshot(
                        mismatched, 1L, FormDefinitionStatus.published, Instant.parse("2026-01-01T00:00:00Z"));
        when(store.findReleaseHead("mismatch-svc")).thenReturn(Optional.of(inconsistent));

        assertThatThrownBy(() -> service.getLatestPublished("mismatch-svc"))
                .isInstanceOf(StoredDefinitionCorruptException.class);

        verify(validationService, never()).validate(any());
    }

    @Test
    void missingDocumentStatusFieldThrowsStoredDefinitionCorrupt() {
        ObjectNode noStatus = document("no-status-svc", 1, FormDefinitionStatus.published);
        noStatus.remove("status");
        FormDefinitionSnapshot snapshot =
                new FormDefinitionSnapshot(
                        noStatus, 1L, FormDefinitionStatus.published, Instant.parse("2026-01-01T00:00:00Z"));
        when(store.findReleaseHead("no-status-svc")).thenReturn(Optional.of(snapshot));

        assertThatThrownBy(() -> service.getLatestPublished("no-status-svc"))
                .isInstanceOf(StoredDefinitionCorruptException.class);
    }

    @Test
    void storeAdmissionFailureIsTranslatedToStoredDefinitionCorrupt() {
        when(store.findReleaseHead("boom-svc"))
                .thenThrow(new FormDefinitionAdmissionException("persisted definition coordinates are invalid"));

        assertThatThrownBy(() -> service.getLatestPublished("boom-svc"))
                .isInstanceOf(StoredDefinitionCorruptException.class);
    }

    @Test
    void invalidServiceIdRejectedBeforeReachingStore() {
        assertThatThrownBy(() -> service.getLatestPublished("  padded  "))
                .isInstanceOf(FormDefinitionAdmissionException.class);

        verify(store, never()).findReleaseHead(any());
    }
}
