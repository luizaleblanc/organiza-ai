package com.organiza.mod_variable_income.repository;

import com.organiza.mod_variable_income.model.VariableIncomeEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VariableIncomeEntityRepository extends JpaRepository<VariableIncomeEntity, String> {
    List<VariableIncomeEntity> findByUserId(String userId);
}
