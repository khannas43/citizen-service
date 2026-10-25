package org.citizen.auth.store;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class OtpStore {

    private final Map<String, OtpEntry> store = new ConcurrentHashMap<>();

    public record OtpEntry(String otp, Instant expiresAt) {}

    public void save(String aadhaarRef, String otp) {
        store.put(aadhaarRef, new OtpEntry(otp, Instant.now().plusSeconds(600)));
    }

    public boolean verify(String aadhaarRef, String otp) {
        OtpEntry entry = store.get(aadhaarRef);
        if (entry == null || Instant.now().isAfter(entry.expiresAt())) {
            return false;
        }
        boolean match = entry.otp().equals(otp);
        if (match) {
            store.remove(aadhaarRef);
        }
        return match;
    }
}
