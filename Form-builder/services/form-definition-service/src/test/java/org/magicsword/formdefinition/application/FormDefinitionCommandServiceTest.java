package org.magicsword.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.domain.FormDefinitionStatus;
import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationResult;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C2 pure unit tests for {@link FormDefinitionCommandService}. No Spring context: the
 * validation service and store collaborators are plain Mockito mocks.
 */
class FormDefinitionCommandServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final FormDefinitionValidationService validationService = mock(FormDefinitionValidationService.class);
    private final FormDefinitionStore store = mock(FormDefinitionStore.class);
    private final FormDefinitionCommandService commandService =
            new FormDefinitionCommandService(validationService, store);

    private ObjectNode draftDocument() {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", "svc-a");
        doc.put("version", 1);
        doc.put("status", "draft");
        return doc;
    }

    private static ValidationResult validResult() {
        return new ValidationResult(true, List.of());
    }

    private static ValidationResult invalidResult() {
        return new ValidationResult(false, List.of(ValidationIssue.error("x.code", "message", null)));
    }

    @Test
    void validatorIsInvokedBeforeStoreCreate() {
        ObjectNode doc = draftDocument();
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.create(any())).thenAnswer(invocation -> {
            JsonNode arg = invocation.getArgument(0);
            return new FormDefinitionSnapshot(arg, 0L, FormDefinitionStatus.draft, Instant.parse("2026-01-01T00:00:00Z"));
        });

        commandService.createDraft(doc);

        InOrder order = inOrder(validationService, store);
        order.verify(validationService).validate(any());
        order.verify(store).create(any());
        order.verifyNoMoreInteractions();
    }

    @Test
    void invalidValidationResultThrowsValidationFailedAndStoreIsNeverCalled() {
        ObjectNode doc = draftDocument();
        when(validationService.validate(any())).thenReturn(invalidResult());

        assertThatThrownBy(() -> commandService.createDraft(doc))
                .isInstanceOf(FormDefinitionValidationFailedException.class);

        verifyNoInteractions(store);
    }

    @Test
    void nonDraftStatusAfterValidPipelineThrowsCreateRequiresDraftAndStoreIsNeverCalled() {
        ObjectNode doc = draftDocument();
        doc.put("status", "published");
        when(validationService.validate(any())).thenReturn(validResult());

        assertThatThrownBy(() -> commandService.createDraft(doc))
                .isInstanceOf(CreateRequiresDraftException.class);

        verify(store, never()).create(any());
    }

    @Test
    void missingStatusAfterValidPipelineThrowsCreateRequiresDraftAndStoreIsNeverCalled() {
        ObjectNode doc = draftDocument();
        doc.remove("status");
        when(validationService.validate(any())).thenReturn(validResult());

        assertThatThrownBy(() -> commandService.createDraft(doc))
                .isInstanceOf(CreateRequiresDraftException.class);

        verify(store, never()).create(any());
    }

    @Test
    void validDraftCallsStoreCreateExactlyOnceWithDeepCopiedContent() {
        ObjectNode doc = draftDocument();
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.create(any())).thenAnswer(invocation -> {
            JsonNode arg = invocation.getArgument(0);
            return new FormDefinitionSnapshot(arg, 0L, FormDefinitionStatus.draft, Instant.parse("2026-01-01T00:00:00Z"));
        });

        JsonNode returned = commandService.createDraft(doc).definition();

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store).create(captor.capture());
        JsonNode passedToStore = captor.getValue();

        assertThat(passedToStore).isEqualTo(doc);
        assertThat(passedToStore).isNotSameAs(doc);
        assertThat(returned).isEqualTo(doc);

        // The store received a snapshot: mutating the caller's original document afterward
        // must never retroactively affect what was (or will be) persisted.
        doc.put("serviceId", "MUTATED-AFTER-CALL");
        assertThat(passedToStore.get("serviceId").asText()).isEqualTo("svc-a");
    }

    @Test
    void nullDocumentThrowsCreateRequiresDraftAndStoreIsNeverCalled() {
        when(validationService.validate(any())).thenReturn(validResult());

        assertThatThrownBy(() -> commandService.createDraft(null))
                .isInstanceOf(CreateRequiresDraftException.class);

        verifyNoInteractions(store);
    }

    // ---------------------------------------------------------------- FB-C3 replaceDraft

    private static final String SERVICE_ID = "svc-a";
    private static final int VERSION = 1;
    private static final long REVISION = 3L;
    private static final Instant CREATED_AT = Instant.parse("2026-01-01T00:00:00Z");

    private ObjectNode currentStoredDocument() {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", SERVICE_ID);
        doc.put("version", VERSION);
        doc.put("status", "draft");
        ObjectNode audit = doc.putObject("audit");
        audit.put("createdBy", "svc-account");
        audit.put("createdAt", "2026-01-01T00:00:00Z");
        return doc;
    }

    private FormDefinitionSnapshot currentSnapshot(FormDefinitionStatus status, long revision) {
        return new FormDefinitionSnapshot(currentStoredDocument(), revision, status, CREATED_AT);
    }

    private ObjectNode updateBody() {
        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", SERVICE_ID);
        doc.put("version", VERSION);
        doc.put("status", "draft");
        ObjectNode audit = doc.putObject("audit");
        audit.put("createdBy", "svc-account");
        audit.put("createdAt", "2026-01-01T00:00:00Z");
        doc.put("label", "updated-label");
        return doc;
    }

    private String ifMatchFor(long revision) {
        return FormDefinitionETag.format(revision);
    }

    @Test
    void replaceDraftValidatesBeforeCallingStoreReplaceDraftInOrder() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.replaceDraft(anyString(), anyInt(), anyLong(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode arg = invocation.getArgument(3);
                            return new FormDefinitionSnapshot(
                                    arg, REVISION + 1, FormDefinitionStatus.draft, CREATED_AT);
                        });

        commandService.replaceDraft(SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), updateBody());

        InOrder order = inOrder(validationService, store);
        order.verify(store).findSnapshot(SERVICE_ID, VERSION);
        order.verify(validationService).validate(any());
        order.verify(store).replaceDraft(eq(SERVICE_ID), eq(VERSION), eq(REVISION), any());
        order.verifyNoMoreInteractions();
    }

    @Test
    void replaceDraftInvalidValidationResultThrowsValidationFailedAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(invalidResult());

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), updateBody()))
                .isInstanceOf(FormDefinitionValidationFailedException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftStaleRevisionThrowsBeforeValidationAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID,
                                        String.valueOf(VERSION),
                                        ifMatchFor(REVISION + 999),
                                        updateBody()))
                .isInstanceOf(StaleRevisionException.class);

        verifyNoInteractions(validationService);
        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftOnNonDraftStoredStatusThrowsDefinitionNotEditableAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.published, REVISION)));

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), updateBody()))
                .isInstanceOf(DefinitionNotEditableException.class);

        verifyNoInteractions(validationService);
        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftCoordinateMismatchThrowsAfterValidationAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());

        ObjectNode body = updateBody();
        body.put("serviceId", "different-service");

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(DefinitionCoordinateMismatchException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftVersionMismatchThrowsCoordinateMismatchAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());

        ObjectNode body = updateBody();
        body.put("version", VERSION + 1);

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(DefinitionCoordinateMismatchException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftChangedCreationAuditThrowsImmutableCreationAuditChangedAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());

        ObjectNode body = updateBody();
        ((ObjectNode) body.get("audit")).put("createdBy", "someone-else");

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(ImmutableCreationAuditChangedException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftChangedCreationAuditCreatedAtThrowsImmutableCreationAuditChangedAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());

        ObjectNode body = updateBody();
        ((ObjectNode) body.get("audit")).put("createdAt", "2099-01-01T00:00:00Z");

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(ImmutableCreationAuditChangedException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftBodyStatusPublishedThrowsUpdateRequiresDraftAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());

        ObjectNode body = updateBody();
        body.put("status", "published");

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(UpdateRequiresDraftException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftMissingBodyStatusThrowsUpdateRequiresDraftAndStoreReplaceDraftNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());

        ObjectNode body = updateBody();
        body.remove("status");

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body))
                .isInstanceOf(UpdateRequiresDraftException.class);

        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftMissingIfMatchThrowsIfMatchRequiredAndStoreIsNeverCalled() {
        assertThatThrownBy(
                        () -> commandService.replaceDraft(SERVICE_ID, String.valueOf(VERSION), null, updateBody()))
                .isInstanceOf(IfMatchRequiredException.class);

        verifyNoInteractions(validationService);
        verifyNoInteractions(store);
    }

    @Test
    void replaceDraftInvalidIfMatchThrowsInvalidIfMatchAndStoreIsNeverCalled() {
        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), "*", updateBody()))
                .isInstanceOf(InvalidIfMatchException.class);

        verifyNoInteractions(validationService);
        verifyNoInteractions(store);
    }

    @Test
    void replaceDraftNotFoundThrowsFormDefinitionNotFoundAndValidationNeverCalled() {
        when(store.findSnapshot(SERVICE_ID, VERSION)).thenReturn(Optional.empty());

        assertThatThrownBy(
                        () ->
                                commandService.replaceDraft(
                                        SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), updateBody()))
                .isInstanceOf(FormDefinitionNotFoundException.class);

        verifyNoInteractions(validationService);
        verify(store, never()).replaceDraft(anyString(), anyInt(), anyLong(), any());
    }

    @Test
    void replaceDraftValidUpdatePassesDeepCopiedBodyToStore() {
        when(store.findSnapshot(SERVICE_ID, VERSION))
                .thenReturn(Optional.of(currentSnapshot(FormDefinitionStatus.draft, REVISION)));
        when(validationService.validate(any())).thenReturn(validResult());
        when(store.replaceDraft(anyString(), anyInt(), anyLong(), any()))
                .thenAnswer(
                        invocation -> {
                            JsonNode arg = invocation.getArgument(3);
                            return new FormDefinitionSnapshot(
                                    arg, REVISION + 1, FormDefinitionStatus.draft, CREATED_AT);
                        });

        ObjectNode body = updateBody();
        FormDefinitionSnapshot result =
                commandService.replaceDraft(SERVICE_ID, String.valueOf(VERSION), ifMatchFor(REVISION), body);

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(store).replaceDraft(eq(SERVICE_ID), eq(VERSION), eq(REVISION), captor.capture());
        JsonNode passedToStore = captor.getValue();

        assertThat(passedToStore).isEqualTo(body);
        assertThat(passedToStore).isNotSameAs(body);
        assertThat(result.revision()).isEqualTo(REVISION + 1);

        // Mutating the caller's body afterward must never retroactively affect what was passed.
        body.put("label", "MUTATED-AFTER-CALL");
        assertThat(passedToStore.get("label").asText()).isEqualTo("updated-label");
    }
}
