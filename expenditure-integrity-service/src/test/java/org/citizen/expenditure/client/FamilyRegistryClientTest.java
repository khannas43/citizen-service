package org.citizen.expenditure.client;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FamilyRegistryClientTest {

    @Test
    void masksStandardAadhaarRef() {
        assertEquals("****-****-5001", FamilyRegistryClient.maskAadhaarRef("XXXX-XXXX-5001"));
    }
}
