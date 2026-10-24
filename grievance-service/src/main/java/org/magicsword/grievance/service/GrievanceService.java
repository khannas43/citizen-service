package org.magicsword.grievance.service;

import org.magicsword.grievance.entity.Grievance;
import org.magicsword.grievance.entity.GrievanceAttachment;
import org.magicsword.grievance.entity.GrievanceComment;
import org.magicsword.grievance.model.AttachmentDto;
import org.magicsword.grievance.model.CommentRequest;
import org.magicsword.grievance.model.CommentResponse;
import org.magicsword.grievance.model.GrievanceRequest;
import org.magicsword.grievance.model.GrievanceResponse;
import org.magicsword.grievance.model.GrievanceThreadResponse;
import org.magicsword.grievance.model.GrievanceUpdateRequest;
import org.magicsword.grievance.repository.GrievanceAttachmentRepository;
import org.magicsword.grievance.repository.GrievanceCommentRepository;
import org.magicsword.grievance.repository.GrievanceRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class GrievanceService {

    private final GrievanceRepository repo;
    private final GrievanceAttachmentRepository attachmentRepo;
    private final GrievanceCommentRepository commentRepo;
    private final AppNumberService appNumberService;

    public GrievanceService(
            GrievanceRepository repo,
            GrievanceAttachmentRepository attachmentRepo,
            GrievanceCommentRepository commentRepo,
            AppNumberService appNumberService) {
        this.repo = repo;
        this.attachmentRepo = attachmentRepo;
        this.commentRepo = commentRepo;
        this.appNumberService = appNumberService;
    }

    public GrievanceResponse submit(GrievanceRequest req) {
        Grievance g = new Grievance();
        g.setAadhaarRef(req.aadhaarRef());
        g.setCitizenName(req.citizenName());
        g.setTrackingRef(req.trackingRef());
        g.setComplaintText(req.complaintText());
        g.setCategory(req.category() != null ? req.category() : "OTHER");
        g.setPriority(req.priority() != null ? req.priority() : "NORMAL");
        g.setStatus("OPEN");
        g.setCreatedAt(LocalDateTime.now());
        g.setUpdatedAt(LocalDateTime.now());
        g.setGrievanceRef(appNumberService.next("GRV"));
        Grievance saved = repo.save(g);

        if (req.attachments() != null) {
            for (AttachmentDto a : req.attachments()) {
                GrievanceAttachment att = new GrievanceAttachment();
                att.setGrievanceId(saved.getId());
                att.setFileName(a.name());
                att.setFileType(a.type());
                att.setFileData(a.data());
                attachmentRepo.save(att);
            }
        }
        return toResponse(saved);
    }

    public List<GrievanceResponse> getCitizenGrievances(String aadhaarRef) {
        return repo.findByAadhaarRefOrderByCreatedAtDesc(aadhaarRef)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public List<GrievanceResponse> getAllOpen() {
        return repo.findByStatusInOrderByCreatedAtDesc(
                        List.of("OPEN", "ACKNOWLEDGED", "QUERY_RAISED", "RESOLVED"))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    public GrievanceResponse update(UUID id, GrievanceUpdateRequest req) {
        Grievance g = repo.findById(id)
                .orElseThrow(() -> new RuntimeException("Grievance not found: " + id));
        g.setStatus(req.status());
        if (req.officerNotes() != null) {
            g.setOfficerNotes(req.officerNotes());
        }
        g.setUpdatedAt(LocalDateTime.now());
        return toResponse(repo.save(g));
    }

    public GrievanceThreadResponse getThread(UUID grievanceId) {
        Grievance g = repo.findById(grievanceId)
                .orElseThrow(() -> new RuntimeException("Not found: " + grievanceId));
        List<AttachmentDto> atts = attachmentRepo.findByGrievanceIdOrderByCreatedAtAsc(grievanceId)
                .stream()
                .map(a -> new AttachmentDto(a.getFileName(), a.getFileType(), a.getFileData()))
                .toList();
        List<CommentResponse> comments = commentRepo.findByGrievanceIdOrderByCreatedAtAsc(grievanceId)
                .stream()
                .map(this::toCommentResponse)
                .toList();
        return new GrievanceThreadResponse(toResponse(g), atts, comments);
    }

    public CommentResponse addComment(UUID grievanceId, CommentRequest req) {
        Grievance g = repo.findById(grievanceId)
                .orElseThrow(() -> new RuntimeException("Not found: " + grievanceId));
        if ("CITIZEN".equals(req.authorType()) && "RESOLVED".equals(g.getStatus())) {
            throw new RuntimeException("Cannot add follow-up to a resolved grievance");
        }
        GrievanceComment c = new GrievanceComment();
        c.setGrievanceId(grievanceId);
        c.setAuthorName(req.authorName());
        c.setAuthorType(req.authorType());
        c.setCommentText(req.commentText());
        if (req.attachment() != null) {
            c.setAttachmentName(req.attachment().name());
            c.setAttachmentType(req.attachment().type());
            c.setAttachmentData(req.attachment().data());
        }
        // Auto-transition status based on who is commenting
        if ("OFFICER_QUERY".equals(req.authorType())) {
            g.setStatus("QUERY_RAISED");
            repo.save(g);
        } else if ("CITIZEN".equals(req.authorType()) && "QUERY_RAISED".equals(g.getStatus())) {
            g.setStatus("ACKNOWLEDGED");
            repo.save(g);
        }
        return toCommentResponse(commentRepo.save(c));
    }

    public Map<String, Object> stats() {
        long open = repo.countByStatusIn(List.of("OPEN", "ACKNOWLEDGED", "QUERY_RAISED"));
        long resolved = repo.countByStatus("RESOLVED");
        return Map.of("openGrievances", open, "resolvedGrievances", resolved);
    }

    private CommentResponse toCommentResponse(GrievanceComment c) {
        return new CommentResponse(
                c.getId(),
                c.getGrievanceId(),
                c.getAuthorName(),
                c.getAuthorType(),
                c.getCommentText(),
                c.getAttachmentName(),
                c.getAttachmentType(),
                c.getAttachmentData(),
                c.getCreatedAt()
        );
    }

    private GrievanceResponse toResponse(Grievance g) {
        String ref = g.getGrievanceRef();
        if (ref == null || ref.isBlank()) {
            ref = "GRV-" + g.getId().toString().substring(g.getId().toString().length() - 5).toUpperCase();
        }
        return new GrievanceResponse(
                g.getId(),
                g.getTrackingRef(),
                g.getAadhaarRef(),
                g.getCitizenName(),
                g.getComplaintText(),
                g.getStatus(),
                g.getCreatedAt(),
                g.getUpdatedAt(),
                g.getOfficerNotes(),
                ref,
                g.getCategory(),
                g.getPriority()
        );
    }
}
