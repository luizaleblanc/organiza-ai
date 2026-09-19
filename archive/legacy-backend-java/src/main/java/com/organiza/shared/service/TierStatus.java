package com.organiza.shared.service;

public record TierStatus(String tier, int messagesUsed, int messagesLimit, boolean voiceEnabled, boolean canSendMessage) {
}
