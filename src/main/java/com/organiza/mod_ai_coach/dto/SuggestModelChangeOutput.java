package com.organiza.mod_ai_coach.dto;

public record SuggestModelChangeOutput(Boolean shouldChange, String suggestedModel, String message) {
}
