package org.magicsword.formdefinition.api;

import java.net.URI;
import java.util.List;

import org.magicsword.formdefinition.application.FormDefinitionCommandService;
import org.magicsword.formdefinition.application.FormDefinitionETag;
import org.magicsword.formdefinition.application.FormDefinitionLifecycleService;
import org.magicsword.formdefinition.application.FormDefinitionNewDraftService;
import org.magicsword.formdefinition.application.FormDefinitionPublishedQueryService;
import org.magicsword.formdefinition.application.FormDefinitionQueryService;
import org.magicsword.formdefinition.application.FormDefinitionSnapshot;
import org.magicsword.formdefinition.application.FormDefinitionValidationService;
import org.magicsword.formdefinition.application.FormDefinitionVersionItem;
import org.magicsword.formdefinition.application.FormDefinitionVersionListPage;
import org.magicsword.formdefinition.application.FormDefinitionVersionQueryService;
import org.magicsword.formdefinition.validation.ValidationIssue;
import org.magicsword.formdefinition.validation.ValidationResult;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Versioned REST boundary for Form Definitions (FB-C2–C5): validate, draft create/read/replace,
 * lifecycle, new-draft clone, latest-published lookup, and bounded version listing.
 *
 * <p>Deployed under context path {@code /form-definition-service}, so full URLs are
 * {@code /form-definition-service/api/v1/...}.
 */
@RestController
@RequestMapping(path = "/api/v1/form-definitions", produces = MediaType.APPLICATION_JSON_VALUE)
public class FormDefinitionController {

    private static final CacheControl NO_STORE = CacheControl.noStore();

    private final FormDefinitionValidationService validationService;
    private final FormDefinitionCommandService commandService;
    private final FormDefinitionQueryService queryService;
    private final FormDefinitionLifecycleService lifecycleService;
    private final FormDefinitionNewDraftService newDraftService;
    private final FormDefinitionPublishedQueryService publishedQueryService;
    private final FormDefinitionVersionQueryService versionQueryService;

    public FormDefinitionController(
            FormDefinitionValidationService validationService,
            FormDefinitionCommandService commandService,
            FormDefinitionQueryService queryService,
            FormDefinitionLifecycleService lifecycleService,
            FormDefinitionNewDraftService newDraftService,
            FormDefinitionPublishedQueryService publishedQueryService,
            FormDefinitionVersionQueryService versionQueryService) {
        this.validationService = validationService;
        this.commandService = commandService;
        this.queryService = queryService;
        this.lifecycleService = lifecycleService;
        this.newDraftService = newDraftService;
        this.publishedQueryService = publishedQueryService;
        this.versionQueryService = versionQueryService;
    }

    @PostMapping(path = "/validation", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<ValidationResultBody> validate(@RequestBody JsonNode body) {
        ValidationResult result = validationService.validate(body);
        return ResponseEntity.ok(ValidationResultBody.from(result));
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> create(@RequestBody JsonNode body) {
        FormDefinitionSnapshot created = commandService.createDraft(body);
        JsonNode definition = created.definition();
        String serviceId = definition.get("serviceId").asText();
        int version = definition.get("version").asInt();
        URI location =
                ServletUriComponentsBuilder.fromCurrentContextPath()
                        .path("/api/v1/form-definitions")
                        .queryParam("serviceId", serviceId)
                        .queryParam("version", version)
                        .build()
                        .encode()
                        .toUri();
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(created.revision()))
                .header(HttpHeaders.LOCATION, location.toASCIIString())
                .body(definition);
    }

    @GetMapping
    public ResponseEntity<JsonNode> getExact(
            @RequestParam("serviceId") String serviceId, @RequestParam("version") String version) {
        FormDefinitionSnapshot snapshot = queryService.getExact(serviceId, version);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(snapshot.revision()))
                .body(snapshot.definition());
    }

