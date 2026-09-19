package com.organiza.shared.security;

import com.organiza.mod_user.model.User;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

@Service
public class CurrentUserService {

    public User getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser authenticatedUser)) {
            throw new AccessDeniedException("Usuário não autenticado.");
        }
        return authenticatedUser.getDomainUser();
    }

    public String getCurrentUserId() {
        return getCurrentUser().getId();
    }
}
