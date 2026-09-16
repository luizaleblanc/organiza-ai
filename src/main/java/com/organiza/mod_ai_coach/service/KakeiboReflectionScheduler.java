package com.organiza.mod_ai_coach.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.mod_ai_coach.repository.KakeiboReflectionEntityRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;

@Service
public class KakeiboReflectionScheduler {

    private static final Logger log = LoggerFactory.getLogger(KakeiboReflectionScheduler.class);

    private final UserEntityRepository userEntityRepository;
    private final KakeiboReflectionEntityRepository reflectionRepository;

    public KakeiboReflectionScheduler(UserEntityRepository userEntityRepository,
                                     KakeiboReflectionEntityRepository reflectionRepository) {
        this.userEntityRepository = userEntityRepository;
        this.reflectionRepository = reflectionRepository;
    }

    @Scheduled(cron = "0 0 18 * * MON")
    public void triggerWeeklyCheck() {
        LocalDate weekStart = KakeiboReflectionService.getWeekStart(LocalDate.now());

        userEntityRepository.findAll().stream()
                .filter(user -> user.getBudgetModel() == BudgetModelType.KAKEIBO)
                .filter(user -> reflectionRepository.findByUserIdAndWeekStart(user.getId(), weekStart).isEmpty())
                .forEach(user -> log.info("Kakeibo reflection pendente para usuário {} na semana {}", user.getId(), weekStart));
    }
}
