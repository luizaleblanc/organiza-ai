package com.organiza.mod_budget.repository;

import com.organiza.mod_budget.model.EnvelopeEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EnvelopeEntityRepository extends JpaRepository<EnvelopeEntity, String> {
    List<EnvelopeEntity> findByUserId(String userId);
}
