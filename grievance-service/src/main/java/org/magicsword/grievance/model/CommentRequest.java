package org.magicsword.grievance.model;

public record CommentRequest(
        String authorName,
        String authorType,
        String commentText,
        AttachmentDto attachment
) {}
