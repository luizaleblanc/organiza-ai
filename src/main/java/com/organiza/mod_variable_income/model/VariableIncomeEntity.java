package com.organiza.mod_variable_income.model;

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
@Table(name = "variable_incomes")
@Data
@AllArgsConstructor
@NoArgsConstructor
public class VariableIncomeEntity {

    @Id
    private String id;

    @Column(name = "user_id", nullable = false)
    private String userId;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false)
    private String source;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private VariableIncomeDestination destination;

    @Column(nullable = false)
    private LocalDateTime date;

    public VariableIncomeEntity(String userId, BigDecimal amount, String source, VariableIncomeDestination destination) {
        this.id = UUID.randomUUID().toString();
        this.userId = userId;
        this.amount = amount;
        this.source = source;
        this.destination = destination;
    }

    @PrePersist
    public void prePersist() {
        this.date = LocalDateTime.now();
    }
}
