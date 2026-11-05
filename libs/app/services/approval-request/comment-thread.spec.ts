import { describe, expect, it } from "vitest";
import { buildCommentThreads, type CommentNode, type CommentRow } from "./comment-thread";

const row = (id: string, parentId: string | null = null, deleted = false): CommentRow => ({ id, parentId, content: `text-${id}`, deleted });

/** Cây rút gọn: id + con, để so sánh hình dạng */
const shape = (nodes: CommentNode<CommentRow>[]): unknown[] => nodes.map((n) => (n.replies.length ? [n.id, shape(n.replies)] : n.id));

describe("buildCommentThreads", () => {
  it("groups replies under their root in the given order", () => {
    const threads = buildCommentThreads([row("a"), row("b")], [row("a1", "a"), row("b1", "b"), row("a2", "a")]);
    expect(shape(threads)).toEqual([
      ["a", ["a1", "a2"]],
      ["b", ["b1"]],
    ]);
  });

  it("nests replies of replies under the comment they answer, at any depth", () => {
    const threads = buildCommentThreads([row("a")], [row("a1", "a"), row("a2", "a"), row("a1x", "a1"), row("a1xy", "a1x")]);
    expect(shape(threads)).toEqual([["a", [["a1", [["a1x", ["a1xy"]]]], "a2"]]]);
  });

  it("keeps a deleted root as a placeholder without its content, replies stay", () => {
    const [thread] = buildCommentThreads([row("a", null, true)], [row("a1", "a")]);
    expect(thread.deleted).toBe(true);
    expect(thread.content).toBeNull();
    expect(thread.replies.map((r) => r.id)).toEqual(["a1"]);
  });

  it("keeps a deleted middle comment as a placeholder while something live is under it", () => {
    const [thread] = buildCommentThreads([row("a")], [row("a1", "a", true), row("a1x", "a1")]);
    const [middle] = thread.replies;
    expect(middle.id).toBe("a1");
    expect(middle.content).toBeNull();
    expect(middle.replies.map((r) => r.id)).toEqual(["a1x"]);
  });

  it("drops deleted comments with nothing live under them, and replies of roots outside the page", () => {
    const threads = buildCommentThreads([row("a")], [row("a1", "a", true), row("a2", "a1", true), row("x1", "x")]);
    expect(shape(threads)).toEqual(["a"]);
  });
});
