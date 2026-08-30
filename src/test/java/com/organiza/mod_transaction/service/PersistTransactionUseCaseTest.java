package com.organiza.mod_transaction.service;

import com.organiza.mod_transaction.dto.PersistTransactionInput;
import com.organiza.mod_transaction.dto.TransactionOutput;
import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.model.Transaction;
import com.organiza.mod_transaction.repository.TransactionRepository;
import com.organiza.shared.security.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PersistTransactionUseCaseTest {

    private TransactionRepository transactionRepository;
    private CurrentUserService currentUserService;
    private PersistTransactionUseCase useCase;

    @BeforeEach
    void setUp() {
        transactionRepository = Mockito.mock(TransactionRepository.class);
        currentUserService = Mockito.mock(CurrentUserService.class);
        when(currentUserService.getCurrentUserId()).thenReturn("user-teste-id");
        useCase = new PersistTransactionUseCase(transactionRepository, currentUserService);
    }

    @Test
    void shouldThrowExceptionWhenAmountIsZeroOrNegative() {
        PersistTransactionInput input = new PersistTransactionInput("Teste Negativo", 0L, Category.GROCERIES, "BRL");

        IllegalArgumentException exception = assertThrows(IllegalArgumentException.class, () -> {
            useCase.execute(input);
        });

        assertEquals("Operação negada: O valor da transação deve ser maior que zero.", exception.getMessage());
        verify(transactionRepository, never()).save(any(Transaction.class));
    }

    @Test
    void shouldSaveTransactionSuccessfully() {
        PersistTransactionInput input = new PersistTransactionInput("Almoço", 5000L, Category.GROCERIES, "BRL");

        when(transactionRepository.save(any(Transaction.class))).thenAnswer(invocation -> invocation.getArgument(0));

        TransactionOutput output = useCase.execute(input);

        assertNotNull(output);
        assertEquals(5000.0, output.value());
        verify(transactionRepository, times(1)).save(any(Transaction.class));
    }
}
