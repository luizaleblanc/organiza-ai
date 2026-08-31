package com.organiza.mod_user.dto;

import com.organiza.mod_user.model.IncomeType;

import java.math.BigDecimal;

public record OnboardingRequest(BigDecimal salary, IncomeType incomeType, Boolean hasDebt) {
}
