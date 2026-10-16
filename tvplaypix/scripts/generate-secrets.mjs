#!/usr/bin/env node
// Gera segredos fortes para o .env.local. Uso: npm run secrets
import { randomBytes } from 'node:crypto';

console.log(`CRON_SECRET=${randomBytes(32).toString('base64url')}`);
console.log(`CREDENTIALS_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
console.log(`KIRVANO_WEBHOOK_TOKEN=${randomBytes(24).toString('base64url')}`);
