package com.organiza.mod_user.dto;

import java.util.List;

public record OnboardingResponse(String suggestedModel, String modelDescription, List<BucketSummaryDTO> buckets) {
}
