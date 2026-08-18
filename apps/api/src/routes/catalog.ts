import { Router } from "express";
import type { Difficulty } from "@grade9/shared";
import { subjects, topicName } from "@grade9/shared";
import { questionCounts } from "../repositories/questionRepository";

export const catalogRouter = Router();

export interface CatalogTopic {
  id: string;
  name: string;
  counts: Record<Difficulty, number>;
  total: number;
}

export interface CatalogSubject {
  id: string;
  name: string;
  topics: CatalogTopic[];
  total: number;
}

/**
 * Subjects and topics for the test builder, with how many questions back each one.
 *
 * The real topic list is still being pulled out of the past papers, so this
 * merges the starter topics with every topic that actually exists in the bank.
 * Entering a question under a new topic makes it selectable straight away, with
 * no code change needed.
 */
catalogRouter.get("/", async (_request, response, next) => {
  try {
    const counts = await questionCounts();

    const catalog = new Map<string, CatalogSubject>();

    for (const subject of subjects) {
      catalog.set(subject.id, {
        id: subject.id,
        name: subject.name,
        topics: subject.topics.map((topic) => ({
          id: topic.id,
          name: topic.name,
          counts: { easy: 0, medium: 0, hard: 0 },
          total: 0
        })),
        total: 0
      });
    }

    for (const entry of counts) {
      let subject = catalog.get(entry.subjectId);

      if (!subject) {
        subject = {
          id: entry.subjectId,
          name: entry.subjectId.replace(/\b\w/g, (char) => char.toUpperCase()),
          topics: [],
          total: 0
        };
        catalog.set(entry.subjectId, subject);
      }

      let topic = subject.topics.find((item) => item.id === entry.topicId);

      if (!topic) {
        topic = {
          id: entry.topicId,
          name: topicName(entry.subjectId, entry.topicId),
          counts: { easy: 0, medium: 0, hard: 0 },
          total: 0
        };
        subject.topics.push(topic);
      }

      topic.counts[entry.difficulty] += entry.count;
      topic.total += entry.count;
      subject.total += entry.count;
    }

    response.json({ subjects: [...catalog.values()] });
  } catch (error) {
    next(error);
  }
});
