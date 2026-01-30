/* app.js — RBLX UI Designer (single-file, no deps)
   Features:
   - Drag + resize elements on a pixel canvas
   - Hierarchy list + selection
   - Properties panel (layout, appearance, text, image)
   - Save/Load to localStorage
   - Export Roblox Lua (variables or no-variables)
*/

(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
  const round = (n) => Math.round(n);
  const snap = (n, grid = 8) => Math.round(n / grid) * grid;

  function hexToRgb(hex) {
    const s = (hex || "").trim();
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(s);
    if (!m) return { r: 255, g: 255, b: 255 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function rgbToHex(r, g, b) {
    const h = (x) => x.toString(16).padStart(2, "0");
    return `#${h(clamp(r, 0, 255))}${h(clamp(g, 0, 255))}${h(clamp(b, 0, 255))}`;
  }

  function safeLuaIdent(name) {
    // Turn arbitrary names into valid-ish Lua identifiers for variable names.
    // (Not needed in "no variables" mode.)
    const cleaned = String(name || "")
      .replace(/[^\w]/g, "_")
      .replace(/^(\d)/, "_$1");
    return cleaned || "node";
  }

  function titleCase(s) {
    return String(s || "").replace(/(^|\s)\S/g, (m) => m.toUpperCase());
  }

  // ---------- DOM ----------
  const canvasOuter = $("#canvasOuter");
  const canvas = $("#canvas");
  const hierarchyEl = $("#hierarchy");

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
  const btnDelete = $("#btnDelete");

  const exportBox = $("#exportBox");

  const emptyProps = $("#emptyProps");
  const propsWrap = $("#props");

  const propName = $("#propName");
  const propX = $("#propX");
  const propY = $("#propY");
  const propW = $("#propW");
  const propH = $("#propH");
  const propAnchor = $("#propAnchor");

  const propBgColor = $("#propBgColor");
  const propBgAlpha = $("#propBgAlpha");
  const propBgAlphaLabel = $("#propBgAlphaLabel");
  const propBorder = $("#propBorder");

  const propText = $("#propText");
  const propTextColor = $("#propTextColor");
  const propTextScaled = $("#propTextScaled");
  const propFont = $("#propFont");

  const propImage = $("#propImage");

  const chkSafeArea = $("#chkSafeArea");
  const safeArea = $("#safeArea");

  const zoom = $("#zoom");
  const zoomLabel = $("#zoomLabel");

  const statusLeft = $("#statusLeft");
  const statusRight = $("#statusRight");

  // ---------- Canvas sizing ----------
  // Design canvas size (pixels). Roblox uses different resolutions; we offer a fixed "phone-ish" default.
  // You can tweak to 1920x1080 if you prefer.
  const CANVAS_W = 900;
  const CANVAS_H = 560;

  canvas.style.width = `${CANVAS_W}px`;
  canvas.style.height = `${CANVAS_H}px`;

  // ---------- State ----------
  const state = {
    project: {
      guiName: "HelloWorldGui",
      resetOnSpawn: false,
      parent: "PlayerGui",
      outputMode: "variables",
    },
    nodes: [], // flat list (but we will use parentId for hierarchy)
    selectedId: null,
    zoom: 1,
    showSafeArea: false,
  };

  function defaultProject() {
    return {
      project: {
        guiName: "HelloWorldGui",
        resetOnSpawn: false,
        parent: "PlayerGui",
        outputMode: "variables",
      },
      nodes: [
        {
          id: uid(),
          type: "TextLabel",
          name: "TextLabel",
          parentId: "ROOT",
          x: round(CANVAS_W * 0.5 - 150),
          y: round(CANVAS_H * 0.5 - 50),
          w: 300,
          h: 100,
          anchorX: 0.5,
          anchorY: 0.5,
          bgColor: { r: 30, g: 30, b: 30 },
          bgAlpha: 1,
          border: false,
          text: "hello world",
          textColor: { r: 255, g: 255, b: 255 },
          textScaled: true,
          font: "SourceSansBold",
          image: "",
        },
      ],
      selectedId: null,
      zoom: 1,
      showSafeArea: false,
    };
  }

  function setStatus(left, right = "") {
    if (typeof left === "string") statusLeft.textContent = left;
    if (typeof right === "string") statusRight.textContent = right;
  }

  // ---------- Rendering ----------
  function render() {
    // Project controls
    guiNameEl.value = state.project.guiName;
    resetOnSpawnEl.value = String(state.project.resetOnSpawn);
    guiParentEl.value = state.project.parent;
    outputModeEl.value = state.project.outputMode;

    // Zoom
    canvasOuter.style.setProperty("--zoom", String(state.zoom));
    zoom.value = String(Math.round(state.zoom * 100));
    zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;

    // Safe area
    safeArea.hidden = !state.showSafeArea;

    // Clear canvas
    canvas.innerHTML = "";

    // Build map
    const byId = new Map(state.nodes.map((n) => [n.id, n]));

    // Render nodes as absolutely positioned divs
    for (const n of state.nodes) {
      const el = document.createElement("div");
      el.className = `node node-${n.type.toLowerCase()}${n.id === state.selectedId ? " selected" : ""}`;
      el.dataset.id = n.id;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      el.style.width = `${n.w}px`;
      el.style.height = `${n.h}px`;

      // Visuals
      el.style.background = `rgba(${n.bgColor.r},${n.bgColor.g},${n.bgColor.b},${n.bgAlpha})`;
      el.style.border = n.border ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent";

      if (n.type === "TextLabel" || n.type === "TextButton") {
        const txt = document.createElement("div");
        txt.className = "node-text";
        txt.textContent = n.text ?? "";
        txt.style.color = `rgb(${n.textColor.r},${n.textColor.g},${n.textColor.b})`;
        txt.style.fontFamily = fontToCss(n.font);
        txt.style.fontWeight = cssWeightForFont(n.font);
        txt.style.fontSize = n.textScaled ? "calc(12px + 1.2vw)" : "16px";
        txt.style.lineHeight = "1.1";
        txt.style.textAlign = "center";
        el.appendChild(txt);

        if (n.type === "TextButton") {
          el.classList.add("clickable");
        }
      } else if (n.type === "ImageLabel") {
        const img = document.createElement("div");
        img.className = "node-image";
        // We don't fetch Roblox assets; allow normal URLs for preview.
        // If user enters rbxassetid:// it will show placeholder.
        const src = (n.image || "").trim();
        if (src && !src.startsWith("rbxassetid://")) {
          img.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;
        } else {
          img.classList.add("placeholder");
        }
        el.appendChild(img);
      } else {
        // Frame: nothing else
      }

      // Resize handles
      const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
      for (const h of handles) {
        const hd = document.createElement("div");
        hd.className = `handle handle-${h}`;
        hd.dataset.handle = h;
        el.appendChild(hd);
      }

      canvas.appendChild(el);
    }

    renderHierarchy(byId);
    renderProperties(byId);
    updateExportButtons();
  }

  function renderHierarchy(byId) {
    // Simple tree: ROOT -> children
    const children = new Map();
    function pushChild(pid, id) {
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid).push(id);
    }
    for (const n of state.nodes) pushChild(n.parentId || "ROOT", n.id);

    function makeItem(id, depth = 0) {
      const n = byId.get(id);
      const row = document.createElement("div");
      row.className = `hrow${id === state.selectedId ? " active" : ""}`;
      row.style.paddingLeft = `${10 + depth * 12}px`;

      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = n.type;

      const name = document.createElement("span");
      name.className = "hname";
      name.textContent = n.name || n.type;

      row.appendChild(badge);
      row.appendChild(name);

      row.addEventListener("click", () => {
        selectNode(id);
      });

      const wrap = document.createElement("div");
      wrap.appendChild(row);

      const kids = children.get(id) || [];
      for (const kid of kids) wrap.appendChild(makeItem(kid, depth + 1));
      return wrap;
    }

    hierarchyEl.innerHTML = "";
    const rootHeader = document.createElement("div");
    rootHeader.className = "hroot";
    rootHeader.innerHTML = `<span class="badge">ScreenGui</span><span class="hname">${state.project.guiName || "ScreenGui"}</span>`;
    hierarchyEl.appendChild(rootHeader);

    const top = children.get("ROOT") || [];
    for (const id of top) hierarchyEl.appendChild(makeItem(id, 0));

    if (state.nodes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hempty";
      empty.textContent = "No elements yet. Use the Toolbox to add.";
      hierarchyEl.appendChild(empty);
    }
  }

  function renderProperties(byId) {
    const sel = state.selectedId ? byId.get(state.selectedId) : null;
    if (!sel) {
      emptyProps.hidden = false;
      propsWrap.hidden = true;
      return;
    }

    emptyProps.hidden = true;
    propsWrap.hidden = false;

    // Fill fields
    propName.value = sel.name || "";
    propX.value = String(sel.x);
    propY.value = String(sel.y);
    propW.value = String(sel.w);
    propH.value = String(sel.h);
    propAnchor.value = `${sel.anchorX},${sel.anchorY}`;

    propBgColor.value = rgbToHex(sel.bgColor.r, sel.bgColor.g, sel.bgColor.b);
    propBgAlpha.value = String(sel.bgAlpha);
    propBgAlphaLabel.textContent = Number(sel.bgAlpha).toFixed(2);
    propBorder.value = sel.border ? "true" : "false";

    // Text props
    const isText = sel.type === "TextLabel" || sel.type === "TextButton";
    propText.disabled = !isText;
    propTextColor.disabled = !isText;
    propTextScaled.disabled = !isText;
    propFont.disabled = !isText;

    propText.value = isText ? (sel.text ?? "") : "";
    propTextColor.value = isText ? rgbToHex(sel.textColor.r, sel.textColor.g, sel.textColor.b) : "#ffffff";
    propTextScaled.value = isText ? String(!!sel.textScaled) : "true";
    propFont.value = isText ? (sel.font || "SourceSansBold") : "SourceSansBold";

    // Image props
    const isImg = sel.type === "ImageLabel";
    propImage.disabled = !isImg;
    propImage.value = isImg ? (sel.image || "") : "";
  }

  function updateExportButtons() {
    const hasCode = (exportBox.value || "").trim().length > 0;
    btnCopy.disabled = !hasCode;
    btnDownload.disabled = !hasCode;
  }

  function fontToCss(font) {
    // Simple mapping; not exact Roblox fonts, but visually distinct.
    switch (font) {
      case "Gotham":
      case "GothamBold":
        return "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      case "Arial":
        return "Arial, system-ui, sans-serif";
      case "Code":
        return "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      case "SourceSans":
      case "SourceSansBold":
      default:
        return "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    }
  }

  function cssWeightForFont(font) {
    if (font === "SourceSansBold" || font === "GothamBold") return "700";
    return "500";
  }

  // ---------- Selection ----------
  function selectNode(id) {
    state.selectedId = id;
    const n = state.nodes.find((x) => x.id === id);
    if (n) setStatus(`Selected: ${n.type} (${n.name || n.type})`, `x:${n.x} y:${n.y} w:${n.w} h:${n.h}`);
    render();
  }

  function clearSelection() {
    state.selectedId = null;
    setStatus("Ready.", "");
    render();
  }

  // ---------- Create nodes ----------
  function createNode(type) {
    const base = {
      id: uid(),
      type,
      name: type,
      parentId: "ROOT",
      x: 80,
      y: 80,
      w: 220,
      h: 80,
      anchorX: 0,
      anchorY: 0,
      bgColor: { r: 50, g: 50, b: 55 },
      bgAlpha: 1,
      border: false,
      text: type === "TextLabel" ? "TextLabel" : type === "TextButton" ? "Button" : "",
      textColor: { r: 255, g: 255, b: 255 },
      textScaled: true,
      font: "SourceSansBold",
      image: "",
    };

    if (type === "Frame") {
      base.w = 260;
      base.h = 140;
      base.text = "";
    }
    if (type === "ImageLabel") {
      base.w = 240;
      base.h = 160;
      base.bgColor = { r: 35, g: 35, b: 40 };
    }

    state.nodes.push(base);
    selectNode(base.id);
  }

  // ---------- Interaction: drag/resize ----------
  const dragState = {
    active: false,
    mode: null, // "move" or "resize"
    id: null,
    handle: null,
    startMouse: { x: 0, y: 0 },
    startRect: { x: 0, y: 0, w: 0, h: 0 },
    grid: 8,
    shiftSnap: false,
  };

  function canvasToLocal(clientX, clientY) {
    // Convert mouse coords into canvas pixel coords (unzoomed)
    const rect = canvas.getBoundingClientRect();
    const z = state.zoom;
    return {
      x: (clientX - rect.left) / z,
      y: (clientY - rect.top) / z,
    };
  }

  function pickNodeTarget(e) {
    const nodeEl = e.target.closest(".node");
    if (!nodeEl) return null;
    const id = nodeEl.dataset.id;
    return { nodeEl, id };
  }

  function onPointerDown(e) {
    const target = pickNodeTarget(e);
    if (!target) {
      clearSelection();
      return;
    }

    const id = target.id;
    selectNode(id);

    const n = state.nodes.find((x) => x.id === id);
    if (!n) return;

    const handleEl = e.target.closest(".handle");
    const isHandle = !!handleEl;

    dragState.active = true;
    dragState.id = id;
    dragState.mode = isHandle ? "resize" : "move";
    dragState.handle = isHandle ? handleEl.dataset.handle : null;
    dragState.startMouse = canvasToLocal(e.clientX, e.clientY);
    dragState.startRect = { x: n.x, y: n.y, w: n.w, h: n.h };
    dragState.shiftSnap = e.shiftKey;

    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function applyMove(n, dx, dy, useSnap) {
    let nx = dragState.startRect.x + dx;
    let ny = dragState.startRect.y + dy;

    if (useSnap) {
      nx = snap(nx, dragState.grid);
      ny = snap(ny, dragState.grid);
    } else {
      nx = round(nx);
      ny = round(ny);
    }

    // clamp inside canvas
    nx = clamp(nx, 0, CANVAS_W - n.w);
    ny = clamp(ny, 0, CANVAS_H - n.h);

    n.x = nx;
    n.y = ny;
  }

  function applyResize(n, dx, dy, handle, useSnap) {
    let { x, y, w, h } = dragState.startRect;

    const minW = 20;
    const minH = 20;

    const snapIf = (val) => (useSnap ? snap(val, dragState.grid) : round(val));

    const right = x + w;
    const bottom = y + h;

    // Handle map
    const moveLeft = handle.includes("w");
    const moveRight = handle.includes("e");
    const moveTop = handle.includes("n");
    const moveBottom = handle.includes("s");

    let newLeft = x;
    let newRight = right;
    let newTop = y;
    let newBottom = bottom;

    if (moveLeft) newLeft = snapIf(x + dx);
    if (moveRight) newRight = snapIf(right + dx);
    if (moveTop) newTop = snapIf(y + dy);
    if (moveBottom) newBottom = snapIf(bottom + dy);

    // Enforce min sizes
    if (newRight - newLeft < minW) {
      if (moveLeft) newLeft = newRight - minW;
      else newRight = newLeft + minW;
    }
    if (newBottom - newTop < minH) {
      if (moveTop) newTop = newBottom - minH;
      else newBottom = newTop + minH;
    }

    // Clamp to canvas bounds
    newLeft = clamp(newLeft, 0, CANVAS_W - minW);
    newTop = clamp(newTop, 0, CANVAS_H - minH);
    newRight = clamp(newRight, minW, CANVAS_W);
    newBottom = clamp(newBottom, minH, CANVAS_H);

    // Re-apply min sizes post clamp
    if (newRight - newLeft < minW) newRight = newLeft + minW;
    if (newBottom - newTop < minH) newBottom = newTop + minH;

    n.x = newLeft;
    n.y = newTop;
    n.w = newRight - newLeft;
    n.h = newBottom - newTop;
  }

  function onPointerMove(e) {
    if (!dragState.active) return;
    const n = state.nodes.find((x) => x.id === dragState.id);
    if (!n) return;

    const cur = canvasToLocal(e.clientX, e.clientY);
    const dx = cur.x - dragState.startMouse.x;
    const dy = cur.y - dragState.startMouse.y;

    const useSnap = dragState.shiftSnap || e.shiftKey;

    if (dragState.mode === "move") {
      applyMove(n, dx, dy, useSnap);
    } else if (dragState.mode === "resize") {
      applyResize(n, dx, dy, dragState.handle, useSnap);
    }

    setStatus(
      `Editing: ${n.type} (${n.name || n.type})`,
      `x:${n.x} y:${n.y} w:${n.w} h:${n.h}${useSnap ? " (snap)" : ""}`
    );

    // Update props fields live
    if (state.selectedId === n.id) {
      propX.value = String(n.x);
      propY.value = String(n.y);
      propW.value = String(n.w);
      propH.value = String(n.h);
    }

    // Rerender selection outline positions only? Simpler: rerender whole.
    render();
  }

  function onPointerUp(e) {
    if (!dragState.active) return;
    dragState.active = false;
    dragState.mode = null;
    dragState.id = null;
    dragState.handle = null;
    setStatus(statusLeft.textContent, statusRight.textContent);
  }

  // ---------- Properties editing ----------
  function updateSelected(mutator) {
    const n = state.nodes.find((x) => x.id === state.selectedId);
    if (!n) return;
    mutator(n);
    render();
  }

  function bindProps() {
    propName.addEventListener("input", () => {
      updateSelected((n) => (n.name = propName.value.trim() || n.type));
    });

    const applyXYWH = () => {
      updateSelected((n) => {
        n.x = clamp(round(Number(propX.value)), 0, CANVAS_W - n.w);
        n.y = clamp(round(Number(propY.value)), 0, CANVAS_H - n.h);
        n.w = clamp(round(Number(propW.value)), 20, CANVAS_W - n.x);
        n.h = clamp(round(Number(propH.value)), 20, CANVAS_H - n.y);
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

    // Text
    propText.addEventListener("input", () => {
      updateSelected((n) => {
        if (n.type === "TextLabel" || n.type === "TextButton") n.text = propText.value;
      });
    });

    propTextColor.addEventListener("input", () => {
      const { r, g, b } = hexToRgb(propTextColor.value);
      updateSelected((n) => {
        if (n.type === "TextLabel" || n.type === "TextButton") n.textColor = { r, g, b };
      });
    });

    propTextScaled.addEventListener("change", () => {
      updateSelected((n) => {
        if (n.type === "TextLabel" || n.type === "TextButton") n.textScaled = propTextScaled.value === "true";
      });
    });

    propFont.addEventListener("change", () => {
      updateSelected((n) => {
        if (n.type === "TextLabel" || n.type === "TextButton") n.font = propFont.value;
      });
    });

    // Image
    propImage.addEventListener("input", () => {
      updateSelected((n) => {
        if (n.type === "ImageLabel") n.image = propImage.value;
      });
    });
  }

  // ---------- Project controls ----------
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
  }

  // ---------- Save / Load ----------
  const STORAGE_KEY = "rblx-ui-designer:v1";

  function saveToStorage() {
    const payload = JSON.stringify({
      ...state,
      // Ensure we don't store transient drag info
    });
    localStorage.setItem(STORAGE_KEY, payload);
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
      // Basic validation
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.nodes)) throw new Error("Bad file");
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
    state.selectedId = null;
    state.zoom = 1;
    state.showSafeArea = false;
    chkSafeArea.checked = false;
    exportBox.value = "";
    setStatus("New project created.", "");
    render();
  }

  // ---------- Duplicate / Delete ----------
  function duplicateSelected() {
    const n = state.nodes.find((x) => x.id === state.selectedId);
    if (!n) return;
    const copy = JSON.parse(JSON.stringify(n));
    copy.id = uid();
    copy.name = (n.name || n.type) + "Copy";
    copy.x = clamp(n.x + 12, 0, CANVAS_W - n.w);
    copy.y = clamp(n.y + 12, 0, CANVAS_H - n.h);
    state.nodes.push(copy);
    selectNode(copy.id);
    setStatus("Duplicated element.", "");
  }

  function deleteSelected() {
    const id = state.selectedId;
    if (!id) return;
    state.nodes = state.nodes.filter((n) => n.id !== id && n.parentId !== id); // remove children too (simple)
    state.selectedId = null;
    setStatus("Deleted element.", "");
    render();
  }

  // ---------- Export Lua ----------
  function formatColor3(rgb) {
    return `Color3.fromRGB(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  function luaBool(b) {
    return b ? "true" : "false";
  }

  function exportLua() {
    const mode = state.project.outputMode;
    const useVars = mode === "variables";

    const guiName = state.project.guiName?.trim() || "ScreenGui";
    const resetOnSpawn = !!state.project.resetOnSpawn;
    const parent = state.project.parent;

    // For now: only ROOT children; (can extend to nesting later)
    // If user has frames and wants parenting, we will still honor parentId relationships.
    const byId = new Map(state.nodes.map((n) => [n.id, n]));
    const children = new Map();
    const top = [];
    for (const n of state.nodes) {
      const pid = n.parentId || "ROOT";
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid).push(n.id);
    }
    for (const id of (children.get("ROOT") || [])) top.push(id);

    // Deterministic order (top-to-bottom)
    const order = [...state.nodes].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const orderedIds = order.map((n) => n.id);

    // Ensure ScreenGui is created first.
    const lines = [];
    const indent = (lvl) => "  ".repeat(lvl);

    function emit(line = "") {
      lines.push(line);
    }

    function nodeVarName(n, taken) {
      let base = safeLuaIdent((n.name || n.type).replace(/\s+/g, ""));
      // Common nicety: lowerCamel
      base = base.charAt(0).toLowerCase() + base.slice(1);
      if (!base) base = "node";
      let v = base;
      let i = 2;
      while (taken.has(v)) {
        v = `${base}${i++}`;
      }
      taken.add(v);
      return v;
    }

    const taken = new Set(["game", "workspace", "script"]);
    const varMap = new Map();

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

    // Create all instances (in canvas order, but respecting parent creation first)
    function ensureVar(n) {
      if (!useVars) return null;
      if (varMap.has(n.id)) return varMap.get(n.id);
      const v = nodeVarName(n, taken);
      varMap.set(n.id, v);
      return v;
    }

    // Topological-ish: parent first. We can just iterate orderedIds and if parent not created yet, create parent first.
    const created = new Set(["SCREEN_GUI"]);

    function parentExpr(n) {
      const pid = n.parentId || "ROOT";
      if (pid === "ROOT") return useVars ? "screenGui" : "screenGui";
      if (useVars) return varMap.get(pid) || "screenGui";
      // no-vars: we don't store references; we will still use variables inside block for parenting
      return null;
    }

    function emitNode(n, lvl = 0) {
      const isNoVars = !useVars;
      const varName = useVars ? ensureVar(n) : safeLuaIdent(n.type.toLowerCase());

      const prefix = isNoVars ? indent(1) : "";
      const v = isNoVars ? `local ${varName}` : `local ${varName}`;
      emit(`${prefix}${v} = Instance.new("${n.type}")`);
      emit(`${prefix}${varName}.Name = "${escapeLuaString(n.name || n.type)}"`);

      // Convert pixel x/y/w/h to Roblox with anchor offsets:
      // Position uses Scale 0 and Offset = x - (anchorX * w), y - (anchorY * h)
      const posX = round(n.x - n.anchorX * n.w);
      const posY = round(n.y - n.anchorY * n.h);

      emit(`${prefix}${varName}.Size = UDim2.new(0, ${round(n.w)}, 0, ${round(n.h)})`);
      emit(`${prefix}${varName}.Position = UDim2.new(0, ${posX}, 0, ${posY})`);
      emit(`${prefix}${varName}.AnchorPoint = Vector2.new(${n.anchorX}, ${n.anchorY})`);

      // Visual common
      emit(`${prefix}${varName}.BackgroundColor3 = ${formatColor3(n.bgColor)}`);
      if (typeof n.bgAlpha === "number") emit(`${prefix}${varName}.BackgroundTransparency = ${clamp(1 - n.bgAlpha, 0, 1).toFixed(2)}`);
      emit(`${prefix}${varName}.BorderSizePixel = ${n.border ? 1 : 0}`);

      // Type-specific
      if (n.type === "TextLabel" || n.type === "TextButton") {
        emit(`${prefix}${varName}.TextColor3 = ${formatColor3(n.textColor)}`);
        emit(`${prefix}${varName}.Text = "${escapeLuaString(n.text ?? "")}"`);
        emit(`${prefix}${varName}.TextScaled = ${luaBool(!!n.textScaled)}`);
        emit(`${prefix}${varName}.Font = Enum.Font.${n.font || "SourceSansBold"}`);
      }
      if (n.type === "ImageLabel") {
        if ((n.image || "").trim()) {
          emit(`${prefix}${varName}.Image = "${escapeLuaString((n.image || "").trim())}"`);
        }
      }

      // Parent
      const pid = n.parentId || "ROOT";
      if (pid === "ROOT") {
        emit(`${prefix}${varName}.Parent = screenGui`);
      } else {
        if (useVars) {
          const pVar = varMap.get(pid);
          emit(`${prefix}${varName}.Parent = ${pVar || "screenGui"}`);
        } else {
          // no-vars mode: we keep locals, so parent variable exists if created.
          emit(`${prefix}${varName}.Parent = ${safeLuaIdent((byId.get(pid)?.type || "frame").toLowerCase())}`);
        }
      }

      emit("");
      created.add(n.id);
    }

    // In no-vars mode we still need some temporary locals for parenting; simplest: keep locals but not "meaningful names"
    // We'll create instances in an order that guarantees parent exists first, so "frame" local exists when parenting.
    function ensureCreated(id) {
      if (created.has(id)) return;
      const n = byId.get(id);
      if (!n) return;
      const pid = n.parentId || "ROOT";
      if (pid !== "ROOT") ensureCreated(pid);
      emitNode(n);
    }

    // Variables mode: create in parent-first order
    for (const id of orderedIds) ensureCreated(id);

    // Close block for no-vars
    if (!useVars) {
      emit(`end`);
    }

    exportBox.value = lines.join("\n").trimEnd();
    updateExportButtons();
    setStatus("Exported Lua script.", "");
  }

  function escapeLuaString(s) {
    return String(s ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }

  // ---------- Copy / Download ----------
  async function copyExport() {
    const text = exportBox.value || "";
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied to clipboard.", "");
    } catch {
      // Fallback
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

  // ---------- Toolbox binding ----------
  function bindToolbox() {
    $$(".tool[data-create]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const t = btn.dataset.create;
        createNode(t);
      });
    });
  }

  // ---------- Keyboard shortcuts ----------
  function bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === "Delete" || e.key === "Backspace") {
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

  // ---------- Buttons ----------
  function bindButtons() {
    btnNew.addEventListener("click", newProject);
    btnSave.addEventListener("click", saveToStorage);
    btnLoad.addEventListener("click", loadFromStorage);
    btnExport.addEventListener("click", exportLua);
    btnCopy.addEventListener("click", copyExport);
    btnDownload.addEventListener("click", downloadExport);
    btnDuplicate.addEventListener("click", duplicateSelected);
    btnDelete.addEventListener("click", deleteSelected);
  }

  // ---------- Canvas events ----------
  function bindCanvas() {
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // Prevent scrolling while dragging on touch
    canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }

  // ---------- Init ----------
  function init() {
    // init to default
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

    // Start selected first node
    if (state.nodes[0]) state.selectedId = state.nodes[0].id;

    setStatus("Ready. Add elements from the Toolbox.", `Canvas: ${CANVAS_W}×${CANVAS_H}px`);
    render();
    exportLua(); // show initial example output
  }

  init();
})();
