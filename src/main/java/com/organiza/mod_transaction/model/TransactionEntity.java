package com.organiza.mod_transaction.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Data
@AllArgsConstructor
@NoArgsConstructor
public class TransactionEntity {
    @Id
    private UUID id;
    private String description;
    private long amount;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private Category category;

    private String currency;

    private String userId;

    @Enumerated(EnumType.STRING)
    @Column(length = 16)
    private Bucket bucket;

    @Enumerated(EnumType.STRING)
    @Column(length = 32, nullable = false)
    private Source source = Source.MANUAL;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    public static TransactionEntity from(Transaction transaction) {
        return new TransactionEntity(
                transaction.getId().uuid(),
                transaction.getDescription(),
                transaction.getAmount(),
                transaction.getCategory(),
                transaction.getCurrency(),
                transaction.getUserId(),
                null,
                Source.MANUAL,
                null);
    }

    public Transaction toDomain() {
        return new Transaction(
                this.id != null ? new TransactionId(this.id) : null,
                this.description,
                this.amount,
                this.category,
                this.currency,
                this.userId
        );
    }
}
