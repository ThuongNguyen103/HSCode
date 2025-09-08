import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  ArrowLeft,
  Search,
} from "lucide-react";

// Đổi tên biến API Key
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

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
        if (!Array.isArray(data) && !data.children) {
          throw new Error(
            "Invalid JSON structure: Expected an array or object with 'children'"
          );
        }
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
    // Step 1: Call Python backend to get keywords
    const keywordRes = await fetch("https://hscode-backend.onrender.com/api/get-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchQuery,
      }),
    });

    if (!keywordRes.ok) throw new Error(`Keyword extraction failed: ${keywordRes.status}`);
    const keywordData = await keywordRes.json();
    const { objectKeywords, contextKeywords } = keywordData;

    // ... (local pruning logic remains the same)
    const flatData = flattenTree(treeData);
    const candidates = flatData
      .filter((n) => n && n.htsno && n.description)
      .map((n) => ({
        htsno: n.htsno,
        description: n.description,
        fullDescription: getFullDescription(n, treeData),
      }));

    const allKeywords = [...objectKeywords, ...contextKeywords];
    const searchKeywords = allKeywords.join(" ");
    const scored = candidates
      .map((c) => ({
        ...c,
        localSim: searchKeywords
          ? searchKeywords
              .split(" ")
              .filter((kw) => c.fullDescription.toLowerCase().includes(kw))
              .length
          : 0,
      }))
      .sort((a, b) => b.localSim - a.localSim)
      .slice(0, 30);

    // Step 3: Call Python backend to rank results
    const rankingRes = await fetch("https://hscode-backend.onrender.com/api/rank-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        objectKeywords,
        contextKeywords,
        candidates: scored,
      }),
    });

    if (!rankingRes.ok) throw new Error(`Ranking failed: ${rankingRes.status}`);
    const rankingData = await rankingRes.json();
    const topResults = Array.isArray(rankingData.result) ? rankingData.result : [];

    // ... (logic to enrich and set results remains the same)
    const enrichedRank = topResults.map((r) => {
      const found = scored.find((c) => c.htsno === r.htsno);
      return {
        ...r,
        fullDescription: found ? found.fullDescription : r.description,
      };
    });

    setSearchResults(enrichedRank.slice(0, 10));
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
          {/* Thanh tìm kiếm */}
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
            {/* Cột trái: danh sách kết quả */}
            <div className="w-1/3 bg-white border-r overflow-y-auto">
              <h2 className="text-lg font-semibold p-4 border-b">
                Search Results
              </h2>
              {searchResults.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-500 rounded-lg shadow-sm border-collapse">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="w-1/6 px-4 py-2 text-left text-sm font-semibold text-gray-700 border border-gray-500">
                          HS Code
                        </th>
                        <th className="w-1/12 px-4 py-2 text-left text-sm font-semibold text-gray-700 border border-gray-500">
                          Score
                        </th>
                        <th className="w-2/6 px-4 py-2 text-left text-sm font-semibold text-gray-700 border border-gray-500">
                          Full Description
                        </th>
                        <th className="w-3/6 px-4 py-2 text-left text-sm font-semibold text-gray-700 border border-gray-500">
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
                          <td className="px-4 py-2 border border-gray-500 font-semibold text-blue-700 truncate">
                            {result.htsno}
                          </td>
                          <td className="px-4 py-2 border border-gray-500">
                            {result.score}%
                          </td>
                          <td
                            className="px-4 py-2 border border-gray-500"
                            dangerouslySetInnerHTML={{
                              __html: result.fullDescription,
                            }}
                          />
                          <td className="px-4 py-2 border border-gray-500 text-sm text-gray-600 italic">
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

            {/* Cột phải: chi tiết */}
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

              {/* Cây con */}
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

              {/* Mô tả */}
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
