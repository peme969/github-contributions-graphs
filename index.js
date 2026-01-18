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
  // UI elements
  const usernameInput = document.getElementById("usernameInput");
  const loadBtn = document.getElementById("loadBtn");
  const themeSelect = document.getElementById("themeSelect");
  const yearSelect = document.getElementById("yearSelect");
  const graphDisplay = document.getElementById("graphDisplay");
  const statusEl = document.getElementById("status");
  const tooltip = document.getElementById("tooltip");

  // Cache: { [year]: { [themeName]: svgText } }
  let svgCache = {};

  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
  }

  function setPlaceholder(text) {
    graphDisplay.innerHTML = `<div class="placeholder">${text}</div>`;
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
    const yearsRes = await fetch(YEARS_URL);
    if (!yearsRes.ok) throw new Error(`GET years failed (${yearsRes.status})`);
    const yearsData = await yearsRes.json();
    return yearsData.years_in_git || [];
  }

  async function fetchSVGFor(username, year, palette) {
    const POST_URL = `https://github-contribution-graph-generator.vercel.app/custom/${username}`;
    const payload = { palette };
    const res = await fetch(POST_URL + "?year=" + year, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`POST failed (${res.status})`);
    return await res.text();
  }

  function fillSelect(selectEl, options) {
    selectEl.innerHTML = "";
    for (const v of options) {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = String(v);
      selectEl.appendChild(opt);
    }
  }

  function renderSelected() {
    const themeName = themeSelect.value;
    const year = yearSelect.value;
    if (!themeName || !year) return;

    const svgText = svgCache?.[year]?.[themeName];
    if (!svgText) {
      setPlaceholder("Graph not loaded yet.");
      return;
    }

    const svgWrap = document.createElement("div");
    svgWrap.className = "svg-wrap";
    svgWrap.innerHTML = svgText;

    graphDisplay.innerHTML = "";
    graphDisplay.appendChild(svgWrap);
    bindTooltips(svgWrap);
  }

  async function generateAll(username) {
    svgCache = {};
    themeSelect.disabled = true;
    yearSelect.disabled = true;

    setPlaceholder("Loading years...");
    setStatus("");

    const years = await fetchYears(username);
    if (!years.length) {
      setPlaceholder("No years found for this user.");
      return;
    }

    const themeNames = Object.keys(themes);

    fillSelect(themeSelect, themeNames);
    fillSelect(yearSelect, years);

    themeSelect.disabled = false;
    yearSelect.disabled = false;

    const total = years.length * themeNames.length;
    let done = 0;

    setStatus(`Generating ${total} graphs...`);
    setPlaceholder("Generating graphs...");

    for (const year of years) {
      svgCache[year] = {};
      for (const themeName of themeNames) {
        const palette = getPalette(themes[themeName]);
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

        done += 1;
        setStatus(`Generating ${total} graphs... (${done}/${total})`);
      }
    }

    setStatus(`Done. Loaded ${done}/${total} graphs for @${username}.`);

    // default selection
    themeSelect.value = themeNames[0] || "";
    yearSelect.value = String(years[0] || "");
    renderSelected();
  }

  themeSelect.addEventListener("change", renderSelected);
  yearSelect.addEventListener("change", renderSelected);

  async function onGenerate() {
    const username = (usernameInput.value || "").trim();
    if (!username) {
      setStatus("Please enter a username.");
      setPlaceholder("Enter a username to generate graphs.");
      return;
    }

    try {
      await generateAll(username);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
      setPlaceholder("Could not generate graphs.");
    }
  }

  loadBtn.addEventListener("click", onGenerate);
  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onGenerate();
  });
})();
