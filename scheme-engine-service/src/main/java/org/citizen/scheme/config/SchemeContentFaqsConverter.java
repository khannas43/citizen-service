package org.citizen.scheme.config;

import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.persistence.Converter;
import org.citizen.scheme.model.content.SchemeContentFaqItem;

import java.util.List;

@Converter
public class SchemeContentFaqsConverter extends JsonListConverter<SchemeContentFaqItem> {
    public SchemeContentFaqsConverter() {
        super(new TypeReference<>() {});
    }
}
