package org.citizen.grievance.service;

import org.citizen.grievance.entity.Clarification;
import org.citizen.grievance.model.CitizenRespondRequest;
import org.citizen.grievance.model.ClarificationAnswerRequest;
import org.citizen.grievance.model.ClarificationRequest;
import org.citizen.grievance.model.ClarificationResponse;
import org.citizen.grievance.model.InfoRequestRequest;
import org.citizen.grievance.model.RespondByRefRequest;
import org.citizen.grievance.repository.ClarificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

@Service
public class ClarificationService {

    public static final String CITIZEN_TO_OFFICER = "CITIZEN_TO_OFFICER";
    public static final String OFFICER_TO_CITIZEN = "OFFICER_TO_CITIZEN";

    private static final String NOTIFICATIONS_URL =
            "http://notifications-service.citizen.svc.cluster.local:8080/notifications-service/v1/notifications";

    private final ClarificationRepository repo;
    private final RestTemplate restTemplate;

    public ClarificationService(ClarificationRepository repo, RestTemplate restTemplate) {
        this.repo = repo;
        this.restTemplate = restTemplate;
    }

    public ClarificationResponse ask(ClarificationRequest req) {
        Clarification c = new Clarification();
        c.setApplicationRef(req.applicationRef());
        c.setAadhaarRef(req.aadhaarRef());
        c.setCitizenName(req.citizenName());
        c.setServiceName(req.serviceName());
        c.setQuestion(req.question());
        c.setDirection(CITIZEN_TO_OFFICER);
        c.setStatus("PENDING");
        c.setAskedAt(LocalDateTime.now());
        return toResponse(repo.save(c));
    }

    public ClarificationResponse createInfoRequest(InfoRequestRequest req) {
        String displayRef = req.displayRef() != null ? req.displayRef() : req.applicationRef();
        Clarification c = new Clarification();
        c.setApplicationRef(req.applicationRef());
        c.setDisplayRef(displayRef);
        c.setAadhaarRef(req.aadhaarRef());
        c.setServiceName(req.serviceName());
        c.setQuestion(req.query());
        c.setOfficerName(req.officerName());
        c.setDirection(OFFICER_TO_CITIZEN);
        c.setStatus("PENDING");
        c.setAskedAt(LocalDateTime.now());
        c = repo.save(c);

        sendNotification(
                c.getAadhaarRef(),
                "Additional Information Required",
                "Officer " + req.officerName() + " has requested additional information for your application "
                        + displayRef + ": " + req.query(),
                c.getServiceName(),
                displayRef
        );
        return toResponse(c);
    }

    public List<ClarificationResponse> byAadhaar(String aadhaarRef, String direction) {
        return repo.findByAadhaarRefOrderByAskedAtDesc(aadhaarRef).stream()
                .filter(c -> direction == null || direction.equals(c.getDirection()))
                .map(this::toResponse)
                .toList();
    }

    public List<ClarificationResponse> byApplication(String applicationRef, String direction) {
        return Stream.concat(
                        repo.findByApplicationRefOrderByAskedAtDesc(applicationRef).stream(),
                        repo.findByDisplayRefOrderByAskedAtDesc(applicationRef).stream())
                .distinct()
                .filter(c -> direction == null || direction.equals(c.getDirection()))
                .sorted((a, b) -> b.getAskedAt().compareTo(a.getAskedAt()))
                .map(this::toResponse)
                .toList();
    }

    public List<ClarificationResponse> pendingCitizenQuestions() {
        return repo.findByStatusAndDirectionOrderByAskedAtAsc("PENDING", CITIZEN_TO_OFFICER).stream()
                .map(this::toResponse)
                .toList();
    }

    public List<ClarificationResponse> pendingInfoRequests(String aadhaarRef) {
        return repo.findByAadhaarRefOrderByAskedAtDesc(aadhaarRef).stream()
                .filter(c -> OFFICER_TO_CITIZEN.equals(c.getDirection()) && "PENDING".equals(c.getStatus()))
                .map(this::toResponse)
                .toList();
    }

    public List<ClarificationResponse> citizenResponses() {
        return repo.findByDirectionAndStatusOrderByAnsweredAtDesc(OFFICER_TO_CITIZEN, "ANSWERED").stream()
                .map(this::toResponse)
                .toList();
    }

