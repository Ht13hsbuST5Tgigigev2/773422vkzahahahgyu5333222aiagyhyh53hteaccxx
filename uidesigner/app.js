/* app.js — RBLX UI Designer (v2)
   Fixes & upgrades requested:
   ✅ Backspace no longer deletes (only Del or right-click menu)
   ✅ Proper Explorer (tree) with selection, parenting, and ordering (ZIndex)
   ✅ More UI elements: Frame, ScrollingFrame, TextLabel, TextButton, TextBox, ImageLabel, ImageButton
   ✅ “UI Objects” tab (UICorner, UIStroke, UIGradient, etc.) attach to selected instance
   ✅ Much better placement: true drag inside canvas, drag inside parent frames, drop-to-parent
   ✅ Drag-drop parenting:
        - Drop an element onto a Frame/ScrollingFrame in canvas to parent it
        - Drop Explorer rows onto other rows to parent, or reorder for ZIndex

   Notes:
   - Coordinates are stored as ANCHOR position (x,y) within parent, with AnchorPoint applied.
   - Export uses UDim2 offsets only (like your example), with AnchorPoint + Position offsets.
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
  const btnBringFront = $("#btnBringFront");
  const btnSendBack = $("#btnSendBack");

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
  const ctxBringFront = $("#ctxBringFront");
  const ctxSendBack = $("#ctxSendBack");

  // -------------------- Canvas size --------------------
  const CANVAS_W = 980;
  const CANVAS_H = 620;
  canvas.style.width = `${CANVAS_W}px`;
  canvas.style.height = `${CANVAS_H}px`;

  // -------------------- State --------------------
  const STORAGE_KEY = "rblx-ui-designer:v2";

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

  function setStatus(left, right = "") {
    if (typeof left === "string") statusLeft.textContent = left;
    if (typeof right === "string") statusRight.textContent = right;
  }

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
          // anchor-position in parent space
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

          // ScrollingFrame-only
          canvasSize: { w: 0, h: 0 },
          scrollBarThickness: 6,

          // UI Objects attached to this instance
          uiObjects: [],
        },
      ],
      selectedId: textId,
      zoom: 1,
      showSafeArea: false,
    };
  }

  // -------------------- Node utilities --------------------
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
    // sort children by zIndex then insertion-ish
    for (const [pid, ids] of m.entries()) {
      ids.sort((a, b) => {
        const A = state.nodes.find((x) => x.id === a);
        const B = state.nodes.find((x) => x.id === b);
        return (A?.zIndex ?? 0) - (B?.zIndex ?? 0);
      });
    }
    return m;
  }

  // Absolute layout math (top-left + anchor)
  function absTopLeft(id, map) {
    const n = map.get(id);
    if (!n) return { x: 0, y: 0 };

    const pid = n.parentId || "ROOT";
    const parentTL = pid === "ROOT" ? { x: 0, y: 0 } : absTopLeft(pid, map);

    const tlx = parentTL.x + (n.x - n.anchorX * n.w);
    const tly = parentTL.y + (n.y - n.anchorY * n.h);
    return { x: tlx, y: tly };
  }

  function absAnchor(id, map) {
    const n = map.get(id);
    if (!n) return { x: 0, y: 0 };
    const pid = n.parentId || "ROOT";
    const parentTL = pid === "ROOT" ? { x: 0, y: 0 } : absTopLeft(pid, map);
    return { x: parentTL.x + n.x, y: parentTL.y + n.y };
  }

  function parentSize(pid, map) {
    if (pid === "ROOT") return { w: CANVAS_W, h: CANVAS_H };
    const p = map.get(pid);
    if (!p) return { w: CANVAS_W, h: CANVAS_H };
    return { w: p.w, h: p.h };
  }

  function clampInParent(n, map) {
    const pid = n.parentId || "ROOT";
    const ps = parentSize(pid, map);

    // clamp anchor position such that element stays fully within parent bounds
    const minX = n.anchorX * n.w;
    const maxX = ps.w - (1 - n.anchorX) * n.w;
    const minY = n.anchorY * n.h;
    const maxY = ps.h - (1 - n.anchorY) * n.h;

    n.x = clamp(round(n.x), minX, maxX);
    n.y = clamp(round(n.y), minY, maxY);

    // size clamp also within parent
    n.w = clamp(round(n.w), 20, ps.w);
    n.h = clamp(round(n.h), 20, ps.h);
  }

  function selectNode(id) {
    state.selectedId = id;
    const m = byId();
    const n = m.get(id);
    if (n) {
      setStatus(`Selected: ${n.type} (${n.name || n.type})`, `x:${n.x} y:${n.y} w:${n.w} h:${n.h} z:${n.zIndex ?? 1}`);
    } else {
      setStatus("Ready.", "");
    }
    render();
  }

  function clearSelection() {
    state.selectedId = null;
    setStatus("Ready.", "");
    render();
  }

  // -------------------- Creation --------------------
  function makeNode(type, parentId = "ROOT") {
    const m = byId();
    const ps = parentSize(parentId, m);

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
      base.w = 320;
      base.h = 180;
      base.bgColor = { r: 38, g: 38, b: 44 };
    }

    if (type === "ScrollingFrame") {
      base.w = 360;
      base.h = 220;
      base.bgColor = { r: 35, g: 35, b: 42 };
      base.canvasSize = { w: 520, h: 360 };
      base.scrollBarThickness = 8;
    }

    if (type === "TextLabel") {
      base.w = 300;
      base.h = 100;
      base.bgColor = { r: 30, g: 30, b: 30 };
      base.text = "TextLabel";
    }

    if (type === "TextButton") {
      base.w = 280;
      base.h = 90;
      base.bgColor = { r: 48, g: 48, b: 58 };
      base.text = "Button";
      base.border = true;
    }

    if (type === "TextBox") {
      base.w = 320;
      base.h = 80;
      base.bgColor = { r: 28, g: 28, b: 34 };
      base.text = "Type here…";
      base.border = true;
    }

    if (type === "ImageLabel") {
      base.w = 280;
      base.h = 180;
      base.bgColor = { r: 26, g: 26, b: 32 };
    }

    if (type === "ImageButton") {
      base.w = 280;
      base.h = 180;
      base.bgColor = { r: 26, g: 26, b: 32 };
      base.border = true;
    }

    clampInParent(base, m);
    return base;
  }

  function nextZIndex(parentId) {
    const siblings = state.nodes.filter((n) => (n.parentId || "ROOT") === parentId);
    const max = siblings.reduce((acc, n) => Math.max(acc, n.zIndex ?? 1), 0);
    return max + 1;
  }

  function createNode(type) {
    const parentId = "ROOT";
    const node = makeNode(type, parentId);
    state.nodes.push(node);
    selectNode(node.id);
  }

  function addUiObject(type) {
    if (!state.selectedId) {
      setStatus("Select an instance first to add UI Objects.", "");
      return;
    }
    const m = byId();
    const n = m.get(state.selectedId);
    if (!n) return;

    n.uiObjects = n.uiObjects || [];
    const obj = { id: uid(), type, props: {} };

    // sensible defaults
    if (type === "UICorner") obj.props = { cornerRadius: 8 };
    if (type === "UIStroke") obj.props = { thickness: 2, color: { r: 255, g: 255, b: 255 }, transparency: 0.2 };
    if (type === "UIGradient") obj.props = { enabled: true };
    if (type === "UITextSizeConstraint") obj.props = { minTextSize: 8, maxTextSize: 48 };
    if (type === "UISizeConstraint") obj.props = { minW: 0, minH: 0, maxW: 0, maxH: 0 };
    if (type === "UIAspectRatioConstraint") obj.props = { aspectRatio: 1.0 };

    n.uiObjects.push(obj);
    setStatus(`Added ${type} to ${n.name || n.type}.`, "");
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
  function cssWeightForFont(font) {
    if (font === "SourceSansBold" || font === "GothamBold") return "700";
    return "500";
  }

  function render() {
    // project controls
    guiNameEl.value = state.project.guiName;
    resetOnSpawnEl.value = String(state.project.resetOnSpawn);
    guiParentEl.value = state.project.parent;
    outputModeEl.value = state.project.outputMode;

    // zoom + safe area
    canvasOuter.style.setProperty("--zoom", String(state.zoom));
    zoom.value = String(Math.round(state.zoom * 100));
    zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
    safeArea.hidden = !state.showSafeArea;

    // canvas
    canvas.innerHTML = "";

    const m = byId();
    const ch = childrenMap();

    // create dom nodes recursively
    const domById = new Map();

    const makeDomForNode = (n) => {
      const el = document.createElement("div");
      el.className = `node node-${n.type.toLowerCase()}${n.id === state.selectedId ? " selected" : ""}`;
      el.dataset.id = n.id;
      el.style.width = `${n.w}px`;
      el.style.height = `${n.h}px`;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.style.zIndex = String(n.zIndex ?? 1);

      // anchor transform
      el.style.transform = `translate(${-n.anchorX * 100}%, ${-n.anchorY * 100}%)`;

      // visuals
      el.style.background = `rgba(${n.bgColor.r},${n.bgColor.g},${n.bgColor.b},${n.bgAlpha})`;
      el.style.border = n.border ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent";

      if (n.type === "Frame" || n.type === "ScrollingFrame") {
        el.classList.add("container");
        if (n.type === "ScrollingFrame") el.classList.add("scrolling");
      }

      // content
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
        if (src && !src.startsWith("rbxassetid://")) {
          img.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
        } else {
          img.classList.add("placeholder");
        }
        el.appendChild(img);

        if (n.type === "ImageButton") el.classList.add("clickable");
      }

      // If container, we want children inside a dedicated inner layer that is absolute
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

      domById.set(n.id, el);
      return { el, inner };
    };

    // build root children first (but nested properly)
    const buildTree = (pid, parentInner) => {
      const ids = (ch.get(pid) || []).slice();
      // sort by zIndex then stable
      ids.sort((a, b) => (m.get(a)?.zIndex ?? 1) - (m.get(b)?.zIndex ?? 1));

      for (const id of ids) {
        const n = m.get(id);
        if (!n) continue;
        const { el, inner } = makeDomForNode(n);
        parentInner.appendChild(el);
        buildTree(id, inner);
      }
    };

    // Root parent is the canvas itself (position: relative)
    buildTree("ROOT", canvas);

    // Explorer
    renderExplorer(m, ch);
    // Properties
    renderProperties(m);

    // update export buttons
    btnCopy.disabled = !(exportBox.value || "").trim();
    btnDownload.disabled = btnCopy.disabled;
  }

  function renderExplorer(m, ch) {
    explorer.innerHTML = "";

    const root = document.createElement("div");
    root.className = "ex-root";
    root.innerHTML = `<div class="ex-row ex-root-row" data-id="ROOT">
      <span class="ex-badge">ScreenGui</span>
      <span class="ex-name">${(state.project.guiName || "ScreenGui")}</span>
    </div>`;
    explorer.appendChild(root);

    const makeRow = (id, depth) => {
      const n = m.get(id);
      const row = document.createElement("div");
      row.className = `ex-row${id === state.selectedId ? " active" : ""}`;
      row.draggable = true;
      row.dataset.id = id;
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

      // drag-drop in explorer: reorder + reparent
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", id);
        e.dataTransfer.effectAllowed = "move";
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("drop");
        e.dataTransfer.dropEffect = "move";
      });

      row.addEventListener("dragleave", () => row.classList.remove("drop"));

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("drop");
        const draggedId = e.dataTransfer.getData("text/plain");
        if (!draggedId || draggedId === id) return;

        const target = m.get(id);
        const dragged = m.get(draggedId);
        if (!target || !dragged) return;

        // If dropping onto a container => parent it
        if (isContainer(target)) {
          reparentNode(draggedId, id);
          setStatus(`Parented ${dragged.name || dragged.type} → ${target.name || target.type}`, "");
        } else {
          // else reorder among siblings (same parent as target)
          const sibParent = target.parentId || "ROOT";
          if ((dragged.parentId || "ROOT") !== sibParent) {
            // moving across parents by reorder target's parent
            reparentNode(draggedId, sibParent);
          }
          reorderWithinParent(draggedId, id);
          setStatus("Reordered (ZIndex).", "");
        }
        render();
      });

      return row;
    };

    const addChildren = (pid, depth) => {
      const ids = (ch.get(pid) || []).slice().sort((a, b) => (m.get(a)?.zIndex ?? 1) - (m.get(b)?.zIndex ?? 1));
      for (const id of ids) {
        explorer.appendChild(makeRow(id, depth));
        addChildren(id, depth + 1);
      }
    };

    addChildren("ROOT", 0);
  }

  function renderProperties(m) {
    const n = state.selectedId ? m.get(state.selectedId) : null;
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

    // parent select options
    const opts = [];
    opts.push({ id: "ROOT", label: "ScreenGui (root)" });
    for (const node of state.nodes) {
      // valid parents: ROOT + Frame/ScrollingFrame (not self, not descendants)
      if (!isContainer(node)) continue;
      if (node.id === n.id) continue;
      if (isDescendant(node.id, n.id)) continue; // don't allow parenting to a child
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
    const textOn = isTextType(n);
    propText.disabled = !textOn;
    propTextColor.disabled = !textOn;
    propTextScaled.disabled = !textOn;
    propFont.disabled = !textOn;

    propText.value = textOn ? (n.text ?? "") : "";
    propTextColor.value = textOn ? rgbToHex(n.textColor.r, n.textColor.g, n.textColor.b) : "#ffffff";
    propTextScaled.value = textOn ? String(!!n.textScaled) : "true";
    propFont.value = textOn ? (n.font || "SourceSansBold") : "SourceSansBold";

    // image
    const imgOn = isImageType(n);
    propImage.disabled = !imgOn;
    propImage.value = imgOn ? (n.image || "") : "";

    // scrollingframe props
    const scrollOn = n.type === "ScrollingFrame";
    propCanvasW.disabled = !scrollOn;
    propCanvasH.disabled = !scrollOn;
    propScrollBar.disabled = !scrollOn;

    propCanvasW.value = scrollOn ? String(n.canvasSize?.w ?? 0) : "";
    propCanvasH.value = scrollOn ? String(n.canvasSize?.h ?? 0) : "";
    propScrollBar.value = scrollOn ? String(n.scrollBarThickness ?? 6) : "";

    // UI objects list
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
        row.querySelector(".uiobj-remove").addEventListener("click", () => {
          removeUiObject(n.id, obj.id);
        });
        uiObjectsList.appendChild(row);
      }
    }
  }

  function isDescendant(maybeChildId, maybeParentId) {
    // return true if maybeChildId is inside maybeParentId (direct or indirect)
    let cur = state.nodes.find(n => n.id === maybeChildId);
    while (cur) {
      const pid = cur.parentId || "ROOT";
      if (pid === maybeParentId) return true;
      if (pid === "ROOT") return false;
      cur = state.nodes.find(n => n.id === pid);
    }
    return false;
  }

  function removeUiObject(nodeId, uiId) {
    const m = byId();
    const n = m.get(nodeId);
    if (!n) return;
    n.uiObjects = (n.uiObjects || []).filter(o => o.id !== uiId);
    setStatus("Removed UI Object.", "");
    render();
  }

  // -------------------- Reparent / reorder --------------------
  function reparentNode(nodeId, newParentId) {
    const m = byId();
    const n = m.get(nodeId);
    if (!n) return;

    const oldParent = n.parentId || "ROOT";
    if (oldParent === newParentId) return;

    // Keep world anchor position constant
    const worldA = absAnchor(nodeId, m);
    n.parentId = newParentId;

    // New parent top-left
    const newParentTL = newParentId === "ROOT" ? { x: 0, y: 0 } : absTopLeft(newParentId, m);
    n.x = worldA.x - newParentTL.x;
    n.y = worldA.y - newParentTL.y;

    // bump zIndex in new parent to top
    n.zIndex = nextZIndex(newParentId);

    clampInParent(n, m);
  }

  function reorderWithinParent(dragId, targetId) {
    const m = byId();
    const drag = m.get(dragId);
    const target = m.get(targetId);
    if (!drag || !target) return;

    const pid = target.parentId || "ROOT";
    const siblings = state.nodes
      .filter(n => (n.parentId || "ROOT") === pid)
      .sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));

    const fromIdx = siblings.findIndex(n => n.id === dragId);
    const toIdx = siblings.findIndex(n => n.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    siblings.splice(fromIdx, 1);
    siblings.splice(toIdx, 0, drag);

    // reassign sequential zIndex
    siblings.forEach((n, i) => (n.zIndex = i + 1));
  }

  function bringToFront(id) {
    const m = byId();
    const n = m.get(id);
    if (!n) return;
    n.zIndex = nextZIndex(n.parentId || "ROOT");
  }

  function sendToBack(id) {
    const m = byId();
    const n = m.get(id);
    if (!n) return;
    const pid = n.parentId || "ROOT";
    const siblings = state.nodes.filter(x => (x.parentId || "ROOT") === pid);
    siblings.sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1));
    // put n at start
    const reordered = [n, ...siblings.filter(s => s.id !== id)];
    reordered.forEach((s, i) => (s.zIndex = i + 1));
  }

  // -------------------- Drag/Resize on Canvas --------------------
  const dragState = {
    active: false,
    mode: null,      // "move" | "resize"
    id: null,
    handle: null,
    startMouse: { x: 0, y: 0 }, // in parent-local coords
    start: { x: 0, y: 0, w: 0, h: 0 },
    parentId: "ROOT",
  };

  function canvasEventToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    const z = state.zoom;
    return {
      x: (e.clientX - rect.left) / z,
      y: (e.clientY - rect.top) / z,
    };
  }

  function worldToParentLocal(world, parentId, m) {
    const parentTL = parentId === "ROOT" ? { x: 0, y: 0 } : absTopLeft(parentId, m);
    return { x: world.x - parentTL.x, y: world.y - parentTL.y };
  }

  function onPointerDown(e) {
    // ignore right click (context menu)
    if (e.button === 2) return;

    const nodeEl = e.target.closest(".node");
    if (!nodeEl) {
      clearSelection();
      return;
    }

    const id = nodeEl.dataset.id;
    selectNode(id);

    const m = byId();
    const n = m.get(id);
    if (!n) return;

    // detect handle
    const handleEl = e.target.closest(".handle");
    const handle = handleEl ? handleEl.dataset.handle : null;

    dragState.active = true;
    dragState.id = id;
    dragState.mode = handle ? "resize" : "move";
    dragState.handle = handle;
    dragState.parentId = n.parentId || "ROOT";

    const world = canvasEventToWorld(e);
    const local = worldToParentLocal(world, dragState.parentId, m);

    dragState.startMouse = local;
    dragState.start = { x: n.x, y: n.y, w: n.w, h: n.h };

    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function applyMove(n, dx, dy, m) {
    n.x = dragState.start.x + dx;
    n.y = dragState.start.y + dy;
    clampInParent(n, m);
  }

  function applyResize(n, dx, dy, handle, m) {
    // resizing around anchor is messy; we resize using top-left deltas,
    // but keep anchor position consistent relative to box by adjusting x/y when needed.
    const start = dragState.start;

    // compute start top-left in parent local
    const startTL = {
      x: start.x - n.anchorX * start.w,
      y: start.y - n.anchorY * start.h,
    };
    let tlx = startTL.x;
    let tly = startTL.y;
    let brx = startTL.x + start.w;
    let bry = startTL.y + start.h;

    const moveLeft = handle.includes("w");
    const moveRight = handle.includes("e");
    const moveTop = handle.includes("n");
    const moveBottom = handle.includes("s");

    if (moveLeft) tlx = startTL.x + dx;
    if (moveRight) brx = startTL.x + start.w + dx;
    if (moveTop) tly = startTL.y + dy;
    if (moveBottom) bry = startTL.y + start.h + dy;

    // min size
    const minW = 20, minH = 20;
    if (brx - tlx < minW) {
      if (moveLeft) tlx = brx - minW;
      else brx = tlx + minW;
    }
    if (bry - tly < minH) {
      if (moveTop) tly = bry - minH;
      else bry = tly + minH;
    }

    const newW = brx - tlx;
    const newH = bry - tly;

    n.w = round(newW);
    n.h = round(newH);

    // new anchor position = top-left + anchor * size
    n.x = tlx + n.anchorX * n.w;
    n.y = tly + n.anchorY * n.h;

    clampInParent(n, m);
  }

  function findDropParent(world, m) {
    // Find top-most container under pointer excluding the dragged node itself.
    // We check DOM hit-test first, then verify type.
    const z = state.zoom;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + world.x * z;
    const cy = rect.top + world.y * z;

    const el = document.elementFromPoint(cx, cy);
    if (!el) return "ROOT";

    const containerEl = el.closest(".node.container");
    if (!containerEl) return "ROOT";

    const id = containerEl.dataset.id;
    const n = m.get(id);
    if (!n) return "ROOT";
    if (!isContainer(n)) return "ROOT";
    return id;
  }

  function onPointerMove(e) {
    if (!dragState.active) return;

    const m = byId();
    const n = m.get(dragState.id);
    if (!n) return;

    const world = canvasEventToWorld(e);
    const local = worldToParentLocal(world, dragState.parentId, m);

    const dx = local.x - dragState.startMouse.x;
    const dy = local.y - dragState.startMouse.y;

    if (dragState.mode === "move") applyMove(n, dx, dy, m);
    else applyResize(n, dx, dy, dragState.handle, m);

    setStatus(`Editing: ${n.type} (${n.name || n.type})`, `x:${n.x} y:${n.y} w:${n.w} h:${n.h} z:${n.zIndex ?? 1}`);
    render();
  }

  function onPointerUp(e) {
    if (!dragState.active) return;

    const m = byId();
    const n = m.get(dragState.id);
    if (n && dragState.mode === "move") {
      // drop-to-parent: if released over a container, reparent
      const world = canvasEventToWorld(e);
      const dropParent = findDropParent(world, m);

      // don't parent into itself or its descendants
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
  function hideCtx() {
    ctxMenu.hidden = true;
  }

  function showCtx(x, y) {
    ctxMenu.hidden = false;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  }

  function bindContextMenu() {
    // disable browser menu on canvas
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const nodeEl = e.target.closest(".node");
      if (!nodeEl) {
        hideCtx();
        return;
      }
      const id = nodeEl.dataset.id;
      selectNode(id);
      showCtx(e.clientX, e.clientY);
    });

    document.addEventListener("click", () => hideCtx());
    window.addEventListener("resize", () => hideCtx());
    window.addEventListener("scroll", () => hideCtx(), true);

    ctxDelete.addEventListener("click", () => {
      deleteSelected();
      hideCtx();
    });
    ctxDuplicate.addEventListener("click", () => {
      duplicateSelected();
      hideCtx();
    });
    ctxBringFront.addEventListener("click", () => {
      if (state.selectedId) bringToFront(state.selectedId);
      render();
      hideCtx();
    });
    ctxSendBack.addEventListener("click", () => {
      if (state.selectedId) sendToBack(state.selectedId);
      render();
      hideCtx();
    });
  }

  // -------------------- Properties binding --------------------
  function updateSelected(mutator) {
    const m = byId();
    const n = m.get(state.selectedId);
    if (!n) return;
    mutator(n, m);
    clampInParent(n, m);
    render();
  }

  function bindProps() {
    propName.addEventListener("input", () => {
      updateSelected((n) => (n.name = propName.value.trim() || n.type));
    });

    propParent.addEventListener("change", () => {
      const newPid = propParent.value;
      if (!state.selectedId) return;
      reparentNode(state.selectedId, newPid);
      render();
    });

    const applyXYWH = () => {
      updateSelected((n) => {
        n.x = Number(propX.value);
        n.y = Number(propY.value);
        n.w = Number(propW.value);
        n.h = Number(propH.value);
      });
    };

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

    propZIndex.addEventListener("input", () => {
      updateSelected((n) => (n.zIndex = round(Number(propZIndex.value) || 1)));
    });

    propBgColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(propBgColor.value);
      updateSelected((n) => (n.bgColor = { r, g, b }));
    });

    propBgAlpha.addEventListener("input", () => {
      const a = clamp(Number(propBgAlpha.value), 0, 1);
      propBgAlphaLabel.textContent = a.toFixed(2);
      updateSelected((n) => (n.bgAlpha = a));
    });

    propBorder.addEventListener("change", () => {
      updateSelected((n) => (n.border = propBorder.value === "true"));
    });

    // text
    propText.addEventListener("input", () => {
      updateSelected((n) => {
        if (isTextType(n)) n.text = propText.value;
      });
    });

    propTextColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(propTextColor.value);
      updateSelected((n) => {
        if (isTextType(n)) n.textColor = { r, g, b };
      });
    });

    propTextScaled.addEventListener("change", () => {
      updateSelected((n) => {
        if (isTextType(n)) n.textScaled = propTextScaled.value === "true";
      });
    });

    propFont.addEventListener("change", () => {
      updateSelected((n) => {
        if (isTextType(n)) n.font = propFont.value;
      });
    });

    // image
    propImage.addEventListener("input", () => {
      updateSelected((n) => {
        if (isImageType(n)) n.image = propImage.value;
      });
    });

    // scrollingframe props
    const applyScroll = () => {
      updateSelected((n) => {
        if (n.type !== "ScrollingFrame") return;
        n.canvasSize = n.canvasSize || { w: 0, h: 0 };
        n.canvasSize.w = round(Number(propCanvasW.value) || 0);
        n.canvasSize.h = round(Number(propCanvasH.value) || 0);
        n.scrollBarThickness = round(Number(propScrollBar.value) || 0);
      });
    };

    propCanvasW.addEventListener("input", applyScroll);
    propCanvasH.addEventListener("input", applyScroll);
    propScrollBar.addEventListener("input", applyScroll);
  }

  // -------------------- Project controls --------------------
  function bindProjectControls() {
    guiNameEl.addEventListener("input", () => {
      state.project.guiName = guiNameEl.value.trim() || "ScreenGui";
      render();
    });
    resetOnSpawnEl.addEventListener("change", () => {
      state.project.resetOnSpawn = resetOnSpawnEl.value === "true";
      render();
    });
    guiParentEl.addEventListener("change", () => {
      state.project.parent = guiParentEl.value;
      render();
    });
    outputModeEl.addEventListener("change", () => {
      state.project.outputMode = outputModeEl.value;
      render();
    });

    chkSafeArea.addEventListener("change", () => {
      state.showSafeArea = chkSafeArea.checked;
      render();
    });

    zoom.addEventListener("input", () => {
      state.zoom = clamp(Number(zoom.value) / 100, 0.5, 2.0);
      render();
    });

    // toolbox tabs
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
    if (!raw) {
      setStatus("Nothing saved yet.", "");
      return;
    }
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
    const m = byId();
    const n = m.get(state.selectedId);
    if (!n) return;

    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid();
    copy.name = (n.name || n.type) + "Copy";
    copy.zIndex = nextZIndex(copy.parentId || "ROOT");
    copy.x += 12;
    copy.y += 12;
    clampInParent(copy, m);

    state.nodes.push(copy);
    selectNode(copy.id);
    setStatus("Duplicated element.", "");
  }

  function deleteSelected() {
    const id = state.selectedId;
    if (!id) return;

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
    state.nodes = state.nodes.filter(n => !toRemove.has(n.id));

    state.selectedId = null;
    setStatus("Deleted element.", "");
    render();
  }

  // -------------------- Export Lua --------------------
  function luaBool(b) { return b ? "true" : "false"; }
  function formatColor3(rgb) { return `Color3.fromRGB(${rgb.r}, ${rgb.g}, ${rgb.b})`; }

  function exportLua() {
    const useVars = state.project.outputMode === "variables";
    const guiName = state.project.guiName?.trim() || "ScreenGui";
    const resetOnSpawn = !!state.project.resetOnSpawn;
    const parent = state.project.parent;

    const m = byId();

    // parent-first order
    const ids = state.nodes.map(n => n.id);
    const created = new Set(["ROOT"]);
    const lines = [];
    const taken = new Set(["game", "workspace", "script", "player", "screenGui"]);
    const varMap = new Map();

    function emit(s = "") { lines.push(s); }
    function indent(n) { return "  ".repeat(n); }

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
      const n = m.get(id);
      if (!n) return;
      const pid = n.parentId || "ROOT";
      if (pid !== "ROOT") ensure(pid);

      const pre = useVars ? "" : indent(1);
      const v = useVars ? varNameFor(n) : safeLuaIdent(n.type.toLowerCase());

      emit(`${pre}local ${v} = Instance.new("${n.type}")`);
      emit(`${pre}${v}.Name = "${escapeLuaString(n.name || n.type)}"`);

      // size
      emit(`${pre}${v}.Size = UDim2.new(0, ${round(n.w)}, 0, ${round(n.h)})`);

      // position offset = top-left (x - anchor*w)
      const posX = round(n.x - n.anchorX * n.w);
      const posY = round(n.y - n.anchorY * n.h);
      emit(`${pre}${v}.Position = UDim2.new(0, ${posX}, 0, ${posY})`);
      emit(`${pre}${v}.AnchorPoint = Vector2.new(${n.anchorX}, ${n.anchorY})`);
      emit(`${pre}${v}.ZIndex = ${round(n.zIndex ?? 1)}`);

      // visuals
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

      // parent
      if ((n.parentId || "ROOT") === "ROOT") {
        emit(`${pre}${v}.Parent = screenGui`);
      } else {
        if (useVars) {
          emit(`${pre}${v}.Parent = ${varMap.get(n.parentId) || "screenGui"}`);
        } else {
          // in no-vars mode we still used local variables, so parent identifier exists
          emit(`${pre}${v}.Parent = ${safeLuaIdent((m.get(n.parentId)?.type || "frame").toLowerCase())}`);
        }
      }

      // UI Objects export
      const uiObjs = n.uiObjects || [];
      for (const obj of uiObjs) {
        const uiVar = useVars ? `${v}_${safeLuaIdent(obj.type).toLowerCase()}` : `ui_${safeLuaIdent(obj.type).toLowerCase()}`;
        emit(`${pre}local ${uiVar} = Instance.new("${obj.type}")`);
        // minimal property support
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
        emit(`${pre}${uiVar}.Parent = ${v}`);
      }

      emit("");
      created.add(id);
    }

    // Sort by parent-first and by zIndex within parents
    const sorted = state.nodes
      .slice()
      .sort((a, b) => {
        if ((a.parentId || "ROOT") === (b.parentId || "ROOT")) return (a.zIndex ?? 1) - (b.zIndex ?? 1);
        // rough: parents first by depth
        const da = depth(a.id, m);
        const db = depth(b.id, m);
        return da - db;
      })
      .map(n => n.id);

    for (const id of sorted) ensure(id);

    if (!useVars) emit(`end`);

    exportBox.value = lines.join("\n").trimEnd();
    btnCopy.disabled = !(exportBox.value || "").trim();
    btnDownload.disabled = btnCopy.disabled;

    setStatus("Exported Lua script.", "");
  }

  function depth(id, m) {
    let d = 0;
    let cur = m.get(id);
    while (cur && (cur.parentId || "ROOT") !== "ROOT") {
      d++;
      cur = m.get(cur.parentId);
    }
    return d;
  }

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
        // aliases
        if (t === "UIGridStyleLayout") return addUiObject("UIGridLayout");
        if (t === "UIListStyleLayout") return addUiObject("UIListLayout");
        addUiObject(t);
      });
    });
  }

  // -------------------- Keyboard shortcuts --------------------
  function bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // IMPORTANT: Backspace should NOT delete.
      // Only Delete deletes.
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

    btnBringFront.addEventListener("click", () => {
      if (!state.selectedId) return;
      bringToFront(state.selectedId);
      render();
    });

    btnSendBack.addEventListener("click", () => {
      if (!state.selectedId) return;
      sendToBack(state.selectedId);
      render();
    });
  }

  // -------------------- Canvas binding --------------------
  function bindCanvas() {
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // prevent touch scroll while dragging
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  // -------------------- Init --------------------
  function init() {
    const d = defaultProject();
    state.project = d.project;
    state.nodes = d.nodes;
    state.selectedId = d.selectedId;
    state.zoom = d.zoom;
    state.showSafeArea = d.showSafeArea;

    chkSafeArea.checked = state.showSafeArea;

    bindToolbox();
    bindProps();
    bindProjectControls();
    bindButtons();
    bindKeyboard();
    bindCanvas();
    bindContextMenu();

    setStatus("Ready. Use Explorer for layering and parenting.", `Canvas: ${CANVAS_W}×${CANVAS_H}px`);
    render();
    exportLua();
  }

  init();
})();
