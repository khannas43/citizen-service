package org.magicsword.expenditure.security;

import org.magicsword.expenditure.domain.IntegrityDomain;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.util.Arrays;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Who may see and who may rule on each kind of case. Payroll cases carry individual salaries, so they are open
 * only to payroll and finance roles, not to scheme officers; the endpoint-level rules in OfficerSecurityConfig
 * are the union of these lists and this class narrows them per domain.
 */
@Component
public class DomainAccess {

    private final Map<IntegrityDomain, Set<String>> read;
    private final Map<IntegrityDomain, Set<String>> review;

    public DomainAccess(@Value("${officer.integrity.beneficiary-read-roles}") String beneficiaryRead,
                        @Value("${officer.integrity.beneficiary-review-roles}") String beneficiaryReview,
                        @Value("${officer.integrity.payroll-read-roles}") String payrollRead,
                        @Value("${officer.integrity.payroll-review-roles}") String payrollReview) {
        this.read = Map.of(IntegrityDomain.BENEFICIARY, roles(beneficiaryRead), IntegrityDomain.PAYROLL, roles(payrollRead));
        this.review = Map.of(IntegrityDomain.BENEFICIARY, roles(beneficiaryReview), IntegrityDomain.PAYROLL, roles(payrollReview));
    }

    private static Set<String> roles(String csv) {
        return Arrays.stream(csv.split(",")).map(String::trim).filter(s -> !s.isEmpty()).map(r -> "ROLE_" + r).collect(Collectors.toSet());
    }

    private static boolean has(Authentication auth, Set<String> roles) {
        return auth != null && auth.getAuthorities().stream().anyMatch(a -> roles.contains(a.getAuthority()));
    }

    public boolean canRead(Authentication auth, IntegrityDomain domain) {
        return domain == null || has(auth, read.get(domain));
    }

    public boolean canReview(Authentication auth, IntegrityDomain domain) {
        return domain == null || has(auth, review.get(domain));
    }

    public void requireRead(Authentication auth, IntegrityDomain domain) {
        if (!canRead(auth, domain)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, notAllowed(domain));
    }

    public void requireReview(Authentication auth, IntegrityDomain domain) {
        if (!canReview(auth, domain)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, notAllowed(domain));
    }

    private static String notAllowed(IntegrityDomain domain) {
        return domain == IntegrityDomain.PAYROLL
                ? "Payroll and pension cases are open only to payroll and finance roles."
                : "Your role is not allowed to work on beneficiary payment cases.";
    }
}
