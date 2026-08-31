'use strict';

const { summarizeOutput } = require('../lib/summarize');

describe('summarizeOutput', () => {
  it('leaves short output untouched', () => {
    const text = 'line1\nline2\nline3';
    const result = summarizeOutput(text, { maxLines: 60, maxBytes: 4000 });

    expect(result.truncated).toBe(false);
    expect(result.text).toBe(text);
    expect(result.totalLines).toBe(3);
  });

  it('handles empty output', () => {
    const result = summarizeOutput('');
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('');
    expect(result.totalLines).toBe(0);
  });

  it('truncates output past the line threshold, keeping head and tail', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line${i}`);
    const text = lines.join('\n');

    const result = summarizeOutput(text, { maxLines: 20, maxBytes: 1000000 });

    expect(result.truncated).toBe(true);
    expect(result.totalLines).toBe(200);
    expect(result.text.startsWith('line0\n')).toBe(true);
    expect(result.text.endsWith('line199')).toBe(true);
    expect(result.text).toContain('omitted');
    expect(result.omitted).toBe(200 - 10 - 10);
  });

  it('truncates output past the byte threshold even when line count is small', () => {
    const text = 'x'.repeat(10000);
    const result = summarizeOutput(text, { maxLines: 60, maxBytes: 100 });

    expect(result.truncated).toBe(true);
    expect(result.totalBytes).toBe(10000);
  });

  it('never drops the last line even with an odd max', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `l${i}`);
    const text = lines.join('\n');
    const result = summarizeOutput(text, { maxLines: 5, maxBytes: 1000000 });

    expect(result.text.endsWith('l49')).toBe(true);
    expect(result.omitted).toBe(50 - 3 - 2);
  });
});
