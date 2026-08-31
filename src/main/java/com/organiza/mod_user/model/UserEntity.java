package com.organiza.mod_user.model;

import com.organiza.mod_budget.model.BudgetModelType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(name = "users")
@Data
@AllArgsConstructor
@NoArgsConstructor
public class UserEntity {

    @Id
    private String id;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(nullable = false)
    private String password;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(precision = 10, scale = 2)
    private BigDecimal salary;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Tier tier = Tier.FREE;

    @Column(name = "has_variable_income", nullable = false)
    private Boolean hasVariableIncome = false;

    @Column(name = "emergency_fund_goal", precision = 10, scale = 2)
    private BigDecimal emergencyFundGoal;

    @Enumerated(EnumType.STRING)
    @Column(name = "budget_model", nullable = false, length = 32)
    private BudgetModelType budgetModel = BudgetModelType.STANDARD_503020;

    @Enumerated(EnumType.STRING)
    @Column(name = "income_type", nullable = false, length = 16)
    private IncomeType incomeType = IncomeType.FIXED;

    @Column(name = "has_debt", nullable = false)
    private Boolean hasDebt = false;

    public static UserEntity from(User user) {
        return new UserEntity(user.getId(), user.getEmail(), user.getPassword(), user.getRole(), null, Tier.FREE, false, null,
                BudgetModelType.STANDARD_503020, IncomeType.FIXED, false);
    }

    public User toDomain() {
        return new User(id, email, password, role);
    }
}
