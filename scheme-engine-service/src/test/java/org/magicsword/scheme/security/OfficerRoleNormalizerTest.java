package org.magicsword.scheme.security;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class OfficerRoleNormalizerTest {

    @Test
    void normalizesAliases() {
        assertEquals("SCHEME_DEPT", OfficerRoleNormalizer.normalize("SCHEME_DEPARTMENT"));
        assertEquals("DEPT_ADMIN", OfficerRoleNormalizer.normalize("DEPARTMENT_ADMIN"));
        assertEquals("TALATI", OfficerRoleNormalizer.normalize("MAMLATDAR"));
    }
}
