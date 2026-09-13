package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.AnswerKakeiboReflectionInput;
import com.organiza.shared.security.CurrentUserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AnswerKakeiboReflectionFunctionTest {

    @Mock
    private KakeiboReflectionService kakeiboReflectionService;

    @Mock
    private CurrentUserService currentUserService;

    private final List<String> answers = List.of("a", "b", "c", "d");

    @Test
    void shouldReturnSuccessMessageWhenReflectionIsRecorded() {
        when(currentUserService.getCurrentUserId()).thenReturn("u-1");

        AnswerKakeiboReflectionFunction function = new AnswerKakeiboReflectionFunction(
                kakeiboReflectionService, currentUserService);

        String result = function.apply(new AnswerKakeiboReflectionInput(answers));

        assertEquals("Sua reflexão semanal do Kakeibo foi registrada com sucesso.", result);
    }

    @Test
    void shouldReturnFriendlyMessageInsteadOfThrowingWhenUserIsNotInKakeiboModel() {
        when(currentUserService.getCurrentUserId()).thenReturn("u-1");
        when(kakeiboReflectionService.recordReflection(eq("u-1"), anyList(), any(LocalDate.class)))
                .thenThrow(new IllegalStateException("Usuário não está no modelo Kakeibo: u-1"));

        AnswerKakeiboReflectionFunction function = new AnswerKakeiboReflectionFunction(
                kakeiboReflectionService, currentUserService);

        String result = assertDoesNotThrow(() -> function.apply(new AnswerKakeiboReflectionInput(answers)));

        assertFalse(result.isBlank());
        assertFalse(result.contains("Exception"));
    }

    @Test
    void shouldReturnFriendlyMessageInsteadOfThrowingWhenAnswersAreInvalid() {
        when(currentUserService.getCurrentUserId()).thenReturn("u-1");
        when(kakeiboReflectionService.recordReflection(eq("u-1"), anyList(), any(LocalDate.class)))
                .thenThrow(new IllegalArgumentException("As 4 respostas do Kakeibo são obrigatórias."));

        AnswerKakeiboReflectionFunction function = new AnswerKakeiboReflectionFunction(
                kakeiboReflectionService, currentUserService);

        String result = assertDoesNotThrow(() -> function.apply(new AnswerKakeiboReflectionInput(List.of("apenas uma"))));

        assertFalse(result.isBlank());
        assertFalse(result.contains("Exception"));
    }
}
