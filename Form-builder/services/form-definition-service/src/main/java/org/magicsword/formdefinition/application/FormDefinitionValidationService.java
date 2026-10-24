package org.magicsword.formdefinition.application;

import org.magicsword.formdefinition.validation.FormDefinitionValidationPipeline;
import org.magicsword.formdefinition.validation.ValidationResult;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Application facade over the pure C1 {@link FormDefinitionValidationPipeline} (FB-C2).
 *
 * <p>Never persists. Deep-copies the request body so callers cannot mutate pipeline input after
 * the fact through the same node reference.
 */
@Service
public class FormDefinitionValidationService {

    private final FormDefinitionValidationPipeline pipeline;

    public FormDefinitionValidationService(FormDefinitionValidationPipeline pipeline) {
        this.pipeline = pipeline;
    }

    public ValidationResult validate(JsonNode document) {
        JsonNode detached = document == null ? null : document.deepCopy();
        return pipeline.validate(detached);
    }
}
