package org.magicsword.formdefinition.api;

import java.net.URI;
import java.util.List;
import java.util.stream.Collectors;

import org.magicsword.formdefinition.application.CreateRequiresDraftException;
import org.magicsword.formdefinition.application.DefinitionCoordinateMismatchException;
import org.magicsword.formdefinition.application.DefinitionNotEditableException;
import org.magicsword.formdefinition.application.DuplicateFormDefinitionException;
import org.magicsword.formdefinition.application.FormDefinitionAdmissionException;
import org.magicsword.formdefinition.application.FormDefinitionNotFoundException;
import org.magicsword.formdefinition.application.FormDefinitionValidationFailedException;
import org.magicsword.formdefinition.application.IfMatchRequiredException;
import org.magicsword.formdefinition.application.ImmutableCreationAuditChangedException;
import org.magicsword.formdefinition.application.InvalidActorException;
import org.magicsword.formdefinition.application.InvalidIfMatchException;
import org.magicsword.formdefinition.application.InvalidPaginationException;
import org.magicsword.formdefinition.application.InvalidTransitionRequestException;
import org.magicsword.formdefinition.application.LifecycleTransitionNotAllowedException;
import org.magicsword.formdefinition.application.PublishedFormDefinitionNotFoundException;
import org.magicsword.formdefinition.application.SourceNotCloneableException;
import org.magicsword.formdefinition.application.StaleRevisionException;
import org.magicsword.formdefinition.application.StoredDefinitionCorruptException;
import org.magicsword.formdefinition.application.UpdateRequiresDraftException;
import org.magicsword.formdefinition.application.VersionExhaustedException;
import org.magicsword.formdefinition.governance.GovernanceDefinitionNotFoundException;
import org.magicsword.formdefinition.governance.GovernanceForbiddenException;
import org.magicsword.formdefinition.governance.GovernanceUnauthenticatedException;
import org.magicsword.formdefinition.governance.InvalidGovernanceTransitionRequestException;
import org.magicsword.formdefinition.validation.ValidationIssue;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * RFC 9457 ProblemDetail mapping for Form Definition REST errors (FB-C2 / C3).
 *
 * <p>Never includes stack traces, SQL, submitted definitions, field values, ETag internals,
 * lockVersion, or exception messages that could leak internals. Validation issues are exposed
 * only for {@code validation_failed}.
 */
@RestControllerAdvice
public class FormDefinitionExceptionHandler {

    private static final MediaType PROBLEM_JSON = MediaType.APPLICATION_PROBLEM_JSON;

    @ExceptionHandler(FormDefinitionValidationFailedException.class)
    public ResponseEntity<ProblemDetail> validationFailed(FormDefinitionValidationFailedException ex) {
        ProblemDetail problem =
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.UNPROCESSABLE_ENTITY, "Form Definition validation failed");
        problem.setTitle("Validation Failed");
        problem.setProperty("code", ProblemCodes.VALIDATION_FAILED);
        problem.setProperty("issues", toIssueMaps(ex.issues()));
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    @ExceptionHandler(CreateRequiresDraftException.class)
    public ResponseEntity<ProblemDetail> createRequiresDraft(CreateRequiresDraftException ex) {
        return problem(
                HttpStatus.UNPROCESSABLE_ENTITY,
                ProblemCodes.CREATE_REQUIRES_DRAFT,
                "Create Requires Draft",
                "Only draft Form Definitions may be created");
    }

    @ExceptionHandler(UpdateRequiresDraftException.class)
    public ResponseEntity<ProblemDetail> updateRequiresDraft(UpdateRequiresDraftException ex) {
        return problem(
                HttpStatus.UNPROCESSABLE_ENTITY,
                ProblemCodes.UPDATE_REQUIRES_DRAFT,
                "Update Requires Draft",
                "Only draft Form Definitions may be updated");
    }

