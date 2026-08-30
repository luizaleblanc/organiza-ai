package com.organiza.mod_budget.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "budgets", uniqueConstraints = @UniqueConstraint(name = "uk_user_month", columnNames = {"user_id", "month_year"}))
@Data
@AllArgsConstructor
@NoArgsConstructor
public class BudgetEntity {

    @Id
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(name = "month_year", nullable = false, length = 7)
    private String monthYear;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal salary;

    @Column(name = "needs_limit", nullable = false, precision = 10, scale = 2)
    private BigDecimal needsLimit;

    @Column(name = "wants_limit", nullable = false, precision = 10, scale = 2)
    private BigDecimal wantsLimit;

    @Column(name = "savings_limit", nullable = false, precision = 10, scale = 2)
    private BigDecimal savingsLimit;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    public BudgetEntity(String userId, String monthYear, BigDecimal salary,
                         BigDecimal needsLimit, BigDecimal wantsLimit, BigDecimal savingsLimit) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.monthYear = monthYear;
        this.salary = salary;
        this.needsLimit = needsLimit;
        this.wantsLimit = wantsLimit;
        this.savingsLimit = savingsLimit;
    }
}
