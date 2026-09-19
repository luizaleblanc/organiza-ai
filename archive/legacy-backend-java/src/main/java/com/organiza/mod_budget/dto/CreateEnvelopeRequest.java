package com.organiza.mod_budget.dto;

import com.organiza.mod_budget.model.EnvelopeLimitType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public record CreateEnvelopeRequest(@NotBlank String userId,
                                     @NotBlank String categoryName,
                                     @NotNull @Positive BigDecimal limitAmount,
                                     EnvelopeLimitType limitType,
                                     Integer movingAverageMonths) {
}
