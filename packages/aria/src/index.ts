// packages/aria/src/index.ts
export { assembleContext } from "./assembler";
export {
  embedText, embedBatch, indexScoutingEntries, indexMatchEntry,
  retrieveContext, formatRetrievedContext,
} from "./rag";
export { checkRateLimit, recordUsage, LIMITS } from "./rateLimiter";
export { ARIA_TOOLS, executeTool } from "./tools";
export {
  loadConversation, saveConversation, buildMessagesWithHistory, listConversations,
} from "./memory";
export { systemBase } from "./prompts/systemBase";
export {
  encryptApiKey, decryptApiKey, maskApiKey, isByokConfigured,
} from "./byokCrypto";
