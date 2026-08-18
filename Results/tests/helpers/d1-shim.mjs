// Results/tests/helpers/d1-shim.mjs
//
// A minimal D1-compatible wrapper around node:sqlite's DatabaseSync,
// covering only the slice of the API this project's repository.js and
// scheduler.js actually call: prepare().bind().run()/.all()/.first(), and
// db.batch(). Lets tests run the real migration SQL and the real
// repository/scheduler code against a genuine in-memory SQLite database
// instead of hand-rolling mock query results.

export function wrapD1(sqliteDb, { onQuery } = {}) {
  function bound(sql, args) {
    return {
      async run() {
        onQuery?.(sql);
        const info = sqliteDb.prepare(sql).run(...args);
        return { meta: { last_row_id: Number(info.lastInsertRowid), changes: Number(info.changes) } };
      },
      async all() {
        onQuery?.(sql);
        return { results: sqliteDb.prepare(sql).all(...args) };
      },
      async first() {
        onQuery?.(sql);
        return sqliteDb.prepare(sql).get(...args) ?? null;
      },
    };
  }
  return {
    prepare(sql) {
      return { bind: (...args) => bound(sql, args) };
    },
    async batch(statements) {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    },
  };
}
