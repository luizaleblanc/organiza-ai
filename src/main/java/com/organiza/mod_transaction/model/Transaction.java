package com.organiza.mod_transaction.model;

public class Transaction {
    private final TransactionId id;
    private final String description;
    private final long amount;
    private final Category category;
    private final String currency;
    private final String userId;

    public Transaction(TransactionId id, String description, long amount, Category category, String currency, String userId) {
        this.id = id;
        this.description = description;
        this.amount = amount;
        this.category = category;
        this.currency = currency;
        this.userId = userId;
    }

    public Transaction(String description, long amount, Category category, String currency, String userId) {
        this(new TransactionId(), description, amount, category, currency, userId);
    }

    public TransactionId getId() {
        return id;
    }

    public String getDescription() {
        return description;
    }

    public long getAmount() {
        return amount;
    }

    public Category getCategory() {
        return category;
    }

    public String getCurrency() {
        return currency;
    }

    public String getUserId() {
        return userId;
    }
}
