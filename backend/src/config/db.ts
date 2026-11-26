import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import os from "os";
import fs from 'fs';

dotenv.config({ path: [path.resolve(__dirname, '../../.env.local'), path.resolve(__dirname, '../../.env')] });

const isProduction = process.env.NODE_ENV === "production";
const dbUrl = (process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim())
  ?.replace(/^postgresql:/i, "postgres:");
const isPostgres = !!dbUrl && /^postgres:/i.test(dbUrl);

// Default to the demo database, including after a deploy without the local .env.
// A stale DATABASE_URL must not silently reconnect the demo to a deleted MySQL host.
const externalDbRequested =
  process.env.USE_MOCK_DB === "false" ||
  ["mysql", "postgres", "postgresql"].includes(process.env.DATABASE_TYPE || "") ||
  isPostgres;
const useMockDb =
  process.env.USE_MOCK_DB === "true" ||
  process.env.DATABASE_TYPE === "mock" ||
  !externalDbRequested ||
  !dbUrl ||
  dbUrl.startsWith("sqlite");

const explicitMock = process.env.USE_MOCK_DB === 'true' || process.env.DATABASE_TYPE === 'mock';
if (!explicitMock && externalDbRequested && (!dbUrl || dbUrl.startsWith('sqlite'))) {
  throw new Error('An external database was requested, but DATABASE_URL or POSTGRES_URL is missing or is a SQLite URL.');
}
if (useMockDb && process.env.REQUIRE_PERSISTENT_DB === 'true' && process.env.NODE_ENV !== 'test') {
  throw new Error('REQUIRE_PERSISTENT_DB=true requires an external PostgreSQL/MySQL database. SQLite demo storage cannot persist data across hosting restarts.');
}

let sequelize: Sequelize;

if (useMockDb) {
  const sqlitePath = process.env.SQLITE_STORAGE || (isProduction
    ? path.join(os.tmpdir(), "heartconnect.sqlite")
    : path.resolve(__dirname, "../../Database/dating_app.sqlite"));
  console.log(`[Database] Using Mock Database (SQLite) at: ${sqlitePath}`);
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: sqlitePath,
    logging: false,
  });
} else {
  if (["postgres", "postgresql"].includes(process.env.DATABASE_TYPE || "") && !isPostgres) {
    throw new Error("DATABASE_TYPE=postgres requires a PostgreSQL DATABASE_URL or POSTGRES_URL.");
  }
  const localCaPath = path.resolve(__dirname, '../../aiven-ca.pem');
  const caFile = process.env.DATABASE_SSL_CA_FILE?.trim();
  const postgresCa = process.env.DATABASE_SSL_CA?.trim().replace(/\\n/g, "\n") ||
    (caFile ? fs.readFileSync(path.resolve(__dirname, '../..', caFile), 'utf8') :
      isPostgres && dbUrl.includes('aivencloud') && fs.existsSync(localCaPath) ? fs.readFileSync(localCaPath, 'utf8') : undefined);
  const needsSsl =
    isProduction ||
    !!postgresCa ||
    dbUrl.includes("aivencloud") ||
    dbUrl.includes("render");

  let connectionUrl = dbUrl;
  if (isPostgres && postgresCa) {
    // URI sslmode would otherwise replace the explicit CA options in node-postgres.
    const parsed = new URL(connectionUrl);
    parsed.searchParams.delete('sslmode');
    connectionUrl = parsed.toString();
  }
  sequelize = new Sequelize(connectionUrl, {
    // Static loading lets Vercel trace the PostgreSQL driver into the function bundle.
    ...(isPostgres ? { dialectModule: require('pg') } : {}),
    logging: false,
    pool: {
      max: isPostgres ? 2 : 10,
      min: isPostgres ? 0 : 2,
      acquire: 30000,
      idle: isPostgres ? 1000 : 10000,
    },
    dialectOptions: {
      ...(needsSsl ? { ssl: {
        require: true,
        rejectUnauthorized: isPostgres,
        ...(isPostgres && postgresCa ? { ca: postgresCa } : {}),
      } } : {}),
      ...(isPostgres ? { connectionTimeoutMillis: 15000, statement_timeout: 60000 } : {}),
    },
  });
}

export default sequelize;
