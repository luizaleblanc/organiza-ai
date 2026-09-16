package com.organiza.mod_budget.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "envelopes")
@Data
@AllArgsConstructor
@NoArgsConstructor
public class EnvelopeEntity {

    @Id
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "category_name", nullable = false)
    private String categoryName;

    @Column(name = "limit_amount", nullable = false, precision = 10, scale = 2)
    private BigDecimal limitAmount;

    @Column(name = "current_spent", nullable = false, precision = 10, scale = 2)
    private BigDecimal currentSpent = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "limit_type", nullable = false, length = 32)
    private EnvelopeLimitType limitType = EnvelopeLimitType.FIXED;

    @Column(name = "moving_average_months", nullable = false)
    private Integer movingAverageMonths = 3;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public EnvelopeEntity(String userId, String categoryName, BigDecimal limitAmount) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.categoryName = categoryName;
        this.limitAmount = limitAmount;
        this.currentSpent = BigDecimal.ZERO;
        this.limitType = EnvelopeLimitType.FIXED;
        this.movingAverageMonths = 3;
    }

    @PrePersist
    public void prePersist() {
        if (this.id == null) {
            this.id = UUID.randomUUID().toString();
        }
        this.createdAt = LocalDateTime.now();
    }
}
