// Mocha の数値 ID とハッシュ URL は、同じページ内のハッシュ欄で識別する。
export function isMochaSongPath(pathname) {
  return /^\/songs\/(?:\d+|[a-f0-9]{64})\/?$/i.test(pathname);
}

export function findMochaSection(documentRef, title) {
  const sections = Array.from(documentRef.querySelectorAll("main section"))
    .filter((section) => section.querySelector(":scope > h2")?.textContent.trim() === title);
  return sections.length === 1 ? sections[0] : null;
}

function findField(section, labels) {
  const heads = Array.from(section.querySelectorAll("dt"))
    .filter((head) => labels.includes(head.textContent.trim()));
  if (heads.length !== 1 || heads[0].nextElementSibling?.tagName !== "DD") return null;
  return { head: heads[0], cell: heads[0].nextElementSibling };
}

export function getMochaIdentifiers(section) {
  const identifiers = { md5: null, sha256: null, bmsid: null };
  for (const [key, label, pattern] of [
    ["md5", "MD5", /^[a-f0-9]{32}$/i],
    ["sha256", "SHA-256", /^[a-f0-9]{64}$/i],
  ]) {
    const field = findField(section, [label]);
    const input = field?.cell.querySelector('input[id^="song-hash-"]');
    const labelElement = field?.head.querySelector("label");
    const value = input?.value.trim() ?? "";
    if (input && labelElement?.htmlFor === input.id && pattern.test(value)) {
      identifiers[key] = value.toLowerCase();
    }
  }
  return identifiers;
}

export function preserveMochaLevel(section, container) {
  const field = findField(section, ["LEVEL"]);
  if (!field) return;
  const list = section.ownerDocument.createElement("dl");
  const style = section.ownerDocument.createElement("style");
  // 元ページの Tailwind クラスとリセットは Shadow DOM へ届かないため、必要な指定を再現する。
  style.textContent = `
    .bmsie-mocha-level {
      margin: 16px 0 0;
      padding: 24px;
      border-radius: 4px;
      background: #fffdf9;
      color: #2e211b;
      font-size: 14px;
      line-height: 20px;
      box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    }
    .bmsie-mocha-level, .bmsie-mocha-level * {
      font-family: Figtree, ui-sans-serif, system-ui, sans-serif;
    }
    .bmsie-mocha-level dt { margin: 0; color: #6b7280; font-weight: 500; }
    .bmsie-mocha-level dd { margin: 4px 0 0; font-weight: 400; }
    .bmsie-mocha-level .whitespace-nowrap { white-space: nowrap; }
  `;
  list.className = "bmsie-mocha-level";
  list.append(field.head.cloneNode(true), field.cell.cloneNode(true));
  // サイト固有情報は Shadow DOM 内の共通メタデータとは分離する。
  container.shadowRoot.append(style, list);
}

export async function appendMochaFallbackLinks(documentRef, { md5, sha256 }, checkBmsSearchPatternExists) {
  const section = findMochaSection(documentRef, "URL");
  if (!section) {
    console.warn("Mocha: 外部リンクの追加先 URL section が見つかりませんでした");
    return;
  }
  function appendLink(text, href) {
    if (!section.isConnected) return;
    let field = findField(section, ["Other IR", "Other URL"]);
    if (!field) {
      const list = section.querySelector("dl");
      if (!list) return;
      const row = documentRef.createElement("div");
      const head = documentRef.createElement("dt");
      const cell = documentRef.createElement("dd");
      head.className = "font-medium text-gray-500";
      head.textContent = "Other URL";
      cell.className = "mt-1";
      row.append(head, cell);
      list.append(row);
      field = { head, cell };
    }
    if (Array.from(field.cell.querySelectorAll("a")).some((anchor) => anchor.href === href)) return;
    const anchor = documentRef.createElement("a");
    anchor.href = href;
    anchor.textContent = text;
    anchor.className = "text-indigo-600 hover:underline";
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    field.cell.append(documentRef.createTextNode("　"), anchor);
    field.head.textContent = "Other URL";
  }

  if (md5) appendLink("Viewer", `https://bms-score-viewer.pages.dev/view?md5=${md5}`);
  if (sha256 || md5) {
    const query = sha256 ? `sha256=${sha256}` : `md5=${md5}`;
    appendLink("EZ2PATTERN", `https://ez2pattern.kr/bms/chart?${query}`);
  }
  if (sha256) {
    try {
      if (await checkBmsSearchPatternExists(sha256)) {
        appendLink("BMS SEARCH", `https://bmssearch.net/patterns/${sha256}`);
      }
    } catch (error) {
      console.warn("Mocha: BMS SEARCH の存在確認に失敗しました", error);
    }
  }
}
