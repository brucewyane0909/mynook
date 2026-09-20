import { handleHealthRequest } from './_lib/gemini';

export default async function handler(req: any, res: any) {
  return handleHealthRequest(req, res);
}
