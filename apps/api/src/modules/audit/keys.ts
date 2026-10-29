import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';

/**
 * Chaves Ed25519 da auditoria.
 * - A chave PRIVADA fica só no servidor (AUDIT_SIGNING_PRIVATE_KEY): fora do banco, do
 *   repositório e do frontend. Quem só tem acesso ao banco não consegue assinar.
 * - A chave PÚBLICA é publicada para qualquer um conferir as assinaturas.
 * - Formato das variáveis: base64 do DER (PKCS#8 na privada, SPKI na pública), numa linha só.
 */

export type PublicKeyInfo = { keyVersion: number; publicKeyPem: string };

export type Keyring = {
  keyVersion: number;
  sign(message: string): string;
  verify(message: string, signatureBase64: string, keyVersion: number): boolean;
  publicKeys(): PublicKeyInfo[];
};

/** Mensagem assinada de cada checkpoint. Mudar o formato exige nova versão ("v2"). */
export function checkpointMessage(params: { lotId: string; bidCount: number; lastHash: string; keyVersion: number }): string {
  return `verzel-audit-v1|${params.lotId}|${params.bidCount}|${params.lastHash}|${params.keyVersion}`;
}

function parsePrivateKey(base64: string): KeyObject {
  const key = createPrivateKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('AUDIT_SIGNING_PRIVATE_KEY precisa ser uma chave Ed25519.');
  return key;
}

function parsePublicKey(base64: string): KeyObject {
  const key = createPublicKey({ key: Buffer.from(base64, 'base64'), format: 'der', type: 'spki' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Chave pública de auditoria precisa ser Ed25519.');
  return key;
}

export function createKeyring(params: {
  privateKeyBase64: string;
  keyVersion: number;
  /** Chaves públicas de versões anteriores (troca de chave), por versão. */
  previousPublicKeys?: Record<number, string>;
}): Keyring {
  const privateKey = parsePrivateKey(params.privateKeyBase64);
  const publicKeys = new Map<number, KeyObject>([[params.keyVersion, createPublicKey(privateKey)]]);
  for (const [version, base64] of Object.entries(params.previousPublicKeys ?? {})) {
    if (Number(version) !== params.keyVersion) publicKeys.set(Number(version), parsePublicKey(base64));
  }

  return {
    keyVersion: params.keyVersion,
    sign(message) {
      return sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
    },
    verify(message, signatureBase64, keyVersion) {
      const publicKey = publicKeys.get(keyVersion);
      if (!publicKey) return false;
      try {
        return verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(signatureBase64, 'base64'));
      } catch {
        return false;
      }
    },
    publicKeys() {
      return [...publicKeys.entries()]
        .sort(([a], [b]) => a - b)
        .map(([keyVersion, key]) => ({ keyVersion, publicKeyPem: key.export({ type: 'spki', format: 'pem' }).toString() }));
    },
  };
}

/** Gera um par novo (usado pelo comando audit:keygen e pelos testes). */
export function generateKeyPairBase64(): { privateKeyBase64: string; publicKeyBase64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyBase64: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    publicKeyBase64: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  };
}
