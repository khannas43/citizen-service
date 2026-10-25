package org.citizen.expenditure.controller;

import org.citizen.expenditure.domain.NoticeResponseKind;
import org.citizen.expenditure.entity.CaseNotice;
import org.citizen.expenditure.service.IntegrityCaseService;
import org.citizen.expenditure.service.NoticeService;
import org.citizen.expenditure.security.DomainAccess;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/cases/{id}/notice")
@CrossOrigin(originPatterns = "*")
public class NoticeController {

    private final NoticeService notices;
    private final IntegrityCaseService cases;
    private final DomainAccess access;

    public NoticeController(NoticeService notices, IntegrityCaseService cases, DomainAccess access) {
        this.notices = notices;
        this.cases = cases;
        this.access = access;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> draft(@PathVariable UUID id,
                                                       @RequestParam(defaultValue = "en") String lang,
                                                       Authentication auth) {
        cases.domainOf(id).ifPresent(d -> access.requireReview(auth, d));
        return ResponseEntity.ok(notices.draft(id, lang));
    }

    @PostMapping("/issue")
    public ResponseEntity<CaseNotice> issue(@PathVariable UUID id,
                                            @RequestBody(required = false) Map<String, String> body,
                                            @AuthenticationPrincipal Jwt jwt,
                                            Authentication auth) {
        cases.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        String lang = body != null ? body.get("language") : null;
        return ResponseEntity.ok(notices.issue(id, lang, jwt));
    }

    @PostMapping("/response")
    public ResponseEntity<CaseNotice> response(@PathVariable UUID id,
                                               @RequestBody ResponseRequest body,
                                               @AuthenticationPrincipal Jwt jwt,
                                               Authentication auth) {
        cases.domainOf(id).ifPresent(d -> access.requireRead(auth, d));
        return ResponseEntity.ok(notices.recordResponse(id, body.responseKind(), body.note(), jwt));
    }

    public record ResponseRequest(NoticeResponseKind responseKind, String note) {}
}
