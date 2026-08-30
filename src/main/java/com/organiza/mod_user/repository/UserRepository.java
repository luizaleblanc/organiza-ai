package com.organiza.mod_user.repository;

import com.organiza.mod_user.model.User;

import java.util.List;
import java.util.Optional;

public interface UserRepository {
    User save(User user);

    Optional<User> findByEmail(String email);

    List<User> findAll();
}
