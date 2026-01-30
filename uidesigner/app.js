/* app.js — RBLX UI Designer (v3)
   What changed (per your feedback):
   ✅ Backspace NEVER deletes (only Delete / Del key, or context menu delete)
   ✅ Explorer now behaves much closer to Roblox Studio:
      - Drag ABOVE / BELOW an item to reorder inside the same parent (updates ZIndex)
      - Drag INTO a Frame/ScrollingFrame row to parent it (updates parentId)
      - Move Up / Move Down buttons also reorder
      - Context menu also includes Move Up / Move Down
   ✅ UI Objects list includes the Studio ones you showed (and exports them):
      UIAspectRatioConstraint, UICorner, UIGradient, UIGridLayout, UIListLayout, UIPadding,
      UIPageLayout, UIScale, UISizeConstraint, UIStroke, UITableLayout, UITextSizeConstraint
      (plus optional UIFlexLayout if you kept it in HTML)
   ✅ Canvas parenting still works: drop an object onto a Frame/ScrollingFrame in the canvas to parent

   Notes:
   - Explorer reorder = ZIndex order within the SAME parent (like the main “on top” ordering)
   - We store positions as anchor-position within parent space (x,y), so parenting is stable.
*/

(() => {
  "use strict";

  // -------------------- Helpers --------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (n) => Math.round(n);
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
    if (!m) return { r: 255, g: 255, b: 255 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function rgbToHex(r, g, b) {
    const h = (x) => clamp(x, 0, 255).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function escapeLuaString(s) {
    return String(s ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }
  function safeLuaIdent(name) {
    const cleaned = String(name || "")
      .replace(/[^\w]/g, "_")
      .replace(/^(\d)/, "_$1");
    return cleaned || "node";
  }

  // -------------------- DOM --------------------
  const canvasOuter = $("#canvasOuter");
  const canvas = $("#canvas");
  const explorer = $("#explorer");

  const guiNameEl = $("#guiName");
  const resetOnSpawnEl = $("#resetOnSpawn");
  const guiParentEl = $("#guiParent");
  const outputModeEl = $("#outputMode");

  const btnNew = $("#btnNew");
  const btnSave = $("#btnSave");
  const btnLoad = $("#btnLoad");
  const btnExport = $("#btnExport");
  const btnCopy = $("#btnCopy");
  const btnDownload = $("#btnDownload");
  const btnDuplicate = $("#btnDuplicate");

  const btnMoveUp = $("#btnMoveUp");
  const btnMoveDown = $("#btnMoveDown");

  const exportBox = $("#exportBox");

  const emptyProps = $("#emptyProps");
  const propsWrap = $("#props");

  const propName = $("#propName");
  const propParent = $("#propParent");
  const propX = $("#propX");
  const propY = $("#propY");
  const propW = $("#propW");
  const propH = $("#propH");
  const propAnchor = $("#propAnchor");
  const propZIndex = $("#propZIndex");

  const propBgColor = $("#propBgColor");
  const propBgAlpha = $("#propBgAlpha");
  const propBgAlphaLabel = $("#propBgAlphaLabel");
  const propBorder = $("#propBorder");

  const propText = $("#propText");
  const propTextColor = $("#propTextColor");
  const propTextScaled = $("#propTextScaled");
  const propFont = $("#propFont");

  const propImage = $("#propImage");

  const propCanvasW = $("#propCanvasW");
  const propCanvasH = $("#propCanvasH");
  const propScrollBar = $("#propScrollBar");

  const uiObjectsList = $("#uiObjectsList");

  const chkSafeArea = $("#chkSafeArea");
  const safeArea = $("#safeArea");
  const zoom = $("#zoom");
  const zoomLabel = $("#zoomLabel");

  const statusLeft = $("#statusLeft");
  const statusRight = $("#statusRight");

  // toolbox tabs
  const tabInstances = $("#tabInstances");
  const tabUiObjects = $("#tabUiObjects");
  const toolboxInstances = $("#toolboxInstances");
  const toolboxUiObjects = $("#toolboxUiObjects");

  // context menu
  const ctxMenu = $("#ctxMenu");
  const ctxDelete = $("#ctxDelete");
  const ctxDuplicate = $("#ctxDuplicate");
  const ctxMoveUp = $("#ctxMoveUp");
  const ctxMoveDown = $("#ctxMoveDown");

  // -------------------- Canvas size --------------------
  const CANVAS_W = 980;
  const CANVAS_H = 620;
  canvas.style.width = `${CANVAS_W}px`;
  canvas.style.height = `${CANVAS_H}px`;

  // -------------------- State --------------------
  const STORAGE_KEY = "rblx-ui-designer:v3";

  const state = {
    project: {
      guiName: "HelloWorldGui",
      resetOnSpawn: false,
      parent: "PlayerGui",
      outputMode: "variables",
    },
    nodes: [],
    selectedId: null,
    zoom: 1,
    showSafeArea: false,
  };

  // -------------------- Type helpers --------------------
  const isContainer = (n) => n && (n.type === "Frame" || n.type === "ScrollingFrame");
  const isTextType = (n) => n && (n.type === "TextLabel" || n.type === "TextButton" || n.type === "TextBox");
  const isImageType = (n) => n && (n.type === "ImageLabel" || n.type === "ImageButton");

  function byId() {
    return new Map(state.nodes.map((n) => [n.id, n]));
  }

  function childrenMap() {
    const m = new Map();
    for (const n of state.nodes) {
      const pid = n.parentId || "ROOT";
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid).push(n.id);
    }
    // stable sort by zIndex
    for (const [pid, ids] of m.entries()) {
      ids.sort((a, b) => ((getNode(a)?.zIndex ?? 1) - (getNode(b)?.zIndex ?? 1)));
    }
    return m;
  }

  function getNode(id) {
    return state.nodes.find((n) => n.id === id) || null;
  }

  function parentSize(pid, map) {
    if (pid === "ROOT") return { w: CANVAS_W, h: CANVAS_H };
    const p = map.get(pid);
    return p ? { w: p.w, h: p.h } : { w: CANVAS_W, h: CANVAS_H };
  }

  function clampInParent(n, map) {
    const pid = n.parentId || "ROOT";
    const ps = parentSize(pid, map);

    n.w = clamp(round(n.w), 20, ps.w);
    n.h = clamp(round(n.h), 20, ps.h);

    const minX = n.anchorX * n.w;
    const maxX = ps.w - (1 - n.anchorX) * n.w;
    const minY = n.anchorY * n.h;
    const maxY = ps.h - (1 - n.anchorY) * n.h;

    n.x = clamp(round(n.x), minX, maxX);
    n.y = clamp(round(n.y), minY, maxY);
  }

  function absTopLeft(id, map) {
    const n = map.get(id);
    if (!n) return { x: 0, y: 0 };
    const pid = n.parentId || "ROOT";
    const pTL = pid === "ROOT" ? { x: 0, y: 0 } : absTopLeft(pid, map);
    return {
      x: pTL.x + (n.x - n.anchorX * n.w),
      y: pTL.y + (n.y - n.anchorY * n.h),
    };
  }

  function absAnchor(id, map) {
    const n = map.get(id);
    if (!n) return { x: 0, y: 0 };
    const pid = n.parentId || "ROOT";
    const pTL = pid === "ROOT" ? { x: 0, y: 0 } : absTopLeft(pid, map);
    return { x: pTL.x + n.x, y: pTL.y + n.y };
  }

  function isDescendant(maybeChildId, maybeParentId) {
    let cur = getNode(maybeChildId);
    while (cur) {
      const pid = cur.parentId || "ROOT";
      if (pid === maybeParentId) return true;
      if (pid === "ROOT") return false;
      cur = getNode(pid);
    }
    return false;
  }

  function setStatus(left, right = "") {
    if (typeof left === "string") statusLeft.textContent = left;
    if (typeof right === "string") statusRight.textContent = right;
  }

  function selectNode(id) {
    state.selectedId = id;
    const n = getNode(id);
    if (n) setStatus(`Selected: ${n.type} (${n.name || n.type})`, `x:${n.x} y:${n.y} w:${n.w} h:${n.h} z:${n.zIndex ?? 1}`);
    else setStatus("Ready.", "");
    render();
  }

  function clearSelection() {
    state.selectedId = null;
    setStatus("Ready.", "");
    render();
  }

  // -------------------- Defaults --------------------
  function defaultProject() {
    const textId = uid();
    return {
      project: {
        guiName: "HelloWorldGui",
        resetOnSpawn: false,
        parent: "PlayerGui",
        outputMode: "variables",
      },
      nodes: [
        {
          id: textId,
          type: "TextLabel",
          name: "TextLabel",
          parentId: "ROOT",
          x: round(CANVAS_W * 0.5),
          y: round(CANVAS_H * 0.5),
          w: 300,
          h: 100,
          anchorX: 0.5,
          anchorY: 0.5,
          zIndex: 1,
          bgColor: { r: 30, g: 30, b: 30 },
          bgAlpha: 1,
          border: false,
          text: "hello world",
          textColor: { r: 255, g: 255, b: 255 },
          textScaled: true,
          font: "SourceSansBold",
          image: "",
          canvasSize: { w: 0, h: 0 },
          scrollBarThickness: 6,
          uiObjects: [],
        },
      ],
      selectedId: textId,
      zoom: 1,
      showSafeArea: false,
    };
  }

  // -------------------- Creation --------------------
  function nextZIndex(parentId) {
    const siblings = state.nodes.filter((n) => (n.parentId || "ROOT") === parentId);
    const max = siblings.reduce((acc, n) => Math.max(acc, n.zIndex ?? 1), 0);
    return max + 1;
  }

  function makeNode(type, parentId = "ROOT") {
    const map = byId();
    const ps = parentSize(parentId, map);

    const base = {
      id: uid(),
      type,
      name: type,
      parentId,

      x: round(ps.w * 0.5),
      y: round(ps.h * 0.5),
      w: 240,
      h: 90,
      anchorX: 0.5,
      anchorY: 0.5,
      zIndex: nextZIndex(parentId),

      bgColor: { r: 50, g: 50, b: 55 },
      bgAlpha: 1,
      border: false,

      text: "",
      textColor: { r: 255, g: 255, b: 255 },
      textScaled: true,
      font: "SourceSansBold",

      image: "",

      canvasSize: { w: 0, h: 0 },
      scrollBarThickness: 6,

      uiObjects: [],
    };

    if (type === "Frame") {
      base.w = 320; base.h = 180;
      base.bgColor = { r: 38, g: 38, b: 44 };
    }
    if (type === "ScrollingFrame") {
      base.w = 360; base.h = 220;
      base.bgColor = { r: 35, g: 35, b: 42 };
      base.canvasSize = { w: 520, h: 360 };
      base.scrollBarThickness = 8;
    }
    if (type === "TextLabel") {
      base.w = 300; base.h = 100;
      base.bgColor = { r: 30, g: 30, b: 30 };
      base.text = "TextLabel";
    }
    if (type === "TextButton") {
      base.w = 280; base.h = 90;
      base.bgColor = { r: 48, g: 48, b: 58 };
      base.text = "Button";
      base.border = true;
    }
    if (type === "TextBox") {
      base.w = 320; base.h = 80;
      base.bgColor = { r: 28, g: 28, b: 34 };
      base.text = "Type here…";
      base.border = true;
    }
    if (type === "ImageLabel" || type === "ImageButton") {
      base.w = 280; base.h = 180;
      base.bgColor = { r: 26, g: 26, b: 32 };
      base.border = (type === "ImageButton");
    }
    if (type === "ViewportFrame") {
      base.w = 320; base.h = 220;
      base.bgColor = { r: 22, g: 22, b: 28 };
      base.border = true;
    }

    clampInParent(base, map);
    return base;
  }

  function createNode(type) {
    const node = makeNode(type, "ROOT");
    state.nodes.push(node);
    selectNode(node.id);
  }

  // -------------------- UI Objects --------------------
  const SUPPORTED_UI_OBJECTS = new Set([
    "UIAspectRatioConstraint",
    "UICorner",
    "UIGradient",
    "UIGridLayout",
    "UIListLayout",
    "UIPadding",
    "UIPageLayout",
    "UIScale",
    "UISizeConstraint",
    "UIStroke",
    "UITableLayout",
    "UITextSizeConstraint",
    // optional extras if you have them in HTML
    "UIFlexLayout",
  ]);

  function addUiObject(type) {
    if (!SUPPORTED_UI_OBJECTS.has(type)) {
      setStatus(`UI Object not supported yet: ${type}`, "");
      return;
    }
    if (!state.selectedId) {
      setStatus("Select an instance first to add UI Objects.", "");
      return;
    }
    const n = getNode(state.selectedId);
    if (!n) return;

    n.uiObjects = n.uiObjects || [];
    const obj = { id: uid(), type, props: {} };

    // defaults (exported)
    if (type === "UICorner") obj.props = { cornerRadius: 8 };
    if (type === "UIStroke") obj.props = { thickness: 2, color: { r: 255, g: 255, b: 255 }, transparency: 0.2 };
    if (type === "UITextSizeConstraint") obj.props = { minTextSize: 8, maxTextSize: 48 };
    if (type === "UISizeConstraint") obj.props = { minW: 0, minH: 0, maxW: 0, maxH: 0 };
    if (type === "UIAspectRatioConstraint") obj.props = { aspectRatio: 1.0 };
    if (type === "UIScale") obj.props = { scale: 1.0 };
    if (type === "UIPadding") obj.props = { left: 0, right: 0, top: 0, bottom: 0 };

    n.uiObjects.push(obj);
    setStatus(`Added ${type} to ${n.name || n.type}.`, "");
    render();
  }

  function removeUiObject(nodeId, uiId) {
    const n = getNode(nodeId);
    if (!n) return;
    n.uiObjects = (n.uiObjects || []).filter((o) => o.id !== uiId);
    setStatus("Removed UI Object.", "");
    render();
  }

  // -------------------- Parenting / Ordering --------------------
  function reparentNode(nodeId, newParentId) {
    const map = byId();
    const n = map.get(nodeId);
    if (!n) return;

    const oldParent = n.parentId || "ROOT";
    if (oldParent === newParentId) return;

    // keep world anchor constant
    const worldA = absAnchor(nodeId, map);
    n.parentId = newParentId;

    const newParentTL = newParentId === "ROOT" ? { x: 0, y: 0 } : absTopLeft(newParentId, map);
    n.x = worldA.x - newParentTL.x;
    n.y = worldA.y - newParentTL.y;

    // set to top of new parent
    n.zIndex = nextZIndex(newParentId);

    clampInParent(n, map);
    normalizeZIndices(newParentId);
    normalizeZIndices(oldParent);
  }

  function siblingsOf(id) {
    const n = getNode(id);
    if (!n) return [];
    const pid = n.parentId || "ROOT";
    return state.nodes
      .filter((x) => (x.parentId || "ROOT") === pid)
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
  }

  function normalizeZIndices(parentId) {
    const sibs = state.nodes
      .filter((x) => (x.parentId || "ROOT") === parentId)
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
    sibs.forEach((n, i) => (n.zIndex = i + 1));
  }

  // Insert dragId before/after targetId in target's parent
  function reorderRelative(dragId, targetId, pos /* "above"|"below" */) {
    const drag = getNode(dragId);
    const target = getNode(targetId);
    if (!drag || !target) return;

    const pid = target.parentId || "ROOT";

    // Ensure drag is in same parent
    if ((drag.parentId || "ROOT") !== pid) {
      reparentNode(dragId, pid);
    }

    const sibs = state.nodes
      .filter((x) => (x.parentId || "ROOT") === pid)
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));

    const dIdx = sibs.findIndex((n) => n.id === dragId);
    const tIdx = sibs.findIndex((n) => n.id === targetId);
    if (dIdx === -1 || tIdx === -1) return;

    const [item] = sibs.splice(dIdx, 1);

    let insertAt = tIdx;
    if (pos === "below") insertAt = tIdx + (dIdx < tIdx ? 0 : 1);
    if (pos === "above") insertAt = tIdx + (dIdx < tIdx ? -1 : 0);
    insertAt = clamp(insertAt, 0, sibs.length);

    sibs.splice(insertAt, 0, item);
    sibs.forEach((n, i) => (n.zIndex = i + 1));
  }

  function moveUpSelected() {
    const id = state.selectedId;
    if (!id) return;
    const sibs = siblingsOf(id);
    const idx = sibs.findIndex((n) => n.id === id);
    if (idx <= 0) return;
    // swap with previous
    const a = sibs[idx - 1];
    const b = sibs[idx];
    const z = a.zIndex;
    a.zIndex = b.zIndex;
    b.zIndex = z;
    normalizeZIndices(b.parentId || "ROOT");
    render();
  }

  function moveDownSelected() {
    const id = state.selectedId;
    if (!id) return;
    const sibs = siblingsOf(id);
    const idx = sibs.findIndex((n) => n.id === id);
    if (idx === -1 || idx >= sibs.length - 1) return;
    const a = sibs[idx];
    const b = sibs[idx + 1];
    const z = a.zIndex;
    a.zIndex = b.zIndex;
    b.zIndex = z;
    normalizeZIndices(a.parentId || "ROOT");
    render();
  }

  // -------------------- Render (Canvas + Explorer + Properties) --------------------
  function fontToCss(font) {
    switch (font) {
      case "Gotham":
      case "GothamBold":
        return "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      case "Arial":
        return "Arial, system-ui, sans-serif";
      case "Code":
        return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      default:
        return "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    }
  }
  function cssWeightForFont(font) {
    if (font === "SourceSansBold" || font === "GothamBold") return "700";
    return "500";
  }

  function render() {
    guiNameEl.value = state.project.guiName;
    resetOnSpawnEl.value = String(state.project.resetOnSpawn);
    guiParentEl.value = state.project.parent;
    outputModeEl.value = state.project.outputMode;

    canvasOuter.style.setProperty("--zoom", String(state.zoom));
    zoom.value = String(Math.round(state.zoom * 100));
    zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    safeArea.hidden = !state.showSafeArea;

    // ----- Canvas
    canvas.innerHTML = "";
    const map = byId();
    const ch = childrenMap();

    const makeNodeDom = (n) => {
      const el = document.createElement("div");
      el.className = `node node-${n.type.toLowerCase()}${n.id === state.selectedId ? " selected" : ""}`;
      el.dataset.id = n.id;

      // anchor-based positioning
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.style.width = `${n.w}px`;
      el.style.height = `${n.h}px`;
      el.style.transform = `translate(${-n.anchorX * 100}%, ${-n.anchorY * 100}%)`;
      el.style.zIndex = String(n.zIndex ?? 1);

      el.style.background = `rgba(${n.bgColor.r},${n.bgColor.g},${n.bgColor.b},${n.bgAlpha})`;
      el.style.border = n.border ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent";

      if (isContainer(n)) {
        el.classList.add("container");
        if (n.type === "ScrollingFrame") el.classList.add("scrolling");
      }

      if (isTextType(n)) {
        const txt = document.createElement("div");
        txt.className = "node-text";
        txt.textContent = n.text ?? "";
        txt.style.color = `rgb(${n.textColor.r},${n.textColor.g},${n.textColor.b})`;
        txt.style.fontFamily = fontToCss(n.font);
        txt.style.fontWeight = cssWeightForFont(n.font);
        txt.style.fontSize = n.textScaled ? "calc(12px + 1.1vw)" : "16px";
        el.appendChild(txt);
        if (n.type === "TextButton") el.classList.add("clickable");
        if (n.type === "TextBox") el.classList.add("textbox");
      }

      if (isImageType(n)) {
        const img = document.createElement("div");
        img.className = "node-image";
        const src = (n.image || "").trim();
        if (src && !src.startsWith("rbxassetid://")) img.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
        else img.classList.add("placeholder");
        el.appendChild(img);
        if (n.type === "ImageButton") el.classList.add("clickable");
      }

      // children layer
      const inner = document.createElement("div");
      inner.className = "node-inner";
      el.appendChild(inner);

      // handles
      const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
      for (const h of handles) {
        const hd = document.createElement("div");
        hd.className = `handle handle-${h}`;
        hd.dataset.handle = h;
        el.appendChild(hd);
      }

      return { el, inner };
    };

    const build = (pid, parentEl) => {
      const ids = (ch.get(pid) || []).slice();
      ids.sort((a, b) => ((map.get(a)?.zIndex ?? 1) - (map.get(b)?.zIndex ?? 1)));
      for (const id of ids) {
        const n = map.get(id);
        if (!n) continue;
        const { el, inner } = makeNodeDom(n);
        parentEl.appendChild(el);
        build(id, inner);
      }
    };

    build("ROOT", canvas);

    // ----- Explorer
    renderExplorer(map, ch);

    // ----- Properties
    renderProperties(map);

    // export buttons
    btnCopy.disabled = !(exportBox.value || "").trim();
    btnDownload.disabled = btnCopy.disabled;
  }

  function renderExplorer(map, ch) {
    explorer.innerHTML = "";

    const rootRow = document.createElement("div");
    rootRow.className = "ex-row ex-root-row";
    rootRow.dataset.id = "ROOT";
    rootRow.innerHTML = `
      <span class="ex-badge">ScreenGui</span>
      <span class="ex-name">${state.project.guiName || "ScreenGui"}</span>
      <span class="ex-z mono"></span>
    `;
    explorer.appendChild(rootRow);

    // Drag state for explorer
    const clearDropMarks = () => {
      $$(".ex-row", explorer).forEach((r) => {
        r.classList.remove("drop-above", "drop-below", "drop-inside");
        r.dataset.drop = "";
      });
    };

    function computeDropPos(row, clientY) {
      const rect = row.getBoundingClientRect();
      const y = clientY - rect.top;
      const topZone = rect.height * 0.25;
      const bottomZone = rect.height * 0.25;

      const id = row.dataset.id;
      const n = id === "ROOT" ? null : map.get(id);

      // For containers: middle zone means "inside"
      if (n && isContainer(n) && y > topZone && y < rect.height - bottomZone) return "inside";
      // Otherwise above/below
      return y <= rect.height / 2 ? "above" : "below";
    }

    function makeRow(id, depth) {
      const n = map.get(id);
      const row = document.createElement("div");
      row.className = `ex-row${id === state.selectedId ? " active" : ""}`;
      row.dataset.id = id;
      row.draggable = true;
      row.style.paddingLeft = `${10 + depth * 14}px`;
      row.innerHTML = `
        <span class="ex-badge">${n.type}</span>
        <span class="ex-name">${n.name || n.type}</span>
        <span class="ex-z mono">z:${n.zIndex ?? 1}</span>
      `;

      row.addEventListener("click", (e) => {
        e.stopPropagation();
        selectNode(id);
      });

      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        clearDropMarks();

        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === id) return;

        // Prevent dropping parent into its descendant
        if (isDescendant(id, draggedId)) return;

        const pos = computeDropPos(row, e.clientY);
        row.dataset.drop = pos;
        row.classList.add(pos === "inside" ? "drop-inside" : pos === "above" ? "drop-above" : "drop-below");
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drop-above", "drop-below", "drop-inside");
        row.dataset.drop = "";
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === id) return;

        // Prevent dropping parent into its descendant
        if (isDescendant(id, draggedId)) return;

        const pos = row.dataset.drop || computeDropPos(row, e.clientY);

        const dragged = getNode(draggedId);
        const target = getNode(id);
        if (!dragged || !target) return;

        if (pos === "inside") {
          if (!isContainer(target)) return;
          reparentNode(draggedId, id);
          setStatus(`Parented ${dragged.name || dragged.type} → ${target.name || target.type}`, "");
        } else {
          // reorder above/below target within target's parent
          reorderRelative(draggedId, id, pos);
          setStatus("Reordered (Explorer order / ZIndex).", "");
        }

        clearDropMarks();
        render();
      });

      return row;
    }

    function addChildren(pid, depth) {
      const ids = (ch.get(pid) || []).slice().sort((a, b) => ((map.get(a)?.zIndex ?? 1) - (map.get(b)?.zIndex ?? 1)));
      for (const id of ids) {
        explorer.appendChild(makeRow(id, depth));
        addChildren(id, depth + 1);
      }
    }

    addChildren("ROOT", 0);
  }

  function renderProperties(map) {
    const n = state.selectedId ? map.get(state.selectedId) : null;
    if (!n) {
      emptyProps.hidden = false;
      propsWrap.hidden = true;
      return;
    }
    emptyProps.hidden = true;
    propsWrap.hidden = false;

    // core
    propName.value = n.name || "";
    propX.value = String(n.x);
    propY.value = String(n.y);
    propW.value = String(n.w);
    propH.value = String(n.h);
    propAnchor.value = `${n.anchorX},${n.anchorY}`;
    propZIndex.value = String(n.zIndex ?? 1);

    // parent options: ROOT + container nodes (not self, not descendants)
    const opts = [{ id: "ROOT", label: "ScreenGui (root)" }];
    for (const node of state.nodes) {
      if (!isContainer(node)) continue;
      if (node.id === n.id) continue;
      if (isDescendant(node.id, n.id)) continue;
      opts.push({ id: node.id, label: `${node.name || node.type} (${node.type})` });
    }
    propParent.innerHTML = opts.map(o => `<option value="${o.id}">${o.label}</option>`).join("");
    propParent.value = n.parentId || "ROOT";

    // appearance
    propBgColor.value = rgbToHex(n.bgColor.r, n.bgColor.g, n.bgColor.b);
    propBgAlpha.value = String(n.bgAlpha);
    propBgAlphaLabel.textContent = Number(n.bgAlpha).toFixed(2);
    propBorder.value = n.border ? "true" : "false";

    // text
    const tOn = isTextType(n);
    propText.disabled = !tOn;
    propTextColor.disabled = !tOn;
    propTextScaled.disabled = !tOn;
    propFont.disabled = !tOn;

    propText.value = tOn ? (n.text ?? "") : "";
    propTextColor.value = tOn ? rgbToHex(n.textColor.r, n.textColor.g, n.textColor.b) : "#ffffff";
    propTextScaled.value = tOn ? String(!!n.textScaled) : "true";
    propFont.value = tOn ? (n.font || "SourceSansBold") : "SourceSansBold";

    // image
    const iOn = isImageType(n);
    propImage.disabled = !iOn;
    propImage.value = iOn ? (n.image || "") : "";

    // scrollingframe
    const sOn = n.type === "ScrollingFrame";
    propCanvasW.disabled = !sOn;
    propCanvasH.disabled = !sOn;
    propScrollBar.disabled = !sOn;

    propCanvasW.value = sOn ? String(n.canvasSize?.w ?? 0) : "";
    propCanvasH.value = sOn ? String(n.canvasSize?.h ?? 0) : "";
    propScrollBar.value = sOn ? String(n.scrollBarThickness ?? 6) : "";

    // ui objects
    uiObjectsList.innerHTML = "";
    const list = (n.uiObjects || []).slice();
    if (list.length === 0) {
      uiObjectsList.innerHTML = `<div class="uiobj-empty">No UI Objects attached.</div>`;
    } else {
      for (const obj of list) {
        const row = document.createElement("div");
        row.className = "uiobj-row";
        row.innerHTML = `
          <span class="uiobj-type">${obj.type}</span>
          <button class="uiobj-remove" type="button" title="Remove">✕</button>
        `;
        row.querySelector(".uiobj-remove").addEventListener("click", () => removeUiObject(n.id, obj.id));
        uiObjectsList.appendChild(row);
      }
    }
  }

  // -------------------- Canvas drag/resize --------------------
  const dragState = {
    active: false,
    mode: null,      // "move" | "resize"
    id: null,
    handle: null,
    parentId: "ROOT",
    startMouse: { x: 0, y: 0 },  // in parent-local coords
    start: { x: 0, y: 0, w: 0, h: 0 },
  };

  function canvasEventToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    const z = state.zoom;
    return { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z };
  }

  function worldToParentLocal(world, parentId, map) {
    const pTL = parentId === "ROOT" ? { x: 0, y: 0 } : absTopLeft(parentId, map);
    return { x: world.x - pTL.x, y: world.y - pTL.y };
  }

  function findDropParent(world, map) {
    // hit-test DOM at pointer and find container
    const rect = canvas.getBoundingClientRect();
    const z = state.zoom;
    const cx = rect.left + world.x * z;
    const cy = rect.top + world.y * z;

    const el = document.elementFromPoint(cx, cy);
    if (!el) return "ROOT";
    const containerEl = el.closest(".node.container");
    if (!containerEl) return "ROOT";
    const id = containerEl.dataset.id;
    const n = map.get(id);
    if (!n || !isContainer(n)) return "ROOT";
    return id;
  }

  function onPointerDown(e) {
    if (e.button === 2) return; // right click handled by context menu
    const nodeEl = e.target.closest(".node");
    if (!nodeEl) {
      clearSelection();
      return;
    }

    const id = nodeEl.dataset.id;
    selectNode(id);

    const map = byId();
    const n = map.get(id);
    if (!n) return;

    const handleEl = e.target.closest(".handle");
    const handle = handleEl ? handleEl.dataset.handle : null;

    dragState.active = true;
    dragState.id = id;
    dragState.mode = handle ? "resize" : "move";
    dragState.handle = handle;
    dragState.parentId = n.parentId || "ROOT";
    dragState.start = { x: n.x, y: n.y, w: n.w, h: n.h };

    const world = canvasEventToWorld(e);
    const local = worldToParentLocal(world, dragState.parentId, map);
    dragState.startMouse = local;

    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function applyMove(n, dx, dy, map) {
    n.x = dragState.start.x + dx;
    n.y = dragState.start.y + dy;
    clampInParent(n, map);
  }

  function applyResize(n, dx, dy, handle, map) {
    const start = dragState.start;
    const startTL = { x: start.x - n.anchorX * start.w, y: start.y - n.anchorY * start.h };
    let tlx = startTL.x, tly = startTL.y;
    let brx = startTL.x + start.w, bry = startTL.y + start.h;

    const moveLeft = handle.includes("w");
    const moveRight = handle.includes("e");
    const moveTop = handle.includes("n");
    const moveBottom = handle.includes("s");

    if (moveLeft) tlx = startTL.x + dx;
    if (moveRight) brx = startTL.x + start.w + dx;
    if (moveTop) tly = startTL.y + dy;
    if (moveBottom) bry = startTL.y + start.h + dy;

    const minW = 20, minH = 20;
    if (brx - tlx < minW) { if (moveLeft) tlx = brx - minW; else brx = tlx + minW; }
    if (bry - tly < minH) { if (moveTop) tly = bry - minH; else bry = tly + minH; }

    n.w = round(brx - tlx);
    n.h = round(bry - tly);
    n.x = tlx + n.anchorX * n.w;
    n.y = tly + n.anchorY * n.h;

    clampInParent(n, map);
  }

  function onPointerMove(e) {
    if (!dragState.active) return;
    const map = byId();
    const n = map.get(dragState.id);
    if (!n) return;

    const world = canvasEventToWorld(e);
    const local = worldToParentLocal(world, dragState.parentId, map);

    const dx = local.x - dragState.startMouse.x;
    const dy = local.y - dragState.startMouse.y;

    if (dragState.mode === "move") applyMove(n, dx, dy, map);
    else applyResize(n, dx, dy, dragState.handle, map);

    setStatus(`Editing: ${n.type} (${n.name || n.type})`, `x:${n.x} y:${n.y} w:${n.w} h:${n.h} z:${n.zIndex ?? 1}`);
    render();
  }

  function onPointerUp(e) {
    if (!dragState.active) return;

    const map = byId();
    const n = map.get(dragState.id);

    if (n && dragState.mode === "move") {
      const world = canvasEventToWorld(e);
      const dropParent = findDropParent(world, map);

      if (dropParent !== (n.parentId || "ROOT") && dropParent !== n.id && !isDescendant(dropParent, n.id)) {
        reparentNode(n.id, dropParent);
      }
    }

    dragState.active = false;
    dragState.mode = null;
    dragState.id = null;
    dragState.handle = null;

    render();
  }

  // -------------------- Context menu (right-click) --------------------
  function hideCtx() { ctxMenu.hidden = true; }
  function showCtx(x, y) {
    ctxMenu.hidden = false;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  }

  function bindContextMenu() {
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const nodeEl = e.target.closest(".node");
      if (!nodeEl) { hideCtx(); return; }
      selectNode(nodeEl.dataset.id);
      showCtx(e.clientX, e.clientY);
    });

    document.addEventListener("click", () => hideCtx());
    window.addEventListener("resize", () => hideCtx());
    window.addEventListener("scroll", () => hideCtx(), true);

    ctxDelete.addEventListener("click", () => { deleteSelected(); hideCtx(); });
    ctxDuplicate.addEventListener("click", () => { duplicateSelected(); hideCtx(); });
    ctxMoveUp.addEventListener("click", () => { moveUpSelected(); hideCtx(); });
    ctxMoveDown.addEventListener("click", () => { moveDownSelected(); hideCtx(); });
  }

  // -------------------- Props bindings --------------------
  function updateSelected(mutator) {
    const map = byId();
    const n = map.get(state.selectedId);
    if (!n) return;
    mutator(n, map);
    clampInParent(n, map);
    render();
  }

  function bindProps() {
    propName.addEventListener("input", () => updateSelected((n) => (n.name = propName.value.trim() || n.type)));

    propParent.addEventListener("change", () => {
      if (!state.selectedId) return;
      const pid = propParent.value;
      if (pid === state.selectedId) return;
      if (isDescendant(pid, state.selectedId)) return;
      reparentNode(state.selectedId, pid);
      render();
    });

    const applyXYWH = () => updateSelected((n) => {
      n.x = Number(propX.value);
      n.y = Number(propY.value);
      n.w = Number(propW.value);
      n.h = Number(propH.value);
    });
    propX.addEventListener("input", applyXYWH);
    propY.addEventListener("input", applyXYWH);
    propW.addEventListener("input", applyXYWH);
    propH.addEventListener("input", applyXYWH);

    propAnchor.addEventListener("change", () => {
      const [ax, ay] = propAnchor.value.split(",").map(Number);
      updateSelected((n) => {
        n.anchorX = isFinite(ax) ? ax : 0;
        n.anchorY = isFinite(ay) ? ay : 0;
      });
    });

    propZIndex.addEventListener("input", () => updateSelected((n) => {
      n.zIndex = round(Number(propZIndex.value) || 1);
      normalizeZIndices(n.parentId || "ROOT");
    }));

    propBgColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(propBgColor.value);
      updateSelected((n) => (n.bgColor = { r, g, b }));
    });

    propBgAlpha.addEventListener("input", () => {
      const a = clamp(Number(propBgAlpha.value), 0, 1);
      propBgAlphaLabel.textContent = a.toFixed(2);
      updateSelected((n) => (n.bgAlpha = a));
    });

    propBorder.addEventListener("change", () => updateSelected((n) => (n.border = propBorder.value === "true")));

    propText.addEventListener("input", () => updateSelected((n) => { if (isTextType(n)) n.text = propText.value; }));
    propTextColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(propTextColor.value);
      updateSelected((n) => { if (isTextType(n)) n.textColor = { r, g, b }; });
    });
    propTextScaled.addEventListener("change", () => updateSelected((n) => { if (isTextType(n)) n.textScaled = propTextScaled.value === "true"; }));
    propFont.addEventListener("change", () => updateSelected((n) => { if (isTextType(n)) n.font = propFont.value; }));

    propImage.addEventListener("input", () => updateSelected((n) => { if (isImageType(n)) n.image = propImage.value; }));

    const applyScroll = () => updateSelected((n) => {
      if (n.type !== "ScrollingFrame") return;
      n.canvasSize = n.canvasSize || { w: 0, h: 0 };
      n.canvasSize.w = round(Number(propCanvasW.value) || 0);
      n.canvasSize.h = round(Number(propCanvasH.value) || 0);
      n.scrollBarThickness = round(Number(propScrollBar.value) || 0);
    });
    propCanvasW.addEventListener("input", applyScroll);
    propCanvasH.addEventListener("input", applyScroll);
    propScrollBar.addEventListener("input", applyScroll);
  }

  // -------------------- Project controls --------------------
  function bindProjectControls() {
    guiNameEl.addEventListener("input", () => { state.project.guiName = guiNameEl.value.trim() || "ScreenGui"; render(); });
    resetOnSpawnEl.addEventListener("change", () => { state.project.resetOnSpawn = resetOnSpawnEl.value === "true"; render(); });
    guiParentEl.addEventListener("change", () => { state.project.parent = guiParentEl.value; render(); });
    outputModeEl.addEventListener("change", () => { state.project.outputMode = outputModeEl.value; render(); });

    chkSafeArea.addEventListener("change", () => { state.showSafeArea = chkSafeArea.checked; render(); });
    zoom.addEventListener("input", () => { state.zoom = clamp(Number(zoom.value) / 100, 0.5, 2.0); render(); });

    tabInstances.addEventListener("click", () => {
      tabInstances.classList.add("active");
      tabUiObjects.classList.remove("active");
      toolboxInstances.hidden = false;
      toolboxUiObjects.hidden = true;
    });
    tabUiObjects.addEventListener("click", () => {
      tabUiObjects.classList.add("active");
      tabInstances.classList.remove("active");
      toolboxInstances.hidden = true;
      toolboxUiObjects.hidden = false;
    });
  }

  // -------------------- Save / Load / New --------------------
  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus("Saved to browser storage.", "");
  }
  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setStatus("Nothing saved yet.", ""); return; }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes)) throw new Error("bad");
      state.project = parsed.project || state.project;
      state.nodes = parsed.nodes || [];
      state.selectedId = parsed.selectedId || null;
      state.zoom = parsed.zoom || 1;
      state.showSafeArea = !!parsed.showSafeArea;
      chkSafeArea.checked = state.showSafeArea;
      setStatus("Loaded from browser storage.", "");
      render();
    } catch (e) {
      console.error(e);
      setStatus("Failed to load saved data.", "");
    }
  }
  function newProject() {
    const d = defaultProject();
    state.project = d.project;
    state.nodes = d.nodes;
    state.selectedId = d.selectedId;
    state.zoom = d.zoom;
    state.showSafeArea = d.showSafeArea;
    chkSafeArea.checked = false;
    exportBox.value = "";
    setStatus("New project created.", "");
    render();
    exportLua();
  }

  // -------------------- Duplicate / Delete --------------------
  function duplicateSelected() {
    if (!state.selectedId) return;
    const map = byId();
    const n = map.get(state.selectedId);
    if (!n) return;

    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid();
    copy.name = (n.name || n.type) + "Copy";
    copy.zIndex = nextZIndex(copy.parentId || "ROOT");
    copy.x += 12; copy.y += 12;
    clampInParent(copy, map);

    state.nodes.push(copy);
    selectNode(copy.id);
    setStatus("Duplicated element.", "");
  }

  function deleteSelected() {
    const id = state.selectedId;
    if (!id) return;

    const toRemove = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of state.nodes) {
        if (toRemove.has(n.parentId) && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          changed = true;
        }
      }
    }
    const removedNode = getNode(id);
    const oldParent = removedNode ? (removedNode.parentId || "ROOT") : "ROOT";

    state.nodes = state.nodes.filter(n => !toRemove.has(n.id));
    state.selectedId = null;

    normalizeZIndices(oldParent);
    setStatus("Deleted element.", "");
    render();
  }

  // -------------------- Export Lua --------------------
  function luaBool(b) { return b ? "true" : "false"; }
  function formatColor3(rgb) { return `Color3.fromRGB(${rgb.r}, ${rgb.g}, ${rgb.b})`; }

  function depth(id, map) {
    let d = 0;
    let cur = map.get(id);
    while (cur && (cur.parentId || "ROOT") !== "ROOT") {
      d++;
      cur = map.get(cur.parentId);
    }
    return d;
  }

  function exportLua() {
    const useVars = state.project.outputMode === "variables";
    const guiName = state.project.guiName?.trim() || "ScreenGui";
    const resetOnSpawn = !!state.project.resetOnSpawn;
    const parent = state.project.parent;

    const map = byId();
    const lines = [];
    const taken = new Set(["game", "workspace", "script", "player", "screenGui"]);
    const varMap = new Map();
    const created = new Set(["ROOT"]);

    const emit = (s = "") => lines.push(s);
    const indent = (n) => "  ".repeat(n);

    function varNameFor(n) {
      if (varMap.has(n.id)) return varMap.get(n.id);
      let base = safeLuaIdent((n.name || n.type).replace(/\s+/g, ""));
      base = base.charAt(0).toLowerCase() + base.slice(1);
      let v = base, i = 2;
      while (taken.has(v)) v = `${base}${i++}`;
      taken.add(v);
      varMap.set(n.id, v);
      return v;
    }

    // header
    if (useVars) {
      emit(`local screenGui = Instance.new("ScreenGui")`);
      emit(`screenGui.Name = "${escapeLuaString(guiName)}"`);
      emit(`screenGui.ResetOnSpawn = ${luaBool(resetOnSpawn)}`);
      if (parent === "PlayerGui") {
        emit(`local player = game.Players.LocalPlayer`);
        emit(`screenGui.Parent = player:WaitForChild("PlayerGui")`);
      } else {
        emit(`screenGui.Parent = game:GetService("CoreGui")`);
      }
      emit("");
    } else {
      emit(`do`);
      emit(`${indent(1)}local screenGui = Instance.new("ScreenGui")`);
      emit(`${indent(1)}screenGui.Name = "${escapeLuaString(guiName)}"`);
      emit(`${indent(1)}screenGui.ResetOnSpawn = ${luaBool(resetOnSpawn)}`);
      if (parent === "PlayerGui") {
        emit(`${indent(1)}local player = game.Players.LocalPlayer`);
        emit(`${indent(1)}screenGui.Parent = player:WaitForChild("PlayerGui")`);
      } else {
        emit(`${indent(1)}screenGui.Parent = game:GetService("CoreGui")`);
      }
      emit("");
    }

    function ensure(id) {
      if (created.has(id)) return;
      const n = map.get(id);
      if (!n) return;

      const pid = n.parentId || "ROOT";
      if (pid !== "ROOT") ensure(pid);

      const pre = useVars ? "" : indent(1);
      const v = useVars ? varNameFor(n) : safeLuaIdent(n.type.toLowerCase());

      emit(`${pre}local ${v} = Instance.new("${n.type}")`);
      emit(`${pre}${v}.Name = "${escapeLuaString(n.name || n.type)}"`);

      emit(`${pre}${v}.Size = UDim2.new(0, ${round(n.w)}, 0, ${round(n.h)})`);

      const posX = round(n.x - n.anchorX * n.w);
      const posY = round(n.y - n.anchorY * n.h);
      emit(`${pre}${v}.Position = UDim2.new(0, ${posX}, 0, ${posY})`);
      emit(`${pre}${v}.AnchorPoint = Vector2.new(${n.anchorX}, ${n.anchorY})`);
      emit(`${pre}${v}.ZIndex = ${round(n.zIndex ?? 1)}`);

      emit(`${pre}${v}.BackgroundColor3 = ${formatColor3(n.bgColor)}`);
      emit(`${pre}${v}.BackgroundTransparency = ${clamp(1 - n.bgAlpha, 0, 1).toFixed(2)}`);
      emit(`${pre}${v}.BorderSizePixel = ${n.border ? 1 : 0}`);

      if (isTextType(n)) {
        emit(`${pre}${v}.TextColor3 = ${formatColor3(n.textColor)}`);
        emit(`${pre}${v}.Text = "${escapeLuaString(n.text ?? "")}"`);
        emit(`${pre}${v}.TextScaled = ${luaBool(!!n.textScaled)}`);
        emit(`${pre}${v}.Font = Enum.Font.${n.font || "SourceSansBold"}`);
      }

      if (isImageType(n)) {
        if ((n.image || "").trim()) emit(`${pre}${v}.Image = "${escapeLuaString((n.image || "").trim())}"`);
      }

      if (n.type === "ScrollingFrame") {
        const cw = round(n.canvasSize?.w ?? 0);
        const chh = round(n.canvasSize?.h ?? 0);
        emit(`${pre}${v}.CanvasSize = UDim2.new(0, ${cw}, 0, ${chh})`);
        emit(`${pre}${v}.ScrollBarThickness = ${round(n.scrollBarThickness ?? 6)}`);
      }

      // parent assignment
      if ((n.parentId || "ROOT") === "ROOT") {
        emit(`${pre}${v}.Parent = screenGui`);
      } else {
        if (useVars) emit(`${pre}${v}.Parent = ${varMap.get(n.parentId) || "screenGui"}`);
        else emit(`${pre}${v}.Parent = ${safeLuaIdent((map.get(n.parentId)?.type || "frame").toLowerCase())}`);
      }

      // UI Objects (basic exported props)
      const uiObjs = n.uiObjects || [];
      for (const obj of uiObjs) {
        const uiVar = useVars ? `${v}_${safeLuaIdent(obj.type).toLowerCase()}` : `ui_${safeLuaIdent(obj.type).toLowerCase()}`;
        emit(`${pre}local ${uiVar} = Instance.new("${obj.type}")`);

        if (obj.type === "UICorner") {
          const r = round(obj.props?.cornerRadius ?? 8);
          emit(`${pre}${uiVar}.CornerRadius = UDim.new(0, ${r})`);
        }
        if (obj.type === "UIStroke") {
          const t = round(obj.props?.thickness ?? 2);
          const c = obj.props?.color || { r: 255, g: 255, b: 255 };
          const tr = clamp(Number(obj.props?.transparency ?? 0.2), 0, 1);
          emit(`${pre}${uiVar}.Thickness = ${t}`);
          emit(`${pre}${uiVar}.Color = ${formatColor3(c)}`);
          emit(`${pre}${uiVar}.Transparency = ${tr.toFixed(2)}`);
        }
        if (obj.type === "UIAspectRatioConstraint") {
          const ar = Number(obj.props?.aspectRatio ?? 1.0);
          emit(`${pre}${uiVar}.AspectRatio = ${ar}`);
        }
        if (obj.type === "UITextSizeConstraint") {
          const minT = round(obj.props?.minTextSize ?? 8);
          const maxT = round(obj.props?.maxTextSize ?? 48);
          emit(`${pre}${uiVar}.MinTextSize = ${minT}`);
          emit(`${pre}${uiVar}.MaxTextSize = ${maxT}`);
        }
        if (obj.type === "UISizeConstraint") {
          const p = obj.props || {};
          emit(`${pre}${uiVar}.MinSize = Vector2.new(${round(p.minW ?? 0)}, ${round(p.minH ?? 0)})`);
          emit(`${pre}${uiVar}.MaxSize = Vector2.new(${round(p.maxW ?? 0)}, ${round(p.maxH ?? 0)})`);
        }
        if (obj.type === "UIScale") {
          const sc = Number(obj.props?.scale ?? 1.0);
          emit(`${pre}${uiVar}.Scale = ${sc}`);
        }
        if (obj.type === "UIPadding") {
          const p = obj.props || {};
          emit(`${pre}${uiVar}.PaddingLeft = UDim.new(0, ${round(p.left ?? 0)})`);
          emit(`${pre}${uiVar}.PaddingRight = UDim.new(0, ${round(p.right ?? 0)})`);
          emit(`${pre}${uiVar}.PaddingTop = UDim.new(0, ${round(p.top ?? 0)})`);
          emit(`${pre}${uiVar}.PaddingBottom = UDim.new(0, ${round(p.bottom ?? 0)})`);
        }

        emit(`${pre}${uiVar}.Parent = ${v}`);
      }

      emit("");
      created.add(id);
    }

    const sorted = state.nodes
      .slice()
      .sort((a, b) => {
        if ((a.parentId || "ROOT") === (b.parentId || "ROOT")) return (a.zIndex ?? 1) - (b.zIndex ?? 1);
        return depth(a.id, map) - depth(b.id, map);
      })
      .map((n) => n.id);

    for (const id of sorted) ensure(id);
    if (!useVars) emit(`end`);

    exportBox.value = lines.join("\n").trimEnd();
    btnCopy.disabled = !(exportBox.value || "").trim();
    btnDownload.disabled = btnCopy.disabled;

    setStatus("Exported Lua script.", "");
  }

  // -------------------- Copy / Download --------------------
  async function copyExport() {
    const text = exportBox.value || "";
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.", "");
    } catch {
      exportBox.focus();
      exportBox.select();
      document.execCommand("copy");
      setStatus("Copied (fallback).", "");
    }
  }
  function downloadExport() {
    const text = exportBox.value || "";
    if (!text.trim()) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.project.guiName || "ui").replace(/[^\w\-]+/g, "_")}.lua`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  // -------------------- Toolbox binding --------------------
  function bindToolbox() {
    $$(".tool[data-create]").forEach((btn) => {
      btn.addEventListener("click", () => createNode(btn.dataset.create));
    });

    $$(".tool[data-add-ui]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.addUi;
        // aliases you used in HTML
        if (t === "UIGridStyleLayout") return addUiObject("UIGridLayout");
        if (t === "UIListStyleLayout") return addUiObject("UIListLayout");
        if (t === "UIConstraint") return setStatus("UIConstraint is a base class in Roblox and not instantiable. Pick a concrete UI* object.", "");
        addUiObject(t);
      });
    });
  }

  // -------------------- Keyboard shortcuts (NO Backspace delete) --------------------
  function bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // NEVER delete on Backspace.
      // Only Delete / Del deletes.
      if (e.key === "Delete") {
        if (state.selectedId) {
          deleteSelected();
          e.preventDefault();
        }
      }

      if (mod && (e.key === "d" || e.key === "D")) {
        if (state.selectedId) {
          duplicateSelected();
          e.preventDefault();
        }
      }

      if (mod && (e.key === "s" || e.key === "S")) {
        saveToStorage();
        e.preventDefault();
      }

      if (mod && (e.key === "e" || e.key === "E")) {
        exportLua();
        e.preventDefault();
      }
    });
  }

  // -------------------- Buttons --------------------
  function bindButtons() {
    btnNew.addEventListener("click", newProject);
    btnSave.addEventListener("click", saveToStorage);
    btnLoad.addEventListener("click", loadFromStorage);
    btnExport.addEventListener("click", exportLua);
    btnCopy.addEventListener("click", copyExport);
    btnDownload.addEventListener("click", downloadExport);
    btnDuplicate.addEventListener("click", duplicateSelected);

    btnMoveUp.addEventListener("click", moveUpSelected);
    btnMoveDown.addEventListener("click", moveDownSelected);
  }

  // -------------------- Canvas binding --------------------
  function bindCanvas() {
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListene
