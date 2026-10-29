import type { AuthUser } from '../modules/auth/session.js';

// Acrescenta req.user ao tipo Request do Express. Só o middleware loadSessionUser preenche.
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
