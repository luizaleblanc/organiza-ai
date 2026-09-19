package com.organiza.mod_ai_coach.repository;

import com.organiza.mod_ai_coach.model.ChatMessageEntity;
import com.organiza.mod_ai_coach.model.ChatRole;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface ChatMessageEntityRepository extends JpaRepository<ChatMessageEntity, String> {
    List<ChatMessageEntity> findAllByUserIdOrderByCreatedAtAsc(String userId);

    List<ChatMessageEntity> findTop20ByUserIdOrderByCreatedAtDesc(String userId);

    int countByUserIdAndRoleAndCreatedAtGreaterThanEqual(String userId, ChatRole role, Instant since);
}
