package com.organiza.mod_user.dto;

import com.organiza.mod_user.model.Role;
import com.organiza.mod_user.model.User;

public record UserSummaryResponse(String id, String email, Role role) {
    public static UserSummaryResponse from(User user) {
        return new UserSummaryResponse(user.getId(), user.getEmail(), user.getRole());
    }
}
