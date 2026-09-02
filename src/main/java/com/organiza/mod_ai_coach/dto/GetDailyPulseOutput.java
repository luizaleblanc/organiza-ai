package com.organiza.mod_ai_coach.dto;

import java.math.BigDecimal;

public record GetDailyPulseOutput(BigDecimal pulse, int daysRemaining, BigDecimal totalSpent,
                                   BigDecimal salary, String message) {
}
