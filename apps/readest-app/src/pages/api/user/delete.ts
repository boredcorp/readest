import type { NextApiRequest, NextApiResponse } from 'next';
import { getAccountDeletionUrl } from '@/libs/user';
import { corsAllMethods, runMiddleware } from '@/utils/cors';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(410).json({
    error: 'Account deletion is managed by StoryBored.',
    accountUrl: getAccountDeletionUrl(),
  });
}
