package org.magicsword.formdefinition.validation;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Iterator;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;

/** Counts JSON nodes and max depth without mutating the tree. */
public final class JsonTreeLimits {

    public record Result(int nodeCount, int maxDepth, boolean nodeLimitExceeded, boolean depthLimitExceeded) {}

    private JsonTreeLimits() {}

    public static Result measure(JsonNode root) {
        if (root == null || root.isMissingNode() || root.isNull()) {
            return new Result(0, 0, false, false);
        }
        int nodes = 0;
        int maxDepth = 0;
        boolean nodeExceeded = false;
        boolean depthExceeded = false;

        Deque<Frame> stack = new ArrayDeque<>();
        stack.push(new Frame(root, 1));

        while (!stack.isEmpty()) {
            Frame frame = stack.pop();
            nodes++;
            if (nodes > ValidationLimits.MAX_NODES) {
                nodeExceeded = true;
                break;
            }
            if (frame.depth > ValidationLimits.MAX_DEPTH) {
                depthExceeded = true;
                // continue counting siblings at allowed depths only — stop descending
                continue;
            }
            maxDepth = Math.max(maxDepth, frame.depth);

            JsonNode node = frame.node;
            if (node.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
                while (fields.hasNext()) {
                    stack.push(new Frame(fields.next().getValue(), frame.depth + 1));
                }
            } else if (node.isArray()) {
                for (JsonNode child : node) {
                    stack.push(new Frame(child, frame.depth + 1));
                }
            }
        }
        return new Result(nodes, maxDepth, nodeExceeded, depthExceeded);
    }

    private record Frame(JsonNode node, int depth) {}
}
