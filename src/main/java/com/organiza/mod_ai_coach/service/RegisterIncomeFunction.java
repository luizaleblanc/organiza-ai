package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.RegisterIncomeInput;
import com.organiza.mod_ai_coach.dto.RegisterIncomeOutput;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.mod_variable_income.model.VariableIncomeDestination;
import com.organiza.mod_variable_income.model.VariableIncomeEntity;
import com.organiza.mod_variable_income.service.VariableIncomeService;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.util.function.Function;

@Service
@Description("Registra uma renda do usuario, fixa ou variavel, e direciona o valor automaticamente para a reserva de emergencia ou para o orcamento")
public class RegisterIncomeFunction implements Function<RegisterIncomeInput, RegisterIncomeOutput> {

    private final VariableIncomeService variableIncomeService;
    private final UserEntityRepository userEntityRepository;
    private final CurrentUserService currentUserService;

    public RegisterIncomeFunction(VariableIncomeService variableIncomeService,
                                   UserEntityRepository userEntityRepository,
                                   CurrentUserService currentUserService) {
        this.variableIncomeService = variableIncomeService;
        this.userEntityRepository = userEntityRepository;
        this.currentUserService = currentUserService;
    }

    @Override
    public RegisterIncomeOutput apply(RegisterIncomeInput input) {
        if ("salário".equalsIgnoreCase(input.source()) || "salario".equalsIgnoreCase(input.source())) {
            return new RegisterIncomeOutput("SALARY",
                    "Beleza, essa é a sua renda fixa. Ela já está considerada no seu orçamento mensal.");
        }

        String userId = currentUserService.getCurrentUserId();
        VariableIncomeEntity entity = new VariableIncomeEntity(userId, input.amount(), input.source(), null);
        VariableIncomeEntity saved = variableIncomeService.save(entity);

        if (saved.getDestination() == VariableIncomeDestination.EMERGENCY_FUND) {
            return new RegisterIncomeOutput(saved.getDestination().name(),
                    "Boa! Coloquei esse valor direto na sua reserva de emergência até você bater a meta.");
        }

        String budgetModel = userEntityRepository.findById(userId)
                .map(user -> user.getBudgetModel().name())
                .orElse("STANDARD_503020");

        return new RegisterIncomeOutput(saved.getDestination().name(),
                "Sua reserva de emergência já está completa, então distribuí esse valor pelo seu modelo de orçamento (" + budgetModel + ").");
    }
}
