package org.magicsword.scheme.controller;

import org.magicsword.scheme.model.AuditEvent;
import org.magicsword.scheme.model.SchemeContentEditorResponse;
import org.magicsword.scheme.model.SchemeContentListItem;
import org.magicsword.scheme.model.SchemeContentSaveRequest;
import org.magicsword.scheme.service.SchemeContentAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/admin/scheme-content")
@CrossOrigin(originPatterns = "*")
public class SchemeContentAdminController {

    private final SchemeContentAdminService adminService;

    public SchemeContentAdminController(SchemeContentAdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping
    public List<SchemeContentListItem> list() {
        return adminService.listForEditor();
    }

    @GetMapping("/{schemeId}")
    public ResponseEntity<SchemeContentEditorResponse> get(@PathVariable UUID schemeId) {
        return adminService.getForEditor(schemeId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{schemeId}")
    public ResponseEntity<?> save(
            @PathVariable UUID schemeId,
            @RequestBody SchemeContentSaveRequest body,
            @AuthenticationPrincipal Jwt jwt) {
        SchemeContentAdminService.SaveResult result = adminService.save(schemeId, body, jwt);
        if (result instanceof SchemeContentAdminService.SaveResult.Ok ok) {
            return ResponseEntity.ok(ok.body());
        }
        if (result instanceof SchemeContentAdminService.SaveResult.Validation v) {
            return ResponseEntity.badRequest().body(Map.of("fieldErrors", v.fieldErrors()));
        }
        if (result instanceof SchemeContentAdminService.SaveResult.Conflict) {
            return ResponseEntity.status(409).body(Map.of("message", "Version conflict"));
        }
        return ResponseEntity.notFound().build();
    }

    @GetMapping("/{schemeId}/history")
    public List<AuditEvent> history(@PathVariable UUID schemeId) {
        return adminService.history(schemeId);
    }
}
