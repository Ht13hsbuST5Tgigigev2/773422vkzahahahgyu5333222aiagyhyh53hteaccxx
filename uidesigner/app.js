/* app.js — RBLX UI Designer (v4, "fix everything" build)
   Goal: Never break, never crash, all core features working.

   ✅ Defensive DOM bindings: missing elements won't crash the app
   ✅ Canvas: select, drag to move, handles to resize
   ✅ Canvas parenting: drag and drop onto Frame/ScrollingFrame to parent
   ✅ Explorer: select, drag above/below to reorder (ZIndex), drag inside to parent
   ✅ Delete only on DEL (Backspace never deletes) + right click context menu delete
   ✅ UI objects supported and exported
   ✅ Save/Load/New/Export/Copy/Download works

   NOTE: This is a browser preview tool. Roblox layout engines (UIListLayout etc) won't be fully simulated visually,
         but export includes them.

*/

(() => {
  "use strict";

  // -------------------- Utilities --------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (n) => Math.round(Number(n) || 0);
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

  const isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform);

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

  // -------------------- Constants --------------------
  const STORAGE_KEY = "rblx-ui-designer:v4";
  const CANVAS_W = 980;
  const CANVAS_H = 620;

  const SUPPORTED_INSTANCES = new Set([
    "Frame",
    "ScrollingFrame",
    "TextLabel",
    "TextButton",
    "TextBox",
    "ImageLabel",
    "ImageButton",
    "ViewportFrame",
  ]);

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
  ]);

  // -------------------- State --------------------
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

  // -------------------- DOM (defensive) --------------------
  const dom = {
    canvasOuter: $("#canvasOuter"),
    canvas: $("#canvas"),
    explorer: $("#explorer"),

    guiName: $("#guiName"),
    resetOnSpawn: $("#resetOnSpawn"),
    guiParent: $("#guiParent"),
    outputMode: $("#outputMode"),

    btnNew: $("#btnNew"),
    btnSave: $("#btnSave"),
    btnLoad: $("#btnLoad"),
    btnExport: $("#btnExport"),
    btnCopy: $("#btnCopy"),
    btnDownload: $("#btnDownload"),

    btnMoveUp: $("#btnMoveUp"),
    btnMoveDown: $("#btnMoveDown"),
    btnDuplicate: $("#btnDuplicate"),

    exportBox: $("#exportBox"),

    emptyProps: $("#emptyProps"),
    propsWrap: $("#props"),

    propName: $("#propName"),
    propParent: $("#propParent"),
    propX: $("#propX"),
    propY: $("#propY"),
    propW: $("#propW"),
    propH: $("#propH"),
    propAnchor: $("#propAnchor"),
    propZIndex: $("#propZIndex"),

    propBgColor: $("#propBgColor"),
    propBgAlpha: $("#propBgAlpha"),
    propBgAlphaLabel: $("#propBgAlphaLabel"),
    propBorder: $("#propBorder"),

    propText: $("#propText"),
    propTextColor: $("#propTextColor"),
    propTextScaled: $("#propTextScaled"),
    propFont: $("#propFont"),

    propImage: $("#propImage"),

    propCanvasW: $("#propCanvasW"),
    propCanvasH: $("#propCanvasH"),
    propScrollBar: $("#propScrollBar"),

    uiObjectsList: $("#uiObjectsList"),

    chkSafeArea: $("#chkSafeArea"),
    safeArea: $("#safeArea"),
    zoom: $("#zoom"),
    zoomLabel: $("#zoomLabel"),

    statusLeft: $("#statusLeft"),
    statusRight: $("#statusRight"),

    tabInstances: $("#tabInstances"),
    tabUiObjects: $("#tabUiObjects"),
    toolboxInstances: $("#toolboxInstances"),
    toolboxUiObjects: $("#toolboxUiObjects"),

    ctxMenu: $("#ctxMenu"),
    ctxDelete: $("#ctxDelete"),
    ctxDuplicate: $("#ctxDuplicate"),
    ctxMoveUp: $("#ctxMoveUp"),
    ctxMoveDown: $("#ctxMoveDown"),
  };

  // Ensure canvas element exists and size it
  if (dom.canvas) {
    dom.canvas.style.width = `${CANVAS_W}px`;
    dom.canvas.style.height = `${CANVAS_H}px`;
  }

  // -------------------- Type helpers --------------------
  const isContainer = (n) => n && (n.type === "Frame" || n.type === "ScrollingFrame");
  const isTextType = (n) => n && (n.type === "TextLabel" || n.type === "TextButton" || n.type === "TextBox");
  const isImageType = (n) => n && (n.type === "ImageLabel" || n.type === "ImageButton");

  const getNode = (id) => state.nodes.find((n) => n.id === id) || null;
  const idMap = () => new Map(state.nodes.map((n) => [n.id, n]));

  function childrenMap() {
    const m = new Map();
    for (const n of state.nodes) {
      const pid = n.parentId || "ROOT";
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid).push(n.id);
    }
    for (const [pid, ids] of m.entries()) {
      ids.sort((a, b) => ((getNode(a)?.zIndex ?? 1) - (getNode(b)?.zIndex ?? 1)));
    }
    return m;
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
    if (dom.statusLeft) dom.statusLeft.textContent = left ?? "";
    if (dom.statusRight) dom.statusRight.textContent = right ?? "";
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
  function defaultNodeText() {
    return {
      id: uid(),
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
      scrollBarThickness: 8,
      uiObjects: [],
    };
  }

  function newProject() {
    const node = defaultNodeText();
    state.project = {
      guiName: "HelloWorldGui",
      resetOnSpawn: false,
      parent: "PlayerGui",
      outputMode: "variables",
    };
    state.nodes = [node];
    state.selectedId = node.id;
    state.zoom = 1;
    state.showSafeArea = false;
    if (dom.chkSafeArea) dom.chkSafeArea.checked = false;
    if (dom.exportBox) dom.exportBox.value = "";
    setStatus("New project created.", "");
    render();
    exportLua();
  }

  // -------------------- Create node --------------------
  function nextZIndex(parentId) {
    const siblings = state.nodes.filter((n) => (n.parentId || "ROOT") === parentId);
    return siblings.reduce((acc, n) => Math.max(acc, n.zIndex ?? 1), 0) + 1;
  }

  function makeNode(type, parentId = "ROOT") {
    const map = idMap();
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
      scrollBarThickness: 8,

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
      base.scrollBarThickness = 10;
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
    if (!SUPPORTED_INSTANCES.has(type)) return;
    const node = makeNode(type, "ROOT");
    state.nodes.push(node);
    selectNode(node.id);
  }

  // -------------------- UI Objects --------------------
  function addUiObject(type) {
    if (!SUPPORTED_UI_OBJECTS.has(type)) return;
    if (!state.selectedId) { setStatus("Select an instance first.", ""); return; }
    const n = getNode(state.selectedId);
    if (!n) return;

    const obj = { id: uid(), type, props: {} };
    if (type === "UICorner") obj.props = { cornerRadius: 8 };
    if (type === "UIStroke") obj.props = { thickness: 2, color: { r: 255, g: 255, b: 255 }, transparency: 0.2 };
    if (type === "UITextSizeConstraint") obj.props = { minTextSize: 8, maxTextSize: 48 };
    if (type === "UISizeConstraint") obj.props = { minW: 0, minH: 0, maxW: 0, maxH: 0 };
    if (type === "UIAspectRatioConstraint") obj.props = { aspectRatio: 1.0 };
    if (type === "UIScale") obj.props = { scale: 1.0 };
    if (type === "UIPadding") obj.props = { left: 0, right: 0, top: 0, bottom: 0 };

    n.uiObjects = n.uiObjects || [];
    n.uiObjects.push(obj);
    setStatus(`Added ${type}.`, "");
    render();
  }

  function removeUiObject(nodeId, uiId) {
    const n = getNode(nodeId);
    if (!n) return;
    n.uiObjects = (n.uiObjects || []).filter((o) => o.id !== uiId);
    render();
  }

  // -------------------- Parenting / Ordering --------------------
  function normalizeZ(parentId) {
    const sibs = state.nodes
      .filter((x) => (x.parentId || "ROOT") === parentId)
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
    sibs.forEach((n, i) => (n.zIndex = i + 1));
  }

  function reparentNode(nodeId, newParentId) {
    const map = idMap();
    const n = map.get(nodeId);
    if (!n) return;

    const oldParent = n.parentId || "ROOT";
    if (oldParent === newParentId) return;

    // keep world anchor constant
    const worldA = absAnchor(nodeId, map);

    n.parentId = newParentId;

    const newTL = newParentId === "ROOT" ? { x: 0, y: 0 } : absTopLeft(newParentId, map);
    n.x = worldA.x - newTL.x;
    n.y = worldA.y - newTL.y;

    n.zIndex = nextZIndex(newParentId);

    clampInParent(n, map);
    normalizeZ(newParentId);
    normalizeZ(oldParent);
  }

  function reorderRelative(dragId, targetId, pos /* "above"|"below" */) {
    const drag = getNode(dragId);
    const target = getNode(targetId);
    if (!drag || !target) return;

    const pid = target.parentId || "ROOT";
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

    let insertAt;
    if (pos === "above") insertAt = tIdx + (dIdx < tIdx ? -1 : 0);
    else insertAt = tIdx + (dIdx < tIdx ? 0 : 1);

    insertAt = clamp(insertAt, 0, sibs.length);
    sibs.splice(insertAt, 0, item);

    sibs.forEach((n, i) => (n.zIndex = i + 1));
  }

  function siblingsOf(id) {
    const n = getNode(id);
    if (!n) return [];
    const pid = n.parentId || "ROOT";
    return state.nodes
      .filter((x) => (x.parentId || "ROOT") === pid)
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
  }

  function moveUpSelected() {
    const id = state.selectedId;
    if (!id) return;
    const sibs = siblingsOf(id);
    const idx = sibs.findIndex((n) => n.id === id);
    if (idx <= 0) return;
    const a = sibs[idx - 1];
    const b = sibs[idx];
    const z = a.zIndex; a.zIndex = b.zIndex; b.zIndex = z;
    normalizeZ(b.parentId || "ROOT");
    render();
  }

  function moveDownSelected() {
    const id = state.selectedId;
    if (!id) return;
    const sibs = siblingsOf(id);
    const idx = sibs.findIndex((n) => n.id === id);
    if (idx < 0 || idx >= sibs.length - 1) return;
    const a = sibs[idx];
    const b = sibs[idx + 1];
    const z = a.zIndex; a.zIndex = b.zIndex; b.zIndex = z;
    normalizeZ(a.parentId || "ROOT");
    render();
  }

  // -------------------- Duplicate / Delete --------------------
  function duplicateSelected() {
    if (!state.selectedId) return;
    const n = getNode(state.selectedId);
    if (!n) return;

    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid();
    copy.name = (n.name || n.type) + "Copy";
    copy.zIndex = nextZIndex(copy.parentId || "ROOT");
    copy.x += 12; copy.y += 12;

    const map = idMap();
    clampInParent(copy, map);

    state.nodes.push(copy);
    selectNode(copy.id);
  }

  function deleteSelected() {
    if (!state.selectedId) return;
    const id = state.selectedId;

    // remove subtree
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

    const removed = getNode(id);
    const oldParent = removed ? (removed.parentId || "ROOT") : "ROOT";

    state.nodes = state.nodes.filter((n) => !toRemove.has(n.id));
    state.selectedId = null;

    normalizeZ(oldParent);
    render();
  }

  // -------------------- Rendering --------------------
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
  function weightForFont(font) {
    if (font === "SourceSansBold" || font === "GothamBold") return "700";
    return "500";
  }

  function renderCanvas(map, ch) {
    if (!dom.canvas) return;
    dom.canvas.innerHTML = "";

    const makeNodeDom = (n) => {
      const el = document.createElement("div");
      el.className = `node${n.id === state.selectedId ? " selected" : ""}${isContainer(n) ? " container" : ""}${n.type === "ScrollingFrame" ? " scrolling" : ""}${(n.type === "TextButton" || n.type === "ImageButton") ? " clickable" : ""}${n.type === "TextBox" ? " textbox" : ""}`;
      el.dataset.id = n.id;

      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.style.width = `${n.w}px`;
      el.style.height = `${n.h}px`;
      el.style.transform = `translate(${-n.anchorX * 100}%, ${-n.anchorY * 100}%)`;
      el.style.zIndex = String(n.zIndex ?? 1);
      el.style.background = `rgba(${n.bgColor.r},${n.bgColor.g},${n.bgColor.b},${n.bgAlpha})`;
      el.style.border = n.border ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent";

      if (isTextType(n)) {
        const txt = document.createElement("div");
        txt.className = "node-text";
        txt.textContent = n.text ?? "";
        txt.style.color = `rgb(${n.textColor.r},${n.textColor.g},${n.textColor.b})`;
        txt.style.fontFamily = fontToCss(n.font);
        txt.style.fontWeight = weightForFont(n.font);
        txt.style.fontSize = n.textScaled ? "calc(12px + 1.1vw)" : "16px";
        el.appendChild(txt);
      }

      if (isImageType(n)) {
        const img = document.createElement("div");
        img.className = "node-image";
        const src = (n.image || "").trim();
        if (src && !src.startsWith("rbxassetid://")) img.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
        else img.classList.add("placeholder");
        el.appendChild(img);
      }

      // children container
      const inner = document.createElement("div");
      inner.className = "node-inner";
      el.appendChild(inner);

      // resize handles
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
      const ids = (ch.get(pid) || []).slice()
        .sort((a, b) => ((map.get(a)?.zIndex ?? 1) - (map.get(b)?.zIndex ?? 1)));
      for (const id of ids) {
        const n = map.get(id);
        if (!n) continue;
        const { el, inner } = makeNodeDom(n);
        parentEl.appendChild(el);
        build(id, inner);
      }
    };

    build("ROOT", dom.canvas);
  }

  function renderExplorer(map, ch) {
    if (!dom.explorer) return;
    dom.explorer.innerHTML = "";

    // Root row
    const rootRow = document.createElement("div");
    rootRow.className = "ex-row ex-root-row";
    rootRow.dataset.id = "ROOT";
    rootRow.innerHTML = `
      <span class="ex-badge">ScreenGui</span>
      <span class="ex-name">${state.project.guiName || "ScreenGui"}</span>
      <span class="ex-z mono"></span>
    `;
    dom.explorer.appendChild(rootRow);

    const clearDropMarks = () => {
      $$(".ex-row", dom.explorer).forEach((r) => {
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
      if (id === "ROOT") return y <= rect.height / 2 ? "above" : "below";

      const n = map.get(id);
      if (n && isContainer(n) && y > topZone && y < rect.height - bottomZone) return "inside";
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

      row.addEventListener("click", (e) => { e.stopPropagation(); selectNode(id); });

      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        clearDropMarks();

        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === id) return;
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
          reorderRelative(draggedId, id, pos);
          setStatus("Reordered (Explorer order = ZIndex).", "");
        }

        clearDropMarks();
        render();
      });

      return row;
    }

    function addChildren(pid, depth) {
      const ids = (ch.get(pid) || []).slice()
        .sort((a, b) => ((map.get(a)?.zIndex ?? 1) - (map.get(b)?.zIndex ?? 1)));
      for (const id of ids) {
        dom.explorer.appendChild(makeRow(id, depth));
        addChildren(id, depth + 1);
      }
    }

    addChildren("ROOT", 0);
  }

  function renderProperties(map) {
    const n = state.selectedId ? map.get(state.selectedId) : null;
    if (!dom.emptyProps || !dom.propsWrap) return;

    if (!n) {
      dom.emptyProps.hidden = false;
      dom.propsWrap.hidden = true;
      return;
    }
    dom.emptyProps.hidden = true;
    dom.propsWrap.hidden = false;

    // Core
    if (dom.propName) dom.propName.value = n.name || "";
    if (dom.propX) dom.propX.value = String(n.x);
    if (dom.propY) dom.propY.value = String(n.y);
    if (dom.propW) dom.propW.value = String(n.w);
    if (dom.propH) dom.propH.value = String(n.h);
    if (dom.propAnchor) dom.propAnchor.value = `${n.anchorX},${n.anchorY}`;
    if (dom.propZIndex) dom.propZIndex.value = String(n.zIndex ?? 1);

    // Parent dropdown: ROOT + containers excluding self & descendants
    if (dom.propParent) {
      const opts = [{ id: "ROOT", label: "ScreenGui (root)" }];
      for (const node of state.nodes) {
        if (!isContainer(node)) continue;
        if (node.id === n.id) continue;
        if (isDescendant(node.id, n.id)) continue;
        opts.push({ id: node.id, label: `${node.name || node.type} (${node.type})` });
      }
      dom.propParent.innerHTML = opts.map(o => `<option value="${o.id}">${o.label}</option>`).join("");
      dom.propParent.value = n.parentId || "ROOT";
    }

    // Appearance
    if (dom.propBgColor) dom.propBgColor.value = rgbToHex(n.bgColor.r, n.bgColor.g, n.bgColor.b);
    if (dom.propBgAlpha) dom.propBgAlpha.value = String(n.bgAlpha);
    if (dom.propBgAlphaLabel) dom.propBgAlphaLabel.textContent = Number(n.bgAlpha).toFixed(2);
    if (dom.propBorder) dom.propBorder.value = n.border ? "true" : "false";

    // Text
    const tOn = isTextType(n);
    if (dom.propText) { dom.propText.disabled = !tOn; dom.propText.value = tOn ? (n.text ?? "") : ""; }
    if (dom.propTextColor) { dom.propTextColor.disabled = !tOn; dom.propTextColor.value = tOn ? rgbToHex(n.textColor.r, n.textColor.g, n.textColor.b) : "#ffffff"; }
    if (dom.propTextScaled) { dom.propTextScaled.disabled = !tOn; dom.propTextScaled.value = tOn ? String(!!n.textScaled) : "true"; }
    if (dom.propFont) { dom.propFont.disabled = !tOn; dom.propFont.value = tOn ? (n.font || "SourceSansBold") : "SourceSansBold"; }

    // Image
    const iOn = isImageType(n);
    if (dom.propImage) { dom.propImage.disabled = !iOn; dom.propImage.value = iOn ? (n.image || "") : ""; }

    // ScrollingFrame
    const sOn = n.type === "ScrollingFrame";
    if (dom.propCanvasW) { dom.propCanvasW.disabled = !sOn; dom.propCanvasW.value = sOn ? String(n.canvasSize?.w ?? 0) : ""; }
    if (dom.propCanvasH) { dom.propCanvasH.disabled = !sOn; dom.propCanvasH.value = sOn ? String(n.canvasSize?.h ?? 0) : ""; }
    if (dom.propScrollBar) { dom.propScrollBar.disabled = !sOn; dom.propScrollBar.value = sOn ? String(n.scrollBarThickness ?? 8) : ""; }

    // UI Objects list
    if (dom.uiObjectsList) {
      const list = (n.uiObjects || []).slice();
      dom.uiObjectsList.innerHTML = "";
      if (list.length === 0) {
        dom.uiObjectsList.innerHTML = `<div class="uiobj-empty">No UI Objects attached.</div>`;
      } else {
        for (const obj of list) {
          const row = document.createElement("div");
          row.className = "uiobj-row";
          row.innerHTML = `
            <span class="uiobj-type">${obj.type}</span>
            <button class="uiobj-remove" type="button" title="Remove">✕</button>
          `;
          row.querySelector(".uiobj-remove").addEventListener("click", () => removeUiObject(n.id, obj.id));
          dom.uiObjectsList.appendChild(row);
        }
      }
    }
  }

  function render() {
    // Project UI
    if (dom.guiName) dom.guiName.value = state.project.guiName;
    if (dom.resetOnSpawn) dom.resetOnSpawn.value = String(state.project.resetOnSpawn);
    if (dom.guiParent) dom.guiParent.value = state.project.parent;
    if (dom.outputMode) dom.outputMode.value = state.project.outputMode;

    // Zoom / safe area
    if (dom.canvasOuter) dom.canvasOuter.style.setProperty("--zoom", String(state.zoom));
    if (dom.zoom) dom.zoom.value = String(Math.round(state.zoom * 100));
    if (dom.zoomLabel) dom.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    if (dom.safeArea) dom.safeArea.hidden = !state.showSafeArea;

    const map = idMap();
    const ch = childrenMap();

    renderCanvas(map, ch);
    renderExplorer(map, ch);
    renderProperties(map);

    const hasExport = (dom.exportBox?.value || "").trim().length > 0;
    if (dom.btnCopy) dom.btnCopy.disabled = !hasExport;
    if (dom.btnDownload) dom.btnDownload.disabled = !hasExport;
  }

  // -------------------- Canvas interaction --------------------
  const dragState = {
    active: false,
    mode: null,     // "move" | "resize"
    id: null,
    handle: null,
    parentId: "ROOT",
    startMouse: { x: 0, y: 0 },
    start: { x: 0, y: 0, w: 0, h: 0 },
    pointerId: null,
  };

  function canvasEventToWorld(e) {
    const rect = dom.canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / state.zoom, y: (e.clientY - rect.top) / state.zoom };
  }

  function worldToParentLocal(world, parentId, map) {
    const pTL = parentId === "ROOT" ? { x: 0, y: 0 } : absTopLeft(parentId, map);
    return { x: world.x - pTL.x, y: world.y - pTL.y };
  }

  function findDropParent(world) {
    // hit test on scaled canvas
    const rect = dom.canvas.getBoundingClientRect();
    const cx = rect.left + world.x * state.zoom;
    const cy = rect.top + world.y * state.zoom;

    const el = document.elementFromPoint(cx, cy);
    if (!el) return "ROOT";
    const containerEl = el.closest(".node.container");
    if (!containerEl) return "ROOT";
    const id = containerEl.dataset.id;
    const n = getNode(id);
    if (!n || !isContainer(n)) return "ROOT";
    return id;
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

  function onPointerDown(e) {
    if (e.button === 2) return; // right click handled by context menu
    const nodeEl = e.target.closest(".node");
    if (!nodeEl) { clearSelection(); return; }

    const id = nodeEl.dataset.id;
    selectNode(id);

    const map = idMap();
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
    dragState.pointerId = e.pointerId;

    const world = canvasEventToWorld(e);
    const local = worldToParentLocal(world, dragState.parentId, map);
    dragState.startMouse = local;

    dom.canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragState.active) return;
    const map = idMap();
    const n = map.get(dragState.id);
    if (!n) return;

    const world = canvasEventToWorld(e);
    const local = worldToParentLocal(world, dragState.parentId, map);
    const dx = local.x - dragState.startMouse.x;
    const dy = local.y - dragState.startMouse.y;

    if (dragState.mode === "move") applyMove(n, dx, dy, map);
    else applyResize(n, dx, dy, dragState.handle, map);

    setStatus(`Editing: ${n.type}`, `x:${n.x} y:${n.y} w:${n.w} h:${n.h}`);
    render();
  }

  function onPointerUp(e) {
    if (!dragState.active) return;

    const map = idMap();
    const n = map.get(dragState.id);

    if (n && dragState.mode === "move") {
      const world = canvasEventToWorld(e);
      const dropParent = findDropParent(world);

      if (dropParent !== (n.parentId || "ROOT") && dropParent !== n.id && !isDescendant(dropParent, n.id)) {
        reparentNode(n.id, dropParent);
      }
    }

    dragState.active = false;
    dragState.mode = null;
    dragState.id = null;
    dragState.handle = null;
    dragState.pointerId = null;

    render();
  }

  // -------------------- Context menu --------------------
  function hideCtx() {
    if (dom.ctxMenu) dom.ctxMenu.hidden = true;
  }
  function showCtx(x, y) {
    if (!dom.ctxMenu) return;
    dom.ctxMenu.hidden = false;
    dom.ctxMenu.style.left = `${x}px`;
    dom.ctxMenu.style.top = `${y}px`;
  }

  function bindContextMenu() {
    if (!dom.canvas || !dom.ctxMenu) return;

    dom.canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const nodeEl = e.target.closest(".node");
      if (!nodeEl) { hideCtx(); return; }
      selectNode(nodeEl.dataset.id);
      showCtx(e.clientX, e.clientY);
    });

    document.addEventListener("click", () => hideCtx());
    window.addEventListener("resize", () => hideCtx());
    window.addEventListener("scroll", () => hideCtx(), true);

    if (dom.ctxDelete) dom.ctxDelete.addEventListener("click", () => { deleteSelected(); hideCtx(); });
    if (dom.ctxDuplicate) dom.ctxDuplicate.addEventListener("click", () => { duplicateSelected(); hideCtx(); });
    if (dom.ctxMoveUp) dom.ctxMoveUp.addEventListener("click", () => { moveUpSelected(); hideCtx(); });
    if (dom.ctxMoveDown) dom.ctxMoveDown.addEventListener("click", () => { moveDownSelected(); hideCtx(); });
  }

  // -------------------- Bindings (props/project/toolbox) --------------------
  function updateSelected(mutator) {
    const map = idMap();
    const n = map.get(state.selectedId);
    if (!n) return;
    mutator(n, map);
    clampInParent(n, map);
    render();
  }

  function bindProps() {
    if (dom.propName) dom.propName.addEventListener("input", () => updateSelected((n) => (n.name = dom.propName.value.trim() || n.type)));

    if (dom.propParent) dom.propParent.addEventListener("change", () => {
      if (!state.selectedId) return;
      const pid = dom.propParent.value;
      if (pid === state.selectedId) return;
      if (isDescendant(pid, state.selectedId)) return;
      reparentNode(state.selectedId, pid);
      render();
    });

    const applyXYWH = () => updateSelected((n) => {
      if (dom.propX) n.x = Number(dom.propX.value);
      if (dom.propY) n.y = Number(dom.propY.value);
      if (dom.propW) n.w = Number(dom.propW.value);
      if (dom.propH) n.h = Number(dom.propH.value);
    });
    if (dom.propX) dom.propX.addEventListener("input", applyXYWH);
    if (dom.propY) dom.propY.addEventListener("input", applyXYWH);
    if (dom.propW) dom.propW.addEventListener("input", applyXYWH);
    if (dom.propH) dom.propH.addEventListener("input", applyXYWH);

    if (dom.propAnchor) dom.propAnchor.addEventListener("change", () => {
      const [ax, ay] = dom.propAnchor.value.split(",").map(Number);
      updateSelected((n) => {
        n.anchorX = isFinite(ax) ? ax : 0;
        n.anchorY = isFinite(ay) ? ay : 0;
      });
    });

    if (dom.propZIndex) dom.propZIndex.addEventListener("input", () => updateSelected((n) => {
      n.zIndex = round(dom.propZIndex.value || 1);
      normalizeZ(n.parentId || "ROOT");
    }));

    if (dom.propBgColor) dom.propBgColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(dom.propBgColor.value);
      updateSelected((n) => (n.bgColor = { r, g, b }));
    });

    if (dom.propBgAlpha) dom.propBgAlpha.addEventListener("input", () => {
      const a = clamp(Number(dom.propBgAlpha.value), 0, 1);
      if (dom.propBgAlphaLabel) dom.propBgAlphaLabel.textContent = a.toFixed(2);
      updateSelected((n) => (n.bgAlpha = a));
    });

    if (dom.propBorder) dom.propBorder.addEventListener("change", () => updateSelected((n) => (n.border = dom.propBorder.value === "true")));

    if (dom.propText) dom.propText.addEventListener("input", () => updateSelected((n) => { if (isTextType(n)) n.text = dom.propText.value; }));
    if (dom.propTextColor) dom.propTextColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(dom.propTextColor.value);
      updateSelected((n) => { if (isTextType(n)) n.textColor = { r, g, b }; });
    });
    if (dom.propTextScaled) dom.propTextScaled.addEventListener("change", () => updateSelected((n) => { if (isTextType(n)) n.textScaled = dom.propTextScaled.value === "true"; }));
    if (dom.propFont) dom.propFont.addEventListener("change", () => updateSelected((n) => { if (isTextType(n)) n.font = dom.propFont.value; }));

    if (dom.propImage) dom.propImage.addEventListener("input", () => updateSelected((n) => { if (isImageType(n)) n.image = dom.propImage.value; }));

    const applyScroll = () => updateSelected((n) => {
      if (n.type !== "ScrollingFrame") return;
      n.canvasSize = n.canvasSize || { w: 0, h: 0 };
      if (dom.propCanvasW) n.canvasSize.w = round(dom.propCanvasW.value || 0);
      if (dom.propCanvasH) n.canvasSize.h = round(dom.propCanvasH.value || 0);
      if (dom.propScrollBar) n.scrollBarThickness = round(dom.propScrollBar.value || 0);
    });
    if (dom.propCanvasW) dom.propCanvasW.addEventListener("input", applyScroll);
    if (dom.propCanvasH) dom.propCanvasH.addEventListener("input", applyScroll);
    if (dom.propScrollBar) dom.propScrollBar.addEventListener("input", applyScroll);
  }

  function bindProjectControls() {
    if (dom.guiName) dom.guiName.addEventListener("input", () => { state.project.guiName = dom.guiName.value.trim() || "ScreenGui"; render(); });
    if (dom.resetOnSpawn) dom.resetOnSpawn.addEventListener("change", () => { state.project.resetOnSpawn = dom.resetOnSpawn.value === "true"; render(); });
    if (dom.guiParent) dom.guiParent.addEventListener("change", () => { state.project.parent = dom.guiParent.value; render(); });
    if (dom.outputMode) dom.outputMode.addEventListener("change", () => { state.project.outputMode = dom.outputMode.value; render(); });

    if (dom.chkSafeArea) dom.chkSafeArea.addEventListener("change", () => { state.showSafeArea = dom.chkSafeArea.checked; render(); });
    if (dom.zoom) dom.zoom.addEventListener("input", () => { state.zoom = clamp(Number(dom.zoom.value) / 100, 0.5, 2.0); render(); });

    if (dom.tabInstances && dom.tabUiObjects && dom.toolboxInstances && dom.toolboxUiObjects) {
      dom.tabInstances.addEventListener("click", () => {
        dom.tabInstances.classList.add("active");
        dom.tabUiObjects.classList.remove("active");
        dom.toolboxInstances.hidden = false;
        dom.toolboxUiObjects.hidden = true;
      });
      dom.tabUiObjects.addEventListener("click", () => {
        dom.tabUiObjects.classList.add("active");
        dom.tabInstances.classList.remove("active");
        dom.toolboxInstances.hidden = true;
        dom.toolboxUiObjects.hidden = false;
      });
    }
  }

  function bindToolbox() {
    $$(".tool[data-create]").forEach((btn) => {
      btn.addEventListener("click", () => createNode(btn.dataset.create));
    });

    $$(".tool[data-add-ui]").forEach((btn) => {
      btn.addEventListener("click", () => addUiObject(btn.dataset.addUi));
    });
  }

  // -------------------- Save/Load --------------------
  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus("Saved.", "");
  }
  function loadFromStorage() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { setStatus("Nothing saved yet.", ""); return; }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes)) throw new Error("Invalid save");
      state.project = parsed.project || state.project;
      state.nodes = parsed.nodes || [];
      state.selectedId = parsed.selectedId || null;
      state.zoom = parsed.zoom || 1;
      state.showSafeArea = !!parsed.showSafeArea;
      if (dom.chkSafeArea) dom.chkSafeArea.checked = state.showSafeArea;
      setStatus("Loaded.", "");
      render();
    } catch {
      setStatus("Load failed (corrupt save).", "");
    }
  }

  // -------------------- Export Lua --------------------
  function luaBool(b) { return b ? "true" : "false"; }
  function formatColor3(rgb) { return `Color3.fromRGB(${rgb.r}, ${rgb.g}, ${rgb.b})`; }

  function depthOf(id, map) {
    let d = 0;
    let cur = map.get(id);
    while (cur && (cur.parentId || "ROOT") !== "ROOT") {
      d++;
      cur = map.get(cur.parentId);
    }
    return d;
  }

  function exportLua() {
    if (!dom.exportBox) return;

    const useVars = state.project.outputMode === "variables";
    const guiName = state.project.guiName?.trim() || "ScreenGui";
    const resetOnSpawn = !!state.project.resetOnSpawn;
    const parent = state.project.parent;

    const map = idMap();
    const ch = childrenMap();

    const lines = [];
    const emit = (s = "") => lines.push(s);

    const taken = new Set(["game", "workspace", "script", "player", "screenGui"]);
    const varMap = new Map();

    const varNameFor = (n) => {
      if (varMap.has(n.id)) return varMap.get(n.id);
      let base = safeLuaIdent((n.name || n.type).replace(/\s+/g, ""));
      base = base.charAt(0).toLowerCase() + base.slice(1);
      let v = base, i = 2;
      while (taken.has(v)) v = `${base}${i++}`;
      taken.add(v);
      varMap.set(n.id, v);
      return v;
    };

    const pre = (lvl) => (useVars ? "" : "  ".repeat(lvl));

    // Header
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
      emit(`${pre(1)}local screenGui = Instance.new("ScreenGui")`);
      emit(`${pre(1)}screenGui.Name = "${escapeLuaString(guiName)}"`);
      emit(`${pre(1)}screenGui.ResetOnSpawn = ${luaBool(resetOnSpawn)}`);
      if (parent === "PlayerGui") {
        emit(`${pre(1)}local player = game.Players.LocalPlayer`);
        emit(`${pre(1)}screenGui.Parent = player:WaitForChild("PlayerGui")`);
      } else {
        emit(`${pre(1)}screenGui.Parent = game:GetService("CoreGui")`);
      }
      emit("");
    }

    const created = new Set(["ROOT"]);

    const emitNode = (id) => {
      if (created.has(id)) return;
      const n = map.get(id);
      if (!n) return;

      const pid = n.parentId || "ROOT";
      if (pid !== "ROOT") emitNode(pid);

      const v = useVars ? varNameFor(n) : safeLuaIdent(n.type.toLowerCase());
      const pfx = useVars ? "" : pre(1);

      emit(`${pfx}local ${v} = Instance.new("${n.type}")`);
      emit(`${pfx}${v}.Name = "${escapeLuaString(n.name || n.type)}"`);
      emit(`${pfx}${v}.Size = UDim2.new(0, ${round(n.w)}, 0, ${round(n.h)})`);

      const posX = round(n.x - n.anchorX * n.w);
      const posY = round(n.y - n.anchorY * n.h);
      emit(`${pfx}${v}.Position = UDim2.new(0, ${posX}, 0, ${posY})`);
      emit(`${pfx}${v}.AnchorPoint = Vector2.new(${n.anchorX}, ${n.anchorY})`);
      emit(`${pfx}${v}.ZIndex = ${round(n.zIndex ?? 1)}`);

      emit(`${pfx}${v}.BackgroundColor3 = ${formatColor3(n.bgColor)}`);
      emit(`${pfx}${v}.BackgroundTransparency = ${(clamp(1 - n.bgAlpha, 0, 1)).toFixed(2)}`);
      emit(`${pfx}${v}.BorderSizePixel = ${n.border ? 1 : 0}`);

      if (isTextType(n)) {
        emit(`${pfx}${v}.TextColor3 = ${formatColor3(n.textColor)}`);
        emit(`${pfx}${v}.Text = "${escapeLuaString(n.text ?? "")}"`);
        emit(`${pfx}${v}.TextScaled = ${luaBool(!!n.textScaled)}`);
        emit(`${pfx}${v}.Font = Enum.Font.${n.font || "SourceSansBold"}`);
      }

      if (isImageType(n)) {
        const img = (n.image || "").trim();
        if (img) emit(`${pfx}${v}.Image = "${escapeLuaString(img)}"`);
      }

      if (n.type === "ScrollingFrame") {
        const cw = round(n.canvasSize?.w ?? 0);
        const chh = round(n.canvasSize?.h ?? 0);
        emit(`${pfx}${v}.CanvasSize = UDim2.new(0, ${cw}, 0, ${chh})`);
        emit(`${pfx}${v}.ScrollBarThickness = ${round(n.scrollBarThickness ?? 8)}`);
      }

      // UI objects (basic defaults only)
      for (const obj of (n.uiObjects || [])) {
        const uiVar = useVars ? `${v}_${safeLuaIdent(obj.type).toLowerCase()}` : `ui_${safeLuaIdent(obj.type).toLowerCase()}`;
        emit(`${pfx}local ${uiVar} = Instance.new("${obj.type}")`);

        if (obj.type === "UICorner") {
          const r = round(obj.props?.cornerRadius ?? 8);
          emit(`${pfx}${uiVar}.CornerRadius = UDim.new(0, ${r})`);
        }
        if (obj.type === "UIStroke") {
          const t = round(obj.props?.thickness ?? 2);
          const c = obj.props?.color || { r: 255, g: 255, b: 255 };
          const tr = clamp(Number(obj.props?.transparency ?? 0.2), 0, 1);
          emit(`${pfx}${uiVar}.Thickness = ${t}`);
          emit(`${pfx}${uiVar}.Color = ${formatColor3(c)}`);
          emit(`${pfx}${uiVar}.Transparency = ${tr.toFixed(2)}`);
        }
        if (obj.type === "UIAspectRatioConstraint") {
          const ar = Number(obj.props?.aspectRatio ?? 1.0);
          emit(`${pfx}${uiVar}.AspectRatio = ${ar}`);
        }
        if (obj.type === "UITextSizeConstraint") {
          const minT = round(obj.props?.minTextSize ?? 8);
          const maxT = round(obj.props?.maxTextSize ?? 48);
          emit(`${pfx}${uiVar}.MinTextSize = ${minT}`);
          emit(`${pfx}${uiVar}.MaxTextSize = ${maxT}`);
        }
        if (obj.type === "UISizeConstraint") {
          const p = obj.props || {};
          emit(`${pfx}${uiVar}.MinSize = Vector2.new(${round(p.minW ?? 0)}, ${round(p.minH ?? 0)})`);
          emit(`${pfx}${uiVar}.MaxSize = Vector2.new(${round(p.maxW ?? 0)}, ${round(p.maxH ?? 0)})`);
        }
        if (obj.type === "UIScale") {
          const sc = Number(obj.props?.scale ?? 1.0);
          emit(`${pfx}${uiVar}.Scale = ${sc}`);
        }
        if (obj.type === "UIPadding") {
          const p = obj.props || {};
          emit(`${pfx}${uiVar}.PaddingLeft = UDim.new(0, ${round(p.left ?? 0)})`);
          emit(`${pfx}${uiVar}.PaddingRight = UDim.new(0, ${round(p.right ?? 0)})`);
          emit(`${pfx}${uiVar}.PaddingTop = UDim.new(0, ${round(p.top ?? 0)})`);
          emit(`${pfx}${uiVar}.PaddingBottom = UDim.new(0, ${round(p.bottom ?? 0)})`);
        }

        emit(`${pfx}${uiVar}.Parent = ${v}`);
      }

      // Parent assignment at end (after properties)
      if (pid === "ROOT") emit(`${pfx}${v}.Parent = screenGui`);
      else emit(`${pfx}${v}.Parent = ${useVars ? varMap.get(pid) : safeLuaIdent(map.get(pid)?.type?.toLowerCase() || "frame")}`);

      emit("");
      created.add(id);
    };

    // Emit nodes in depth order, then sibling zIndex order
    const ids = state.nodes.slice().sort((a, b) => {
      const da = depthOf(a.id, map);
      const db = depthOf(b.id, map);
      if (da !== db) return da - db;
      if ((a.parentId || "ROOT") !== (b.parentId || "ROOT")) return 0;
      return (a.zIndex ?? 1) - (b.zIndex ?? 1);
    }).map(n => n.id);

    for (const id of ids) emitNode(id);

    if (!useVars) emit("end");

    dom.exportBox.value = lines.join("\n").trimEnd();
    render();
    setStatus("Exported Lua.", "");
  }

  async function copyExport() {
    const text = (dom.exportBox?.value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied.", "");
    } catch {
      dom.exportBox.focus();
      dom.exportBox.select();
      document.execCommand("copy");
      setStatus("Copied (fallback).", "");
    }
  }

  function downloadExport() {
    const text = (dom.exportBox?.value || "").trim();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.project.guiName || "ui").replace(/[^\w\-]+/g, "_")}.lua`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  // -------------------- Buttons / keyboard --------------------
  function bindButtons() {
    if (dom.btnNew) dom.btnNew.addEventListener("click", newProject);
    if (dom.btnSave) dom.btnSave.addEventListener("click", saveToStorage);
    if (dom.btnLoad) dom.btnLoad.addEventListener("click", loadFromStorage);
    if (dom.btnExport) dom.btnExport.addEventListener("click", exportLua);

    if (dom.btnCopy) dom.btnCopy.addEventListener("click", copyExport);
    if (dom.btnDownload) dom.btnDownload.addEventListener("click", downloadExport);

    if (dom.btnDuplicate) dom.btnDuplicate.addEventListener("click", duplicateSelected);
    if (dom.btnMoveUp) dom.btnMoveUp.addEventListener("click", moveUpSelected);
    if (dom.btnMoveDown) dom.btnMoveDown.addEventListener("click", moveDownSelected);
  }

  function bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;

      // Delete ONLY on Delete key
      if (e.key === "Delete") {
        if (state.selectedId) {
          deleteSelected();
          e.preventDefault();
        }
      }

      // Backspace NEVER deletes (we do nothing here)
      if (e.key === "Backspace") {
        // only prevent navigation if focused on body (optional)
        if (document.activeElement === document.body) e.preventDefault();
      }

      if (mod && (e.key === "d" || e.key === "D")) {
        if (state.selectedId) { duplicateSelected(); e.preventDefault(); }
      }
      if (mod && (e.key === "s" || e.key === "S")) {
        saveToStorage(); e.preventDefault();
      }
      if (mod && (e.key === "e" || e.key === "E")) {
        exportLua(); e.preventDefault();
      }
    });
  }

  // -------------------- Canvas bind --------------------
  function bindCanvas() {
    if (!dom.canvas) return;
    dom.canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // avoid mobile scroll during drag
    dom.canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  // -------------------- Save/Load (uses state) --------------------
  function saveToStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    setStatus("Saved.", "");
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
      if (dom.chkSafeArea) dom.chkSafeArea.checked = state.showSafeArea;
      setStatus("Loaded.", "");
      render();
    } catch {
      setStatus("Load failed.", "");
    }
  }

  // -------------------- Init --------------------
  function init() {
    // Defensive checks for required core DOM
    if (!dom.canvas || !dom.canvasOuter) {
      console.error("Canvas elements missing (#canvas, #canvasOuter). Check index.html.");
      return;
    }

    // Toolbox
    bindToolbox();

    // Props + project controls
    bindProps();
    bindProjectControls();

    // Buttons + keyboard + canvas + context menu
    bindButtons();
    bindKeyboard();
    bindCanvas();
    bindContextMenu();

    // initial project
    newProject();
    setStatus("Ready. (v4)", `Canvas: ${CANVAS_W}×${CANVAS_H}px`);
  }

  init();
})();

