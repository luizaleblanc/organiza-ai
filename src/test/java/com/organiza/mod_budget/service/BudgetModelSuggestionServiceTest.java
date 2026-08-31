package com.organiza.mod_budget.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.IncomeType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class BudgetModelSuggestionServiceTest {

    private final BudgetModelSuggestionService service = new BudgetModelSuggestionService();

    @Test
    void shouldSuggestFreelancerBaseZeroWhenIncomeIsVariable() {
        BudgetModelType result = service.suggestModel(BigDecimal.valueOf(3000), IncomeType.VARIABLE, false);

        assertEquals(BudgetModelType.FREELANCER_BASE_ZERO, result);
    }

    @Test
    void shouldSuggestFreelancerBaseZeroWhenIncomeIsVariableEvenWithDebt() {
        BudgetModelType result = service.suggestModel(BigDecimal.valueOf(3000), IncomeType.VARIABLE, true);

        assertEquals(BudgetModelType.FREELANCER_BASE_ZERO, result);
    }

    @Test
    void shouldSuggestAntiDebtWhenUserHasDebt() {
        BudgetModelType result = service.suggestModel(BigDecimal.valueOf(3000), IncomeType.FIXED, true);

        assertEquals(BudgetModelType.ANTI_DEBT_701020, result);
    }

    @Test
    void shouldSuggestSurvivalWhenSalaryIsAtOrBelowTwoMinimumWagesAndNoDebt() {
        BudgetModelType result = service.suggestModel(BigDecimal.valueOf(3242), IncomeType.FIXED, false);

        assertEquals(BudgetModelType.SURVIVAL_702010, result);
    }

    @Test
    void shouldSuggestStandardWhenSalaryIsBetweenTwoMinimumWagesAndFiveThousandAndNoDebt() {
        BudgetModelType result = service.suggestModel(BigDecimal.valueOf(5000), IncomeType.FIXED, false);

        assertEquals(BudgetModelType.STANDARD_503020, result);
    }

    @Test
    void shouldSuggestStandardWhenSalaryIsAboveFiveThousandAndNoDebt() {
        BudgetModelType result = service.suggestModel(BigDecimal.valueOf(8000), IncomeType.FIXED, false);

        assertEquals(BudgetModelType.STANDARD_503020, result);
    }
}
