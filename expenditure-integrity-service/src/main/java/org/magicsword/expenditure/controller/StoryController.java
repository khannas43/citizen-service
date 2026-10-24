package org.magicsword.expenditure.controller;

import org.magicsword.expenditure.security.DomainAccess;
import org.magicsword.expenditure.service.StoryService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** The guided demo: three real cases and the pilot summary. Cases the caller's role may not read are left out. */
@RestController
@RequestMapping("/v1/story")
@CrossOrigin(originPatterns = "*")
public class StoryController {

    private final StoryService story;
    private final DomainAccess access;

    public StoryController(StoryService story, DomainAccess access) {
        this.story = story;
        this.access = access;
    }

    @GetMapping
    public Map<String, Object> story(Authentication auth) {
        return Map.of("scenarios", story.scenarios(domain -> access.canRead(auth, domain)), "summary", story.summary());
    }
}
