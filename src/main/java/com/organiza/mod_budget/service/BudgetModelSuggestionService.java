package com.organiza.mod_budget.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.IncomeType;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;

@Service
public class BudgetModelSuggestionService {

    private static final BigDecimal SURVIVAL_THRESHOLD = BigDecimal.valueOf(3242);
    private static final BigDecimal STANDARD_THRESHOLD = BigDecimal.valueOf(5000);

    public BudgetModelType suggestModel(BigDecimal salary, IncomeType incomeType, Boolean hasDebt) {
        if (incomeType == IncomeType.VARIABLE) {
            return BudgetModelType.FREELANCER_BASE_ZERO;
        }

        if (Boolean.TRUE.equals(hasDebt)) {
            return BudgetModelType.ANTI_DEBT_701020;
        }

        if (salary.compareTo(SURVIVAL_THRESHOLD) <= 0) {
            return BudgetModelType.SURVIVAL_702010;
        }

        if (salary.compareTo(STANDARD_THRESHOLD) <= 0) {
            return BudgetModelType.STANDARD_503020;
        }

        return BudgetModelType.STANDARD_503020;
    }
}
