package com.organiza.mod_user.model;

import java.util.UUID;

public class User {

    private final String id;
    private final String email;
    private final String password;
    private final Role role;

    public User(String email, String password) {
        this(UUID.randomUUID().toString(), email, password, Role.USER);
    }

    public User(String id, String email, String password, Role role) {
        this.id = id;
        this.email = email;
        this.password = password;
        this.role = role;
    }

    public String getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPassword() {
        return password;
    }

    public Role getRole() {
        return role;
    }
}
