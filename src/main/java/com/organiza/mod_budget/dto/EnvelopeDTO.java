package com.organiza.mod_budget.dto;

import com.organiza.mod_budget.model.EnvelopeEntity;

import java.math.BigDecimal;

public record EnvelopeDTO(String id, String userId, String categoryName, BigDecimal limitAmount,
                           BigDecimal currentSpent, String limitType, Integer movingAverageMonths) {

    public static EnvelopeDTO from(EnvelopeEntity entity) {
        return new EnvelopeDTO(
                entity.getId(),
                entity.getUserId(),
                entity.getCategoryName(),
                entity.getLimitAmount(),
                entity.getCurrentSpent(),
                entity.getLimitType().name(),
                entity.getMovingAverageMonths());
    }
}
