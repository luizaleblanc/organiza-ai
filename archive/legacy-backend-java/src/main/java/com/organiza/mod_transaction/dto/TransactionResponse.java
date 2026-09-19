package com.organiza.mod_transaction.dto;

public record TransactionResponse(String id, String category, String description, double amount, String currency) {
    public static TransactionResponse from(TransactionOutput output) {
        return new TransactionResponse(output.id(), output.category(), output.description(), output.value(), output.currency());
    }
}