    @ExceptionHandler(DuplicateFormDefinitionException.class)
    public ResponseEntity<ProblemDetail> duplicate(DuplicateFormDefinitionException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.DUPLICATE_FORM_DEFINITION,
                "Duplicate Form Definition",
                "A Form Definition already exists for this serviceId and version");
    }

    @ExceptionHandler(FormDefinitionNotFoundException.class)
    public ResponseEntity<ProblemDetail> notFound(FormDefinitionNotFoundException ex) {
        return problem(
                HttpStatus.NOT_FOUND,
                ProblemCodes.FORM_DEFINITION_NOT_FOUND,
                "Form Definition Not Found",
                "No Form Definition exists for the requested serviceId and version");
    }

    @ExceptionHandler(FormDefinitionAdmissionException.class)
    public ResponseEntity<ProblemDetail> invalidCoordinates(FormDefinitionAdmissionException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_COORDINATES,
                "Invalid Coordinates",
                "Request coordinates are invalid");
    }

    @ExceptionHandler(StoredDefinitionCorruptException.class)
    public ResponseEntity<ProblemDetail> storedCorrupt(StoredDefinitionCorruptException ex) {
        return problem(
                HttpStatus.INTERNAL_SERVER_ERROR,
                ProblemCodes.STORED_DEFINITION_CORRUPT,
                "Stored Definition Corrupt",
                "The stored Form Definition could not be loaded safely");
    }

    @ExceptionHandler(IfMatchRequiredException.class)
    public ResponseEntity<ProblemDetail> ifMatchRequired(IfMatchRequiredException ex) {
        return problem(
                HttpStatus.PRECONDITION_REQUIRED,
                ProblemCodes.IF_MATCH_REQUIRED,
                "If-Match Required",
                "If-Match header is required for draft updates");
    }

    @ExceptionHandler(InvalidIfMatchException.class)
    public ResponseEntity<ProblemDetail> invalidIfMatch(InvalidIfMatchException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_IF_MATCH,
                "Invalid If-Match",
                "If-Match header is invalid");
    }

    @ExceptionHandler(StaleRevisionException.class)
    public ResponseEntity<ProblemDetail> staleRevision(StaleRevisionException ex) {
        return problem(
                HttpStatus.PRECONDITION_FAILED,
                ProblemCodes.STALE_REVISION,
                "Stale Revision",
                "The Form Definition was modified by another request");
    }

    @ExceptionHandler(DefinitionNotEditableException.class)
    public ResponseEntity<ProblemDetail> notEditable(DefinitionNotEditableException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.DEFINITION_NOT_EDITABLE,
                "Definition Not Editable",
                "Only draft Form Definitions may be updated");
    }

    @ExceptionHandler(DefinitionCoordinateMismatchException.class)
    public ResponseEntity<ProblemDetail> coordinateMismatch(DefinitionCoordinateMismatchException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.DEFINITION_COORDINATE_MISMATCH,
                "Definition Coordinate Mismatch",
                "Body serviceId and version must exactly match the targeted resource");
    }

    @ExceptionHandler(ImmutableCreationAuditChangedException.class)
    public ResponseEntity<ProblemDetail> immutableAudit(ImmutableCreationAuditChangedException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.IMMUTABLE_CREATION_AUDIT_CHANGED,
                "Immutable Creation Audit Changed",
                "audit.createdBy and audit.createdAt cannot be changed");
    }

    @ExceptionHandler(InvalidTransitionRequestException.class)
    public ResponseEntity<ProblemDetail> invalidTransitionRequest(InvalidTransitionRequestException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_TRANSITION_REQUEST,
                "Invalid Transition Request",
                "Lifecycle or new-draft request body is invalid");
    }

    @ExceptionHandler(InvalidActorException.class)
    public ResponseEntity<ProblemDetail> invalidActor(InvalidActorException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_ACTOR,
                "Invalid Actor",
                "Actor identity is invalid");
    }

    @ExceptionHandler(LifecycleTransitionNotAllowedException.class)
    public ResponseEntity<ProblemDetail> transitionNotAllowed(LifecycleTransitionNotAllowedException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.LIFECYCLE_TRANSITION_NOT_ALLOWED,
                "Lifecycle Transition Not Allowed",
                "The requested lifecycle transition is not allowed");
    }

    @ExceptionHandler(SourceNotCloneableException.class)
    public ResponseEntity<ProblemDetail> sourceNotCloneable(SourceNotCloneableException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.SOURCE_NOT_CLONEABLE,
                "Source Not Cloneable",
                "Only published or retired Form Definitions may be cloned");
    }

    @ExceptionHandler(VersionExhaustedException.class)
    public ResponseEntity<ProblemDetail> versionExhausted(VersionExhaustedException ex) {
        return problem(
                HttpStatus.CONFLICT,
                ProblemCodes.VERSION_EXHAUSTED,
                "Version Exhausted",
                "No further Form Definition versions can be allocated");
    }

    @ExceptionHandler(PublishedFormDefinitionNotFoundException.class)
    public ResponseEntity<ProblemDetail> publishedNotFound(PublishedFormDefinitionNotFoundException ex) {
        return problem(
                HttpStatus.NOT_FOUND,
                ProblemCodes.PUBLISHED_FORM_DEFINITION_NOT_FOUND,
                "Published Form Definition Not Found",
                "No published Form Definition is available for the requested service");
    }

    @ExceptionHandler(InvalidPaginationException.class)
    public ResponseEntity<ProblemDetail> invalidPagination(InvalidPaginationException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_PAGINATION,
                "Invalid Pagination",
                "Version list pagination parameters are invalid");
    }

    @ExceptionHandler(GovernanceUnauthenticatedException.class)
    public ResponseEntity<ProblemDetail> governanceUnauthenticated(
            GovernanceUnauthenticatedException ex) {
        return problem(
                HttpStatus.UNAUTHORIZED,
                ProblemCodes.GOVERNANCE_UNAUTHENTICATED,
                "Governance Unauthenticated",
                "Governance authentication is required");
    }

    @ExceptionHandler(GovernanceForbiddenException.class)
    public ResponseEntity<ProblemDetail> governanceForbidden(GovernanceForbiddenException ex) {
        return problem(
                HttpStatus.FORBIDDEN,
                ProblemCodes.GOVERNANCE_FORBIDDEN,
                "Governance Forbidden",
                "Governance authorization failed");
    }

    @ExceptionHandler(InvalidGovernanceTransitionRequestException.class)
    public ResponseEntity<ProblemDetail> invalidGovernanceTransition(
            InvalidGovernanceTransitionRequestException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_GOVERNANCE_TRANSITION_REQUEST,
                "Invalid Governance Transition Request",
                "Governance lifecycle request is invalid");
    }

    @ExceptionHandler(GovernanceDefinitionNotFoundException.class)
    public ResponseEntity<ProblemDetail> governanceDefinitionNotFound(
            GovernanceDefinitionNotFoundException ex) {
        return problem(
                HttpStatus.NOT_FOUND,
                ProblemCodes.GOVERNANCE_DEFINITION_NOT_FOUND,
                "Governance Definition Not Found",
                "No eligible Form Definition exists for the requested governance coordinates");
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetail> malformedJson(HttpMessageNotReadableException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.MALFORMED_JSON,
                "Malformed JSON",
                "Request body is not valid JSON");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ProblemDetail> missingParam(MissingServletRequestParameterException ex) {
        return problem(
                HttpStatus.BAD_REQUEST,
                ProblemCodes.INVALID_COORDINATES,
                "Invalid Coordinates",
                "Request coordinates are invalid");
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ProblemDetail> unsupportedMediaType(HttpMediaTypeNotSupportedException ex) {
        ProblemDetail problem =
                ProblemDetail.forStatusAndDetail(
                        HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported content type");
        problem.setTitle("Unsupported Media Type");
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    private static ResponseEntity<ProblemDetail> problem(
            HttpStatus status, String code, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setProperty("code", code);
        problem.setType(URI.create("about:blank"));
        return ResponseEntity.status(status)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(PROBLEM_JSON)
                .body(problem);
    }

    private static List<java.util.Map<String, Object>> toIssueMaps(List<ValidationIssue> issues) {
        return issues.stream()
                .map(
                        issue -> {
                            java.util.Map<String, Object> map = new java.util.LinkedHashMap<>();
                            map.put("code", issue.code());
                            map.put("message", issue.message());
                            map.put("severity", issue.severity().name());
                            if (issue.path() != null) {
                                map.put("path", issue.path());
                            }
                            return map;
                        })
                .collect(Collectors.toList());
    }
}
