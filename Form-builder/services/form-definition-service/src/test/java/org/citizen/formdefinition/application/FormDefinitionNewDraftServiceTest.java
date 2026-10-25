package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
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
 * FB-C4 pure unit tests for {@link FormDefinitionNewDraftService}. No Spring context: the store
 * and validation collaborators are plain Mockito mocks and the clock is fixed, so allocation /
 * re-check ordering and candidate-building semantics can be asserted precisely.
 */
class FormDefinitionNewDraftServiceTest {

    private static final String SERVICE_ID = "svc-a";
    private static final int SOURCE_VERSION = 3;
    private static final int NEXT_VERSION = 4;
    private static final long REVISION = 7L;
    private static final Instant FIXED_INSTANT = Instant.parse("2026-07-24T12:00:00Z");
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    private final ObjectMapper mapper = new ObjectMapper();
    private final FormDefinitionStore store = mock(FormDefinitionStore.class);
    private final FormDefinitionValidationService validationService =
            mock(FormDefinitionValidationService.class);
    private final Clock clock = Clock.fixed(FIXED_INSTANT, ZoneOffset.UTC);
    private final FormDefinitionNewDraftService service =
            new FormDefinitionNewDraftService(store, validationService, clock);

    private ObjectNode sourceDocument(FormDefinitionStatus status) {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", SERVICE_ID);
        doc.put("version", SOURCE_VERSION);
        doc.put("status", status.name());
        doc.putObject("jsonSchema").put("marker", "schema");
        doc.putObject("uiSchema").put("marker", "ui");
        doc.putObject("meta").put("marker", "meta");
        ObjectNode audit = doc.putObject("audit");
        audit.put("createdBy", "original-creator");
        audit.put("createdAt", CREATED_AT.toString());
        if (status == FormDefinitionStatus.published || status == FormDefinitionStatus.retired) {
            audit.put("submittedBy", "alice");
            audit.put("approvedBy", "bob");
            audit.put("publishedAt", "2026-02-01T00:00:00Z");
        }
        return doc;
    }

    private FormDefinitionSnapshot snapshot(JsonNode document, FormDefinitionStatus status, long revision) {
        return new FormDefinitionSnapshot(document, revision, status, CREATED_AT);
    }

    private static ObjectNode requestBody(String createdBy) {
        ObjectMapper mapper = new ObjectMapper();
        ObjectNode body = mapper.createObjectNode();
        body.put("createdBy", createdBy);
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

    private void stubHappyPathForStatus(FormDefinitionStatus sourceStatus) {
        doNothing().when(store).acquireServiceMutationLock(anyString());
        ObjectNode source = sourceDocument(sourceStatus);
        FormDefinitionSnapshot sourceSnapshot = snapshot(source, sourceStatus, REVISION);
        when(store.findSnapshot(SERVICE_ID, SOURCE_VERSION)).thenReturn(Optional.of(sourceSnapshot));
        when(store.allocateNextVersion(SERVICE_ID)).thenReturn(NEXT_VERSION);
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.create(any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode arg = invocation.getArgument(0);
                            return snapshot(arg, FormDefinitionStatus.draft, 0L);
                        });
    }

    // ---------------------------------------------------------------- happy path / ordering

    @Test
    void publishedSourceClonesInOrderLockThenFindThenAllocateThenValidateThenCreate() {
        stubHappyPathForStatus(FormDefinitionStatus.published);

        FormDefinitionSnapshot result =
                service.createFromVersion(
                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), requestBody("dana"));

