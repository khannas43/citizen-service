package org.citizen.notifications.controller;

import org.citizen.notifications.entity.Notification;
import org.citizen.notifications.model.NotificationRequest;
import org.citizen.notifications.model.NotificationResponse;
import org.citizen.notifications.repository.NotificationRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/notifications")
@CrossOrigin(allowedHeaders = "*", originPatterns = "*",
             methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PATCH, RequestMethod.OPTIONS})
public class NotificationController {

    private final NotificationRepository repo;

    public NotificationController(NotificationRepository repo) {
        this.repo = repo;
    }

    @PostMapping
    public ResponseEntity<NotificationResponse> create(@RequestBody NotificationRequest req) {
        Notification n = new Notification();
        n.setAadhaarRef(req.aadhaarRef());
        n.setTitle(req.title());
        n.setMessage(req.message());
        n.setServiceName(req.serviceName());
        n.setTrackingId(req.trackingId());
        return ResponseEntity.ok(toResponse(repo.save(n)));
    }

    @GetMapping
    public ResponseEntity<List<NotificationResponse>> list(@RequestParam String aadhaar) {
        List<NotificationResponse> result = repo.findByAadhaarRefOrderByIsReadAscCreatedAtDesc(aadhaar)
            .stream()
            .limit(10)
            .map(this::toResponse)
            .toList();
        return ResponseEntity.ok(result);
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<NotificationResponse> markRead(@PathVariable UUID id) {
        return repo.findById(id)
            .map(n -> {
                n.setIsRead(true);
                return ResponseEntity.ok(toResponse(repo.save(n)));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    private NotificationResponse toResponse(Notification n) {
        return new NotificationResponse(
            n.getId(), n.getAadhaarRef(), n.getTitle(), n.getMessage(),
            n.getServiceName(), n.getTrackingId(), n.getIsRead(), n.getCreatedAt()
        );
    }
}
