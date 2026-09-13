package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.model.KakeiboReflectionEntity;
import com.organiza.mod_ai_coach.repository.KakeiboReflectionEntityRepository;
import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
public class KakeiboReflectionService {

    public static final List<String> QUESTIONS = List.of(
            "Quais gastos essenciais você conseguiu manter dentro do planejado esta semana?",
            "O que você gastou em cultura e lazer sem culpa ou sem planejar?",
            "Houve algum gasto extra que você percebeu que não era necessário?",
            "Qual ajuste simples você vai fazer na próxima semana para melhorar seu controle?"
    );

    private final UserEntityRepository userEntityRepository;
    private final KakeiboReflectionEntityRepository reflectionRepository;

    public KakeiboReflectionService(UserEntityRepository userEntityRepository,
                                   KakeiboReflectionEntityRepository reflectionRepository) {
        this.userEntityRepository = userEntityRepository;
        this.reflectionRepository = reflectionRepository;
    }

    public List<String> getQuestions() {
        return QUESTIONS;
    }

    public boolean shouldAskForReflection(String userId, LocalDate referenceDate) {
        UserEntity user = userEntityRepository.findById(userId).orElse(null);
        if (user == null || user.getBudgetModel() != BudgetModelType.KAKEIBO) {
            return false;
        }

        LocalDate weekStart = getWeekStart(referenceDate);
        return reflectionRepository.findByUserIdAndWeekStart(userId, weekStart).isEmpty();
    }

    public KakeiboReflectionEntity recordReflection(String userId, List<String> answers, LocalDate referenceDate) {
        UserEntity user = userEntityRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Usuário não encontrado: " + userId));

        if (user.getBudgetModel() != BudgetModelType.KAKEIBO) {
            throw new IllegalStateException("Usuário não está no modelo Kakeibo: " + userId);
        }

        if (answers == null || answers.size() != QUESTIONS.size()) {
            throw new IllegalArgumentException("As 4 respostas do Kakeibo são obrigatórias.");
        }

        LocalDate weekStart = getWeekStart(referenceDate);
        Optional<KakeiboReflectionEntity> existing = reflectionRepository.findByUserIdAndWeekStart(userId, weekStart);
        if (existing.isPresent()) {
            return existing.get();
        }

        KakeiboReflectionEntity reflection = new KakeiboReflectionEntity(userId, weekStart, answers);
        return reflectionRepository.save(reflection);
    }

    static LocalDate getWeekStart(LocalDate referenceDate) {
        LocalDate monday = referenceDate.with(DayOfWeek.MONDAY);
        return monday;
    }
}
