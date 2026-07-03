/**
 * Replace AI knowledge corpora from docs/RAG.
 * Run: npm run db:seed-ai-knowledge
 */
import { seedAiKnowledge } from "../lib/ai-seed";

seedAiKnowledge()
  .then(() => {
    console.log("AI knowledge seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
