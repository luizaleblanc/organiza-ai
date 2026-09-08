package com.organiza.mod_variable_income.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.IncomeType;
import com.organiza.mod_user.model.Role;
import com.organiza.mod_user.model.Tier;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.mod_variable_income.model.VariableIncomeDestination;
import com.organiza.mod_variable_income.model.VariableIncomeEntity;
import com.organiza.mod_variable_income.repository.VariableIncomeEntityRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

class VariableIncomeServiceTest {

    private static final String USER_ID = "user-teste-id";

    private VariableIncomeEntityRepository variableIncomeEntityRepository;
    private UserEntityRepository userEntityRepository;
    private VariableIncomeService service;

    @BeforeEach
    void setUp() {
        variableIncomeEntityRepository = Mockito.mock(VariableIncomeEntityRepository.class);
        userEntityRepository = Mockito.mock(UserEntityRepository.class);
        service = new VariableIncomeService(variableIncomeEntityRepository, userEntityRepository);
    }

    private UserEntity userWithGoal(BigDecimal emergencyFundGoal) {
        return new UserEntity(USER_ID, "user@teste.com", "hash", Role.USER, BigDecimal.valueOf(4000), Tier.FREE,
                true, emergencyFundGoal, BudgetModelType.STANDARD_503020, IncomeType.VARIABLE, false, null);
    }

    @Test
    void shouldRouteToBudgetWhenUserHasNoEmergencyFundGoal() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithGoal(null)));
        when(variableIncomeEntityRepository.save(Mockito.any())).thenAnswer(invocation -> invocation.getArgument(0));

        VariableIncomeEntity income = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(500), "freela", null);
        VariableIncomeEntity saved = service.save(income);

        assertEquals(VariableIncomeDestination.BUDGET_5030020, saved.getDestination());
    }

    @Test
    void shouldRouteToBudgetWhenEmergencyFundGoalIsZeroOrNegative() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithGoal(BigDecimal.ZERO)));
        when(variableIncomeEntityRepository.save(Mockito.any())).thenAnswer(invocation -> invocation.getArgument(0));

        VariableIncomeEntity income = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(500), "freela", null);
        VariableIncomeEntity saved = service.save(income);

        assertEquals(VariableIncomeDestination.BUDGET_5030020, saved.getDestination());
    }

    @Test
    void shouldRouteToEmergencyFundWhenGoalNotReachedYet() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithGoal(BigDecimal.valueOf(3000))));
        when(variableIncomeEntityRepository.findByUserId(USER_ID)).thenReturn(List.of());
        when(variableIncomeEntityRepository.save(Mockito.any())).thenAnswer(invocation -> invocation.getArgument(0));

        VariableIncomeEntity income = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(500), "freela", null);
        VariableIncomeEntity saved = service.save(income);

        assertEquals(VariableIncomeDestination.EMERGENCY_FUND, saved.getDestination());
    }

    @Test
    void shouldKeepRoutingToEmergencyFundWhileReserveIsBelowGoal() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithGoal(BigDecimal.valueOf(3000))));
        VariableIncomeEntity previousReserveEntry = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(2500), "show",
                VariableIncomeDestination.EMERGENCY_FUND);
        when(variableIncomeEntityRepository.findByUserId(USER_ID)).thenReturn(List.of(previousReserveEntry));
        when(variableIncomeEntityRepository.save(Mockito.any())).thenAnswer(invocation -> invocation.getArgument(0));

        VariableIncomeEntity income = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(400), "mentoria", null);
        VariableIncomeEntity saved = service.save(income);

        assertEquals(VariableIncomeDestination.EMERGENCY_FUND, saved.getDestination());
    }

    @Test
    void shouldRouteToBudgetOnceReserveReachesGoal() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithGoal(BigDecimal.valueOf(3000))));
        VariableIncomeEntity previousReserveEntry = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(3000), "show",
                VariableIncomeDestination.EMERGENCY_FUND);
        when(variableIncomeEntityRepository.findByUserId(USER_ID)).thenReturn(List.of(previousReserveEntry));
        when(variableIncomeEntityRepository.save(Mockito.any())).thenAnswer(invocation -> invocation.getArgument(0));

        VariableIncomeEntity income = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(400), "mentoria", null);
        VariableIncomeEntity saved = service.save(income);

        assertEquals(VariableIncomeDestination.BUDGET_5030020, saved.getDestination());
    }

    @Test
    void shouldOnlyCountEmergencyFundEntriesTowardsReserveProgress() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithGoal(BigDecimal.valueOf(1000))));
        VariableIncomeEntity budgetEntry = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(5000), "salário extra",
                VariableIncomeDestination.BUDGET_5030020);
        when(variableIncomeEntityRepository.findByUserId(USER_ID)).thenReturn(List.of(budgetEntry));
        when(variableIncomeEntityRepository.save(Mockito.any())).thenAnswer(invocation -> invocation.getArgument(0));

        VariableIncomeEntity income = new VariableIncomeEntity(USER_ID, BigDecimal.valueOf(400), "freela", null);
        VariableIncomeEntity saved = service.save(income);

        assertEquals(VariableIncomeDestination.EMERGENCY_FUND, saved.getDestination());
    }
}
