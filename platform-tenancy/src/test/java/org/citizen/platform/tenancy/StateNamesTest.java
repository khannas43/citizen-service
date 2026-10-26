package org.citizen.platform.tenancy;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class StateNamesTest {

    @Test
    void recognisesStateNamesCaseInsensitively() {
        assertTrue(StateNames.isStateWide("Telangana"));
        assertTrue(StateNames.isStateWide("  gujarat "));
        assertTrue(StateNames.isStateWide("తెలంగాణ"));
        assertFalse(StateNames.isStateWide("Karimnagar"));
        assertFalse(StateNames.isStateWide(null));
    }

    @Test
    void namesFollowTheStateCode() {
        assertEquals("Telangana", StateNames.nameOf("TG"));
        assertEquals("Tamil Nadu", StateNames.nameOf("TN"));
        assertEquals("Telangana", StateNames.nameOf(null));
        StateContext.set("TN");
        try {
            assertEquals("Tamil Nadu", StateNames.currentName());
        } finally {
            StateContext.clear();
        }
    }
}
