package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.domain.FormDefinitionStatus;
import org.citizen.formdefinition.validation.ValidationIssue;
import org.citizen.formdefinition.validation.ValidationResult;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C4 pure unit tests for {@link FormDefinitionLifecycleService}. No Spring context: the store
 * and validation collaborators are plain Mockito mocks and the clock is fixed, so call ordering
 * and candidate-building semantics can be asserted precisely.
 */
class FormDefinitionLifecycleServiceTest {

    private static final String SERVICE_ID = "svc-a";
    private static final int VERSION = 1;
    private static final long REVISION = 5L;
    private static final Instant FIXED_INSTANT = Instant.parse("2026-07-24T12:00:00Z");
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    private final ObjectMapper mapper = new ObjectMapper();
    private final FormDefinitionStore store = mock(FormDefinitionStore.class);
    private final FormDefinitionValidationService validationService =
            mock(FormDefinitionValidationService.class);
    private final Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
    private final FormDefinitionLifecycleService service =
            new FormDefinitionLifecycleService(store, validationService, clock);

    private ObjectNode storedDocument(FormDefinitionStatus status, String... extraAuditPairs) {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", SERVICE_ID);
        doc.put("version", VERSION);
        doc.put("status", status.name());
        ObjectNode audit = doc.putObject("audit");
        audit.put("createdBy", "svc-account");
        audit.put("createdAt", CREATED_AT.toString());
        for (int i = 0; i + 1 < extraAuditPairs.length; i += 2) {
            audit.put(extraAuditPairs[i], extraAuditPairs[i + 1]);
        }
        return doc;
    }

    private FormDefinitionSnapshot snapshot(JsonNode document, FormDefinitionStatus status, long revision) {
        return new FormDefinitionSnapshot(document, revision, status, CREATED_AT);
    }

    private static ObjectNode requestBody(String targetStatus, String actorId) {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", targetStatus);
        body.put("actorId", actorId);
        return body;
    }

    private static ValidationResult validResult() {
        return new ValidationResult(true, List.of());
    }

    private static ValidationResult invalidResult() {
        return new ValidationResult(false, List.of(ValidationIssue.error("x.code", "message", null)));
    }

    private String ifMatchFor(long revision) {
        return FormDefinitionETag.format(revision);
    }

    private void stubLock() {
        doNothing().when(store).acquireServiceMutationLock(anyString());
    }

    // ---------------------------------------------------------------- happy path / ordering

