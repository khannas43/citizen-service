package org.magicsword.expenditure.controller;

import org.magicsword.expenditure.service.OverviewService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Senior-management money picture. Who may read it is set in OfficerSecurityConfig (officer.integrity.overview-roles). */
@RestController
@RequestMapping("/v1/overview")
@CrossOrigin(originPatterns = "*")
public class OverviewController {

    private final OverviewService overview;

    public OverviewController(OverviewService overview) {
        this.overview = overview;
    }

    @GetMapping
    public Map<String, Object> overview() {
        return overview.overview();
    }
}
