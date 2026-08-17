// Loads the topic / subtopic tree for a set of chapters and turns a set of
// *excluded* nodes into the filters a question query needs.
//
// Selection is opt-OUT: everything is selected by default (what the user asked
// for — "by default qty are tick to all topics"), and the picker only records
// what was unticked. That keeps a brand-new selection cheap (empty set) and
// means newly added topics are automatically included.

import { supabase } from "@/integrations/supabase/client";

export type SubtopicNode = { id: string; name: string };
export type TopicNode = { id: string; name: string; subtopics: SubtopicNode[] };
export type ChapterTopics = { chapterId: string; topics: TopicNode[] };

export const excludeKey = {
  topic: (id: string) => `t:${id}`,
  subtopic: (id: string) => `s:${id}`,
};

/** Fetch topics + subtopics for the given chapter ids (bigint-as-string). */
export async function loadTopicTree(chapterIds: string[]): Promise<ChapterTopics[]> {
  if (!chapterIds.length) return [];
  const numeric = chapterIds.map((c) => Number(c)).filter((n) => Number.isFinite(n));
  if (!numeric.length) return [];

  const { data: topics, error } = await supabase
    .from("qb_topics" as never)
    .select("id,chapter_id,name")
    .in("chapter_id", numeric as never[])
    .order("name");
  if (error || !topics) return chapterIds.map((chapterId) => ({ chapterId, topics: [] }));

  const topicRows = topics as unknown as { id: number; chapter_id: number; name: string }[];
  const topicIds = topicRows.map((t) => t.id);

  let subRows: { id: number; topic_id: number; name: string }[] = [];
  if (topicIds.length) {
    const { data: subs } = await supabase
      .from("qb_subtopics" as never)
      .select("id,topic_id,name")
      .in("topic_id", topicIds as never[])
      .order("name");
    subRows = (subs ?? []) as unknown as typeof subRows;
  }

  const subsByTopic = new Map<number, SubtopicNode[]>();
  for (const s of subRows) {
    if (!subsByTopic.has(s.topic_id)) subsByTopic.set(s.topic_id, []);
    subsByTopic.get(s.topic_id)!.push({ id: String(s.id), name: s.name });
  }

  const byChapter = new Map<string, TopicNode[]>();
  for (const t of topicRows) {
    const key = String(t.chapter_id);
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key)!.push({ id: String(t.id), name: t.name, subtopics: subsByTopic.get(t.id) ?? [] });
  }

  return chapterIds.map((chapterId) => ({ chapterId, topics: byChapter.get(chapterId) ?? [] }));
}

export type TopicFilter = {
  /** Topics kept in full — match on `topic_id`. */
  fullTopicIds: string[];
  /** Topics kept only partially — match on `subtopic_id`. */
  subtopicIds: string[];
  /** True when nothing was unticked, so no topic filter is needed at all. */
  everything: boolean;
};

/** Convert the excluded-node set into query filters. */
export function toTopicFilter(tree: ChapterTopics[], excluded: Set<string>): TopicFilter {
  if (excluded.size === 0) return { fullTopicIds: [], subtopicIds: [], everything: true };

  const fullTopicIds: string[] = [];
  const subtopicIds: string[] = [];
  for (const chapter of tree) {
    for (const topic of chapter.topics) {
      if (excluded.has(excludeKey.topic(topic.id))) continue;
      const droppedSubs = topic.subtopics.filter((s) => excluded.has(excludeKey.subtopic(s.id)));
      if (droppedSubs.length === 0) {
        fullTopicIds.push(topic.id);
      } else {
        for (const s of topic.subtopics) {
          if (!excluded.has(excludeKey.subtopic(s.id))) subtopicIds.push(s.id);
        }
      }
    }
  }
  return { fullTopicIds, subtopicIds, everything: false };
}

/** Count of topics still selected, for the "12 / 15 topics" hint. */
export function countSelectedTopics(tree: ChapterTopics[], excluded: Set<string>) {
  let total = 0;
  let selected = 0;
  for (const chapter of tree) {
    for (const topic of chapter.topics) {
      total++;
      if (!excluded.has(excludeKey.topic(topic.id))) selected++;
    }
  }
  return { total, selected };
}
