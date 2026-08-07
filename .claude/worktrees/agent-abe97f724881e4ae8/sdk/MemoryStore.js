const fs = require('fs');
const path = require('path');

class MemoryStore {
  constructor(filePath = path.join(process.cwd(), 'memory', 'agent-memory.json')) {
    this.filePath = filePath;
    this.ensureFile();
  }

  ensureFile() {
    const dir = path.dirname(this.filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({}, null, 2));
    }
  }

  readAll() {
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
  }

  writeAll(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  async get(key) {
    const data = this.readAll();
    return data[key] || null;
  }

  async set(key, value) {
    const data = this.readAll();

    data[key] = {
      value,
      updatedAt: new Date().toISOString(),
    };

    this.writeAll(data);
    return data[key];
  }
}

module.exports = MemoryStore;