    public ClarificationResponse answer(UUID id, ClarificationAnswerRequest req) {
        Clarification c = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Clarification not found: " + id));
        if (!CITIZEN_TO_OFFICER.equals(c.getDirection())) {
            throw new RuntimeException("Only citizen questions can be answered by officers");
        }
        c.setAnswer(req.answer());
        c.setStatus("ANSWERED");
        c.setAnsweredAt(LocalDateTime.now());
        c = repo.save(c);
        sendNotification(
                c.getAadhaarRef(),
                "Your question has been answered",
                "Officer replied to your question on " + c.getApplicationRef() + ": " + c.getAnswer(),
                c.getServiceName(),
                c.getApplicationRef()
        );
        return toResponse(c);
    }

    public ClarificationResponse respond(UUID id, CitizenRespondRequest req) {
        Clarification c = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Clarification not found: " + id));
        if (!OFFICER_TO_CITIZEN.equals(c.getDirection())) {
            throw new RuntimeException("Only officer info requests can be answered by citizens");
        }
        if (!"PENDING".equals(c.getStatus())) {
            throw new RuntimeException("This request has already been answered");
        }
        c.setAnswer(req.answer());
        c.setStatus("ANSWERED");
        c.setAnsweredAt(LocalDateTime.now());
        c = repo.save(c);
        sendNotification(
                c.getAadhaarRef(),
                "Response submitted",
                "Your response for application "
                        + (c.getDisplayRef() != null ? c.getDisplayRef() : c.getApplicationRef())
                        + " has been sent to the officer.",
                c.getServiceName(),
                c.getDisplayRef() != null ? c.getDisplayRef() : c.getApplicationRef()
        );
        return toResponse(c);
    }

    public ClarificationResponse respondByRef(RespondByRefRequest req) {
        if (req.clarificationId() != null) {
            return respond(req.clarificationId(), new CitizenRespondRequest(req.answer()));
        }
        Clarification c = repo.findByAadhaarRefOrderByAskedAtDesc(req.aadhaarRef()).stream()
                .filter(x -> OFFICER_TO_CITIZEN.equals(x.getDirection()))
                .filter(x -> "PENDING".equals(x.getStatus()))
                .filter(x -> refsMatch(x, req.applicationRef(), req.displayRef()))
                .filter(x -> req.query() == null || req.query().equals(x.getQuestion()))
                .findFirst()
                .orElseGet(() -> {
                    Clarification created = new Clarification();
                    created.setApplicationRef(req.applicationRef());
                    created.setDisplayRef(req.displayRef());
                    created.setAadhaarRef(req.aadhaarRef());
                    created.setServiceName(req.serviceName());
                    created.setQuestion(req.query());
                    created.setOfficerName(req.officerName());
                    created.setDirection(OFFICER_TO_CITIZEN);
                    created.setStatus("PENDING");
                    created.setAskedAt(LocalDateTime.now());
                    return repo.save(created);
                });
        return respond(c.getId(), new CitizenRespondRequest(req.answer()));
    }

    private boolean refsMatch(Clarification c, String applicationRef, String displayRef) {
        if (applicationRef != null
                && (applicationRef.equals(c.getApplicationRef()) || applicationRef.equals(c.getDisplayRef()))) {
            return true;
        }
        return displayRef != null
                && (displayRef.equals(c.getApplicationRef()) || displayRef.equals(c.getDisplayRef()));
    }

    private void sendNotification(String aadhaarRef, String title, String message,
                                  String serviceName, String trackingId) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("aadhaarRef", aadhaarRef);
            body.put("title", title);
            body.put("message", message);
            body.put("serviceName", serviceName);
            body.put("trackingId", trackingId);
            restTemplate.postForEntity(NOTIFICATIONS_URL, body, String.class);
        } catch (Exception ignored) {
            // fire-and-forget
        }
    }

    private ClarificationResponse toResponse(Clarification c) {
        return new ClarificationResponse(
                c.getId(),
                c.getApplicationRef(),
                c.getAadhaarRef(),
                c.getCitizenName(),
                c.getServiceName(),
                c.getQuestion(),
                c.getAnswer(),
                c.getStatus(),
                c.getDirection(),
                c.getOfficerName(),
                c.getDisplayRef(),
                c.getAskedAt(),
                c.getAnsweredAt()
        );
    }
}
