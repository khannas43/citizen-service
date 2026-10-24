package org.magicsword.scheme.service;

import org.magicsword.scheme.entity.OfficeType;
import org.magicsword.scheme.model.OfficeFiltersResponse;
import org.magicsword.scheme.repository.ServiceOfficeRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class OfficeFiltersService {

    private final ServiceOfficeRepository officeRepository;

    public OfficeFiltersService(ServiceOfficeRepository officeRepository) {
        this.officeRepository = officeRepository;
    }

    public OfficeFiltersResponse getFilters() {
        List<String> districts = officeRepository.findDistinctDistricts();
        Map<String, List<String>> talukasByDistrict = new LinkedHashMap<>();
        for (String d : districts) {
            talukasByDistrict.put(d, officeRepository.findDistinctTalukas(d));
        }
        Map<String, Map<String, List<String>>> villagesByTaluka = new LinkedHashMap<>();
        for (Object[] row : officeRepository.findDistinctVillages()) {
            villagesByTaluka
                    .computeIfAbsent((String) row[0], k -> new LinkedHashMap<>())
                    .computeIfAbsent((String) row[1], k -> new ArrayList<>())
                    .add((String) row[2]);
        }
        return new OfficeFiltersResponse(
                districts,
                talukasByDistrict,
                villagesByTaluka,
                Arrays.asList(OfficeType.values()));
    }
}
