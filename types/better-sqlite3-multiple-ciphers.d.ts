// better-sqlite3-multiple-ciphers is API-compatible with better-sqlite3 and
// ships no types of its own here — map it onto @types/better-sqlite3.
declare module "better-sqlite3-multiple-ciphers" {
  import Database = require("better-sqlite3");
  export = Database;
}
