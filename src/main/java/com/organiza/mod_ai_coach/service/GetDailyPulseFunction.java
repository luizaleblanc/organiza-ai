package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.GetDailyPulseInput;
import com.organiza.mod_ai_coach.dto.GetDailyPulseOutput;
import com.organiza.mod_transaction.repository.TransactionEntityRepository;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.function.Function;

@Service
@Description("Calcula quanto o usuario ainda pode gastar por dia ate o fim do mes, com base no salario e nos gastos ja registrados")
public class GetDailyPulseFunction implements Function<GetDailyPulseInput, GetDailyPulseOutput> {

    private final UserEntityRepository userEntityRepository;
    private final TransactionEntityRepository transactionEntityRepository;
    private final CurrentUserService currentUserService;

    public GetDailyPulseFunction(UserEntityRepository userEntityRepository,
                                  TransactionEntityRepository transactionEntityRepository,
                                  CurrentUserService currentUserService) {
        this.userEntityRepository = userEntityRepository;
        this.transactionEntityRepository = transactionEntityRepository;
        this.currentUserService = currentUserService;
    }

    @Override
    public GetDailyPulseOutput apply(GetDailyPulseInput input) {
        String userId = currentUserService.getCurrentUserId();
        UserEntity user = userEntityRepository.findById(userId)
                .orElseThrow(() -> new IllegalStateException("Usuário não encontrado."));

        BigDecimal salary = user.getSalary() != null ? user.getSalary() : BigDecimal.ZERO;

        LocalDate today = LocalDate.now();
        LocalDate firstDayOfMonth = today.withDayOfMonth(1);
        Instant from = firstDayOfMonth.atStartOfDay(ZoneId.systemDefault()).toInstant();

        Long totalSpentRaw = transactionEntityRepository.sumAmountByUserIdAndCreatedAtAfter(userId, from);
        BigDecimal totalSpent = totalSpentRaw != null ? BigDecimal.valueOf(totalSpentRaw) : BigDecimal.ZERO;

        int daysRemaining = today.lengthOfMonth() - today.getDayOfMonth() + 1;
        BigDecimal remaining = salary.subtract(totalSpent);

        if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
            return new GetDailyPulseOutput(BigDecimal.ZERO, daysRemaining, totalSpent, salary,
                    "Você já comprometeu todo o salário deste mês.");
        }

        BigDecimal pulse = remaining.divide(BigDecimal.valueOf(daysRemaining), 2, RoundingMode.HALF_UP);
        return new GetDailyPulseOutput(pulse, daysRemaining, totalSpent, salary, null);
    }
}
