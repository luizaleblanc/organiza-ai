package com.organiza.mod_variable_income.controller;

import com.organiza.mod_variable_income.dto.VariableIncomeDTO;
import com.organiza.mod_variable_income.model.VariableIncomeDestination;
import com.organiza.mod_variable_income.model.VariableIncomeEntity;
import com.organiza.mod_variable_income.service.VariableIncomeService;
import com.organiza.shared.security.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class VariableIncomeControllerTest {

    private static final String AUTHENTICATED_USER_ID = "user-autenticado-id";

    private VariableIncomeService variableIncomeService;
    private CurrentUserService currentUserService;
    private VariableIncomeController controller;

    @BeforeEach
    void setUp() {
        variableIncomeService = Mockito.mock(VariableIncomeService.class);
        currentUserService = Mockito.mock(CurrentUserService.class);
        controller = new VariableIncomeController(variableIncomeService, currentUserService);
        when(currentUserService.getCurrentUserId()).thenReturn(AUTHENTICATED_USER_ID);
    }

    @Test
    void shouldIgnoreUserIdFromRequestBodyAndUseAuthenticatedUser() {
        when(variableIncomeService.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        // userId do corpo aponta pra outro usuario -- nao pode vazar pra entidade salva.
        VariableIncomeDTO request = new VariableIncomeDTO(null, "outro-usuario-id", BigDecimal.valueOf(500), "freela", null, null);
        controller.create(request);

        ArgumentCaptor<VariableIncomeEntity> captor = ArgumentCaptor.forClass(VariableIncomeEntity.class);
        Mockito.verify(variableIncomeService).save(captor.capture());
        assertEquals(AUTHENTICATED_USER_ID, captor.getValue().getUserId());
    }

    @Test
    void shouldListOnlyIncomeOfAuthenticatedUser() {
        VariableIncomeEntity entity = new VariableIncomeEntity(AUTHENTICATED_USER_ID, BigDecimal.valueOf(500), "freela",
                VariableIncomeDestination.EMERGENCY_FUND);
        when(variableIncomeService.findByUserId(AUTHENTICATED_USER_ID)).thenReturn(List.of(entity));

        List<VariableIncomeDTO> result = controller.list();

        assertEquals(1, result.size());
        assertEquals(AUTHENTICATED_USER_ID, result.get(0).userId());
        Mockito.verify(variableIncomeService).findByUserId(AUTHENTICATED_USER_ID);
    }
}
