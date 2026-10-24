package org.magicsword.notifications.repository;

import org.magicsword.notifications.entity.Notification;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {
    List<Notification> findByAadhaarRefOrderByIsReadAscCreatedAtDesc(String aadhaarRef);
}
