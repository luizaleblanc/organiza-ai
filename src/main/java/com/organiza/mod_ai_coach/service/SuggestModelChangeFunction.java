package com.organiza.mod_ai_coach.service;

import com.organiza.mod_ai_coach.dto.SuggestModelChangeInput;
import com.organiza.mod_ai_coach.dto.SuggestModelChangeOutput;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.context.annotation.Description;
import org.springframework.stereotype.Service;

import java.util.function.Function;

@Service
@Description("Analisa os gastos dos ultimos 3 meses do usuario e verifica se o modelo de orcamento atual ainda faz sentido")
public class SuggestModelChangeFunction implements Function<SuggestModelChangeInput, SuggestModelChangeOutput> {

    private final CurrentUserService currentUserService;

    public SuggestModelChangeFunction(CurrentUserService currentUserService) {
        this.currentUserService = currentUserService;
    }

    /**
     * TODO: TransactionEntity ainda nao tem uma consulta por bucket/periodo (ver
     * PROJECT_STATUS.md, "Campos/tabelas que FALTAM") e o enum Bucket (NEEDS/WANTS/SAVINGS)
     * nao cobre os buckets dos 6 modelos adaptativos (ex: "Quitacao de Divida", Kakeibo).
     * Implementar a comparacao real (percentual gasto vs. percentual do modelo, divergencia > 15%)
     * quando essa infraestrutura de consulta existir.
     */
    @Override
    public SuggestModelChangeOutput apply(SuggestModelChangeInput input) {
        currentUserService.getCurrentUserId();
        return new SuggestModelChangeOutput(false, null,
                "Ainda não tenho dados suficientes dos últimos 3 meses para avaliar se vale a pena trocar de modelo.");
    }
}
