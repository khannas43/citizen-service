package org.magicsword.expenditure.domain;

/** Whether an outcome has taken effect or is waiting for a second approver (large recoveries). */
public enum ActionStatus {
    PENDING,
    APPROVED,
    REJECTED
}
