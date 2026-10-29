// Configuração: a âncora da auditoria precisa ser um banco DIFERENTE do principal (etapa 22, F2).
import { describe, expect, it } from 'vitest';
import { loadConfig, sameDatabase } from '../src/shared/config.js';

const KEY = 'MC4CAQAwBQYDK2VwBCIEIA' + 'A'.repeat(22); // só o formato base64 importa aqui
const base = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://app:segredo@db.exemplo.test:5432/verzel',
  AUDIT_SIGNING_PRIVATE_KEY: KEY,
};

describe('âncora independente', () => {
  it('recusa a âncora apontando para o mesmo banco do DATABASE_URL (mesmo com outro usuário)', () => {
    expect(() => loadConfig({ ...base, ANCHOR_DATABASE_URL: 'postgres://outro:x@DB.exemplo.test/verzel?sslmode=require' })).toThrow(
      /ANCHOR_DATABASE_URL: precisa ser outro banco/,
    );
  });

  it('aceita outro banco no mesmo servidor e outro servidor', () => {
    expect(loadConfig({ ...base, ANCHOR_DATABASE_URL: 'postgres://app:segredo@db.exemplo.test:5432/verzel_anchor' }).anchorDatabaseUrl).toContain(
      'verzel_anchor',
    );
    expect(loadConfig({ ...base, ANCHOR_DATABASE_URL: 'postgres://a:b@ancora.exemplo.test/verzel' }).anchorDatabaseUrl).toContain('ancora');
  });

  it('compara servidor, porta e nome do banco', () => {
    expect(sameDatabase('postgres://a@h:5432/db', 'postgresql://b:c@H/db?x=1')).toBe(true);
    expect(sameDatabase('postgres://a@h:5432/db', 'postgres://a@h:5433/db')).toBe(false);
    expect(sameDatabase('postgres://a@h/db', 'postgres://a@h/db_test')).toBe(false);
  });
});
