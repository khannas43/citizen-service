package org.magicsword.formdefinition.application;

/**
 * Provisional actor / createdBy admission until authenticated principals exist (FB-C4).
 *
 * <p>Production must derive identity from an authenticated principal — C4 does not implement
 * authorization and must not claim it.
 */
public final class ActorIdAdmission {

    public static final int MAX_CODE_POINTS = 256;

    private ActorIdAdmission() {}

    public static String admit(String actorId) {
        if (actorId == null) {
            throw new InvalidActorException();
        }
        if (actorId.isEmpty() || actorId.isBlank()) {
            throw new InvalidActorException();
        }
        if (!actorId.equals(actorId.trim())) {
            throw new InvalidActorException();
        }
        if (actorId.codePointCount(0, actorId.length()) > MAX_CODE_POINTS) {
            throw new InvalidActorException();
        }
        return actorId;
    }
}
