package org.citizen.family.service;

import org.citizen.family.entity.Family;
import org.citizen.family.entity.FamilyMember;
import org.citizen.family.entity.FamilyMemberId;
import org.citizen.family.entity.Person;
import org.citizen.family.event.FamilyRegistryEvent;
import org.citizen.family.model.*;
import org.citizen.family.repository.FamilyMemberRepository;
import org.citizen.family.repository.FamilyRepository;
import org.citizen.family.repository.PersonRepository;
import org.citizen.family.repository.PersonSearchDao;
import org.springframework.data.domain.PageRequest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class FamilyRegistryService {

    private static final String TOPIC = "family-registry-events";

    private final FamilyRepository familyRepository;
    private final PersonRepository personRepository;
    private final FamilyMemberRepository familyMemberRepository;
    private final PersonSearchDao personSearchDao;
    private final KafkaTemplate<String, FamilyRegistryEvent> kafkaTemplate;

    public FamilyRegistryService(FamilyRepository familyRepository,
                                 PersonRepository personRepository,
                                 FamilyMemberRepository familyMemberRepository,
                                 PersonSearchDao personSearchDao,
                                 KafkaTemplate<String, FamilyRegistryEvent> kafkaTemplate) {
        this.familyRepository = familyRepository;
        this.personRepository = personRepository;
        this.familyMemberRepository = familyMemberRepository;
        this.personSearchDao = personSearchDao;
        this.kafkaTemplate = kafkaTemplate;
    }

    public FamilyResponse getFamily(UUID familyId) {
        Family family = familyRepository.findById(familyId)
                .orElseThrow(() -> new NoSuchElementException("Family not found: " + familyId));
        return toFamilyResponse(family);
    }

    public IncomeResponse getFamilyIncome(UUID familyId) {
        requireFamily(familyId);
        List<FamilyMember> members = familyMemberRepository.findByFamilyId(familyId);

        List<IncomeMember> breakdown = members.stream()
                .map(fm -> {
                    Person person = personRepository.findById(fm.getPersonId())
                            .orElseThrow(() -> new NoSuchElementException("Person not found: " + fm.getPersonId()));
                    return new IncomeMember(
                            person.getId(),
                            person.getName(),
                            Boolean.TRUE.equals(person.getIsAlive()) ? person.getAnnualIncome() : 0L,
                            person.getOccupation(),
                            fm.getRelationshipToHead()
                    );
                })
                .sorted(Comparator.comparing(IncomeMember::annualIncome, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();

        long total = breakdown.stream()
                .mapToLong(m -> m.annualIncome() != null ? m.annualIncome() : 0L)
                .sum();

        return new IncomeResponse(familyId, total, breakdown);
    }

    public List<SchemeEligibility> getSchemeEligibility(UUID familyId) {
        IncomeResponse income = getFamilyIncome(familyId);
        List<PersonSummary> members = getFamily(familyId).members();

        boolean hasFarmer = members.stream()
                .anyMatch(m -> m.occupation() != null
                        && m.occupation().toLowerCase().contains("farm")
                        && Boolean.TRUE.equals(m.isAlive()));

        PersonSummary head = members.stream()
                .filter(m -> "HEAD".equals(m.relationshipToHead()))
                .findFirst()
                .orElse(members.get(0));

        List<SchemeEligibility> results = new ArrayList<>();

        if (hasFarmer && income.totalAnnualIncome() < 200_000) {
            results.add(new SchemeEligibility("PM_KISAN", true, "Farmer in family and income below ₹2L"));
        } else if (!hasFarmer) {
            results.add(new SchemeEligibility("PM_KISAN", false, "No farmer in family"));
        } else {
            results.add(new SchemeEligibility("PM_KISAN", false, "Family income exceeds ₹2L threshold"));
        }

        if (income.totalAnnualIncome() < 100_000) {
            results.add(new SchemeEligibility("BPL_RATION", true, "Family income below ₹1L"));
        } else {
            results.add(new SchemeEligibility("BPL_RATION", false, "Family income exceeds ₹1L threshold"));
        }

        String headCaste = head.casteCategory() != null ? head.casteCategory().toUpperCase() : "";
        Set<String> eligibleCastes = Set.of("OBC", "SC", "ST");
        if (eligibleCastes.contains(headCaste) && income.totalAnnualIncome() < 250_000) {
            results.add(new SchemeEligibility("OBC_SCHOLARSHIP", true, "Head caste eligible and income below ₹2.5L"));
        } else if (!eligibleCastes.contains(headCaste)) {
            results.add(new SchemeEligibility("OBC_SCHOLARSHIP", false, "Head caste not in OBC/SC/ST"));
        } else {
            results.add(new SchemeEligibility("OBC_SCHOLARSHIP", false, "Family income exceeds ₹2.5L threshold"));
        }

        results.add(new SchemeEligibility("JAN_DHAN", true, "Open to all citizens"));

        return results;
    }

    public PersonSearchResponse searchPersons(PersonSearchCriteria criteria) {
        if (criteria.isEmpty()) {
            return PersonSearchResponse.empty(criteria.limit());
        }
        return personSearchDao.search(criteria);
    }

    public List<String> listTalukasForDistrict(String district) {
        return familyRepository.findDistinctTalukasByDistrict(district);
    }

    public List<String> listVillagesForTaluka(String district, String taluka) {
        return familyRepository.findDistinctVillagesByDistrictAndTaluka(district, taluka);
    }

    public List<String> listAllFamilyIds() {
        return familyRepository.findAll().stream()
                .map(f -> f.getId().toString())
                .toList();
    }

    public List<String> listFamilyIds(int offset, int limit) {
        int page = offset / limit;
        return familyRepository.findIdsPage(PageRequest.of(page, limit)).stream()
                .map(UUID::toString)
                .toList();
    }

    public Map<String, Long> stats() {
        return Map.of(
                "totalFamilies", familyRepository.count(),
                "totalPersons", personRepository.count()
        );
    }

    @Transactional
    public FamilyResponse createFamily(CreateFamilyRequest req) {
        Family family = new Family();
        family.setAddress(req.address());
        family.setVillage(req.village());
        family.setTaluka(req.taluka());
        family.setDistrict(req.district());
        family.setState("Gujarat");
        family = familyRepository.save(family);

        HeadPersonRequest head = req.headPerson();
        Person person = new Person();
        person.setName(head.name());
        person.setDob(head.dob());
        person.setGender(head.gender());
        person.setOccupation(head.occupation());
        person.setAnnualIncome(head.annualIncome() != null ? head.annualIncome() : 0L);
        person.setCasteCategory(head.casteCategory());
        person.setMobile(head.mobile());
        person.setAadhaarRef(head.aadhaarRef());
        person.setIsAlive(true);
        person = personRepository.save(person);

        FamilyMember member = new FamilyMember();
        member.setFamilyId(family.getId());
        member.setPersonId(person.getId());
        member.setRelationshipToHead("HEAD");
        familyMemberRepository.save(member);

        return toFamilyResponse(family);
    }

    @Transactional
    public FamilyResponse addMember(UUID familyId, AddMemberRequest req) {
        requireFamily(familyId);

        Person person = new Person();
        person.setName(req.name());
        person.setDob(req.dob());
        person.setGender(req.gender());
        person.setOccupation(req.occupation());
        person.setAnnualIncome(req.annualIncome() != null ? req.annualIncome() : 0L);
        person.setCasteCategory(req.casteCategory());
        person.setMobile(req.mobile());
        person.setAadhaarRef(req.aadhaarRef());
        person.setIsAlive(true);
        person.setExamType(req.examType());
        person.setExamPercentile(req.examPercentile());
        person.setCourseCategory(req.courseCategory());
        person = personRepository.save(person);

        FamilyMember member = new FamilyMember();
        member.setFamilyId(familyId);
        member.setPersonId(person.getId());
        member.setRelationshipToHead(req.relationshipToHead());
        familyMemberRepository.save(member);

        publishEvent("MEMBER_ADDED", familyId, person.getId());
        return getFamily(familyId);
    }

    @Transactional
    public FamilyResponse removeMember(UUID familyId, UUID personId) {
        requireFamily(familyId);
        FamilyMemberId memberId = new FamilyMemberId(familyId, personId);
        if (!familyMemberRepository.existsById(memberId)) {
            throw new NoSuchElementException("Member not found in family: " + personId);
        }

        Person person = personRepository.findById(personId)
                .orElseThrow(() -> new NoSuchElementException("Person not found: " + personId));
        person.setIsAlive(false);
        personRepository.save(person);

        publishEvent("MEMBER_DELETED", familyId, personId);
        return getFamily(familyId);
    }

    @Transactional
    public PersonSummary completeOnboarding(UUID personId, CompleteOnboardingRequest req) {
        Person person = personRepository.findById(personId)
                .orElseThrow(() -> new NoSuchElementException("Person not found: " + personId));

        if (req.occupation() != null) person.setOccupation(req.occupation());
        if (req.annualIncome() != null) person.setAnnualIncome(req.annualIncome());
        if (req.casteCategory() != null) person.setCasteCategory(req.casteCategory());
        if (req.educationLevel() != null) person.setEducationLevel(req.educationLevel());
        if (req.maritalStatus() != null) person.setMaritalStatus(req.maritalStatus());
        if (req.employmentStatus() != null) person.setEmploymentStatus(req.employmentStatus());
        person.setOnboardingCompleted(true);
        person = personRepository.save(person);

        FamilyMember fm = familyMemberRepository.findFirstByPersonId(personId)
                .orElseThrow(() -> new NoSuchElementException("Person not linked to a family: " + personId));

        publishEvent("ONBOARDING_COMPLETED", fm.getFamilyId(), personId);
        Family family = familyRepository.findById(fm.getFamilyId()).orElse(null);
        return toPersonSummary(person, fm.getFamilyId(), fm.getRelationshipToHead(), family);
    }

    public PersonSummary updateIncome(UUID personId, Long newAnnualIncome) {
        Person person = personRepository.findById(personId)
                .orElseThrow(() -> new NoSuchElementException("Person not found: " + personId));
        person.setAnnualIncome(newAnnualIncome);
        person = personRepository.save(person);

        FamilyMember fm = familyMemberRepository.findFirstByPersonId(personId)
                .orElseThrow(() -> new NoSuchElementException("Person not linked to a family: " + personId));

        publishEvent("INCOME_UPDATED", fm.getFamilyId(), personId);
        Family family = familyRepository.findById(fm.getFamilyId()).orElse(null);
        return toPersonSummary(person, fm.getFamilyId(), fm.getRelationshipToHead(), family);
    }

    private FamilyResponse toFamilyResponse(Family family) {
        List<FamilyMember> members = familyMemberRepository.findByFamilyId(family.getId());
        List<PersonSummary> summaries = members.stream()
                .map(fm -> {
                    Person person = personRepository.findById(fm.getPersonId())
                            .orElseThrow(() -> new NoSuchElementException("Person not found: " + fm.getPersonId()));
                    return toPersonSummary(person, family.getId(), fm.getRelationshipToHead(), family);
                })
                .collect(Collectors.toList());

        return new FamilyResponse(
                family.getId(),
                family.getAddress(),
                family.getVillage(),
                family.getTaluka(),
                family.getDistrict(),
                family.getState(),
                family.getRationCardNumber(),
                summaries
        );
    }

    private PersonSummary toPersonSummary(Person person, UUID familyId, String relationship, Family family) {
        return new PersonSummary(
                person.getId(),
                familyId,
                person.getName(),
                person.getDob(),
                person.getGender(),
                person.getOccupation(),
                person.getAnnualIncome(),
                person.getCasteCategory(),
                person.getIsAlive(),
                person.getMobile(),
                person.getAadhaarRef(),
                relationship,
                person.getEducationLevel(),
                person.getMaritalStatus(),
                person.getEmploymentStatus(),
                family != null ? family.getVillage() : null,
                family != null ? family.getTaluka() : null,
                family != null ? family.getDistrict() : null,
                person.getOnboardingCompleted(),
                person.getExamType(),
                person.getExamPercentile(),
                person.getCourseCategory()
        );
    }

    private void requireFamily(UUID familyId) {
        if (!familyRepository.existsById(familyId)) {
            throw new NoSuchElementException("Family not found: " + familyId);
        }
    }

    private void publishEvent(String eventType, UUID familyId, UUID personId) {
        FamilyRegistryEvent event = new FamilyRegistryEvent(
                eventType,
                familyId.toString(),
                personId.toString(),
                Instant.now().toString()
        );
        kafkaTemplate.send(TOPIC, familyId.toString(), event);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
