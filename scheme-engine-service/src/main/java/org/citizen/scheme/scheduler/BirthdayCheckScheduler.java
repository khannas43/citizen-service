package org.citizen.scheme.scheduler;

import org.citizen.scheme.service.SchemeEngineService;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

@Component
public class BirthdayCheckScheduler {

    private final SchemeEngineService service;

    public BirthdayCheckScheduler(SchemeEngineService service) {
        this.service = service;
    }

    @Scheduled(cron = "0 0 0 * * *")
    public void runMidnightBirthdayCheck() {
        service.runBirthdayCheck(LocalDate.now());
    }
}
