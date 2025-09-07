import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  ArrowLeft,
  Search,
} from "lucide-react";

function TreeNode({ node, level = 0, onFocusNode }) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isGroup = !node.htsno;

  const handleDoubleClick = useCallback(() => {
    if (hasChildren) {
      onFocusNode(node);
    }
  }, [hasChildren, onFocusNode, node]);

  const handleToggle = useCallback(() => {
    if (hasChildren) {
      setOpen((prev) => !prev);
    }
  }, [hasChildren]);

  const visibleChildren = useMemo(() => {
    return open && hasChildren ? node.children : [];
  }, [open, hasChildren, node.children]);

  return (
    <div style={{ marginLeft: level * 16 }} className="tree-node-wrapper">
      <div
        className="tree-node"
        onClick={handleToggle}
        onDoubleClick={handleDoubleClick}
      >
        <span className="tree-icon">
          {hasChildren ? (
            open ? (
              <ChevronDown size={16} className="text-gray-600" />
            ) : (
              <ChevronRight size={16} className="text-gray-600" />
            )
          ) : (
            <FileText size={16} className="text-gray-400" />
          )}
        </span>

        {isGroup ? (
          <span
            className="tree-group"
            dangerouslySetInnerHTML={{ __html: node.description || "" }}
          />
        ) : (
          <>
            <span className="tree-code">{node.htsno || ""}</span>
            <span
              className="tree-desc"
              dangerouslySetInnerHTML={{ __html: node.description || "" }}
            />
          </>
        )}
      </div>

      {visibleChildren.length > 0 && (
        <div className={`tree-children ${open ? "open" : ""}`}>
          {visibleChildren.map((child, i) => (
            <TreeNode
              key={i}
              node={child}
              level={level + 1}
              onFocusNode={onFocusNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function collectWithParents(path) {
  return path
    .map(
      (n) =>
        `<div><strong>${n.htsno || ""}</strong> ${n.description || ""}</div>`
    )
    .join("");
}

function flattenTree(tree) {
  let flat = [];
  function traverse(node) {
    if (node && typeof node === "object") {
      flat.push(node);
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(traverse);
      }
    }
  }
  tree.forEach(traverse);
  return flat;
}

function findPathToNode(tree, htsno, path = []) {
  for (const node of tree) {
    if (node && typeof node === "object" && node.htsno === htsno) {
      return [...path, node];
    }
    if (node && node.children && Array.isArray(node.children)) {
      const foundPath = findPathToNode(node.children, htsno, [...path, node]);
      if (foundPath) {
        return foundPath;
      }
    }
  }
  return null;
}

// Lấy mô tả đầy đủ từ root đến node
function getFullDescription(node, tree) {
  const path = findPathToNode(tree, node.htsno) || [];
  return path
    .map(
      (n, idx) => `<div style="margin-left:${idx * 12}px">
        <strong>${n.htsno || ""}</strong> ${n.description || ""}
      </div>`
    )
    .join("");
}

async function callOpenAI(messages, model = "gpt-4o-mini") {
  const res = await fetch("/.netlify/functions/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model }),
  });

  const data = await res.json();
  return data.result;
}


export default function TreeViewer() {
  const [treeData, setTreeData] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const resp = await fetch("/hts-full-tree.json");
        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }
        const data = await resp.json();
        setTreeData(Array.isArray(data) ? data : data.children || []);
      } catch (err) {
        setError(err.message);
        setTreeData([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const focusedNode = useMemo(
    () =>
      currentPath.length > 0
        ? currentPath[currentPath.length - 1]
        : { description: "HTS Full Tree", children: treeData },
    [currentPath, treeData]
  );

  const handleFocusNode = useCallback((node) => {
    setCurrentPath((prev) => [...prev, node]);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentPath((prev) => prev.slice(0, -1));
  }, []);

  const memoizedChildren = useMemo(
    () => focusedNode.children || [],
    [focusedNode]
  );

  const handleSearch = useCallback(async () => {
  if (!searchQuery.trim()) {
    setSearchResults([]);
    return;
  }
  setSearchLoading(true);
  setSearchError(null);
  setSearchResults([]);

  try {
    // Step 1: extract keywords
    const extractContent = await callOpenAI([
      {
        role: "system",
        content: `You are an assistant specialized in HS code search.
Return JSON only:
{
  "translated": "...",
  "objectKeywords": ["..."],
  "contextKeywords": ["..."]
}
Rules:
- Extract nouns that represent goods into objectKeywords (coin, horse, textile).
- Extract modifiers, attributes, and historical/cultural references into contextKeywords (gold, ancient, historical, collectible, currency).
- Normalize historical references (e.g., "Ly Thai To" -> "historical", "ancient", "Vietnamese history").`,
              },
      { role: "user", content: searchQuery },
    ]);

    const objectKeywords = (extractContent.objectKeywords || []).map((k) =>
      k.toLowerCase()
    );
    const contextKeywords = (extractContent.contextKeywords || []).map((k) =>
      k.toLowerCase()
    );

    // Step 2: local scoring
    const flatData = flattenTree(treeData);
    const candidates = flatData.filter((n) => n.htsno && n.description);
    const scored = candidates
      .map((c) => ({
        ...c,
        fullDescription: getFullDescription(c, treeData),
        localSim: [...objectKeywords, ...contextKeywords].filter((kw) =>
          getFullDescription(c, treeData).toLowerCase().includes(kw)
        ).length,
      }))
      .sort((a, b) => b.localSim - a.localSim)
      .slice(0, 30);

    // Step 3: GPT ranking
    const topResults = await callOpenAI([
      {
        role: "system",
        content: `You are an assistant that ranks HS code candidates for a search query.

Guidelines:
1. Always prefer the most specific HS code (leaf nodes with longer codes) when multiple candidates match the same keywords.
   - Example: If both "0203.12" and "0203.12.10.10" match, then "0203.12.10.10" MUST have a higher score than its parent "0203.12".
   - Leaf codes should normally score at least 5–10% higher than their parent if both are relevant.
2. Strong match = objectKeywords (e.g., ham, pork leg) + contextKeywords (e.g., chilled, frozen, processed).
3. If contextKeywords contain ["historical","ancient","collectible","currency"], strongly prefer heading 9705 and its children.
4. Medium match = only object or only context.
5. Weak match = only partial or vague relation.
6. Penalize parent/general codes if a more specific child code matches; parent codes should not appear above their children in the ranking.
7. Ignore irrelevant domains (e.g., watches, jewelry) if objectKeywords contain "coin" or "currency".
8. Output only JSON array of top 10 like:
   [{"htsno": "...", "description": "...", "score": 95, "explanation": "..."}]`,
              },
      {
        role: "user",
        content: `ObjectKeywords: ${JSON.stringify(
          objectKeywords
        )}\nContextKeywords: ${JSON.stringify(
          contextKeywords
        )}\nCandidates: ${JSON.stringify(scored)}`,
      },
    ]);

    // Merge fullDescription từ local
    const enrichedRank = topResults.map((r) => {
      const found = scored.find((c) => c.htsno === r.htsno);
      return { ...r, fullDescription: found?.fullDescription || r.description };
    });

    setSearchResults(enrichedRank.slice(0, 10));
  } catch (err) {
    console.error(err);
    setSearchError(err.message);
  } finally {
    setSearchLoading(false);
  }
}, [searchQuery, treeData]);
  
  const handleSelectResult = useCallback(
    (htsno) => {
      const path = findPathToNode(treeData, htsno);
      if (path) {
        setCurrentPath(path.slice(0, -1));
      }
    },
    [treeData]
  );

  return (
    <div className="p-6 h-screen flex flex-col">
      {isLoading ? (
        <div className="loading-spinner">Loading...</div>
      ) : error ? (
        <div className="error-message">Error: {error}</div>
      ) : (
        <>
          {/* Search bar */}
          <div className="mb-6">
            <div className="flex items-center w-full bg-white rounded-xl shadow-md border border-gray-300 overflow-hidden">
              <div className="px-3 text-gray-500">
                <Search size={20} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 Search HS Code (any language)..."
                className="w-[70%] px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ minWidth: "500px" }}
              />
              <button
                onClick={handleSearch}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 font-medium transition-colors duration-200"
                disabled={searchLoading}
              >
                {searchLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>

          {searchError && (
            <div className="error-message mb-4">{searchError}</div>
          )}

          {/* Layout 2 cột */}
          <div className="flex flex-1 border rounded-lg overflow-hidden shadow">
            {/* Left: search results */}
            <div className="w-1/3 bg-white border-r overflow-y-auto">
              <h2 className="text-lg font-semibold p-4 border-b">
                Search Results
              </h2>
              {searchResults.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-500 rounded-lg shadow-sm border-collapse">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-left border">HS Code</th>
                        <th className="px-4 py-2 text-left border">Score</th>
                        <th className="px-4 py-2 text-left border">
                          Full Description
                        </th>
                        <th className="px-4 py-2 text-left border">
                          Explanation
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {searchResults.map((result, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleSelectResult(result.htsno)}
                        >
                          <td className="px-4 py-2 border font-semibold text-blue-700 truncate">
                            {result.htsno}
                          </td>
                          <td className="px-4 py-2 border">{result.score}%</td>
                          <td
                            className="px-4 py-2 border"
                            dangerouslySetInnerHTML={{
                              __html: result.fullDescription,
                            }}
                          />
                          <td className="px-4 py-2 border text-sm text-gray-600 italic">
                            {result.explanation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-gray-500">No results found</div>
              )}
            </div>

            {/* Right: details */}
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="flex items-center mb-4">
                {currentPath.length > 0 && (
                  <button
                    onClick={handleBack}
                    className="flex items-center text-blue-600 hover:underline mr-3 transition-transform duration-200 hover:scale-105"
                  >
                    <ArrowLeft size={18} className="mr-1" /> Back
                  </button>
                )}
                <h1 className="text-2xl font-bold text-gray-800">
                  {focusedNode.htsno || "HTS Full Tree"}
                </h1>
              </div>

              <div className="mb-6">
                {memoizedChildren.length > 0 ? (
                  memoizedChildren.map((node, idx) => (
                    <TreeNode
                      key={idx}
                      node={node}
                      onFocusNode={handleFocusNode}
                    />
                  ))
                ) : (
                  <div className="text-gray-500">No data available</div>
                )}
              </div>

              <div className="bg-white border rounded-lg shadow p-4">
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <div
                  className="text-gray-700"
                  dangerouslySetInnerHTML={{
                    __html: collectWithParents(currentPath),
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}







