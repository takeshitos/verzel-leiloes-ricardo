// Gera o par de chaves Ed25519 da auditoria. Rode UMA vez, no seu computador:
//   npm run audit:keygen -w apps/api
// Cadastre a privada no painel do Render (AUDIT_SIGNING_PRIVATE_KEY) e guarde uma cópia offline.
// Nunca coloque a privada no repositório, no chat, em logs ou em variável VITE_*.
import { generateKeyPairBase64 } from './keys.js';

const { privateKeyBase64, publicKeyBase64 } = generateKeyPairBase64();

console.log('Par de chaves Ed25519 gerado. A chave PRIVADA é um segredo.\n');
console.log('AUDIT_SIGNING_PRIVATE_KEY (segredo, só no servidor):');
console.log(privateKeyBase64);
console.log('\nChave pública (pode ser divulgada; a API também a publica em /api/audit/public-key):');
console.log(publicKeyBase64);
console.log('\nUse AUDIT_KEY_VERSION=1 na primeira chave. Para trocar no futuro, veja docs/AUDITORIA.md.');
