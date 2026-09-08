package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.SuggestModelChangeInput;
import com.organiza.mod_ai_coach.dto.SuggestModelChangeOutput;
import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_transaction.model.Category;
import com.organiza.mod_transaction.model.TransactionEntity;
import com.organiza.mod_transaction.repository.TransactionEntityRepository;
import com.organiza.mod_user.model.IncomeType;
import com.organiza.mod_user.model.Role;
import com.organiza.mod_user.model.Tier;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

class SuggestModelChangeFunctionTest {

    private static final String USER_ID = "user-teste-id";

    private UserEntityRepository userEntityRepository;
    private TransactionEntityRepository transactionEntityRepository;
    private CurrentUserService currentUserService;
    private SuggestModelChangeFunction function;

    @BeforeEach
    void setUp() {
        userEntityRepository = Mockito.mock(UserEntityRepository.class);
        transactionEntityRepository = Mockito.mock(TransactionEntityRepository.class);
        currentUserService = Mockito.mock(CurrentUserService.class);
        function = new SuggestModelChangeFunction(userEntityRepository, transactionEntityRepository, currentUserService);

        when(currentUserService.getCurrentUserId()).thenReturn(USER_ID);
    }

    private UserEntity userWithModel(BudgetModelType model, Boolean hasDebt) {
        return new UserEntity(USER_ID, "user@teste.com", "hash", Role.USER, BigDecimal.valueOf(4000), Tier.FREE,
                false, null, model, IncomeType.FIXED, hasDebt, null);
    }

    private TransactionEntity transaction(Category category, long amount, YearMonth month) {
        return new TransactionEntity(UUID.randomUUID(), "teste", amount, category, "BRL", USER_ID, null, null,
                month.atDay(15).atStartOfDay(ZoneId.systemDefault()).toInstant());
    }

    @Test
    void shouldSuggestStandardWhenAntiDebtModelButUserHasNoDebt() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithModel(BudgetModelType.ANTI_DEBT_701020, false)));

        SuggestModelChangeOutput output = function.apply(new SuggestModelChangeInput());

        assertTrue(output.shouldChange());
        assertEquals(BudgetModelType.STANDARD_503020.name(), output.suggestedModel());
    }

    @Test
    void shouldReportInsufficientDataWithLessThanTwoMonths() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithModel(BudgetModelType.STANDARD_503020, false)));
        List<TransactionEntity> transactions = List.of(transaction(Category.GROCERIES, 500, YearMonth.now()));
        when(transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(Mockito.eq(USER_ID), Mockito.any())).thenReturn(transactions);

        SuggestModelChangeOutput output = function.apply(new SuggestModelChangeInput());

        assertFalse(output.shouldChange());
        assertEquals("Ainda não tenho dados suficientes dos últimos 3 meses para avaliar se vale a pena trocar de modelo.", output.message());
    }

    @Test
    void shouldSuggestSurvivalWhenNeedsAreConsistentlyAboveStandardModel() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithModel(BudgetModelType.STANDARD_503020, false)));

        YearMonth thisMonth = YearMonth.now();
        YearMonth lastMonth = thisMonth.minusMonths(1);
        List<TransactionEntity> transactions = List.of(
                transaction(Category.GROCERIES, 800, thisMonth), transaction(Category.LEISURE, 200, thisMonth),
                transaction(Category.GROCERIES, 800, lastMonth), transaction(Category.LEISURE, 200, lastMonth));
        when(transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(Mockito.eq(USER_ID), Mockito.any())).thenReturn(transactions);

        SuggestModelChangeOutput output = function.apply(new SuggestModelChangeInput());

        assertTrue(output.shouldChange());
        assertEquals(BudgetModelType.SURVIVAL_702010.name(), output.suggestedModel());
    }

    @Test
    void shouldSuggestStandardWhenNeedsAreConsistentlyBelowSurvivalModel() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithModel(BudgetModelType.SURVIVAL_702010, false)));

        YearMonth thisMonth = YearMonth.now();
        YearMonth lastMonth = thisMonth.minusMonths(1);
        List<TransactionEntity> transactions = List.of(
                transaction(Category.GROCERIES, 400, thisMonth), transaction(Category.LEISURE, 600, thisMonth),
                transaction(Category.GROCERIES, 400, lastMonth), transaction(Category.LEISURE, 600, lastMonth));
        when(transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(Mockito.eq(USER_ID), Mockito.any())).thenReturn(transactions);

        SuggestModelChangeOutput output = function.apply(new SuggestModelChangeInput());

        assertTrue(output.shouldChange());
        assertEquals(BudgetModelType.STANDARD_503020.name(), output.suggestedModel());
    }

    @Test
    void shouldReportNoChangeWhenSpendingMatchesModel() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithModel(BudgetModelType.STANDARD_503020, false)));

        YearMonth thisMonth = YearMonth.now();
        YearMonth lastMonth = thisMonth.minusMonths(1);
        List<TransactionEntity> transactions = List.of(
                transaction(Category.GROCERIES, 500, thisMonth), transaction(Category.LEISURE, 300, thisMonth),
                transaction(Category.GROCERIES, 500, lastMonth), transaction(Category.LEISURE, 300, lastMonth));
        when(transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(Mockito.eq(USER_ID), Mockito.any())).thenReturn(transactions);

        SuggestModelChangeOutput output = function.apply(new SuggestModelChangeInput());

        assertFalse(output.shouldChange());
        assertEquals("Seu modelo atual ainda parece adequado aos seus gastos dos últimos meses.", output.message());
    }

    @Test
    void shouldMentionKakeiboLeisureDivergenceWithoutSuggestingModelSwitch() {
        when(userEntityRepository.findById(USER_ID)).thenReturn(Optional.of(userWithModel(BudgetModelType.KAKEIBO, false)));

        // Essencial (NEEDS) bate exatamente com os 50% do Kakeibo -- so Lazer diverge.
        YearMonth thisMonth = YearMonth.now();
        YearMonth lastMonth = thisMonth.minusMonths(1);
        List<TransactionEntity> transactions = List.of(
                transaction(Category.GROCERIES, 500, thisMonth), transaction(Category.LEISURE, 500, thisMonth),
                transaction(Category.GROCERIES, 500, lastMonth), transaction(Category.LEISURE, 500, lastMonth));
        when(transactionEntityRepository.findAllByUserIdAndCreatedAtAfter(Mockito.eq(USER_ID), Mockito.any())).thenReturn(transactions);

        SuggestModelChangeOutput output = function.apply(new SuggestModelChangeInput());

        assertFalse(output.shouldChange());
        assertTrue(output.message().contains("lazer"));
    }
}
