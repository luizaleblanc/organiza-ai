package com.organiza.mod_transaction.dto;

import com.organiza.mod_transaction.model.Category;

public record PersistTransactionInput(String description, long amount, Category category, String currency) {
}
