package org.magicsword.scheme.config;

import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.persistence.Converter;
import org.magicsword.scheme.model.content.SchemeContentFaqItem;

import java.util.List;

@Converter
public class SchemeContentFaqsConverter extends JsonListConverter<SchemeContentFaqItem> {
    public SchemeContentFaqsConverter() {
        super(new TypeReference<>() {});
    }
}
