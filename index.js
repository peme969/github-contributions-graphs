function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

function stripInvalidXmlChars(str) {
  // Remove ASCII control chars except: TAB(9), LF(10), CR(13)
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

async function svgWrapToPngBlob(svgWrap, bgColor = "#0d1117", scale = 2) {
  const svgEl = svgWrap.querySelector("svg");
  if (!svgEl) throw new Error("SVG not found");

  const clone = svgEl.cloneNode(true);

  // ✅ Remove style/title/metadata/desc
  clone
    .querySelectorAll("style, title, desc, metadata")
    .forEach((n) => n.remove());

  // ✅ Remove <a> elements (replace with inner text)
  clone.querySelectorAll("a").forEach((a) => {
    const t = a.querySelector("text");
    if (t) a.replaceWith(t);
    else a.remove();
  });

  // ✅ Remove ALL data-* attributes (SAFE method)
  clone.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-")) {
        el.removeAttribute(attr.name);
      }
    });
  });

  // ✅ Serialize
  let svgText = new XMLSerializer().serializeToString(clone);

  // ✅ Strip invalid XML control characters
  svgText = stripInvalidXmlChars(svgText);

  // ✅ Fix raw ampersands
  svgText = svgText.replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
    "&amp;",
  );

  // ✅ HARD sanitize quotes inside attributes (last resort)
  svgText = svgText.replace(/="([^"]*)"/g, (m, p1) => {
    const safe = p1.replace(/"/g, "&quot;");
    return `="${safe}"`;
  });

  // Debug exact slice near failure
  console.log("SVG length:", svgText.length);
  console.log("SVG slice near error:", svgText.slice(37036 - 200, 37036 + 200));

  // ✅ Validate
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const err = doc.querySelector("parsererror");
  if (err) {
    console.error("SVG parse error:", err.textContent);
    throw new Error("SVG invalid XML — cannot render image");
  }

  // ✅ Determine size from viewBox or width/height
  const viewBox = clone.viewBox.baseVal;
  const width = parseInt(clone.getAttribute("width")) || viewBox.width || 1200;
  const height =
    parseInt(clone.getAttribute("height")) || viewBox.height || 400;

  const svgDataUrl =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);

  // ✅ Load into image
  const img = new Image();
  img.decoding = "async";

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("SVG could not load as image"));
    img.src = svgDataUrl;
  });

  // ✅ Render to canvas
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(img, 0, 0, width, height);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Canvas PNG conversion failed"));
      else resolve(blob);
    }, "image/png");
  });
}

async function copyPngBlobToClipboard(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("Clipboard image API not supported in this browser");
  }

  const item = new ClipboardItem({ "image/png": blob });
  await navigator.clipboard.write([item]);
}

async function downloadPNG(svgWrap, filename, bgColor = "#0d1117") {
  const svgEl = svgWrap.querySelector("svg");
  if (!svgEl) throw new Error("SVG not found");

  // ✅ Clone SVG so we can safely modify
  const clone = svgEl.cloneNode(true);

  // ✅ Ensure namespaces
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // ✅ Remove <style> blocks (common cause of img decode failure)
  clone.querySelectorAll("style").forEach((s) => s.remove());

  // ✅ Remove <a> elements (another common cause)
  clone.querySelectorAll("a").forEach((a) => {
    // Replace link with its inner text
    const textNode = a.querySelector("text");
    if (textNode) a.replaceWith(textNode);
    else a.remove();
  });
  clone.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-")) {
        el.removeAttribute(attr.name);
      }
    });
  });
  // Remove any lingering title attributes too
  clone.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.toLowerCase() === "title") {
        el.removeAttribute(attr.name);
      }
    });
  });

  // ✅ Convert to clean SVG string
  const svgText = new XMLSerializer().serializeToString(clone);
  svgText = svgText.replace(/data-tooltip="([^"]*)"/g, (m, p1) => {
    return `data-tooltip="${p1.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`;
  });

  const errorIndex = 37036; // from the parser error
  console.log(
    "SVG slice near error:",
    svgText.slice(errorIndex - 200, errorIndex + 200),
  );

  // ✅ Parse test (this catches hidden XML issues)
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    console.error(
      "SVG parse error:",
      doc.querySelector("parsererror").textContent,
    );
    throw new Error("SVG is invalid XML — cannot export PNG");
  }

  // ✅ Determine size
  const viewBox = clone.viewBox.baseVal;
  const width = parseInt(clone.getAttribute("width")) || viewBox.width || 1200;
  const height =
    parseInt(clone.getAttribute("height")) || viewBox.height || 400;

  // ✅ Make image-safe data URL (NO base64 issues)
  const svgDataUrl =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");

    // ✅ Fill background (no transparency)
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.drawImage(img, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) throw new Error("PNG conversion failed");
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 500);
    }, "image/png");
  };

  img.onerror = (e) => {
    console.error("Image decode failed. SVG string:", svgText.slice(0, 600));
    console.error("Event:", e);
    throw new Error("PNG export failed: SVG cannot be rendered as an image");
  };
  console.log(svgText.substring(56260, 56420));

  img.src = svgDataUrl;
}

