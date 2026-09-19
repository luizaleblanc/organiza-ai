package com.organiza.mod_variable_income.service;

import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.mod_variable_income.model.VariableIncomeDestination;
import com.organiza.mod_variable_income.model.VariableIncomeEntity;
import com.organiza.mod_variable_income.repository.VariableIncomeEntityRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
public class VariableIncomeService {

    private final VariableIncomeEntityRepository variableIncomeEntityRepository;
    private final UserEntityRepository userEntityRepository;

    public VariableIncomeService(VariableIncomeEntityRepository variableIncomeEntityRepository,
                                  UserEntityRepository userEntityRepository) {
        this.variableIncomeEntityRepository = variableIncomeEntityRepository;
        this.userEntityRepository = userEntityRepository;
    }

    public VariableIncomeEntity save(VariableIncomeEntity variableIncome) {
        variableIncome.setDestination(decideDestination(variableIncome.getUserId(), variableIncome.getAmount()));
        return variableIncomeEntityRepository.save(variableIncome);
    }

    public List<VariableIncomeEntity> findByUserId(String userId) {
        return variableIncomeEntityRepository.findByUserId(userId);
    }

    private VariableIncomeDestination decideDestination(String userId, BigDecimal amount) {
        var user = userEntityRepository.findById(userId).orElseThrow();
        var emergencyFundGoal = user.getEmergencyFundGoal();

        if (emergencyFundGoal == null || emergencyFundGoal.compareTo(BigDecimal.ZERO) <= 0) {
            return VariableIncomeDestination.BUDGET_5030020;
        }

        var currentReserve = variableIncomeEntityRepository.findByUserId(userId).stream()
                .filter(income -> income.getDestination() == VariableIncomeDestination.EMERGENCY_FUND)
                .map(VariableIncomeEntity::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return currentReserve.compareTo(emergencyFundGoal) < 0
                ? VariableIncomeDestination.EMERGENCY_FUND
                : VariableIncomeDestination.BUDGET_5030020;
    }
}
