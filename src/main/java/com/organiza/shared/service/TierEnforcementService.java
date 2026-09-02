package com.organiza.shared.service;

import com.organiza.mod_ai_coach.model.ChatRole;
import com.organiza.mod_ai_coach.repository.ChatMessageEntityRepository;
import com.organiza.mod_user.model.Tier;
import com.organiza.mod_user.model.UserEntity;
import com.organiza.mod_user.repository.UserEntityRepository;
import com.organiza.shared.exception.TierLimitExceededException;
import com.organiza.shared.security.CurrentUserService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

@Service
public class TierEnforcementService {

    private static final int FREE_MESSAGE_LIMIT = 30;

    private final UserEntityRepository userEntityRepository;
    private final ChatMessageEntityRepository chatMessageRepository;
    private final CurrentUserService currentUserService;

    public TierEnforcementService(UserEntityRepository userEntityRepository,
                                   ChatMessageEntityRepository chatMessageRepository,
                                   CurrentUserService currentUserService) {
        this.userEntityRepository = userEntityRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.currentUserService = currentUserService;
    }

    public TierStatus getTierStatus() {
        UserEntity user = userEntityRepository.findById(currentUserService.getCurrentUserId()).orElseThrow();
        int messagesUsed = countMessagesThisMonth(user.getId());

        if (user.getTier() == Tier.PREMIUM) {
            return new TierStatus(Tier.PREMIUM.name(), messagesUsed, -1, true, true);
        }

        boolean canSendMessage = messagesUsed < FREE_MESSAGE_LIMIT;
        return new TierStatus(Tier.FREE.name(), messagesUsed, FREE_MESSAGE_LIMIT, false, canSendMessage);
    }

    public void enforceCanSendMessage() {
        TierStatus status = getTierStatus();
        if (!status.canSendMessage()) {
            throw new TierLimitExceededException("Você atingiu o limite de 30 mensagens gratuitas este mês.");
        }
    }

    public void enforceVoiceAllowed() {
        TierStatus status = getTierStatus();
        if (!status.voiceEnabled()) {
            throw new TierLimitExceededException("Entrada por voz disponível apenas no plano Premium.");
        }
    }

    private int countMessagesThisMonth(String userId) {
        Instant startOfMonth = LocalDate.now()
                .withDayOfMonth(1)
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant();
        return chatMessageRepository.countByUserIdAndRoleAndCreatedAtGreaterThanEqual(userId, ChatRole.USER, startOfMonth);
    }
}
