package com.organiza.mod_variable_income.dto;

import com.organiza.mod_variable_income.model.VariableIncomeEntity;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record VariableIncomeDTO(String id, String userId, BigDecimal amount, String source, String destination, LocalDateTime date) {

    public static VariableIncomeDTO from(VariableIncomeEntity entity) {
        return new VariableIncomeDTO(
                entity.getId(),
                entity.getUserId(),
                entity.getAmount(),
                entity.getSource(),
                entity.getDestination() != null ? entity.getDestination().name() : null,
                entity.getDate());
    }
}
