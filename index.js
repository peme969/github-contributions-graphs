console.log("octicons:", window.octicons);

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
clone.querySelectorAll("style, title, desc, metadata").forEach((n) => n.remove());

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
  "&amp;"
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
  const height = parseInt(clone.getAttribute("height")) || viewBox.height || 400;

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
    return `data-tooltip="${p1.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}"`;
  });
  
  const errorIndex = 37036; // from the parser error
console.log("SVG slice near error:", svgText.slice(errorIndex - 200, errorIndex + 200));

  // ✅ Parse test (this catches hidden XML issues)
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    console.error("SVG parse error:", doc.querySelector("parsererror").textContent);
    throw new Error("SVG is invalid XML — cannot export PNG");
  }

  // ✅ Determine size
  const viewBox = clone.viewBox.baseVal;
  const width = parseInt(clone.getAttribute("width")) || viewBox.width || 1200;
  const height = parseInt(clone.getAttribute("height")) || viewBox.height || 400;

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
  const username = "peme969";
  function getDownloadOcticonSVG() {
    // GitHub Octicon "download" (16px)
    return `
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M7.25 1.5a.75.75 0 0 1 1.5 0v6.69l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5A.75.75 0 1 1 5.03 5.97l2.22 2.22V1.5ZM2.75 13a.75.75 0 0 1 .75-.75h9a.75.75 0 0 1 0 1.5h-9A.75.75 0 0 1 2.75 13Z"></path>
      </svg>
    `;
  }
  function getCopyOcticonSVG() {
    return `
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
        <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5c0 .966-.784 1.75-1.75 1.75h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
      </svg>
    `;
  }
  
  const YEARS_URL = `https://github-contribution-graph-generator.vercel.app/graph/years/${username}`;
  const POST_URL = `https://github-contribution-graph-generator.vercel.app/custom/${username}`;

  const container = document.getElementById("graphs");
  const tooltip = document.getElementById("tooltip");
  function downloadSVG(svgText, filename) {
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, filename);
  }
  
  
function bindTooltips(scopeEl) {
  const cells = scopeEl.querySelectorAll(".day-cell");
  cells.forEach((cell) => {
    cell.addEventListener("mousemove", (e) => {
      const text = cell.getAttribute("data-tooltip");
      if (!text) return;

      tooltip.textContent = text;
      tooltip.style.opacity = "1";

      // Position tooltip near cursor
      let x = e.pageX + 12;
      let y = e.pageY - 28;

      // Keep tooltip within viewport
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

  function createYearSection(year) {
    const section = document.createElement("section");
    section.className = "year-section";

    const title = document.createElement("h2");
    title.textContent = `Year ${year}`;

    const grid = document.createElement("div");
    grid.className = "grid";

    section.appendChild(title);
    section.appendChild(grid);
    container.appendChild(section);

    return grid;
  }

  async function fetchSVG(year, palette, themeName) {
    const payload = {
      palette,
    };

    const res = await fetch(POST_URL+"?year="+year, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`POST failed (${res.status})`);
    }

    return await res.text(); // SVG string
  }

  function renderCard(grid, year, themeName, svgText) {
    const card = document.createElement("div");
    card.className = "theme-card";
  
    const svgWrap = document.createElement("div");
    svgWrap.className = "svg-wrap";
    svgWrap.innerHTML = svgText;
    console.log("renderCard:", year, themeName);

    // Bind tooltip listeners
    bindTooltips(svgWrap);
    const toast = document.getElementById("toast");
let toastTimer = null;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1200);
}

    // Row under graph: theme name + dropdown + download + copy
    const nameRow = document.createElement("div");
    nameRow.className = "theme-name-row";
  
    const name = document.createElement("div");
    name.className = "theme-name";
    name.textContent = themeName;
  
    // Dropdown export type
    const exportSelect = document.createElement("select");
    exportSelect.className = "export-select";
    exportSelect.innerHTML = `
      <option value="svg">SVG</option>
      <option value="png">PNG</option>
      <option value="json">JSON</option>
    `;
  
    // Download button
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "download-btn";
    downloadBtn.type = "button";
    downloadBtn.title = "Download";
    downloadBtn.innerHTML = getDownloadOcticonSVG();
  
    // Copy SVG button
    const copyBtn = document.createElement("button");
    copyBtn.className = "copy-btn";
    copyBtn.type = "button";
    copyBtn.title = "Copy SVG";
    copyBtn.innerHTML = getCopyOcticonSVG();
  
    downloadBtn.addEventListener("click", async () => {
      try {
        const safeTheme = themeName.replace(/[^a-z0-9_-]/gi, "_");
        const format = exportSelect.value;
    
        if (format === "svg") {
          downloadSVG(svgText, `${username}_${year}_${safeTheme}.svg`);
          showToast("⬇️ Downloaded SVG");
        } else if (format === "png") {
          const blob = await svgWrapToPngBlob(svgWrap, "#0d1117", 2);
downloadBlob(blob, `${username}_${year}_${safeTheme}.png`);
showToast("⬇️ Downloaded PNG");

        } else if (format === "json") {
          const jsonObj = svgToJSON(svgWrap);
          downloadJSON(jsonObj, `${username}_${year}_${safeTheme}.json`);
          showToast("⬇️ Downloaded JSON");
        }
      } catch (err) {
        console.error(err);
        showToast("❌ Download failed");
      }
    });
    copyBtn.addEventListener("click", async () => {
      try {
        const blob = await svgWrapToPngBlob(svgWrap, "#0d1117", 2);
        await copyPngBlobToClipboard(blob);
        showToast("✅ Copied as image (PNG)");
      } catch (err) {
        console.error(err);
        showToast("❌ Copy image failed");
      }
    });
    
    
    
    
    const controls = document.createElement("div");
    controls.className = "theme-controls";
    
    controls.appendChild(exportSelect);
    controls.appendChild(downloadBtn);
    controls.appendChild(copyBtn);
    
    nameRow.appendChild(name);
    nameRow.appendChild(controls);
    
  
    card.appendChild(svgWrap);
    card.appendChild(nameRow);
  
    grid.appendChild(card);
  }
  
  

  function renderErrorCard(grid, themeName, error) {
    const card = document.createElement("div");
    card.className = "theme-card error-card";

    const msg = document.createElement("div");
    msg.className = "error-msg";
    msg.textContent = `Failed: ${themeName} — ${error.message}`;

    card.appendChild(msg);
    grid.appendChild(card);
  }

  // ---------------------------
  // MAIN FLOW
  // ---------------------------
  try {
    const yearsRes = await fetch(YEARS_URL);
    if (!yearsRes.ok) throw new Error(`GET years failed (${yearsRes.status})`);

    const yearsData = await yearsRes.json();
    const years = yearsData.years_in_git || [];

    if (!years.length) {
      container.textContent = "No years found.";
      return;
    }

    // For each year create a section and render themes
    for (const year of years) {
      const grid = createYearSection(year);

      // Fetch each theme graph
      for (const [themeName, themeObj] of Object.entries(themes)) {
        try {
          const palette = getPalette(themeObj);
          const svgText = await fetchSVG(year, palette, themeName);
          renderCard(grid, year, themeName, svgText);
        } catch (err) {
          renderErrorCard(grid, themeName, err);
        }
      }
    }
  } catch (err) {
    container.textContent = `Error: ${err.message}`;
  }
})();
