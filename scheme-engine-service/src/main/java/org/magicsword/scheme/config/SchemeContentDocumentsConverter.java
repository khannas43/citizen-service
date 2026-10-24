package org.magicsword.scheme.config;

import com.fasterxml.jackson.core.type.TypeReference;
import jakarta.persistence.Converter;
import org.magicsword.scheme.model.content.SchemeContentDocumentItem;

import java.util.List;

@Converter
public class SchemeContentDocumentsConverter extends JsonListConverter<SchemeContentDocumentItem> {
    public SchemeContentDocumentsConverter() {
        super(new TypeReference<>() {});
    }
}
