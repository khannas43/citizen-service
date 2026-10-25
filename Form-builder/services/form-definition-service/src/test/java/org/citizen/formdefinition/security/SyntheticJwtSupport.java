package org.citizen.formdefinition.security;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Arrays;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * In-test RSA keypair and RS256 JWT builders for FB-E5.4.1. Never calls live JWKS or discovery.
 */
public final class SyntheticJwtSupport {

    public static final String DEFAULT_ISSUER = "https://fds-test-issuer.example/realms/egov";
    public static final String DEFAULT_AUDIENCE = FormDefinitionJwtValidators.REQUIRED_AUDIENCE;

    private final RSAPublicKey publicKey;
    private final RSAPrivateKey privateKey;
    private final RSAPrivateKey wrongPrivateKey;

    private SyntheticJwtSupport(
            RSAPublicKey publicKey, RSAPrivateKey privateKey, RSAPrivateKey wrongPrivateKey) {
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.wrongPrivateKey = wrongPrivateKey;
    }

    public static SyntheticJwtSupport generate() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KeyPair primary = generator.generateKeyPair();
            KeyPair wrong = generator.generateKeyPair();
            return new SyntheticJwtSupport(
                    (RSAPublicKey) primary.getPublic(),
                    (RSAPrivateKey) primary.getPrivate(),
                    (RSAPrivateKey) wrong.getPrivate());
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to generate RSA keypair for synthetic JWT tests", ex);
        }
    }

    public RSAPublicKey publicKey() {
        return publicKey;
    }

    /**
     * RS256 JWT with {@code realm_access.roles}, signed by the trusted private key.
     *
     * @param exp expiration; when {@code null}, defaults to now + 1 hour
     * @param nbf not-before; when {@code null}, omitted
     */
    public String token(
            String sub,
            Instant exp,
            Instant nbf,
            String issuer,
            String audience,
            String... roles) {
        return signRs256(privateKey, sub, exp, nbf, issuer, audience, realmAccess(roles));
    }

    /** Convenience: default issuer/audience, 1h expiry, roles only. */
    public String token(String sub, String... roles) {
        return token(sub, Instant.now().plusSeconds(3600), null, DEFAULT_ISSUER, DEFAULT_AUDIENCE, roles);
    }

    /** RS256 signed with a key that does not match {@link #publicKey()}. */
    public String tokenSignedWithWrongKey(String sub, String... roles) {
        return signRs256(
                wrongPrivateKey,
                sub,
                Instant.now().plusSeconds(3600),
                null,
                DEFAULT_ISSUER,
                DEFAULT_AUDIENCE,
                realmAccess(roles));
    }

    /** HS256 (HMAC) token — must fail RS256 resource-server verification. */
    public String hs256Token(String sub, String... roles) {
        try {
            byte[] secret = new byte[32];
            Arrays.fill(secret, (byte) 0x42);
            SecretKey key = new SecretKeySpec(secret, "HmacSHA256");
            JWTClaimsSet claims =
                    baseClaims(
                                    sub,
                                    Instant.now().plusSeconds(3600),
                                    null,
                                    DEFAULT_ISSUER,
                                    DEFAULT_AUDIENCE,
                                    realmAccess(roles))
                            .build();
            SignedJWT jwt =
                    new SignedJWT(
                            new JWSHeader.Builder(JWSAlgorithm.HS256)
                                    .type(JOSEObjectType.JWT)
                                    .build(),
                            claims);
            jwt.sign(new MACSigner(key));
            return jwt.serialize();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to build HS256 synthetic JWT", ex);
        }
    }

    /** RS256 token with a custom {@code realm_access} claim (may be malformed). */
    public String tokenWithRealmAccess(String sub, Object realmAccess) {
        return signRs256(
                privateKey,
                sub,
                Instant.now().plusSeconds(3600),
                null,
                DEFAULT_ISSUER,
                DEFAULT_AUDIENCE,
                realmAccess);
    }

    /** Unsigned / structurally broken compact serialization. */
    public static String malformedCompact() {
        return "not.a.jwt";
    }

    private static Map<String, Object> realmAccess(String... roles) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("roles", roles == null ? List.of() : Arrays.asList(roles));
        return map;
    }

    private static String signRs256(
            RSAPrivateKey signingKey,
            String sub,
            Instant exp,
            Instant nbf,
            String issuer,
            String audience,
            Object realmAccess) {
        try {
            Instant expires = exp != null ? exp : Instant.now().plusSeconds(3600);
            JWTClaimsSet claims =
                    baseClaims(sub, expires, nbf, issuer, audience, realmAccess).build();
            SignedJWT jwt =
                    new SignedJWT(
                            new JWSHeader.Builder(JWSAlgorithm.RS256)
                                    .type(JOSEObjectType.JWT)
                                    .build(),
                            claims);
            jwt.sign(new RSASSASigner(signingKey));
            return jwt.serialize();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to build RS256 synthetic JWT", ex);
        }
    }

    private static JWTClaimsSet.Builder baseClaims(
            String sub,
            Instant exp,
            Instant nbf,
            String issuer,
            String audience,
            Object realmAccess) {
        Objects.requireNonNull(issuer, "issuer");
        Objects.requireNonNull(audience, "audience");
        JWTClaimsSet.Builder builder =
                new JWTClaimsSet.Builder()
                        .subject(sub)
                        .issuer(issuer)
                        .audience(audience)
                        .issueTime(Date.from(Instant.now().minusSeconds(5)))
                        .expirationTime(Date.from(exp));
        if (nbf != null) {
            builder.notBeforeTime(Date.from(nbf));
        }
        if (realmAccess != null) {
            builder.claim("realm_access", realmAccess);
        }
        return builder;
    }
}
