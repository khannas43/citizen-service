package org.magicsword.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.validation.FormDefinitionValidationPipeline;
import org.magicsword.formdefinition.validation.ValidationResult;
import org.mockito.ArgumentCaptor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * FB-C2 pure unit tests for {@link FormDefinitionValidationService}, proving the service
 * deep-copies the request body before handing it to the (already-pure) pipeline, so a caller
 * mutating its own document reference after calling {@code validate} can never affect the
 * snapshot that was actually validated.
 *
 * <p>{@link FormDefinitionValidationPipeline} is a final class; mocking it here relies on
 * Mockito's inline mock maker (enabled project-wide via
 * {@code src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker}).
 */
class FormDefinitionValidationServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void deepCopiesDocumentBeforeInvokingPipelineSoLaterCallerMutationCannotAffectTheValidatedSnapshot() {
        FormDefinitionValidationPipeline pipeline = mock(FormDefinitionValidationPipeline.class);
        when(pipeline.validate(any())).thenReturn(new ValidationResult(true, List.of()));
        FormDefinitionValidationService service = new FormDefinitionValidationService(pipeline);

        ObjectNode doc = mapper.createObjectNode();
        doc.put("serviceId", "svc");
        doc.putObject("nested").put("flag", true);
        JsonNode snapshotBeforeCall = doc.deepCopy();

        service.validate(doc);

        ArgumentCaptor<JsonNode> captor = ArgumentCaptor.forClass(JsonNode.class);
        verify(pipeline).validate(captor.capture());
        JsonNode passedToPipeline = captor.getValue();

        assertThat(passedToPipeline).isNotSameAs(doc);
        assertThat(passedToPipeline).isEqualTo(snapshotBeforeCall);

        // Mutate the caller's own document reference after validate() has already run.
        doc.put("serviceId", "MUTATED-AFTER-CALL");
        ((ObjectNode) doc.get("nested")).put("flag", false);

        assertThat(passedToPipeline.get("serviceId").asText()).isEqualTo("svc");
        assertThat(passedToPipeline.get("nested").get("flag").asBoolean()).isTrue();
    }

    @Test
    void nullDocumentIsPassedThroughAsNullWithoutThrowing() {
        FormDefinitionValidationPipeline pipeline = mock(FormDefinitionValidationPipeline.class);
        when(pipeline.validate(isNull())).thenReturn(new ValidationResult(true, List.of()));
        FormDefinitionValidationService service = new FormDefinitionValidationService(pipeline);

        ValidationResult result = service.validate(null);

        assertThat(result.valid()).isTrue();
        verify(pipeline).validate(isNull());
    }

    @Test
    void returnedResultIsExactlyWhatThePipelineProduced() {
        FormDefinitionValidationPipeline pipeline = mock(FormDefinitionValidationPipeline.class);
        ValidationResult stubbed = new ValidationResult(false, List.of());
        when(pipeline.validate(any())).thenReturn(stubbed);
        FormDefinitionValidationService service = new FormDefinitionValidationService(pipeline);

        ValidationResult result = service.validate(mapper.createObjectNode());

        assertThat(result).isSameAs(stubbed);
    }
}
