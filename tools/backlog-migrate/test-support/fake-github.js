// In-memory stand-in for lib/github's interface. Records every call so tests
// can assert what WOULD have been written, and can be told to fail the Nth
// write to simulate a crash mid-run.

class FakeGitHub {
  constructor({
    labels = {},
    issues = {},
    version = [2, 98, 0],
    failOnWrite = null,
  } = {}) {
    this.labels = labels; // { repo: [{name,color,description}] }
    this.issues = issues; // { repo: [{number,title,body,state,labels,comments}] }
    this.ver = version;
    this.calls = [];
    this.writes = 0;
    this.failOnWrite = failOnWrite;
  }

  _write(name, args) {
    this.writes++;
    this.calls.push([name, ...args]);
    if (this.failOnWrite && this.writes === this.failOnWrite) {
      throw new Error('simulated crash');
    }
  }

  _repo(r) {
    if (!this.issues[r]) {
      this.issues[r] = [];
    }
    return this.issues[r];
  }

  version() {
    return this.ver;
  }
  listIssues(repo) {
    this.calls.push(['listIssues', repo]);
    return this._repo(repo).map(i => ({ ...i }));
  }
  listPrs() {
    return [];
  }
  listLabels(repo) {
    return (this.labels[repo] || []).map(l => ({ ...l }));
  }
  createLabel(repo, l) {
    this._write('createLabel', [repo, l.name]);
    (this.labels[repo] = this.labels[repo] || []).push({ ...l });
  }
  editLabel(repo, l) {
    this._write('editLabel', [repo, l.name]);
    const x = this.labels[repo].find(y => y.name === l.name);
    Object.assign(x, {
      name: l.newName || l.name,
      color: l.color,
      description: l.description,
    });
  }
  viewIssue(repo, n) {
    return { ...this._repo(repo).find(i => i.number === n) };
  }
  createIssue(repo, { title, body, labels, parent }) {
    this._write('createIssue', [repo, title]);
    const list = this._repo(repo);
    const number = 1000 + list.length;
    list.push({
      number,
      title,
      body,
      state: 'OPEN',
      labels: labels.map(name => ({ name })),
      comments: [],
      parent,
    });
    return {
      number,
      url: `https://github.com/Tessellate-Studio/${repo}/issues/${number}`,
    };
  }
  comment(repo, n, body) {
    this._write('comment', [repo, n]);
    this._repo(repo)
      .find(i => i.number === n)
      .comments.push({ body });
  }
  labelledItems(repo, name) {
    return this._repo(repo)
      .filter(i => i.labels.some(l => l.name === name))
      .map(i => i.number);
  }
  addLabelTo(repo, n, name) {
    this._write('addLabelTo', [repo, n, name]);
    const i = this._repo(repo).find(x => x.number === n);
    if (!i.labels.some(l => l.name === name)) {
      i.labels.push({ name });
    }
  }
  removeLabelFrom(repo, n, name) {
    this._write('removeLabelFrom', [repo, n, name]);
    const i = this._repo(repo).find(x => x.number === n);
    i.labels = i.labels.filter(l => l.name !== name);
  }
  deleteLabel(repo, name) {
    this._write('deleteLabel', [repo, name]);
    this.labels[repo] = this.labels[repo].filter(l => l.name !== name);
    this._repo(repo).forEach(i => {
      i.labels = i.labels.filter(l => l.name !== name);
    });
  }
  addLabels(repo, n, labels) {
    this._write('addLabels', [repo, n, labels.join(',')]);
    const i = this._repo(repo).find(x => x.number === n);
    i.labels.push(...labels.map(name => ({ name })));
  }
  removeLabels(repo, n, labels) {
    this._write('removeLabels', [repo, n, labels.join(',')]);
    const i = this._repo(repo).find(x => x.number === n);
    i.labels = i.labels.filter(l => !labels.includes(l.name));
  }
  closeIssue(repo, n, { reason }) {
    this._write('closeIssue', [repo, n, reason]);
    const i = this._repo(repo).find(x => x.number === n);
    i.state = 'CLOSED';
    i.stateReason = reason;
  }
}

/** A Pacer double: no waiting, same `writes` counter the real one keeps. */
function instantPacer() {
  return {
    writes: 0,
    async write(fn) {
      const out = await fn();
      this.writes++;
      return out;
    },
  };
}

module.exports = { FakeGitHub, instantPacer };