function svgToJSON(svgWrap) {
  const svg = svgWrap.querySelector("svg");
  if (!svg) return {};

  const cells = [...svg.querySelectorAll(".day-cell")];

  return {
    generatedAt: new Date().toISOString(),
    totalCells: cells.length,
    cells: cells.map((c) => ({
      tooltip: c.getAttribute("data-tooltip"),
      fill: c.getAttribute("fill"),
      x: Number(c.getAttribute("x")),
      y: Number(c.getAttribute("y")),
    })),
  };
}

function downloadJSON(jsonObj, filename) {
  const blob = new Blob([JSON.stringify(jsonObj, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, filename);
}

async function copySVGToClipboard(svgText) {
  await navigator.clipboard.writeText(svgText);
}
(async function () {
  // --- UI elements ---
  const usernameInput = document.getElementById("usernameInput");
  const loadBtn = document.getElementById("loadBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");

  const themeSelect = document.getElementById("themeSelect");
  const yearSelect = document.getElementById("yearSelect");
  const graphDisplay = document.getElementById("graphDisplay");
  const graphSpinner = document.getElementById("graphSpinner");

  const statusEl = document.getElementById("status");
  const tooltip = document.getElementById("tooltip");

  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const progressDetail = document.getElementById("progressDetail");

  const exportSelect = document.getElementById("exportSelect");

  // Cache: svgCache[year][themeName] = svgText
  let svgCache = {};
  let loadedYears = new Set();
  let currentUsername = "";

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || "";
  }

  function setPlaceholder(text) {
    graphDisplay.innerHTML = `<div id="graphSpinner" class="spinner-overlay hidden" aria-hidden="true">
        <div class="spinner"></div>
        <div class="spinner-text">Loading…</div>
      </div>
      <div class="placeholder">${text}</div>`;
  }

  function setGraphSpinner(on, text = "Loading…") {
    const spinner = document.getElementById("graphSpinner");
    if (!spinner) return;
    spinner.classList.toggle("hidden", !on);
    const t = spinner.querySelector(".spinner-text");
    if (t) t.textContent = text;
  }

  function setButtonBusy(on) {
    if (!loadBtn) return;
    loadBtn.disabled = on;
    if (btnText) btnText.textContent = on ? "Generating" : "Generate";
    if (btnSpinner) btnSpinner.classList.toggle("hidden", !on);
  }

  function setProgress(pct, headline, detail) {
    const clamped = Math.max(0, Math.min(100, pct));
    if (progressFill) progressFill.style.width = `${clamped}%`;
    if (progressText) progressText.textContent = headline || "—";
    if (progressDetail) progressDetail.textContent = detail || "";
  }

  function fillSelect(selectEl, values, { disabledAll = false } = {}) {
    selectEl.innerHTML = "";
    for (const v of values) {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(v);
      if (disabledAll) opt.disabled = true;
      selectEl.appendChild(opt);
    }
  }

  function markYearOption(year, { loaded }) {
    const opts = [...yearSelect.options];
    const opt = opts.find((o) => o.value === String(year));
    if (!opt) return;
    opt.disabled = !loaded;
    opt.textContent = loaded ? String(year) : `${year} (loading…)`;
  }

  function disableExports() {
    exportSelect.disabled = true;
    exportSelect.value = "";
  }
  function enableExports() {
    exportSelect.disabled = false;
    exportSelect.value = "";
  }

  function bindTooltips(scopeEl) {
    const cells = scopeEl.querySelectorAll(".day-cell");
    cells.forEach((cell) => {
      cell.addEventListener("mousemove", (e) => {
        const text = cell.getAttribute("data-tooltip");
        if (!text) return;

        tooltip.textContent = text;
        tooltip.style.opacity = "1";

        let x = e.pageX + 12;
        let y = e.pageY - 28;

        const rect = tooltip.getBoundingClientRect();
        const maxX = window.scrollX + window.innerWidth - rect.width - 10;
        const maxY = window.scrollY + window.innerHeight - rect.height - 10;

        if (x > maxX) x = maxX;
        if (y > maxY) y = maxY;

        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
      });

      cell.addEventListener("mouseleave", () => {
        tooltip.style.opacity = "0";
      });
    });
  }

  function getPalette(themeObj) {
    return {
      grade0: themeObj.grade0,
      grade1: themeObj.grade1,
      grade2: themeObj.grade2,
      grade3: themeObj.grade3,
      grade4: themeObj.grade4,
    };
  }

  async function fetchYears(username) {
    const YEARS_URL = `https://github-contribution-graph-generator.vercel.app/graph/years/${username}`;
    const res = await fetch(YEARS_URL);
    if (!res.ok) throw new Error(`GET years failed (${res.status})`);
    const data = await res.json();
    return data.years_in_git || [];
  }

  async function fetchSVGFor(username, year, palette) {
    const POST_URL = `https://github-contribution-graph-generator.vercel.app/custom/${username}`;
    const payload = { palette };
    const res = await fetch(`${POST_URL}?year=${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`POST failed (${res.status})`);
    return await res.text();
  }

  function renderSelected() {
    const year = yearSelect.value;
    const themeName = themeSelect.value;

    if (!year || !themeName) {
      disableExports();
      setPlaceholder("Select a year and theme.");
      return;
    }

    if (!loadedYears.has(String(year))) {
      disableExports();
      setPlaceholder(`Year ${year} is still loading…`);
      return;
    }

    const svgText = svgCache?.[year]?.[themeName];
    if (!svgText) {
      disableExports();
      setPlaceholder("That graph isn’t ready yet.");
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "svg-wrap";
    wrap.innerHTML = svgText;

    graphDisplay.innerHTML = `
      <div id="graphSpinner" class="spinner-overlay hidden" aria-hidden="true">
        <div class="spinner"></div>
        <div class="spinner-text">Loading…</div>
      </div>
    `;
    graphDisplay.appendChild(wrap);

    bindTooltips(wrap);
    enableExports();
  }

  function currentSvgText() {
    const year = yearSelect.value;
    const themeName = themeSelect.value;
    return svgCache?.[year]?.[themeName] || "";
  }

  exportSelect.addEventListener("change", async () => {
    const format = exportSelect.value;
    if (!format) return;

    // reset back to placeholder option after action
    exportSelect.value = "";

    const year = yearSelect.value;
    const themeNameSafe = themeSelect.value.replace(/[^a-z0-9_-]/gi, "_");

    if (!loadedYears.has(String(year))) return;

    if (format === "svg") {
      const svgText = currentSvgText();
      if (!svgText) return;

      downloadBlob(
        new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }),
        `${currentUsername}_${year}_${themeNameSafe}.svg`,
      );
      return;
    }

    if (format === "png") {
      const svgWrap = graphDisplay.querySelector(".svg-wrap");
      if (!svgWrap) return;

      setGraphSpinner(true, "Exporting PNG…");
      try {
        const blob = await svgWrapToPngBlob(svgWrap, "#0d1117", 2);
        downloadBlob(blob, `${currentUsername}_${year}_${themeNameSafe}.png`);
      } finally {
        setGraphSpinner(false);
      }
      return;
    }

    if (format === "json") {
      const svgWrap = graphDisplay.querySelector(".svg-wrap");
      if (!svgWrap) return;

      const jsonObj = svgToJSON(svgWrap);
      downloadJSON(jsonObj, `${currentUsername}_${year}_${themeNameSafe}.json`);
      return;
    }
  });

  themeSelect.addEventListener("change", renderSelected);
  yearSelect.addEventListener("change", renderSelected);

  async function generateAll(username) {
    currentUsername = username;
    svgCache = {};
    loadedYears = new Set();

    disableExports();
    themeSelect.disabled = true;
    yearSelect.disabled = true;

    setPlaceholder("Loading years…");
    setProgress(0, "Loading years…", "");

    const years = await fetchYears(username);
    if (!years.length) {
      setPlaceholder("No years found for this user.");
      setProgress(0, "—", "");
      return;
    }

    // Fill theme dropdown immediately (themes are known locally)
    const themeNames = Object.keys(themes);
    fillSelect(themeSelect, themeNames);
    themeSelect.disabled = false;

    // Fill years dropdown but DISABLE all options until loaded
    fillSelect(yearSelect, years, { disabledAll: true });

    // Pick a “preview” selection (first theme). Year will get selected once it loads.
    themeSelect.value = themeNames[0] || "";
    yearSelect.value = String(years[0]);

    // We keep yearSelect enabled so user can see the list, but locked options cannot be clicked
    yearSelect.disabled = false;

    const totalYears = years.length;
    const totalThemes = themeNames.length;

    // Year-by-year generation
    for (let yi = 0; yi < years.length; yi++) {
      const year = String(years[yi]);
      svgCache[year] = {};
      markYearOption(year, { loaded: false });

      // Show spinner while generating this year (first year especially)
      setGraphSpinner(true, `Loading year ${year}…`);

      for (let ti = 0; ti < themeNames.length; ti++) {
        const themeName = themeNames[ti];
        const palette = getPalette(themes[themeName]);

        // Update progress (overall + per-year detail)
        const overallPct = (yi / totalYears) * 100;
        setProgress(
          overallPct,
          `Year ${yi + 1}/${totalYears}`,
          `Loading ${year}: theme ${ti + 1}/${totalThemes}`,
        );

        try {
          const svgText = await fetchSVGFor(username, year, palette);
          svgCache[year][themeName] = svgText;
        } catch (err) {
          svgCache[year][themeName] =
            `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="80">
              <text x="10" y="45" fill="#ff7b72" font-family="system-ui" font-size="14">
                Failed to load: ${themeName} ${year}
              </text>
            </svg>`;
        }

        // If the user is currently looking at this year/theme, refresh the view
        if (yearSelect.value === year && themeSelect.value === themeName) {
          renderSelected();
        }
      }

      // Mark year as loaded (unlock option)
      loadedYears.add(year);
      markYearOption(year, { loaded: true });

      // If this is the first loaded year, render it immediately
      if (loadedYears.size === 1) {
        yearSelect.value = year;
        renderSelected();
      }

      setGraphSpinner(false);
      const finishedPct = ((yi + 1) / totalYears) * 100;
      setProgress(
        finishedPct,
        `Loaded ${yi + 1}/${totalYears} years`,
        `Finished year ${year}`,
      );
    }

    setStatus(`Done. Loaded ${loadedYears.size} years for @${username}.`);
  }

  async function onGenerate() {
    const username = (usernameInput.value || "").trim();
    if (!username) {
      setStatus("Please enter a username.");
      setPlaceholder("Enter a username to generate graphs.");
      return;
    }

    setStatus("");
    setButtonBusy(true);
    try {
      await generateAll(username);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
      setPlaceholder("Could not generate graphs.");
      setProgress(0, "—", "");
      disableExports();
    } finally {
      setButtonBusy(false);
      setGraphSpinner(false);
    }
  }

  loadBtn.addEventListener("click", onGenerate);
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onGenerate();
  });
})();
