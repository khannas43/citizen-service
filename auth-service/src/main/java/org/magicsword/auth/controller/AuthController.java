package org.magicsword.auth.controller;

import org.magicsword.auth.model.OtpSendRequest;
import org.magicsword.auth.model.OtpSendResponse;
import org.magicsword.auth.model.OtpVerifyRequest;
import org.magicsword.auth.model.OtpVerifyResponse;
import org.magicsword.auth.model.TokenVerifyResponse;
import org.magicsword.auth.service.AuthService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/v1")
@CrossOrigin(originPatterns = "*")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/otp/send")
    public OtpSendResponse sendOtp(@RequestBody OtpSendRequest request) {
        return authService.sendOtp(request.aadhaarRef());
    }

    @PostMapping("/otp/verify")
    public OtpVerifyResponse verifyOtp(@RequestBody OtpVerifyRequest request) {
        return authService.verifyOtp(request.aadhaarRef(), request.otp());
    }

    @GetMapping("/verify")
    public TokenVerifyResponse verifyToken(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        return authService.verifyToken(authHeader);
    }
}
