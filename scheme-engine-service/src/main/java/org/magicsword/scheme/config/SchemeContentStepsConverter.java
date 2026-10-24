package org.magicsword.scheme.config;

import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.persistence.Converter;
import org.magicsword.scheme.model.content.SchemeContentStepItem;

import java.util.List;

@Converter
public class SchemeContentStepsConverter extends JsonListConverter<SchemeContentStepItem> {
    public SchemeContentStepsConverter() {
        super(new TypeReference<>() {});
    }
}
