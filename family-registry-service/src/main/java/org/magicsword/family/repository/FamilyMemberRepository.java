package org.magicsword.family.repository;

import org.magicsword.family.entity.FamilyMember;
import org.magicsword.family.entity.FamilyMemberId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FamilyMemberRepository extends JpaRepository<FamilyMember, FamilyMemberId> {

    List<FamilyMember> findByFamilyId(UUID familyId);

    Optional<FamilyMember> findFirstByPersonId(UUID personId);
}
