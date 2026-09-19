package com.organiza.mod_budget.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.IncomeType;
import com.organiza.mod_user.model.UserEntity;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class BudgetModelMigrationService {

    private static final BigDecimal SURVIVAL_THRESHOLD = BigDecimal.valueOf(3242);
    private static final BigDecimal STANDARD_THRESHOLD = BigDecimal.valueOf(5000);

    private final BudgetModelSuggestionService budgetModelSuggestionService;

    public BudgetModelMigrationService(BudgetModelSuggestionService budgetModelSuggestionService) {
        this.budgetModelSuggestionService = budgetModelSuggestionService;
    }

    public BudgetModelType migrateIfNeeded(UserEntity user) {
        if (user == null) {
            throw new IllegalArgumentException("User cannot be null.");
        }

        BudgetModelType current = user.getBudgetModel() == null ? BudgetModelType.STANDARD_503020 : user.getBudgetModel();
        IncomeType incomeType = user.getIncomeType() == null ? IncomeType.FIXED : user.getIncomeType();
        BigDecimal salary = user.getSalary() == null ? BigDecimal.ZERO : user.getSalary();

        if (current == BudgetModelType.ANTI_DEBT_701020 && !Boolean.TRUE.equals(user.getHasDebt())) {
            return BudgetModelType.STANDARD_503020;
        }

        if (current == BudgetModelType.STANDARD_503020 && incomeType == IncomeType.VARIABLE) {
            return BudgetModelType.FREELANCER_BASE_ZERO;
        }

        if (current == BudgetModelType.STANDARD_503020 && Boolean.TRUE.equals(user.getHasDebt())) {
            return BudgetModelType.ANTI_DEBT_701020;
        }

        if (current == BudgetModelType.SURVIVAL_702010 && Boolean.TRUE.equals(user.getHasDebt())) {
            return BudgetModelType.ANTI_DEBT_701020;
        }

        if (current == BudgetModelType.STANDARD_503020 && salary.compareTo(SURVIVAL_THRESHOLD) <= 0 && !Boolean.TRUE.equals(user.getHasDebt())) {
            return BudgetModelType.SURVIVAL_702010;
        }

        if (current == BudgetModelType.SURVIVAL_702010 && salary.compareTo(STANDARD_THRESHOLD) > 0 && !Boolean.TRUE.equals(user.getHasDebt())) {
            return BudgetModelType.STANDARD_503020;
        }

        BudgetModelType suggested = budgetModelSuggestionService.suggestModel(salary, incomeType, user.getHasDebt());
        return suggested == current ? current : suggested;
    }
}
