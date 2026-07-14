/** @deprecated Use npm run db:seed-ai-knowledge */
import { seedAiKnowledge } from "../lib/ai-seed";

seedAiKnowledge()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
