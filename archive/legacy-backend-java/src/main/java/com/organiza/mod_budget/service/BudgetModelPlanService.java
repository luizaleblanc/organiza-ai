package com.organiza.mod_budget.service;

import com.organiza.mod_budget.model.BudgetModelType;
import com.organiza.mod_user.dto.BucketSummaryDTO;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
public class BudgetModelPlanService {

    public String describe(BudgetModelType model) {
        return switch (model) {
            case STANDARD_503020 -> "Modelo Padrão 50/30/20: metade da sua renda cobre o essencial, 30% é pra viver bem hoje, e 20% guarda pro futuro.";
            case SURVIVAL_702010 -> "Modelo Sobrevivência 70/20/10: a maior parte cobre o essencial, uma folga pra respirar e um pouco guardado, mesmo que pouco.";
            case ANTI_DEBT_701020 -> "Modelo Anti-Dívida: 70% para necessidades, 10% para o mínimo pessoal, 20% para quitar suas dívidas. Quando você sair do vermelho, o sistema migra automaticamente para outro modelo.";
            case SIMPLE_8020 -> "Modelo Simplificado 80/20: 80% pra viver sem culpa, 20% pra guardar sem esforço. Simples assim.";
            case KAKEIBO -> "Modelo Kakeibo: reflexão em 4 categorias -- essencial, cultura, lazer e extras. Toda semana você para pra pensar no que gastou e como pode melhorar.";
            case FREELANCER_BASE_ZERO -> "Modelo Base Zero: sua renda varia, então cada entrada é alocada na hora -- parte pra reserva de emergência, parte pro seu orçamento. Nada fixo, tudo sob controle.";
        };
    }

    public List<BucketSummaryDTO> buildBuckets(BudgetModelType model, BigDecimal salary) {
        return switch (model) {
            case STANDARD_503020 -> List.of(
                    bucket("Necessidades", 50, salary),
                    bucket("Desejos", 30, salary),
                    bucket("Futuro", 20, salary));
            case SURVIVAL_702010 -> List.of(
                    bucket("Necessidades", 70, salary),
                    bucket("Folga", 20, salary),
                    bucket("Guarda", 10, salary));
            case ANTI_DEBT_701020 -> List.of(
                    bucket("Necessidades", 70, salary),
                    bucket("Pessoal", 10, salary),
                    bucket("Quitação de Dívida", 20, salary));
            case SIMPLE_8020 -> List.of(
                    bucket("Viver", 80, salary),
                    bucket("Guardar", 20, salary));
            case KAKEIBO -> List.of(
                    bucket("Essencial", 50, salary),
                    bucket("Cultura", 10, salary),
                    bucket("Lazer", 30, salary),
                    bucket("Extras", 10, salary));
            case FREELANCER_BASE_ZERO -> List.of();
        };
    }

    private BucketSummaryDTO bucket(String name, int percentage, BigDecimal salary) {
        BigDecimal amount = salary
                .multiply(BigDecimal.valueOf(percentage))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        return new BucketSummaryDTO(name, percentage, amount);
    }
}
