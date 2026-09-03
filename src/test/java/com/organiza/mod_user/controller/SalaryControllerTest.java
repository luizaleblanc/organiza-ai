package com.organiza.mod_user.controller;

import com.organiza.mod_user.dto.SalaryUpdateDTO;
import com.organiza.mod_user.dto.SalaryUpdateResponse;
import com.organiza.mod_user.model.Role;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.security.access.AccessDeniedException;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SalaryControllerTest {

    private static final String USER_ID = "user-teste-id";

    private UserEntityRepository userEntityRepository;
    private CurrentUserService currentUserService;
    private SalaryController controller;

    @BeforeEach
    void setUp() {
        userEntityRepository = Mockito.mock(UserEntityRepository.class);
        currentUserService = Mockito.mock(CurrentUserService.class);
        controller = new SalaryController(userEntityRepository, currentUserService);
    }

    @Test
    void shouldUpdateSalaryOfCurrentUser() {
        UserEntity user = new UserEntity(USER_ID, "user@teste.com", "hash", Role.USER, null,
                com.organiza.mod_user.model.Tier.FREE, false, null,
                com.organiza.mod_budget.model.BudgetModelType.STANDARD_503020,
                com.organiza.mod_user.model.IncomeType.FIXED, false);

        when(currentUserService.getCurrentUserId()).thenReturn(USER_ID);
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(user));
        when(userEntityRepository.save(any(UserEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        SalaryUpdateResponse response = controller.updateSalary(new SalaryUpdateDTO(BigDecimal.valueOf(4000)));

        assertEquals(USER_ID, response.id());
        assertEquals(BigDecimal.valueOf(4000), response.salary());
        verify(userEntityRepository, times(1)).save(user);
    }

    @Test
    void shouldNotUpdateSalaryWhenUserIsNotAuthenticated() {
        when(currentUserService.getCurrentUserId()).thenThrow(new AccessDeniedException("Usuário não autenticado."));

        assertThrows(AccessDeniedException.class, () ->
                controller.updateSalary(new SalaryUpdateDTO(BigDecimal.valueOf(4000))));

        verify(userEntityRepository, never()).save(any(UserEntity.class));
    }
}
