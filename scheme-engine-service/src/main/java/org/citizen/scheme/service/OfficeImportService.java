package org.citizen.scheme.service;

import org.citizen.scheme.entity.OfficeType;
import org.citizen.scheme.entity.ServiceOffice;
import org.citizen.scheme.repository.ServiceOfficeRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

@Service
public class OfficeImportService {

    private final ServiceOfficeRepository officeRepository;

    public OfficeImportService(ServiceOfficeRepository officeRepository) {
        this.officeRepository = officeRepository;
    }

    public Map<String, Object> importCsv(MultipartFile file) {
        List<Map<String, String>> errors = new ArrayList<>();
        int imported = 0;
        int rowNum = 0;
        Set<String> dedupe = new HashSet<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String header = reader.readLine();
            if (header == null) {
                return Map.of("imported", 0, "errors", List.of(Map.of("row", "0", "message", "Empty file")));
            }
            String line;
            while ((line = reader.readLine()) != null) {
                rowNum++;
                if (line.isBlank()) continue;
                try {
                    String[] cols = line.split(",", -1);
                    if (cols.length < 12) {
                        errors.add(error(rowNum, "Expected at least 12 columns"));
                        continue;
                    }
                    ServiceOffice o = new ServiceOffice();
                    o.setName(cols[0].trim());
                    o.setNameGujarati(blankNull(cols[1]));
                    o.setOfficeType(OfficeType.valueOf(cols[2].trim()));
                    o.setDepartment(blankNull(cols[3]));
                    o.setAddress(cols[4].trim());
                    o.setDistrict(cols[5].trim());
                    o.setTaluka(cols[6].trim());
                    o.setVillage(blankNull(cols[7]));
                    o.setPincode(blankNull(cols[8]));
                    o.setLatitude(Double.parseDouble(cols[9].trim()));
                    o.setLongitude(Double.parseDouble(cols[10].trim()));
                    o.setPhone(blankNull(cols[11]));
                    if (cols.length > 12) o.setEmail(blankNull(cols[12]));
                    if (cols.length > 13) o.setWorkingHours(blankNull(cols[13]));
                    o.setIsActive(true);
                    o.setDataSource(cols.length > 14 ? cols[14].trim() : "CSV_IMPORT");
                    o.setLastVerifiedOn(LocalDate.now());

                    validateCoords(o.getLatitude(), o.getLongitude());
                    String key = o.getName() + "|" + o.getDistrict() + "|" + o.getTaluka();
                    if (!dedupe.add(key)) {
                        errors.add(error(rowNum, "Duplicate row"));
                        continue;
                    }
                    officeRepository.save(o);
                    imported++;
                } catch (Exception e) {
                    errors.add(error(rowNum, e.getMessage()));
                }
            }
        } catch (Exception e) {
            errors.add(error(0, e.getMessage()));
        }
        return Map.of("imported", imported, "errors", errors);
    }

    private static void validateCoords(double lat, double lng) {
        if (lat < NearbyOfficeService.GUJ_LAT_MIN || lat > NearbyOfficeService.GUJ_LAT_MAX
                || lng < NearbyOfficeService.GUJ_LNG_MIN || lng > NearbyOfficeService.GUJ_LNG_MAX) {
            throw new IllegalArgumentException("lat/lng out of Gujarat bounds");
        }
    }

    private static String blankNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static Map<String, String> error(int row, String msg) {
        return Map.of("row", String.valueOf(row), "message", msg != null ? msg : "error");
    }
}
