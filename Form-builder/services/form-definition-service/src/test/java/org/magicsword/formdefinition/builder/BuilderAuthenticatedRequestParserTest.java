package org.magicsword.formdefinition.builder;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.magicsword.formdefinition.application.InvalidTransitionRequestException;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

class BuilderAuthenticatedRequestParserTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void admitsExactEmptyCloneBody() throws Exception {
        assertThatCode(() -> BuilderAuthenticatedRequestParser.admitEmptyCloneBody(mapper.readTree("{}")))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsCloneBodiesWithCreatedByOrExtras() throws Exception {
        assertThatThrownBy(
                        () ->
                                BuilderAuthenticatedRequestParser.admitEmptyCloneBody(
                                        mapper.readTree("{\"createdBy\":\"spoof\"}")))
                .isInstanceOf(InvalidTransitionRequestException.class);
        assertThatThrownBy(
                        () ->
                                BuilderAuthenticatedRequestParser.admitEmptyCloneBody(
                                        mapper.readTree("{\"extra\":1}")))
                .isInstanceOf(InvalidTransitionRequestException.class);
        assertThatThrownBy(() -> BuilderAuthenticatedRequestParser.admitEmptyCloneBody(null))
                .isInstanceOf(InvalidTransitionRequestException.class);
        assertThatThrownBy(
                        () -> BuilderAuthenticatedRequestParser.admitEmptyCloneBody(mapper.readTree("[]")))
                .isInstanceOf(InvalidTransitionRequestException.class);
    }

    @Test
    void admitsExactSubmittedBody() throws Exception {
        assertThatCode(
                        () ->
                                BuilderAuthenticatedRequestParser.admitSubmittedOnlyBody(
                                        mapper.readTree("{\"targetStatus\":\"submitted\"}")))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsSubmitBodiesWithActorIdWrongTargetOrExtras() throws Exception {
        assertThatThrownBy(
                        () ->
                                BuilderAuthenticatedRequestParser.admitSubmittedOnlyBody(
                                        mapper.readTree(
                                                "{\"targetStatus\":\"submitted\",\"actorId\":\"x\"}")))
                .isInstanceOf(InvalidTransitionRequestException.class);
        assertThatThrownBy(
                        () ->
                                BuilderAuthenticatedRequestParser.admitSubmittedOnlyBody(
                                        mapper.readTree("{\"targetStatus\":\"approved\"}")))
                .isInstanceOf(InvalidTransitionRequestException.class);
        assertThatThrownBy(
                        () ->
                                BuilderAuthenticatedRequestParser.admitSubmittedOnlyBody(
                                        mapper.readTree("{}")))
                .isInstanceOf(InvalidTransitionRequestException.class);
        ObjectNode extra = mapper.createObjectNode();
        extra.put("targetStatus", "submitted");
        extra.put("extra", "no");
        assertThatThrownBy(() -> BuilderAuthenticatedRequestParser.admitSubmittedOnlyBody(extra))
                .isInstanceOf(InvalidTransitionRequestException.class);
    }
}
