package com.organiza.mod_user.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;

public record SalaryUpdateDTO(@NotNull @Positive BigDecimal salary) {
}
