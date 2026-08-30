package com.organiza.mod_budget.repository;

import com.organiza.mod_budget.model.BudgetEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface BudgetEntityRepository extends JpaRepository<BudgetEntity, String> {
    Optional<BudgetEntity> findByUserIdAndMonthYear(String userId, String monthYear);
}
