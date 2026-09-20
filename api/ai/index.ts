import { handleAiChatRequest } from '../_lib/gemini';

export default async function handler(req: any, res: any) {
  return handleAiChatRequest(req, res);
}
