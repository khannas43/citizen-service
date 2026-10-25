package org.citizen.grievance.service;

import org.citizen.grievance.entity.AppCounter;
import org.citizen.grievance.repository.AppCounterRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

@Service
public class AppNumberService {

    private final AppCounterRepository repo;

    public AppNumberService(AppCounterRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public synchronized String next(String prefix) {
        LocalDate now = LocalDate.now();
        String ym = String.format("%02d%02d", now.getYear() % 100, now.getMonthValue());
        String key = prefix + "-" + ym;
        AppCounter counter = repo.findById(key).orElseGet(() -> {
            AppCounter c = new AppCounter();
            c.setCounterKey(key);
            c.setLastValue(0);
            return c;
        });
        counter.setLastValue(counter.getLastValue() + 1);
        repo.save(counter);
        return String.format("%s-%s-%06d", prefix, ym, counter.getLastValue());
    }
}
