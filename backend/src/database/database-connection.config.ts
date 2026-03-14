import { URL } from 'node:url';

type ReadConfigValue = (key: string, defaultValue?: string) => string | undefined;

const resolveDatabaseUrl = (readConfigValue: ReadConfigValue): string | undefined => {
  const databaseUrl = readConfigValue('DATABASE_URL');
  if (!databaseUrl) {
    return undefined;
  }

  const hostOverride = readConfigValue('DB_HOST');
  const portOverride = readConfigValue('DB_PORT');

  if (!hostOverride && !portOverride) {
    return databaseUrl;
  }

  const resolvedUrl = new URL(databaseUrl);

  if (hostOverride) {
    resolvedUrl.hostname = hostOverride;
  }

  if (portOverride) {
    resolvedUrl.port = portOverride;
  }

  return resolvedUrl.toString();
};

export const resolveSslConfig = (readConfigValue: ReadConfigValue) => {
  const dbSsl = readConfigValue('DB_SSL', 'false') === 'true';
  if (!dbSsl) {
    return false;
  }

  const rejectUnauthorized =
    readConfigValue('DB_SSL_REJECT_UNAUTHORIZED') !== undefined
      ? readConfigValue('DB_SSL_REJECT_UNAUTHORIZED', 'true') === 'true'
      : readConfigValue('NODE_ENV', 'development') === 'production';

  return { rejectUnauthorized };
};

export const getDatabaseConnectionConfig = (readConfigValue: ReadConfigValue) => {
  const databaseUrl = resolveDatabaseUrl(readConfigValue);
  const hasDatabaseUrl = !!databaseUrl;

  return {
    type: 'postgres' as const,
    url: databaseUrl,
    host: hasDatabaseUrl ? undefined : readConfigValue('DB_HOST', 'localhost'),
    port: hasDatabaseUrl ? undefined : Number(readConfigValue('DB_PORT', '5432')),
    username: hasDatabaseUrl ? undefined : readConfigValue('DB_USER', 'postgres'),
    password: hasDatabaseUrl ? undefined : readConfigValue('DB_PASSWORD', 'postgres'),
    database: hasDatabaseUrl ? undefined : readConfigValue('DB_NAME', 'plotwise'),
    ssl: resolveSslConfig(readConfigValue),
  };
};