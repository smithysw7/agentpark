// 统一输出：--json 时输出机器可读 JSON，否则输出人类可读表格

export function emit(payload, asJson, pretty) {
  if (asJson) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    for (const line of pretty()) console.log(line);
  }
}

// 中文按 2 列宽计算，保证表格对齐
export function displayWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += ch.codePointAt(0) > 0x2e7f ? 2 : 1;
  return w;
}

function padEnd(s, w) {
  return String(s) + ' '.repeat(Math.max(0, w - displayWidth(s)));
}

export function renderTable(headers, rows) {
  const widths = headers.map((h) => displayWidth(h));
  for (const r of rows) {
    r.forEach((c, i) => {
      widths[i] = Math.max(widths[i], displayWidth(c == null ? '' : c));
    });
  }
  const line = (cells) => cells.map((c, i) => padEnd(c == null ? '' : c, widths[i])).join('  ');
  return [line(headers), ...rows.map((r) => line(r))];
}
