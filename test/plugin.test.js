const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

// the page the plugin rewrites comes from a real claude-limits clone
const REPO = process.env.CLAUDE_LIMITS_REPO || path.join(process.env.HOME, 'claude-limits');

class Plugin {
  constructor(app, data) { this.app = app; this.data = data; }
  async loadData() { return this.data; }
  registerView(type, make) { this.make = make; }
  addRibbonIcon() {}
  addCommand() {}
  registerObsidianProtocolHandler() {}
}
class ItemView {
  constructor(leaf) {
    this.app = leaf.app;
    this.contentEl = {
      style: {}, empty() {},
      createEl: () => (this.frame = { addEventListener() {} }),
    };
  }
}
const load = Module._load;
Module._load = (req, ...rest) => req === 'obsidian' ? { Plugin, ItemView } : load(req, ...rest);
const ClaudeLimits = require('../main.js');

function vault(files) {
  return { vault: { adapter: {
    list: async dir => ({ files: Object.keys(files).filter(f => f.startsWith(dir + '/')) }),
    read: async p => { if (!(p in files)) throw new Error(`no ${p}`); return files[p]; },
  } } };
}
async function page(folder, data) {
  const files = {
    [`${folder}/index.html`]: fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'),
    [`${folder}/limits.js`]: fs.readFileSync(path.join(REPO, 'limits.js'), 'utf8'),
    [`${folder}/hw.js`]: 'S.push({"ts":1});',
  };
  const app = vault(files);
  const plugin = new ClaudeLimits(app, data);
  await plugin.onload();
  const view = plugin.make({ app });
  await view.show();
  return view.frame.srcdoc;
}

test('the page loads its scripts from the shim, not from app://', async () => {
  const doc = await page('claude-limits', null);
  assert.ok(!doc.includes('<script src="limits.js"></script>'));
  assert.ok(doc.includes('const FILES = '));
  assert.ok(doc.includes('S.push({\\"ts\\":1});'));
});

test('the query comes in without location.search', async () => {
  const doc = await page('claude-limits', null);
  assert.ok(!doc.includes('new URLSearchParams(location.search)'));
  assert.ok(doc.includes('new URLSearchParams("reset=countdown")'));
});

test('the folder comes from data.json', async () => {
  const doc = await page('_claude/claude-limits', { folder: '_claude/claude-limits' });
  assert.ok(doc.includes('const FILES = '));
});
