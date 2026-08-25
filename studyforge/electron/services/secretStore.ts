import keytar from "keytar";

const SERVICE_NAME = "StudyForge";
const ACCOUNT_DEEPSEEK = "deepseek-api-key";

/**
 * Unico punto di accesso alla API key DeepSeek. La chiave vive solo nel
 * Keychain macOS (via keytar): non viene mai scritta su SQLite, mai loggata,
 * mai esposta al renderer.
 */
export async function saveDeepSeekApiKey(apiKey: string): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, ACCOUNT_DEEPSEEK, apiKey);
}

export async function getDeepSeekApiKey(): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, ACCOUNT_DEEPSEEK);
}

export async function clearDeepSeekApiKey(): Promise<void> {
  await keytar.deletePassword(SERVICE_NAME, ACCOUNT_DEEPSEEK);
}

export async function hasDeepSeekApiKey(): Promise<boolean> {
  const key = await getDeepSeekApiKey();
  return Boolean(key && key.length > 0);
}
