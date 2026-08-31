package com.organiza.mod_user.dto;

import com.organiza.mod_user.model.UserEntity;

import java.math.BigDecimal;

public record SalaryUpdateResponse(String id, String email, BigDecimal salary) {
    public static SalaryUpdateResponse from(UserEntity user) {
        return new SalaryUpdateResponse(user.getId(), user.getEmail(), user.getSalary());
    }
}
