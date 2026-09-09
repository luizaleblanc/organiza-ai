package com.organiza.mod_budget.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.IncomeType;
import com.organiza.mod_user.model.Role;
import com.organiza.mod_user.model.Tier;
import com.organiza.mod_user.model.UserEntity;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BudgetModelMigrationServiceTest {

    private final BudgetModelMigrationService service =
            new BudgetModelMigrationService(new BudgetModelSuggestionService());

    @Test
    void shouldMigrateAwayFromAntiDebtWhenDebtIsCleared() {
        UserEntity user = new UserEntity(
                "user-1",
                "user@example.com",
                "secret",
                Role.USER,
                new BigDecimal("3000"),
                Tier.FREE,
                false,
                null,
                BudgetModelType.ANTI_DEBT_701020,
                IncomeType.FIXED,
                false,
                null
        );

        BudgetModelType migrated = service.migrateIfNeeded(user);

        assertEquals(BudgetModelType.STANDARD_503020, migrated);
    }

    @Test
    void shouldMigrateToFreelancerModelWhenIncomeBecomesVariable() {
        UserEntity user = new UserEntity(
                "user-2",
                "freelancer@example.com",
                "secret",
                Role.USER,
                new BigDecimal("5000"),
                Tier.FREE,
                true,
                null,
                BudgetModelType.STANDARD_503020,
                IncomeType.VARIABLE,
                false,
                null
        );

        BudgetModelType migrated = service.migrateIfNeeded(user);

        assertEquals(BudgetModelType.FREELANCER_BASE_ZERO, migrated);
    }

    @Test
    void shouldKeepTheCurrentModelWhenItsAlreadyAligned() {
        UserEntity user = new UserEntity(
                "user-3",
                "steady@example.com",
                "secret",
                Role.USER,
                new BigDecimal("8000"),
                Tier.PREMIUM,
                false,
                null,
                BudgetModelType.STANDARD_503020,
                IncomeType.FIXED,
                false,
                null
        );

        BudgetModelType migrated = service.migrateIfNeeded(user);

        assertEquals(BudgetModelType.STANDARD_503020, migrated);
    }
}
