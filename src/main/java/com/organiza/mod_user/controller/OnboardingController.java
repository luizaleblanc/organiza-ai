package com.organiza.mod_user.controller;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_budget.service.BudgetModelPlanService;
import com.organiza.mod_budget.service.BudgetModelSuggestionService;
import com.organiza.mod_user.dto.OnboardingRequest;
import com.organiza.mod_user.dto.OnboardingResponse;
import com.organiza.mod_user.model.IncomeType;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class OnboardingController {

    private final BudgetModelSuggestionService budgetModelSuggestionService;
    private final BudgetModelPlanService budgetModelPlanService;
    private final UserEntityRepository userEntityRepository;
    private final CurrentUserService currentUserService;

    public OnboardingController(BudgetModelSuggestionService budgetModelSuggestionService,
                                 BudgetModelPlanService budgetModelPlanService,
                                 UserEntityRepository userEntityRepository,
                                 CurrentUserService currentUserService) {
        this.budgetModelSuggestionService = budgetModelSuggestionService;
        this.budgetModelPlanService = budgetModelPlanService;
        this.userEntityRepository = userEntityRepository;
        this.currentUserService = currentUserService;
    }

    @PostMapping("/onboarding")
    public OnboardingResponse onboarding(@RequestBody OnboardingRequest request) {
        BudgetModelType suggestedModel = budgetModelSuggestionService.suggestModel(
                request.salary(), request.incomeType(), request.hasDebt());

        UserEntity user = userEntityRepository.findById(currentUserService.getCurrentUserId()).orElseThrow();
        user.setSalary(request.salary());
        user.setIncomeType(request.incomeType());
        user.setHasDebt(request.hasDebt());
        user.setHasVariableIncome(request.incomeType() == IncomeType.VARIABLE);
        user.setBudgetModel(suggestedModel);
        userEntityRepository.save(user);

        return new OnboardingResponse(
                suggestedModel.name(),
                budgetModelPlanService.describe(suggestedModel),
                budgetModelPlanService.buildBuckets(suggestedModel, request.salary()));
    }
}
