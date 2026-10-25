package org.citizen.formdefinition.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.application.FormDefinitionAdmissionException;
import org.citizen.formdefinition.application.InvalidPaginationException;

class GovernanceQueueCursorParserTest {

    @Test
    void admitsStartAndDefaultLimit() {
        GovernanceQueueCursorParser.AdmittedPageRequest page =
                GovernanceQueueCursorParser.admit(null, null, null);
        assertThat(page.cursorOrNull()).isNull();
        assertThat(page.limit()).isEqualTo(50);
    }

    @Test
    void admitsPairedCursor() {
        GovernanceQueueCursorParser.AdmittedPageRequest page =
                GovernanceQueueCursorParser.admit("svc-a", "3", "10");
        assertThat(page.cursorOrNull().afterServiceId()).isEqualTo("svc-a");
        assertThat(page.cursorOrNull().afterVersion()).isEqualTo(3);
        assertThat(page.limit()).isEqualTo(10);
    }

    @Test
    void rejectsUnpairedCursor() {
        assertThatThrownBy(() -> GovernanceQueueCursorParser.admit("svc-a", null, null))
                .isInstanceOf(InvalidPaginationException.class);
        assertThatThrownBy(() -> GovernanceQueueCursorParser.admit(null, "1", null))
                .isInstanceOf(InvalidPaginationException.class);
    }

    @Test
    void rejectsInvalidLimitAndServiceId() {
        assertThatThrownBy(() -> GovernanceQueueCursorParser.admit(null, null, "0"))
                .isInstanceOf(InvalidPaginationException.class);
        assertThatThrownBy(() -> GovernanceQueueCursorParser.admit(null, null, "101"))
                .isInstanceOf(InvalidPaginationException.class);
        assertThatThrownBy(() -> GovernanceQueueCursorParser.admit(" ", "1", null))
                .isInstanceOf(FormDefinitionAdmissionException.class);
    }
}
