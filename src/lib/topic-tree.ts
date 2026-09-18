// Loads the topic / subtopic tree for a set of chapters from Hostinger MySQL
// and turns a set of *excluded* nodes into the filters a question query needs.

export type SubtopicNode = { id: string; name: string };
export type TopicNode = { id: string; name: string; subtopics: SubtopicNode[] };
export type ChapterTopics = { chapterId: string; topics: TopicNode[] };

export const excludeKey = {
  topic: (id: string) => `t:${id}`,
  subtopic: (id: string) => `s:${id}`,
};

/** Fetch topics + subtopics for the given chapter ids from the Hostinger database */
export async function loadTopicTree(chapterIds: string[]): Promise<ChapterTopics[]> {
  if (!chapterIds.length) return [];
  const numeric = chapterIds.filter((c) => Number.isFinite(Number(c)));
  if (!numeric.length) return [];
  try {
    const { getTopicTree } = await import("@/lib/practice-mysql.functions");
    const tree = await getTopicTree({ data: { chapterIds: numeric } });
    if (Array.isArray(tree)) return tree as ChapterTopics[];
  } catch (e) {
    console.warn("loadTopicTree failed:", e);
  }
  return chapterIds.map((chapterId) => ({ chapterId, topics: [] }));
}

export type TopicFilter = {
  fullTopicIds: string[];
  subtopicIds: string[];
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

/** Count of topics still selected, for the hint */
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
