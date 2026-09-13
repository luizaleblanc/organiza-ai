package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.model.KakeiboReflectionEntity;
import com.organiza.mod_ai_coach.repository.KakeiboReflectionEntityRepository;
import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.IncomeType;
import com.organiza.mod_user.model.Role;
import com.organiza.mod_user.model.Tier;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KakeiboReflectionServiceTest {

    @Mock
    private UserEntityRepository userEntityRepository;

    @Mock
    private KakeiboReflectionEntityRepository reflectionRepository;

    @InjectMocks
    private KakeiboReflectionService service;

    @Test
    void shouldRequireReflectionForKakeiboUsersWithoutThisWeeksAnswer() {
        String userId = "u-1";
        LocalDate referenceDate = LocalDate.of(2026, 9, 12);

        when(userEntityRepository.findById(userId)).thenReturn(Optional.of(new UserEntity(
                userId, "a@a.com", "123", Role.USER, BigDecimal.valueOf(5000), Tier.FREE, false, null,
                BudgetModelType.KAKEIBO, IncomeType.FIXED, false, null)));
        when(reflectionRepository.findByUserIdAndWeekStart(userId, LocalDate.of(2026, 9, 7)))
                .thenReturn(Optional.empty());

        assertTrue(service.shouldAskForReflection(userId, referenceDate));
    }

    @Test
    void shouldNotRequireReflectionWhenUserAlreadyAnsweredThisWeek() {
        String userId = "u-2";
        LocalDate referenceDate = LocalDate.of(2026, 9, 12);

        when(userEntityRepository.findById(userId)).thenReturn(Optional.of(new UserEntity(
                userId, "b@b.com", "123", Role.USER, BigDecimal.valueOf(5000), Tier.FREE, false, null,
                BudgetModelType.KAKEIBO, IncomeType.FIXED, false, null)));
        when(reflectionRepository.findByUserIdAndWeekStart(userId, LocalDate.of(2026, 9, 7)))
                .thenReturn(Optional.of(new KakeiboReflectionEntity(userId, LocalDate.of(2026, 9, 7), List.of("a", "b", "c", "d"))));

        assertFalse(service.shouldAskForReflection(userId, referenceDate));
    }

    @Test
    void shouldPersistReflectionAnswers() {
        String userId = "u-3";
        LocalDate referenceDate = LocalDate.of(2026, 9, 12);

        when(userEntityRepository.findById(userId)).thenReturn(Optional.of(new UserEntity(
                userId, "c@c.com", "123", Role.USER, BigDecimal.valueOf(5000), Tier.FREE, false, null,
                BudgetModelType.KAKEIBO, IncomeType.FIXED, false, null)));
        when(reflectionRepository.findByUserIdAndWeekStart(userId, LocalDate.of(2026, 9, 7)))
                .thenReturn(Optional.empty());
        when(reflectionRepository.save(org.mockito.ArgumentMatchers.any(KakeiboReflectionEntity.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        KakeiboReflectionEntity reflection = service.recordReflection(userId, List.of("1", "2", "3", "4"), referenceDate);

        assertEquals(4, reflection.getAnswers().size());
        assertEquals(userId, reflection.getUserId());
        assertEquals(LocalDate.of(2026, 9, 7), reflection.getWeekStart());
    }

    @Test
    void shouldAskOncePerWeekUntilUserAnswersAllFourQuestions() {
        String userId = "u-4";
        LocalDate referenceDate = LocalDate.of(2026, 9, 12);
        LocalDate weekStart = LocalDate.of(2026, 9, 7);
        List<String> answers = List.of(
                "Mantive os essenciais dentro do plano.",
                "Gastei mais em cultura e lazer do que eu imaginei.",
                "Comprei coisas extras que não eram urgentes.",
                "Vou reduzir compras impulsivas na próxima semana."
        );

        // Estado real compartilhado entre os mocks de save/findByUserIdAndWeekStart,
        // simulando um repositorio em memoria em vez de fixar uma sequencia de retornos.
        AtomicReference<KakeiboReflectionEntity> persistedReflection = new AtomicReference<>();

        when(userEntityRepository.findById(userId)).thenReturn(Optional.of(new UserEntity(
                userId, "d@d.com", "123", Role.USER, BigDecimal.valueOf(5000), Tier.FREE, false, null,
                BudgetModelType.KAKEIBO, IncomeType.FIXED, false, null)));
        when(reflectionRepository.findByUserIdAndWeekStart(userId, weekStart))
                .thenAnswer(invocation -> Optional.ofNullable(persistedReflection.get()));
        when(reflectionRepository.save(org.mockito.ArgumentMatchers.any(KakeiboReflectionEntity.class)))
                .thenAnswer(invocation -> {
                    KakeiboReflectionEntity toSave = invocation.getArgument(0);
                    persistedReflection.set(toSave);
                    return toSave;
                });

        assertTrue(service.shouldAskForReflection(userId, referenceDate));

        KakeiboReflectionEntity reflection = service.recordReflection(userId, answers, referenceDate);

        assertEquals(4, reflection.getAnswers().size());
        assertFalse(service.shouldAskForReflection(userId, referenceDate));
    }
}
