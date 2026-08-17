// Collapsible topic / subtopic picker used by Subject-wise Quiz and Generate Test.
//
// Everything is ticked by default; the chevron expands a chapter so the user can
// untick the topics (or individual subtopics) they don't want.

import { useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type ChapterTopics,
  excludeKey,
  loadTopicTree,
} from "@/lib/topic-tree";

export function useTopicTree(chapterIds: string[]) {
  const [tree, setTree] = useState<ChapterTopics[]>([]);
  const [loading, setLoading] = useState(false);
  const key = chapterIds.join(",");

  useEffect(() => {
    let cancelled = false;
    if (!chapterIds.length) {
      setTree([]);
      return;
    }
    setLoading(true);
    loadTopicTree(chapterIds)
      .then((t) => {
        if (!cancelled) setTree(t);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { tree, loading };
}

export function TopicPicker({
  topics,
  excluded,
  onToggle,
  className,
}: {
  topics: ChapterTopics["topics"];
  excluded: Set<string>;
  onToggle: (keys: string[], exclude: boolean) => void;
  className?: string;
}) {
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  if (!topics.length) {
    return (
      <p className={cn("px-3 py-2 text-xs text-muted-foreground", className)}>
        No sub-topics listed for this chapter — all questions will be used.
      </p>
    );
  }

  const allOff = topics.every((t) => excluded.has(excludeKey.topic(t.id)));

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Sub-topics
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() => {
            const keys = topics.flatMap((t) => [
              excludeKey.topic(t.id),
              ...t.subtopics.map((s) => excludeKey.subtopic(s.id)),
            ]);
            onToggle(keys, !allOff);
          }}
        >
          {allOff ? "Select all" : "Clear all"}
        </Button>
      </div>

      {topics.map((topic) => {
        const tKey = excludeKey.topic(topic.id);
        const topicOff = excluded.has(tKey);
        const isOpen = openTopic === topic.id;
        const subsOff = topic.subtopics.filter((s) => excluded.has(excludeKey.subtopic(s.id))).length;
        return (
          <div key={topic.id} className="rounded-lg border border-border/60">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Checkbox
                id={`topic-${topic.id}`}
                checked={!topicOff}
                onCheckedChange={(v) => {
                  const exclude = !v;
                  onToggle(
                    [tKey, ...topic.subtopics.map((s) => excludeKey.subtopic(s.id))],
                    exclude,
                  );
                }}
              />
              <label
                htmlFor={`topic-${topic.id}`}
                className="min-w-0 flex-1 cursor-pointer truncate text-xs"
              >
                {topic.name}
                {subsOff > 0 && !topicOff && (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    ({topic.subtopics.length - subsOff}/{topic.subtopics.length})
                  </span>
                )}
              </label>
              {topic.subtopics.length > 0 && (
                <button
                  type="button"
                  aria-label={isOpen ? "Hide sub-topics" : "Show sub-topics"}
                  aria-expanded={isOpen}
                  onClick={() => setOpenTopic(isOpen ? null : topic.id)}
                  className="rounded p-1 text-muted-foreground transition hover:text-foreground"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                </button>
              )}
            </div>
            {isOpen && topic.subtopics.length > 0 && (
              <div className="space-y-1 border-t border-border/60 px-3 py-2">
                {topic.subtopics.map((s) => {
                  const sKey = excludeKey.subtopic(s.id);
                  return (
                    <div key={s.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`sub-${s.id}`}
                        checked={!excluded.has(sKey) && !topicOff}
                        disabled={topicOff}
                        onCheckedChange={(v) => onToggle([sKey], !v)}
                      />
                      <label htmlFor={`sub-${s.id}`} className="cursor-pointer truncate text-[11px]">
                        {s.name}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TopicPickerLoading() {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sub-topics…
    </div>
  );
}
