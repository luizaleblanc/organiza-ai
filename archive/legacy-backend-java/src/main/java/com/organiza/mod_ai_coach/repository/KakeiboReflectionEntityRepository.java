package com.organiza.mod_ai_coach.repository;

import com.organiza.mod_ai_coach.model.KakeiboReflectionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface KakeiboReflectionEntityRepository extends JpaRepository<KakeiboReflectionEntity, String> {
    Optional<KakeiboReflectionEntity> findByUserIdAndWeekStart(String userId, LocalDate weekStart);

    List<KakeiboReflectionEntity> findByUserIdOrderByCreatedAtDesc(String userId);
}
