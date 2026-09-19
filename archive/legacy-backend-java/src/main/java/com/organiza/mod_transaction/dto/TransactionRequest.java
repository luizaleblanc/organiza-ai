package com.organiza.mod_transaction.dto;

import com.organiza.mod_transaction.model.Category;

public record TransactionRequest(String description, Category category, long amount, String currency) {
    public PersistTransactionInput toInput() {
        return new PersistTransactionInput(description, amount, category, currency);

    }
}
