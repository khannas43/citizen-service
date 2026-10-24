package org.magicsword.formdefinition.config;

import java.time.Clock;

import org.magicsword.formdefinition.validation.FormDefinitionValidationPipeline;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;

/**
 * FB-C2/C4 Jackson, validation, and clock wiring.
 */
@Configuration
public class FormDefinitionWebConfig {

    @Bean
    FormDefinitionValidationPipeline formDefinitionValidationPipeline() {
        return new FormDefinitionValidationPipeline();
    }

    @Bean
    Clock utcClock() {
        return Clock.systemUTC();
    }

    @Bean
    Jackson2ObjectMapperBuilderCustomizer strictDuplicateKeyCustomizer() {
        return builder ->
                builder.featuresToEnable(
                        JsonParser.Feature.STRICT_DUPLICATE_DETECTION,
                        DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY);
    }
}
