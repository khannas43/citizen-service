package org.citizen.expenditure.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PayrollGeoSupportTest {

    @Test
    void infersDistrictTalukaFromGeneratedEmployeeCode() {
        var geo = PayrollGeoSupport.inferFromEmployeeCode("GJ-BAN-DEESA-03").orElseThrow();
        assertEquals("Banaskantha", geo.district());
        assertEquals("Deesa", geo.taluka());
    }

    @Test
    void ignoresUnknownCodes() {
        assertTrue(PayrollGeoSupport.inferFromEmployeeCode("GJ-DEMO-TRANSFER-01").isEmpty());
    }
}
