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

// ----------- GỌI OPENAI QUA NETLIFY FUNCTION -----------
async function callOpenAI(payload) {
  const resp = await fetch("/.netlify/functions/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://api.openai.com/v1/chat/completions",
      payload,
    }),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI proxy failed: ${resp.status}`);
  }

  const data = await resp.json();
  return data.content; // chỉ lấy phần text content trả về
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
      // Step 1: gọi GPT để phân tích keywords
      const extractContent = await callOpenAI({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an HS code expert. Extract the main object and context keywords. 
Output JSON like: {"objectKeywords": [...], "contextKeywords": [...]}`
          },
          { role: "user", content: searchQuery },
        ],
        temperature: 0,
      });

      const parsedExtract = JSON.parse(extractContent);
      const objectKeywords = (parsedExtract.objectKeywords || []).map((k) =>
        k.toLowerCase()
      );
      const contextKeywords = (parsedExtract.contextKeywords || []).map((k) =>
        k.toLowerCase()
      );

      // Step 2: lọc và chấm điểm local
      const flatData = flattenTree(treeData);
      const candidates = flatData.filter((n) => n.htsno && n.description);

      const scored = candidates.map((c) => {
        const fullDescription = getFullDescription(c, treeData);
        const allKeywords = [...objectKeywords, ...contextKeywords];
        const matchCount = allKeywords.filter((kw) =>
          fullDescription.toLowerCase().includes(kw)
        ).length;
        return { ...c, fullDescription, localSim: matchCount };
      });

      const topCandidates = scored
        .sort((a, b) => b.localSim - a.localSim)
        .slice(0, 30);

      // Step 3: Gọi GPT để xếp hạng
      const rankContent = await callOpenAI({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Rank HS code candidates for this query.
Output JSON array of top 10:
[{"htsno":"...","description":"...","score":95,"explanation":"..."}]`,
          },
          {
            role: "user",
            content: `ObjectKeywords: ${JSON.stringify(
              objectKeywords
            )}\nContextKeywords: ${JSON.stringify(
              contextKeywords
            )}\nCandidates: ${JSON.stringify(topCandidates)}`,
          },
        ],
        temperature: 0,
        max_tokens: 1000,
      });

      const parsedRank = JSON.parse(rankContent);
      setSearchResults(parsedRank.slice(0, 10));
    } catch (err) {
      console.error("Search error:", err);
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
