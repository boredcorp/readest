import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import {
  LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE,
  getLearningBoredPrivateBetaPolicy,
} from '@/integrations/learningbored/private-beta-policy';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const privateBetaPolicy = getLearningBoredPrivateBetaPolicy();
  if (!privateBetaPolicy.allowSelfServiceAccountDeletion) {
    return res.status(403).json({ error: LEARNINGBORED_PRIVATE_BETA_DISABLED_MESSAGE });
  }

  try {
    const { user, token } = await validateUserAndToken(req.headers['authorization']);
    if (!user || !token) {
      return res.status(403).json({ error: 'Not authenticated' });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