    @Test
    void draftToSubmittedBuildsCandidateWithSubmittedByAndCallsCollaboratorsInOrder() {
        stubLock();
        ObjectNode current = storedDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode candidate = invocation.getArgument(7);
                            return snapshot(candidate, FormDefinitionStatus.submitted, REVISION + 1);
                        });

        FormDefinitionSnapshot result =
                service.transition(
                        SERVICE_ID,
                        String.valueOf(VERSION),
                        ifMatchFor(REVISION),
                        requestBody("submitted", "alice"));

        InOrder order = inOrder(validationService, store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID); // FB-C4.1: lock before definition lookup
        order.verify(store).findSnapshot(SERVICE_ID, VERSION);
        order.verify(validationService).validate(any());
        order.verify(store)
                .applyLifecycleTransition(
                        eq(SERVICE_ID),
                        eq(VERSION),
                        eq(REVISION),
                        eq(FormDefinitionStatus.draft),
                        eq(FormDefinitionStatus.submitted),
                        eq("alice"),
                        eq(FIXED_INSTANT),
                        any());
        order.verifyNoMoreInteractions();

        assertThat(result.status()).isEqualTo(FormDefinitionStatus.submitted);
        assertThat(result.definition().at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertThat(result.definition().at("/status").asText()).isEqualTo("submitted");
    }

    @Test
    void transitionDoesNotLoadDefinitionBeforeAcquiringServiceMutationLock() {
        stubLock();
        ObjectNode current = storedDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode candidate = invocation.getArgument(7);
                            return snapshot(candidate, FormDefinitionStatus.submitted, REVISION + 1);
                        });

        service.transition(
                SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), requestBody("submitted", "alice"));

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, VERSION);
    }

    @Test
    void candidatePassedToStoreHasSubmittedByAndPreservesCreatedByCreatedAt() {
        stubLock();
        ObjectNode current = storedDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode candidate = invocation.getArgument(7);
                            return snapshot(candidate, FormDefinitionStatus.submitted, REVISION + 1);
                        });

        service.transition(
                SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), requestBody("submitted", "alice"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store)
                .applyLifecycleTransition(
                        anyString(), anyInt(), anyLong(), any(), any(), anyString(), any(), captor.capture());
        JsonNode candidate = captor.getValue();
        assertThat(candidate.at("/audit/createdBy").asText()).isEqualTo("svc-account");
        assertThat(candidate.at("/audit/createdAt").asText()).isEqualTo(CREATED_AT.toString());
        assertThat(candidate.at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertThat(candidate.has("approvedBy")).isFalse();
    }

    @Test
    void submittedToApprovedSetsApprovedByAndPreservesSubmittedBy() {
        stubLock();
        ObjectNode current = storedDocument(FormDefinitionStatus.submitted, "submittedBy", "alice");
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.submitted, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode candidate = invocation.getArgument(7);
                            return snapshot(candidate, FormDefinitionStatus.approved, REVISION + 1);
                        });

        service.transition(
                SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), requestBody("approved", "bob"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store)
                .applyLifecycleTransition(
                        anyString(), anyInt(), anyLong(), any(), any(), anyString(), any(), captor.capture());
        JsonNode candidate = captor.getValue();
        assertThat(candidate.at("/audit/submittedBy").asText()).isEqualTo("alice");
        assertThat(candidate.at("/audit/approvedBy").asText()).isEqualTo("bob");
    }

    @Test
    void approvedToPublishedSetsPublishedAtToClockInstant() {
        stubLock();
        ObjectNode current =
                storedDocument(FormDefinitionStatus.approved, "submittedBy", "alice", "approvedBy", "bob");
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.approved, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode candidate = invocation.getArgument(7);
                            return snapshot(candidate, FormDefinitionStatus.published, REVISION + 1);
                        });

        service.transition(
                SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), requestBody("published", "carol"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store)
                .applyLifecycleTransition(
                        anyString(), anyInt(), anyLong(), any(), any(), anyString(), eq(FIXED_INSTANT), captor.capture());
        JsonNode candidate = captor.getValue();
        assertThat(candidate.at("/audit/publishedAt").asText()).isEqualTo(FIXED_INSTANT.toString());
        // publishedBy is not a governed FormAudit key: publish must not invent one.
        assertThat(candidate.get("audit").has("publishedBy")).isFalse();
    }

    @Test
    void publishedToRetiredAddsNoNewAuditKey() {
        stubLock();
        ObjectNode current =
                storedDocument(
                        FormDefinitionStatus.published,
                        "submittedBy",
                        "alice",
                        "approvedBy",
                        "bob",
                        "publishedAt",
                        "2026-02-01T00:00:00Z");
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.published, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode candidate = invocation.getArgument(7);
                            return snapshot(candidate, FormDefinitionStatus.retired, REVISION + 1);
                        });

        service.transition(
                SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), requestBody("retired", "dave"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store)
                .applyLifecycleTransition(
                        anyString(), anyInt(), anyLong(), any(), any(), anyString(), any(), captor.capture());
        JsonNode candidateAudit = captor.getValue().get("audit");
        assertThat(candidateAudit.properties()).hasSize(5);
        java.util.Set<String> keys = new java.util.HashSet<>();
        candidateAudit.fieldNames().forEachRemaining(keys::add);
        assertThat(keys)
                .containsExactlyInAnyOrder(
                        "createdBy", "createdAt", "submittedBy", "approvedBy", "publishedAt");
    }

    // ---------------------------------------------------------------- request validation

    @Test
    void missingActorIdKeyThrowsInvalidTransitionRequestAndNothingElseCalled() {
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "submitted");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void missingTargetStatusKeyThrowsInvalidTransitionRequest() {
        ObjectNode body = mapper.createObjectNode();
        body.put("actorId", "alice");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void unknownKeyInBodyThrowsInvalidTransitionRequest() {
        ObjectNode body = requestBody("submitted", "alice");
        body.put("extra", "not-allowed");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void unknownTargetStatusValueThrowsInvalidTransitionRequest() {
        ObjectNode body = requestBody("not-a-real-status", "alice");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void targetStatusDraftIsExplicitlyRejectedAsInvalidTransitionRequest() {
        ObjectNode body = requestBody("draft", "alice");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void nonTextualTargetStatusThrowsInvalidTransitionRequest() {
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", 42);
        body.put("actorId", "alice");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void nullBodyThrowsInvalidTransitionRequest() {
        assertThatThrownBy(
                        () -> service.transition(SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), null))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    // ---------------------------------------------------------------- actor admission

    @Test
    void blankActorIdThrowsInvalidActorBeforeStoreLookup() {
        ObjectNode body = requestBody("submitted", "   ");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidActorException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void paddedActorIdThrowsInvalidActorBeforeStoreLookup() {
        ObjectNode body = requestBody("submitted", " alice ");

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidActorException.class);

        verifyNoInteractions(store, validationService);
    }

    // ---------------------------------------------------------------- lookup / concurrency / rules

    @Test
    void notFoundThrowsFormDefinitionNotFoundAndValidationNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION)).thenReturn(Optional.empty());

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("submitted", "alice")))
                .isInstanceOf(FormDefinitionNotFoundException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, VERSION);
        verifyNoInteractions(validationService);
        verify(store, never()).applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void staleRevisionThrowsBeforeRulesCheckAndValidation() {
        ObjectNode current = storedDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION + 999),
                                        requestBody("submitted", "alice")))
                .isInstanceOf(StaleRevisionException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, VERSION);
        verifyNoInteractions(validationService);
        verify(store, never()).applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void disallowedTransitionThrowsLifecycleTransitionNotAllowedAndValidationNeverCalled() {
        ObjectNode current = storedDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));

        // draft -> approved skips submitted.
        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("approved", "alice")))
                .isInstanceOf(LifecycleTransitionNotAllowedException.class);

        verifyNoInteractions(validationService);
        verify(store, never()).applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void retiredSourceRejectsAnyOutgoingTransition() {
        ObjectNode current =
                storedDocument(
                        FormDefinitionStatus.retired,
                        "submittedBy",
                        "alice",
                        "approvedBy",
                        "bob",
                        "publishedAt",
                        "2026-02-01T00:00:00Z");
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.retired, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("submitted", "alice")))
                .isInstanceOf(LifecycleTransitionNotAllowedException.class);

        verifyNoInteractions(validationService);
    }

    // ---------------------------------------------------------------- candidate validation gate

    @Test
    void candidateValidationFailureThrowsAndStoreApplyNeverCalled() {
        ObjectNode current = storedDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(invalidResult());

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("submitted", "alice")))
                .isInstanceOf(FormDefinitionValidationFailedException.class);

        verify(store, never()).applyLifecycleTransition(any(), anyInt(), anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void missingAuditObjectOnStoredDocumentThrowsStoredDefinitionCorrupt() {
        ObjectNode current = mapper.createObjectNode();
        current.put("serviceId", SERVICE_ID);
        current.put("version", VERSION);
        current.put("status", "draft");
        // No "audit" key at all.
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(snapshot(current, FormDefinitionStatus.draft, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("submitted", "alice")))
                .isInstanceOf(StoredDefinitionCorruptException.class);

        verifyNoInteractions(validationService);
    }

    // ---------------------------------------------------------------- If-Match / coordinates

    @Test
    void missingIfMatchThrowsIfMatchRequiredAndStoreNeverCalled() {
        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        null,
                                        requestBody("submitted", "alice")))
                .isInstanceOf(IfMatchRequiredException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void invalidIfMatchThrowsInvalidIfMatchAndStoreNeverCalled() {
        assertThatThrownBy(
                        () ->
                                service.transition(
                                        SERVICE_ID, String.valueOf(VERSION), "*", requestBody("submitted", "alice")))
                .isInstanceOf(InvalidIfMatchException.class);

        verifyNoInteractions(store, validationService);
    }
}
