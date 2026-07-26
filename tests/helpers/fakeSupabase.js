// Minimal in-memory fake of the @supabase/supabase-js query builder surface used
// by SupabaseWorkflowStore and SupabaseAuditLog. Lets the conformers be tested
// offline (injected via { supabase: makeFakeSupabase() }) while still exercising
// the real insert/upsert/select/eq/gte/lte/order/limit/single/maybeSingle calls.

class FakeQuery {
  constructor(table, tables) {
    this.table = table;
    this.tables = tables;
    this._op = 'select';
    this._payload = null;
    this._onConflict = 'id';
    this._filters = [];
    this._order = null;
    this._limit = null;
  }

  _rows() {
    if (!this.tables.has(this.table)) this.tables.set(this.table, []);
    return this.tables.get(this.table);
  }

  insert(row) { this._op = 'insert'; this._payload = row; return this; }
  upsert(row, opts = {}) { this._op = 'upsert'; this._payload = row; this._onConflict = opts.onConflict || 'id'; return this; }
  select() { return this; }
  eq(col, val) { this._filters.push(r => r[col] === val); return this; }
  gte(col, val) { this._filters.push(r => r[col] >= val); return this; }
  lte(col, val) { this._filters.push(r => r[col] <= val); return this; }
  order(col, { ascending = true } = {}) { this._order = { col, ascending }; return this; }
  limit(n) { this._limit = n; return this; }

  _write() {
    const rows = this._rows();
    if (this._op === 'insert') {
      const row = { ...this._payload };
      if (row.id == null) row.id = rows.length + 1;
      rows.push(row);
      return [row];
    }
    // upsert
    const key = this._onConflict;
    const row = { ...this._payload };
    const idx = rows.findIndex(r => r[key] === row[key]);
    if (idx >= 0) rows[idx] = row; else rows.push(row);
    return [row];
  }

  _read() {
    let rows = this._rows().map(r => ({ ...r }));
    for (const f of this._filters) rows = rows.filter(f);
    if (this._order) {
      const { col, ascending } = this._order;
      rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0));
      if (!ascending) rows.reverse();
    }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return rows;
  }

  _resolve() {
    try {
      const data = (this._op === 'insert' || this._op === 'upsert') ? this._write() : this._read();
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async single() {
    const { data, error } = this._resolve();
    if (error) return { data: null, error };
    return { data: (data && data[0]) || null, error: null };
  }

  async maybeSingle() {
    const { data, error } = this._resolve();
    if (error) return { data: null, error };
    return { data: (data && data[0]) || null, error: null };
  }

  then(resolve, reject) {
    return Promise.resolve(this._resolve()).then(resolve, reject);
  }
}

function makeFakeSupabase() {
  const tables = new Map();
  return {
    from(table) { return new FakeQuery(table, tables); },
    _rows(table) { return tables.get(table) || []; },
  };
}

module.exports = { makeFakeSupabase };
