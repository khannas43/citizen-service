package org.magicsword.formdefinition.api;

import java.net.URI;

import org.magicsword.formdefinition.application.FormDefinitionETag;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.builder.FormDefinitionBuilderAuthenticatedService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Authenticated Builder clone and submit boundary (FB-E5.4.2B). Separate from technical
 * identity-bearing endpoints. Actor is JWT {@code sub} only.
 */
@RestController
@RequestMapping(
        path = "/api/v1/form-definitions/builder",
        produces = MediaType.APPLICATION_JSON_VALUE)
public class FormDefinitionBuilderController {

    private static final CacheControl NO_STORE = CacheControl.noStore();

    private final FormDefinitionBuilderAuthenticatedService builderService;

    public FormDefinitionBuilderController(FormDefinitionBuilderAuthenticatedService builderService) {
        this.builderService = builderService;
    }

    @PostMapping(path = "/drafts/from-version", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> cloneFromVersion(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("sourceVersion") String sourceVersion,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody JsonNode body) {
        FormDefinitionSnapshot created =
                builderService.cloneFromVersion(serviceId, sourceVersion, ifMatch, body);
        JsonNode definition = created.definition();
        URI location =
                ServletUriComponentsBuilder.fromCurrentContextPath()
                        .path("/api/v1/form-definitions")
                        .queryParam("serviceId", definition.get("serviceId").asText())
                        .queryParam("version", definition.get("version").asInt())
                        .build()
                        .encode()
                        .toUri();
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(created.revision()))
                .header(HttpHeaders.LOCATION, location.toASCIIString())
                .body(definition);
    }

    @PostMapping(path = "/lifecycle-transitions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> submitDraft(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("version") String version,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody JsonNode body) {
        FormDefinitionSnapshot updated =
                builderService.submitDraft(serviceId, version, ifMatch, body);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(updated.revision()))
                .body(updated.definition());
    }
}
