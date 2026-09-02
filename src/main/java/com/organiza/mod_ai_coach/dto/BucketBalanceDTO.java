package com.organiza.mod_ai_coach.dto;

import java.math.BigDecimal;

public record BucketBalanceDTO(String name, int percentage, BigDecimal limit, BigDecimal spent,
                                BigDecimal remaining) {
}