    @GetMapping(path = "/published/latest")
    public ResponseEntity<JsonNode> getLatestPublished(@RequestParam("serviceId") String serviceId) {
        FormDefinitionSnapshot snapshot = publishedQueryService.getLatestPublished(serviceId);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(snapshot.revision()))
                .body(snapshot.definition());
    }

    @GetMapping(path = "/versions")
    public ResponseEntity<VersionListBody> listVersions(
            @RequestParam("serviceId") String serviceId,
            @RequestParam(value = "afterVersion", required = false) String afterVersion,
            @RequestParam(value = "limit", required = false) String limit) {
        FormDefinitionVersionListPage page =
                versionQueryService.listVersions(serviceId, afterVersion, limit);
        return ResponseEntity.ok().cacheControl(NO_STORE).body(VersionListBody.from(page));
    }

    @PutMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> replaceDraft(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("version") String version,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody JsonNode body) {
        FormDefinitionSnapshot updated =
                commandService.replaceDraft(serviceId, version, ifMatch, body);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(updated.revision()))
                .body(updated.definition());
    }

    @PostMapping(path = "/lifecycle-transitions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> lifecycleTransition(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("version") String version,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody JsonNode body) {
        FormDefinitionSnapshot updated =
                lifecycleService.transition(serviceId, version, ifMatch, body);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(updated.revision()))
                .body(updated.definition());
    }

    @PostMapping(path = "/drafts/from-version", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> createDraftFromVersion(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("sourceVersion") String sourceVersion,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody JsonNode body) {
        FormDefinitionSnapshot created =
                newDraftService.createFromVersion(serviceId, sourceVersion, ifMatch, body);
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

    /** Version list JSON projection (FB-C5). */
    public static final class VersionListBody {

        private final String serviceId;
        private final List<VersionItemBody> items;
        private final Integer nextAfterVersion;

        public VersionListBody(String serviceId, List<VersionItemBody> items, Integer nextAfterVersion) {
            this.serviceId = serviceId;
            this.items = List.copyOf(items);
            this.nextAfterVersion = nextAfterVersion;
        }

        static VersionListBody from(FormDefinitionVersionListPage page) {
            List<VersionItemBody> items =
                    page.items().stream().map(VersionItemBody::from).toList();
            Integer next =
                    page.nextAfterVersion().isPresent()
                            ? page.nextAfterVersion().getAsInt()
                            : null;
            return new VersionListBody(page.serviceId(), items, next);
        }

        @JsonProperty("serviceId")
        public String serviceId() {
            return serviceId;
        }

        @JsonProperty("items")
        public List<VersionItemBody> items() {
            return items;
        }

        @JsonProperty("nextAfterVersion")
        @JsonInclude(JsonInclude.Include.NON_NULL)
        public Integer nextAfterVersion() {
            return nextAfterVersion;
        }
    }

    public static final class VersionItemBody {

        private final int version;
        private final String status;

        public VersionItemBody(int version, String status) {
            this.version = version;
            this.status = status;
        }

        static VersionItemBody from(FormDefinitionVersionItem item) {
            return new VersionItemBody(item.version(), item.status().name());
        }

        @JsonProperty("version")
        public int version() {
            return version;
        }

        @JsonProperty("status")
        public String status() {
            return status;
        }
    }

    /** Jackson-friendly ValidationResult projection (immutable ordered issues). */
    public static final class ValidationResultBody {

        private final boolean valid;
        private final java.util.List<ValidationIssueBody> issues;

        public ValidationResultBody(boolean valid, java.util.List<ValidationIssueBody> issues) {
            this.valid = valid;
            this.issues = java.util.List.copyOf(issues);
        }

        static ValidationResultBody from(ValidationResult result) {
            java.util.List<ValidationIssueBody> issues =
                    result.issues().stream().map(ValidationIssueBody::from).toList();
            return new ValidationResultBody(result.valid(), issues);
        }

        @JsonProperty("valid")
        public boolean valid() {
            return valid;
        }

        @JsonProperty("issues")
        public java.util.List<ValidationIssueBody> issues() {
            return issues;
        }
    }

    public static final class ValidationIssueBody {

        private final String code;
        private final String message;
        private final String severity;
        private final String path;

        public ValidationIssueBody(String code, String message, String severity, String path) {
            this.code = code;
            this.message = message;
            this.severity = severity;
            this.path = path;
        }

        static ValidationIssueBody from(ValidationIssue issue) {
            return new ValidationIssueBody(
                    issue.code(), issue.message(), issue.severity().name(), issue.path());
        }

        @JsonProperty("code")
        public String code() {
            return code;
        }

        @JsonProperty("message")
        public String message() {
            return message;
        }

        @JsonProperty("severity")
        public String severity() {
            return severity;
        }

        @JsonProperty("path")
        @JsonInclude(JsonInclude.Include.NON_NULL)
        public String path() {
            return path;
        }
    }
}
