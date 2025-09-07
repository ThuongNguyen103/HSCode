import fs from "fs";
import path from "path";
import fetch from "node-fetch"; // npm install node-fetch
import { fileURLToPath } from "url";

// __dirname tương đương trong ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://hts.usitc.gov/reststop";

function buildHtsTree(data) {
  const roots = [];
  const stack = [];

  for (const item of data) {
    const currentDepth = Number.parseInt(item.indent, 10) || 0;

    while (stack.length && stack[stack.length - 1].indent >= currentDepth) {
      stack.pop();
    }

    const node = {
      htsno: item.htsno || "",
      description: item.description || "",
      indent: currentDepth,
      children: []
    };

    if (stack.length) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return roots;
}

async function fetchDocs(docNumber) {
  let merged = [];

  for (let i = 1; i <= docNumber; i++) {
    try {
      const rangeUrl = `${BASE_URL}/ranges?docNumber=${i}`;
      const rangeResp = await fetch(rangeUrl);
      if (!rangeResp.ok) throw new Error(`Lỗi lấy range doc ${i}`);
      const rangeData = await rangeResp.json();

      const from = rangeData.Starting_Number;
      const to = rangeData.Ending_Number;
      console.log(`📥 Doc ${i}: ${from} → ${to}`);

      const exportUrl = `${BASE_URL}/exportList?from=${from}&to=${to}&format=JSON&styles=true`;
      const exportResp = await fetch(exportUrl);
      if (!exportResp.ok) throw new Error(`Lỗi exportList doc ${i}`);
      const exportData = await exportResp.json();

      const tree = buildHtsTree(exportData);
      merged = merged.concat(tree);
    } catch (err) {
      console.error(`❌ Lỗi doc ${i}:`, err.message);
    }
  }

  const outPath = path.join(__dirname, "../public/hts-full-tree.json");
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`✅ Đã lưu full tree vào ${outPath}`);
}

// chạy: node src/scripts/fetch-hts.js 10
const docNumber = parseInt(process.argv[2] || "1", 10);
fetchDocs(docNumber);