        InOrder order = inOrder(store, validationService);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID); // FB-C4.1: lock before any source load
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION); // sole cloneability/staleness check
        order.verify(store).allocateNextVersion(SERVICE_ID);
        order.verify(validationService).validate(any());
        order.verify(store).create(any());

        verify(store, times(1)).acquireServiceMutationLock(SERVICE_ID);
        verify(store, times(1)).findSnapshot(SERVICE_ID, SOURCE_VERSION);

        assertThat(result.status()).isEqualTo(FormDefinitionStatus.draft);
        assertThat(result.definition().get("version").asInt()).isEqualTo(NEXT_VERSION);
        assertThat(result.definition().get("serviceId").asText()).isEqualTo(SERVICE_ID);
    }

    @Test
    void cloneDoesNotLoadSourceBeforeAcquiringServiceMutationLock() {
        stubHappyPathForStatus(FormDefinitionStatus.published);

        service.createFromVersion(
                SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), requestBody("dana"));

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION);
    }

    @Test
    void retiredSourceIsAlsoCloneable() {
        stubHappyPathForStatus(FormDefinitionStatus.retired);

        FormDefinitionSnapshot result =
                service.createFromVersion(
                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), requestBody("dana"));

        assertThat(result.status()).isEqualTo(FormDefinitionStatus.draft);
    }

    @Test
    void newDraftCopiesJsonSchemaUiSchemaMetaVerbatimAndSetsOnlyCreatedByCreatedAtAudit() {
        stubHappyPathForStatus(FormDefinitionStatus.published);

        service.createFromVersion(
                SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), requestBody("dana"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store).create(captor.capture());
        JsonNode draft = captor.getValue();

        assertThat(draft.get("status").asText()).isEqualTo("draft");
        assertThat(draft.get("version").asInt()).isEqualTo(NEXT_VERSION);
        assertThat(draft.get("jsonSchema").get("marker").asText()).isEqualTo("schema");
        assertThat(draft.get("uiSchema").get("marker").asText()).isEqualTo("ui");
        assertThat(draft.get("meta").get("marker").asText()).isEqualTo("meta");

        JsonNode audit = draft.get("audit");
        java.util.Set<String> keys = new java.util.HashSet<>();
        audit.fieldNames().forEachRemaining(keys::add);
        assertThat(keys).containsExactlyInAnyOrder("createdBy", "createdAt");
        assertThat(audit.get("createdBy").asText()).isEqualTo("dana");
        assertThat(audit.get("createdAt").asText()).isEqualTo(FIXED_INSTANT.toString());
    }

    @Test
    void createdAtUsesFixedClockInstant() {
        stubHappyPathForStatus(FormDefinitionStatus.published);

        service.createFromVersion(
                SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), requestBody("dana"));

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store).create(captor.capture());
        assertThat(captor.getValue().at("/audit/createdAt").asText()).isEqualTo(FIXED_INSTANT.toString());
    }

    // ---------------------------------------------------------------- cloneability / staleness

    @Test
    void draftSourceThrowsSourceNotCloneableAndAllocateNeverCalled() {
        ObjectNode source = sourceDocument(FormDefinitionStatus.draft);
        when(store.findSnapshot(SERVICE_ID, SOURCE_VERSION))
                .thenReturn(Optional.of(snapshot(source, FormDefinitionStatus.draft, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID,
                                        String.valueOf(SOURCE_VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("dana")))
                .isInstanceOf(SourceNotCloneableException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION);
        verify(store, never()).allocateNextVersion(anyString());
        verify(store, never()).create(any());
        verifyNoInteractions(validationService);
    }

    @Test
    void submittedSourceThrowsSourceNotCloneable() {
        ObjectNode source = sourceDocument(FormDefinitionStatus.submitted);
        when(store.findSnapshot(SERVICE_ID, SOURCE_VERSION))
                .thenReturn(Optional.of(snapshot(source, FormDefinitionStatus.submitted, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID,
                                        String.valueOf(SOURCE_VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("dana")))
                .isInstanceOf(SourceNotCloneableException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION);
        verify(store, never()).allocateNextVersion(anyString());
        verify(store, never()).create(any());
    }

    @Test
    void approvedSourceThrowsSourceNotCloneable() {
        ObjectNode source = sourceDocument(FormDefinitionStatus.approved);
        when(store.findSnapshot(SERVICE_ID, SOURCE_VERSION))
                .thenReturn(Optional.of(snapshot(source, FormDefinitionStatus.approved, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID,
                                        String.valueOf(SOURCE_VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("dana")))
                .isInstanceOf(SourceNotCloneableException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION);
        verify(store, never()).allocateNextVersion(anyString());
        verify(store, never()).create(any());
    }

    @Test
    void notFoundSourceThrowsFormDefinitionNotFound() {
        when(store.findSnapshot(SERVICE_ID, SOURCE_VERSION)).thenReturn(Optional.empty());

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID,
                                        String.valueOf(SOURCE_VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("dana")))
                .isInstanceOf(FormDefinitionNotFoundException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION);
        verify(store, never()).allocateNextVersion(anyString());
        verify(store, never()).create(any());
    }

    @Test
    void staleSourceRevisionThrowsBeforeAllocation() {
        ObjectNode source = sourceDocument(FormDefinitionStatus.published);
        when(store.findSnapshot(SERVICE_ID, SOURCE_VERSION))
                .thenReturn(Optional.of(snapshot(source, FormDefinitionStatus.published, REVISION)));

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID,
                                        String.valueOf(SOURCE_VERSION),
                                        ifMatchFor(REVISION + 999),
                                        requestBody("dana")))
                .isInstanceOf(StaleRevisionException.class);

        InOrder order = inOrder(store);
        order.verify(store).acquireServiceMutationLock(SERVICE_ID);
        order.verify(store).findSnapshot(SERVICE_ID, SOURCE_VERSION);
        verify(store, never()).allocateNextVersion(anyString());
        verify(store, never()).create(any());
        verifyNoInteractions(validationService);
    }

    // ---------------------------------------------------------------- candidate validation gate

    @Test
    void candidateValidationFailureThrowsAndStoreCreateNeverCalled() {
        stubHappyPathForStatus(FormDefinitionStatus.published);
        when(validationService.validate(any())).thenReturn(invalidResult());

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID,
                                        String.valueOf(SOURCE_VERSION),
                                        ifMatchFor(REVISION),
                                        requestBody("dana")))
                .isInstanceOf(FormDefinitionValidationFailedException.class);

        verify(store, never()).create(any());
    }

    // ---------------------------------------------------------------- request body / actor

    @Test
    void missingCreatedByKeyThrowsInvalidTransitionRequestAndStoreNeverTouched() {
        ObjectNode body = mapper.createObjectNode();

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void unknownKeyInBodyThrowsInvalidTransitionRequest() {
        ObjectNode body = requestBody("dana");
        body.put("extra", "nope");

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void nonTextualCreatedByThrowsInvalidTransitionRequest() {
        ObjectNode body = mapper.createObjectNode();
        body.put("createdBy", 123);

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void nullBodyThrowsInvalidTransitionRequest() {
        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), null))
                .isInstanceOf(InvalidTransitionRequestException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void blankCreatedByThrowsInvalidActorBeforeStoreLookup() {
        ObjectNode body = requestBody("   ");

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidActorException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void paddedCreatedByThrowsInvalidActorBeforeStoreLookup() {
        ObjectNode body = requestBody(" dana ");

        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(InvalidActorException.class);

        verifyNoInteractions(store, validationService);
    }

    // ---------------------------------------------------------------- If-Match / coordinates

    @Test
    void missingIfMatchThrowsIfMatchRequiredAndStoreNeverCalled() {
        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), null, requestBody("dana")))
                .isInstanceOf(IfMatchRequiredException.class);

        verifyNoInteractions(store, validationService);
    }

    @Test
    void invalidIfMatchThrowsInvalidIfMatchAndStoreNeverCalled() {
        assertThatThrownBy(
                        () ->
                                service.createFromVersion(
                                        SERVICE_ID, String.valueOf(SOURCE_VERSION), "*", requestBody("dana")))
                .isInstanceOf(InvalidIfMatchException.class);

        verifyNoInteractions(store, validationService);
    }
}
