package com.organiza.mod_transaction.service;

import com.organiza.mod_transaction.repository.TransactionRepository;
import com.organiza.shared.security.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ClearTransactionsUseCaseTest {

    private TransactionRepository transactionRepository;
    private CurrentUserService currentUserService;
    private ClearTransactionsUseCase useCase;

    @BeforeEach
    void setUp() {
        transactionRepository = Mockito.mock(TransactionRepository.class);
        currentUserService = Mockito.mock(CurrentUserService.class);
        when(currentUserService.getCurrentUserId()).thenReturn("user-teste-id");
        useCase = new ClearTransactionsUseCase(transactionRepository, currentUserService);
    }

    @Test
    void shouldDeleteAllTransactionsOnlyForCurrentUser() {
        useCase.execute();

        verify(transactionRepository, times(1)).deleteAllByUserId("user-teste-id");
    }
}
