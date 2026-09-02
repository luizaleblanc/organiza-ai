package com.organiza.shared.exception;

public class TierLimitExceededException extends RuntimeException {

    public TierLimitExceededException(String message) {
        super(message);
    }
}
