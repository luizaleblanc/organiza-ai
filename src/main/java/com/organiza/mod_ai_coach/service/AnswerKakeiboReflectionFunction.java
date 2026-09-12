package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.AnswerKakeiboReflectionInput;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.function.Function;

@Service
@Description("Registra as 4 respostas da reflexão semanal do modelo Kakeibo do usuário atual")
public class AnswerKakeiboReflectionFunction implements Function<AnswerKakeiboReflectionInput, String> {

    private final KakeiboReflectionService kakeiboReflectionService;
    private final CurrentUserService currentUserService;

    public AnswerKakeiboReflectionFunction(KakeiboReflectionService kakeiboReflectionService,
                                           CurrentUserService currentUserService) {
        this.kakeiboReflectionService = kakeiboReflectionService;
        this.currentUserService = currentUserService;
    }

    @Override
    public String apply(AnswerKakeiboReflectionInput input) {
        String userId = currentUserService.getCurrentUserId();
        kakeiboReflectionService.recordReflection(userId, input.answers(), LocalDate.now());
        return "Sua reflexão semanal do Kakeibo foi registrada com sucesso.";
    }
}
