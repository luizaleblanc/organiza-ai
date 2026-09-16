package com.organiza.mod_transaction.model;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum Category {
    GROCERIES,
    LEISURE,
    FOOD,
    PHARMA,
    HEALTH,
    AUTO,
    TRANSPORT,
    HOUSING,
    EDUCATION,
    SHOPPING,
    SUBSCRIPTIONS,
    OTHER;

    @JsonCreator
    public static Category fromValue(String value) {
        if (value == null) {
            return OTHER;
        }
        try {
            return Category.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return OTHER;
        }
    }
}
