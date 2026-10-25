package org.citizen.formdefinition.governance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.domain.FormDefinitionStatus;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

class GovernanceTransitionRequestParserTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void admitsApprovedAndPublishedOnly() throws Exception {
        assertThat(parse("{\"targetStatus\":\"approved\"}"))
                .isEqualTo(FormDefinitionStatus.approved);
        assertThat(parse("{\"targetStatus\":\"published\"}"))
                .isEqualTo(FormDefinitionStatus.published);
    }

    @Test
    void rejectsActorIdAndWrongTargets() throws Exception {
        assertThatThrownBy(() -> parse("{\"targetStatus\":\"approved\",\"actorId\":\"x\"}"))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
        assertThatThrownBy(() -> parse("{\"targetStatus\":\"submitted\"}"))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
        assertThatThrownBy(() -> parse("{\"targetStatus\":\"retired\"}"))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
        assertThatThrownBy(() -> parse("{}"))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
        assertThatThrownBy(() -> parse("[]"))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
    }

    private FormDefinitionStatus parse(String json) throws Exception {
        return GovernanceTransitionRequestParser.parseTargetStatus(mapper.readTree(json));
    }

    @Test
    void objectNodeWithExtraKeyRejected() {
        ObjectNode body = mapper.createObjectNode();
        body.put("targetStatus", "approved");
        body.put("extra", "no");
        assertThatThrownBy(() -> GovernanceTransitionRequestParser.parseTargetStatus(body))
                .isInstanceOf(InvalidGovernanceTransitionRequestException.class);
    }
}
