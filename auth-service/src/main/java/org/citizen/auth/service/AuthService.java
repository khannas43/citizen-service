package org.citizen.auth.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.citizen.auth.model.OtpSendResponse;
import org.citizen.auth.model.OtpVerifyResponse;
import org.citizen.auth.model.PersonSearchResponse;
import org.citizen.auth.model.PersonSummary;
import org.citizen.auth.model.TokenVerifyResponse;
import org.citizen.auth.store.OtpStore;
import org.citizen.auth.util.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private static final String DEMO_OTP = "123456";

    private final OtpStore otpStore;
    private final JwtUtil jwtUtil;
    private final WebClient webClient;

    public AuthService(
            OtpStore otpStore,
            JwtUtil jwtUtil,
            WebClient.Builder webClientBuilder,
            @Value("${family.registry.base-url}") String familyRegistryBaseUrl) {
        this.otpStore = otpStore;
        this.jwtUtil = jwtUtil;
        this.webClient = webClientBuilder.baseUrl(familyRegistryBaseUrl).build();
    }

    public OtpSendResponse sendOtp(String aadhaarRef) {
        PersonSummary person = findPerson(aadhaarRef);
        otpStore.save(aadhaarRef, DEMO_OTP);
        return new OtpSendResponse(true, maskMobile(person.mobile()), person.name());
    }

    public OtpVerifyResponse verifyOtp(String aadhaarRef, String otp) {
        if (!otpStore.verify(aadhaarRef, otp)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid or expired OTP");
        }
        PersonSummary person = findPerson(aadhaarRef);
        String familyId = person.familyId() != null ? person.familyId().toString() : "";
        String token = jwtUtil.generate(aadhaarRef, person.name(), familyId, "CITIZEN");
        return new OtpVerifyResponse(token, person.name(), aadhaarRef, familyId);
    }

    public TokenVerifyResponse verifyToken(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid token");
        }
        String token = authHeader.substring(7);
        try {
            Claims claims = jwtUtil.parse(token);
            return new TokenVerifyResponse(
                    true,
                    claims.get("role", String.class),
                    claims.getSubject(),
                    claims.get("name", String.class),
                    claims.get("familyId", String.class)
            );
        } catch (JwtException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid token");
        }
    }

    private PersonSummary findPerson(String aadhaarRef) {
        try {
            PersonSearchResponse response = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/v1/persons/search")
                            .queryParam("aadhaar", aadhaarRef)
                            .build())
                    .retrieve()
                    .bodyToMono(PersonSearchResponse.class)
                    .block();
            if (response == null || response.results() == null || response.results().isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Aadhaar not registered");
            }
            return response.results().get(0);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Aadhaar not registered");
        }
    }

    private String maskMobile(String mobile) {
        if (mobile == null || mobile.length() < 4) {
            return "XXXXXXXXXX";
        }
        return "XXXXXX" + mobile.substring(mobile.length() - 4);
    }
}
