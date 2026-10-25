package org.citizen.formdefinition.api;

import java.util.List;

import org.citizen.formdefinition.application.FormDefinitionETag;
import org.citizen.formdefinition.application.FormDefinitionSnapshot;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceDetailService;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceLifecycleService;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceQueueItem;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceQueuePage;
import org.citizen.formdefinition.governance.FormDefinitionGovernanceQueueService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * Secured Form Definition officer-governance boundary (FB-E1). Separate from the technical lifecycle
 * endpoint. Default principal provider is fail-closed (401). Queue is status-derived — not a DST
 * inbox.
 */
@RestController
@RequestMapping(
        path = "/api/v1/form-definitions/governance",
        produces = MediaType.APPLICATION_JSON_VALUE)
public class FormDefinitionGovernanceController {

    private static final CacheControl NO_STORE = CacheControl.noStore();

    private final FormDefinitionGovernanceQueueService queueService;
    private final FormDefinitionGovernanceDetailService detailService;
    private final FormDefinitionGovernanceLifecycleService governanceLifecycleService;

    public FormDefinitionGovernanceController(
            FormDefinitionGovernanceQueueService queueService,
            FormDefinitionGovernanceDetailService detailService,
            FormDefinitionGovernanceLifecycleService governanceLifecycleService) {
        this.queueService = queueService;
        this.detailService = detailService;
        this.governanceLifecycleService = governanceLifecycleService;
    }

    @GetMapping(path = "/queue")
    public ResponseEntity<GovernanceQueueBody> listQueue(
            @RequestParam(value = "afterServiceId", required = false) String afterServiceId,
            @RequestParam(value = "afterVersion", required = false) String afterVersion,
            @RequestParam(value = "limit", required = false) String limit) {
        FormDefinitionGovernanceQueuePage page =
                queueService.listQueue(afterServiceId, afterVersion, limit);
        return ResponseEntity.ok().cacheControl(NO_STORE).body(GovernanceQueueBody.from(page));
    }

    @GetMapping(path = "/detail")
    public ResponseEntity<JsonNode> getDetail(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("version") String version) {
        FormDefinitionSnapshot snapshot = detailService.getDetail(serviceId, version);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(snapshot.revision()))
                .body(snapshot.definition());
    }

    @PostMapping(path = "/lifecycle-transitions", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<JsonNode> lifecycleTransition(
            @RequestParam("serviceId") String serviceId,
            @RequestParam("version") String version,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody JsonNode body) {
        FormDefinitionSnapshot updated =
                governanceLifecycleService.transition(serviceId, version, ifMatch, body);
        return ResponseEntity.ok()
                .cacheControl(NO_STORE)
                .header(HttpHeaders.ETAG, FormDefinitionETag.format(updated.revision()))
                .body(updated.definition());
    }

    public static final class GovernanceQueueBody {

        private final List<GovernanceQueueItemBody> items;
        private final GovernanceQueueCursorBody nextCursor;

        public GovernanceQueueBody(
                List<GovernanceQueueItemBody> items, GovernanceQueueCursorBody nextCursor) {
            this.items = List.copyOf(items);
            this.nextCursor = nextCursor;
        }

        static GovernanceQueueBody from(FormDefinitionGovernanceQueuePage page) {
            List<GovernanceQueueItemBody> items =
                    page.items().stream().map(GovernanceQueueItemBody::from).toList();
            GovernanceQueueCursorBody next =
                    page.nextCursor()
                            .map(GovernanceQueueCursorBody::from)
                            .orElse(null);
            return new GovernanceQueueBody(items, next);
        }

        @JsonProperty("items")
        public List<GovernanceQueueItemBody> items() {
            return items;
        }

        @JsonProperty("nextCursor")
        @JsonInclude(JsonInclude.Include.NON_NULL)
        public GovernanceQueueCursorBody nextCursor() {
            return nextCursor;
        }
    }

    public static final class GovernanceQueueItemBody {

        private final String serviceId;
        private final int version;
        private final String status;

        public GovernanceQueueItemBody(String serviceId, int version, String status) {
            this.serviceId = serviceId;
            this.version = version;
            this.status = status;
        }

        static GovernanceQueueItemBody from(FormDefinitionGovernanceQueueItem item) {
            return new GovernanceQueueItemBody(
                    item.serviceId(), item.version(), item.status().name());
        }

        @JsonProperty("serviceId")
        public String serviceId() {
            return serviceId;
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

    /** Cursor projection reuses serviceId/version only (no status in nextCursor per contract). */
    public static final class GovernanceQueueCursorBody {

        private final String serviceId;
        private final int version;

        public GovernanceQueueCursorBody(String serviceId, int version) {
            this.serviceId = serviceId;
            this.version = version;
        }

        static GovernanceQueueCursorBody from(FormDefinitionGovernanceQueueItem item) {
            return new GovernanceQueueCursorBody(item.serviceId(), item.version());
        }

        @JsonProperty("serviceId")
        public String serviceId() {
            return serviceId;
        }

        @JsonProperty("version")
        public int version() {
            return version;
        }
    }
}
