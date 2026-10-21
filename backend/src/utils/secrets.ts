import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

type SecretName = 'API_KEY' | 'WEBHOOK_SECRET';

let ssm: SSMClient | undefined;
const cache = new Map<SecretName, Promise<string>>();

// A local run sets the value itself (API_KEY in .env.local). A deployed function only has <NAME>_PARAM, the SSM
// SecureString holding it, read once per container. A missing optional secret reads as '' (WEBHOOK_SECRET: unsigned).
export function getSecret(name: SecretName, { optional = false } = {}): Promise<string> {
  const direct = process.env[name];
  if (direct !== undefined) return Promise.resolve(direct);

  let pending = cache.get(name);
  if (!pending) {
    pending = readParameter(name, optional);
    cache.set(name, pending);
    pending.catch(() => cache.delete(name)); // a failed read is retried by the next request
  }
  return pending;
}

async function readParameter(name: SecretName, optional: boolean): Promise<string> {
  const param = process.env[`${name}_PARAM`];
  if (!param) {
    if (optional) return '';
    throw new Error(`Neither ${name} nor ${name}_PARAM is set`);
  }
  ssm ??= new SSMClient({});
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: param, WithDecryption: true }));
    return res.Parameter?.Value ?? '';
  } catch (error) {
    if (optional && (error as Error).name === 'ParameterNotFound') return '';
    throw error;
  }
}
