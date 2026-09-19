package com.organiza.mod_ai_coach.dto;

import java.math.BigDecimal;
import java.util.List;

public record GetBalanceOutput(String budgetModel, List<BucketBalanceDTO> buckets,
                                BigDecimal totalAllocated, BigDecimal totalNotAllocated) {
}
