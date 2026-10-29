import type { Pool } from 'pg';
import { withTransaction } from '../../db/transaction.js';
import { AppError } from '../../shared/errors.js';
import { generatePublicAlias, type UserRole } from './alias.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSession, type AuthUser } from './session.js';

type UserRow = { id: string; email: string; role: UserRole; public_alias: string; password_hash: string };

function toAuthUser(row: Omit<UserRow, 'password_hash'>): AuthUser {
  return { id: row.id, email: row.email, role: row.role, publicAlias: row.public_alias };
}

/**
 * Cria usuário, carteira (todo usuário tem uma; o leiloeiro recebe créditos nela) e sessão,
 * tudo na mesma transação. O papel vem do cadastro e não muda depois.
 */
export async function registerUser(
  pool: Pool,
  input: { email: string; password: string; role: UserRole },
): Promise<{ user: AuthUser; token: string }> {
  // Hash fora da transação: é lento de propósito e não precisa de conexão.
  const passwordHash = await hashPassword(input.password);

  return withTransaction(pool, async (client) => {
    // Repete só se o pseudônimo aleatório colidir com outro já existente.
    for (let attempt = 0; attempt < 5; attempt++) {
      const inserted = await client.query<Omit<UserRow, 'password_hash'>>(
        `INSERT INTO users (email, password_hash, role, public_alias)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id, email, role, public_alias`,
        [input.email, passwordHash, input.role, generatePublicAlias(input.role)],
      );

      if (inserted.rows[0]) {
        const user = toAuthUser(inserted.rows[0]);
        await client.query('INSERT INTO wallets (user_id) VALUES ($1)', [user.id]);
        const token = await createSession(client, user.id);
        return { user, token };
      }

      const emailTaken = await client.query('SELECT 1 FROM users WHERE email = $1', [input.email]);
      if (emailTaken.rowCount) {
        throw new AppError(409, 'EMAIL_ALREADY_USED', 'Já existe uma conta com este email.');
      }
    }
    throw new Error('Não foi possível gerar um pseudônimo único.');
  });
}

// Hash de uma senha qualquer, usado para gastar o mesmo tempo quando o email não existe.
// Assim a resposta não revela, pelo tempo, se o email está cadastrado.
let dummyHashPromise: Promise<string> | undefined;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('senha-que-nao-existe-para-equalizar-tempo');
  return dummyHashPromise;
}

/** Confere email e senha. Mesma mensagem para email inexistente e senha errada. */
export async function authenticate(pool: Pool, email: string, password: string): Promise<AuthUser> {
  const result = await pool.query<UserRow>(
    'SELECT id, email, role, public_alias, password_hash FROM users WHERE email = $1',
    [email],
  );
  const row = result.rows[0];
  const passwordOk = await verifyPassword(password, row?.password_hash ?? (await dummyHash()));

  if (!row || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email ou senha incorretos.');
  }
  return toAuthUser(row);
}
