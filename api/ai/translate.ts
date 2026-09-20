import { handleTranslateRequest } from '../_lib/gemini';

export default async function handler(req: any, res: any) {
  return handleTranslateRequest(req, res);
}
