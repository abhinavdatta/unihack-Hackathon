// ═══════════════════════════════════════════════════════════════
// SPECLENS — Pure Vanilla JS Application  v0.3
// No React, no framework. Just HTML + CSS + JavaScript.
//
// API keys can be stored in browser memory (ephemeral) or
// cached in sessionStorage (survives refresh, cleared on tab close).
// Keys are NEVER written to localStorage, cookies, or disk.
// ═══════════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── State ────────────────────────────────────────────────
  var state = {
    view: "catalog",
    selectedProductId: null,
    settingsOpen: false,
    sourceField: null,
    theme: "light",
    aiProvider: "builtin",
    aiApiKey: "",
    cacheKey: false,
    products: [],
    product: null,
    fields: [],
    reviewQueue: [],
    reviewSummary: { total: 0, lowConfidence: 0, productCount: 0 },
    extracting: false,
    editingFieldId: null,
    clearConfirm: false,
    clearing: false,
    keyValidating: false,
    keyValidState: null,
    keyValidError: "",
    // v0.2 features
    searchQuery: "",
    statusFilter: "all",
    page: 1,
    pageSize: 12,
    deleteConfirm: false,
    deleting: false,
    shortcutsOpen: false,
    batchQueue: [],
    batchProgress: { done: 0, total: 0, errors: 0, items: [] },
  };

  // ── Canonical Fields ─────────────────────────────────────
  var FIELD_GROUPS = [
    { key: "identity", label: "Identity", fields: ["product_name","manufacturer","model_number","part_number","product_category"] },
    { key: "physical", label: "Physical", fields: ["weight","dimensions","material","operating_temperature","storage_temperature"] },
    { key: "performance", label: "Performance", fields: ["voltage_rating","current_rating","power_rating","frequency_range","response_time","accuracy","efficiency"] },
    { key: "compliance", label: "Compliance", fields: ["certifications","ip_rating","warranty","rohs_compliant","datasheet_source_url"] },
  ];
  var FIELD_LABELS = {
    product_name:"Product Name",manufacturer:"Manufacturer",model_number:"Model Number",
    part_number:"Part Number",product_category:"Category",weight:"Weight",
    dimensions:"Dimensions",material:"Material",operating_temperature:"Operating Temp",
    storage_temperature:"Storage Temp",voltage_rating:"Voltage Rating",
    current_rating:"Current Rating",power_rating:"Power Rating",
    frequency_range:"Frequency Range",response_time:"Response Time",
    accuracy:"Accuracy",efficiency:"Efficiency",certifications:"Certifications",
    ip_rating:"IP Rating",warranty:"Warranty",rohs_compliant:"RoHS",
    datasheet_source_url:"Datasheet URL",
  };
  var ALL_FIELDS = [];
  FIELD_GROUPS.forEach(function(g) { g.fields.forEach(function(f) { ALL_FIELDS.push(f); }); });

  var PROVIDERS = [
    {id:"builtin",label:"Built-in (Default)",desc:"Platform's default vision model. No key required."},
    {id:"openai",label:"OpenAI",desc:"GPT-4o with vision"},
    {id:"anthropic",label:"Anthropic Claude",desc:"Claude Sonnet 4 with vision"},
    {id:"google",label:"Google Gemini",desc:"Gemini 2.0 Flash with vision"},
    {id:"deepseek",label:"DeepSeek",desc:"DeepSeek Chat (OpenAI-compatible)"},
  ];

  // ── SVG Icons ─────────────────────────────────────────────
  var icons = {
    upload: '<svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    settings: '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    x: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    check: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    pencil: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
    ban: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>',
    eye: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    back: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
    download: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    trash: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    shield: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>',
    zap: '<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    alert: '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    sun: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
    moon: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    monitor: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
    lock: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    search: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    copy: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    undo: '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
    csv: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/></svg>',
    keyboard: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01"/><path d="M10 8h.01"/><path d="M14 8h.01"/><path d="M18 8h.01"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/><path d="M8 16h8"/></svg>',
    package: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
    layers: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L3.17 12"/><path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L3.17 17.5"/></svg>',
  };

  // ── Helpers ──────────────────────────────────────────────
  var $ = function(sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  function confBadge(conf) {
    if (conf >= 0.85) return '<span class="badge badge-high" title="Score: '+conf.toFixed(2)+'"><span class="badge-dot"></span>High</span>';
    if (conf >= 0.6) return '<span class="badge badge-med" title="Score: '+conf.toFixed(2)+'"><span class="badge-dot"></span>Med</span>';
    return '<span class="badge badge-low" title="Score: '+conf.toFixed(2)+'"><span class="badge-dot"></span>Low</span>';
  }

  function statusBadge(s) {
    var map = { extracted:"Extracted", needs_review:"Review", approved:"Approved", edited:"Edited", rejected:"Rejected", completed:"Completed" };
    return '<span class="status-badge status-'+s+'">'+(map[s]||s)+'</span>';
  }

  function toast(msg, type) {
    type = type || "success";
    var t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    $("#toast-container").appendChild(t);
    setTimeout(function() { t.remove(); }, 3200);
  }

  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onload = function() { var s = r.result; var i = s.indexOf(","); resolve(i >= 0 ? s.slice(i+1) : s); };
      r.onerror = function() { reject(new Error("Failed to read file")); };
      r.readAsDataURL(file);
    });
  }

  function timeAgo(dateStr) {
    var d = new Date(dateStr);
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s/60) + "m ago";
    if (s < 86400) return Math.floor(s/3600) + "h ago";
    return d.toLocaleDateString();
  }

  function esc(str) { if (!str) return ""; var d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

  function highlightSnippet(snippet, value) {
    if (!snippet || !value) return esc(snippet || "");
    var escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return esc(snippet).replace(new RegExp("(" + escaped.substring(0,40).replace(/\s+/g, "\\s+") + ")", "i"), "<mark>$1</mark>");
  }

  function debounce(fn, ms) { var t; return function() { var a = arguments; clearTimeout(t); t = setTimeout(function() { fn.apply(null, a); }, ms); }; }

  // ── Filtered & Paged Products ────────────────────────────
  function getFilteredProducts() {
    var q = state.searchQuery.toLowerCase().trim();
    var f = state.statusFilter;
    return state.products.filter(function(p) {
      if (f !== "all" && p.status !== f) return false;
      if (q) {
        var haystack = (p.name + " " + p.fileName + " " + (p.status||"")).toLowerCase();
        if (haystack.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function getPagedProducts() {
    var filtered = getFilteredProducts();
    var start = (state.page - 1) * state.pageSize;
    return filtered.slice(start, start + state.pageSize);
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(getFilteredProducts().length / state.pageSize));
  }

  // ── Stats ────────────────────────────────────────────────
  function getStats() {
    var ps = state.products;
    var totalFields = 0, approvedFields = 0, reviewFields = 0;
    ps.forEach(function(p) { totalFields += (p.fieldCount||0); reviewFields += (p.reviewCount||0); });
    // Approximate approved from what we know
    approvedFields = totalFields - reviewFields;
    var rate = totalFields > 0 ? Math.round((approvedFields / totalFields) * 100) : 0;
    return { products: ps.length, fields: totalFields, review: reviewFields, rate: rate };
  }

  // ── API ───────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    return fetch(path, { headers: { "Content-Type": "application/json" }, ...opts }).then(function(r) { return r.json(); }).then(function(d) { if (d.error) throw new Error(d.error); return d; });
  }

  function fetchProducts() { return api("/api/products").then(function(d) { state.products = d.products || []; }); }

  function fetchProduct(id) {
    return api("/api/products/"+id).then(function(d) {
      state.product = d.product;
      state.fields = (d.fields||[]).map(function(f) {
        return Object.assign({}, f, { label: FIELD_LABELS[f.fieldName]||f.fieldName, group: (FIELD_GROUPS.find(function(g){return g.fields.indexOf(f.fieldName)>=0;})||{}).key||"other" });
      });
    });
  }

  function fetchReviewQueue() {
    return api("/api/review-queue").then(function(d) {
      state.reviewQueue = d.fields||[];
      state.reviewSummary = d.summary||{total:0,lowConfidence:0,productCount:0};
    });
  }

  function extractFile(file) {
    state.extracting = true;
    render();
    fileToBase64(file).then(function(base64) {
      var body = { fileName: file.name, mimeType: file.type, base64: base64 };
      if (state.aiProvider !== "builtin") { body.provider = state.aiProvider; body.apiKey = state.aiApiKey; }
      return api("/api/extract", { method: "POST", body: JSON.stringify(body) });
    }).then(function(d) {
      // v0.3: Multi-product extraction support
      if (d.productCount > 1) {
        toast('Multi-product extraction: ' + d.productCount + ' products found!');
      } else {
        toast('Extracted "' + (d.name || d.products[0].name) + '" — ' + (d.fieldCount || d.products[0].fieldCount) + ' fields, ' + (d.reviewCount || d.products[0].reviewCount) + ' need review');
      }
      return fetchProducts();
    }).catch(function(e) { toast(e.message || "Extraction failed", "error"); })
    .finally(function() { state.extracting = false; render(); });
  }

  // ── Batch Upload ─────────────────────────────────────────
  function extractBatch(files) {
    if (!files.length) return;
    state.batchQueue = Array.prototype.slice.call(files);
    state.batchProgress = { done: 0, total: files.length, errors: 0, items: files.map(function(f) { return { name: f.name, status: "pending" }; }) };
    state.extracting = true;
    render();
    processNextBatch();
  }

  function processNextBatch() {
    if (state.batchQueue.length === 0) {
      state.extracting = false;
      var bp = state.batchProgress;
      toast("Batch complete: " + bp.done + " extracted, " + bp.errors + " errors", bp.errors > 0 ? "error" : "success");
      fetchProducts().then(function() { render(); });
      return;
    }
    var file = state.batchQueue.shift();
    var idx = state.batchProgress.total - state.batchQueue.length - 1;
    state.batchProgress.items[idx].status = "extracting";
    renderCatalog();

    fileToBase64(file).then(function(base64) {
      var body = { fileName: file.name, mimeType: file.type, base64: base64 };
      if (state.aiProvider !== "builtin") { body.provider = state.aiProvider; body.apiKey = state.aiApiKey; }
      return api("/api/extract", { method: "POST", body: JSON.stringify(body) });
    }).then(function(d) {
      // v0.3: A single file may produce multiple products
      state.batchProgress.items[idx].status = "success";
      state.batchProgress.items[idx].productCount = d.productCount || 1;
      state.batchProgress.done++;
      state.batchProgress.total += (d.productCount || 1) - 1; // adjust total for multi-product
    }).catch(function(e) {
      state.batchProgress.items[idx].status = "error";
      state.batchProgress.errors++;
      state.batchProgress.done++;
    }).finally(function() {
      if (state.batchQueue.length > 0) { setTimeout(processNextBatch, 300); } else { processNextBatch(); }
      renderCatalog();
    });
  }

  function updateField(id, status, value) {
    var body = { status: status };
    if (value !== undefined) body.value = value;
    return api("/api/fields/"+id, { method: "PATCH", body: JSON.stringify(body) }).then(function() {
      return Promise.all([fetchProducts(), fetchReviewQueue()]);
    }).then(function() {
      if (state.selectedProductId) return fetchProduct(state.selectedProductId);
    }).then(function() { render(); });
  }

  function bulkUpdate(actions) {
    return api("/api/review-queue/bulk", { method: "POST", body: JSON.stringify({ actions: actions }) }).then(function() {
      toast("Updated " + actions.length + " fields");
      return Promise.all([fetchProducts(), fetchReviewQueue()]);
    }).then(function() { render(); });
  }

  function exportJSON(id) {
    api("/api/export/"+id, { method: "POST" }).then(function(d) {
      var blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = ((state.product&&state.product.name)||"product")+"-schema-org.json"; a.click();
      URL.revokeObjectURL(url);
      toast("Exported as schema.org JSON");
      return Promise.all([fetchProducts(), fetchProduct(id)]);
    }).then(function() { render(); });
  }

  function exportCSV(id) {
    if (!state.fields || !state.fields.length) { toast("No fields to export", "error"); return; }
    var rows = [["Field","Value","Confidence","Status"]];
   state.fields.forEach(function(f) {
    rows.push([f.label||f.fieldName, f.value||"", f.confidence.toFixed(2), f.status]);
  });
    var csv = rows.map(function(r) { return r.map(function(c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = ((state.product&&state.product.name)||"product")+".csv"; a.click();
    URL.revokeObjectURL(url);
    toast("Exported as CSV");
  }

  function deleteProduct(id) {
    state.deleting = true; render();
    api("/api/products/"+id, { method: "DELETE" }).then(function(d) {
      toast("Deleted product and "+d.deleted.fields+" fields");
      state.view = "catalog"; state.selectedProductId = null; state.product = null; state.fields = [];
      state.deleteConfirm = false;
      return fetchProducts();
    }).then(function() { render(); })
    .catch(function(e) { toast(e.message||"Delete failed","error"); })
    .finally(function() { state.deleting = false; render(); });
  }

  function deleteProductFromCatalog(id) {
    var card = document.querySelector('[data-product-id="'+id+'"]');
    if (card) card.style.opacity = "0.4";
    api("/api/products/"+id, { method: "DELETE" }).then(function(d) {
      toast("Deleted product and "+d.deleted.fields+" fields");
      return fetchProducts();
    }).then(function() { render(); })
    .catch(function(e) { toast(e.message||"Delete failed","error"); if (card) card.style.opacity = "1"; });
  }

  function clearData() {
    state.clearing = true; render();
    api("/api/data", { method: "DELETE" }).then(function(d) {
      toast("Cleared "+d.deleted.products+" products, "+d.deleted.fields+" fields");
      state.products=[]; state.product=null; state.fields=[]; state.reviewQueue=[];
      state.selectedProductId=null; state.view="catalog"; state.clearConfirm=false;
      render();
    }).catch(function() { toast("Failed to clear data","error"); })
    .finally(function() { state.clearing=false; render(); });
  }

  function validateKey(provider, key) {
    state.keyValidating=true; state.keyValidState=null; state.keyValidError=""; renderSettings();
    api("/api/validate-key", { method:"POST", body:JSON.stringify({provider:provider,key:key.trim()}) })
    .then(function(d) { state.keyValidState = d.valid ? "valid" : "invalid"; state.keyValidError = d.error||""; })
    .catch(function() { state.keyValidState="invalid"; state.keyValidError="Network error"; })
    .finally(function() { state.keyValidating=false; renderSettings(); });
  }

  // ── Copy to Clipboard ────────────────────────────────────
  function copyValue(text, btnEl) {
    navigator.clipboard.writeText(text).then(function() {
      if (btnEl) { btnEl.classList.add("copied"); setTimeout(function(){btnEl.classList.remove("copied");}, 1500); }
      toast("Copied to clipboard", "info");
    }).catch(function() { toast("Copy failed", "error"); });
  }

  // ── Rendering ────────────────────────────────────────────
  function render() { renderHeader(); renderMain(); renderFooter(); renderSourcePanel(); }

  function renderHeader() {
    $("#header").innerHTML =
      '<div class="logo">SpecLens <span class="version">v0.3</span></div>' +
      '<div class="header-nav">' +
        '<button class="tab-btn '+(state.view==='catalog'||state.view==='detail'?'active':'')+ '" data-tab="catalog">Catalog</button>' +
        '<button class="tab-btn '+(state.view==='review'?'active':'')+ '" data-tab="review">Review Queue</button>' +
        '<span class="tab-spacer"></span>' +
        '<button class="settings-btn" id="settings-open-btn" title="Settings">'+icons.settings+'</button>' +
        '<button class="settings-btn" id="shortcuts-btn" title="Keyboard shortcuts">'+icons.keyboard+'</button>' +
      '</div>';
  }

  function renderMain() {
    var el = $("#main-content");
    if (state.view === "catalog") el.innerHTML = renderCatalog();
    else if (state.view === "detail") el.innerHTML = renderDetail();
    else if (state.view === "review") el.innerHTML = renderReviewQueue();
  }

  function renderCatalog() {
    var st = getStats();
    var filtered = getFilteredProducts();
    var paged = getPagedProducts();
    var totalPages = getTotalPages();

    // Stats bar
    var statsHtml = '<div class="stats-bar">' +
      '<div class="stat-card"><div class="stat-icon blue">'+icons.package+'</div><div class="stat-info"><span class="stat-num">'+st.products+'</span><span class="stat-label">Products</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon emerald">'+icons.check+'</div><div class="stat-info"><span class="stat-num">'+st.fields+'</span><span class="stat-label">Fields</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon amber">'+icons.alert+'</div><div class="stat-info"><span class="stat-num">'+st.review+'</span><span class="stat-label">Need Review</span></div></div>' +
      '<div class="stat-card"><div class="stat-icon '+(st.rate>=80?'emerald':'red')+'">'+icons.zap+'</div><div class="stat-info"><span class="stat-num">'+st.rate+'%</span><span class="stat-label">Approved</span></div></div>' +
    '</div>';

    // Search
    var searchHtml = '<div class="search-bar">' +
      '<span class="search-icon">'+icons.search+'</span>' +
      '<input type="text" id="search-input" placeholder="Search products by name or file..." value="'+esc(state.searchQuery)+'" />' +
      (state.searchQuery ? '<button class="search-clear" id="search-clear">'+icons.x+'</button>' : '') +
    '</div>';

    // Filter chips
    var statuses = [
      {key:"all",label:"All"},{key:"needs_review",label:"Needs Review"},
      {key:"approved",label:"Approved"},{key:"completed",label:"Completed"},{key:"extracted",label:"Extracted"}
    ];
    var counts = { all: state.products.length };
    state.products.forEach(function(p) { counts[p.status] = (counts[p.status]||0) + 1; });
    var chipsHtml = '<div class="filter-chips">';
    statuses.forEach(function(s) {
      chipsHtml += '<button class="filter-chip '+(state.statusFilter===s.key?'active':'')+ '" data-filter="'+s.key+'">'+s.label+'<span class="chip-count">'+(counts[s.key]||0)+'</span></button>';
    });
    chipsHtml += '</div>';

    // Batch progress
    var batchHtml = '';
    if (state.batchProgress.total > 0 && state.batchProgress.done < state.batchProgress.total) {
      var pct = Math.round((state.batchProgress.done / state.batchProgress.total) * 100);
      batchHtml = '<div class="batch-progress"><div class="bp-header"><span>Processing '+(state.batchProgress.done+1)+' of '+state.batchProgress.total+'</span><span>'+pct+'%</span></div>' +
        '<div class="bp-bar-track"><div class="bp-bar-fill" style="width:'+pct+'%"></div></div>' +
        '<div class="bp-items">';
      state.batchProgress.items.forEach(function(item) {
        var cls = item.status === 'success' ? 'success' : item.status === 'error' ? 'error' : 'pending';
        var label = item.status === 'success' ? '✓' : item.status === 'error' ? '✗' : '…';
        var multiLabel = (item.productCount > 1) ? ' (' + item.productCount + ' products)' : '';
        batchHtml += '<div class="bp-item"><span>'+esc(item.name)+multiLabel+'</span><span class="bp-status '+cls+'">'+label+'</span></div>';
      });
      batchHtml += '</div></div>';
    }

    // Upload zone
    var uploadHtml = '<div class="upload-zone '+(state.extracting?'extracting':'')+ '" id="upload-zone">' +
      '<input type="file" id="file-input" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tiff" />' +
      (state.extracting
        ? '<div style="display:flex;align-items:center;justify-content:center;gap:0.5rem"><span class="spinner"></span> Extracting with AI...</div>'
        : icons.upload+'<div class="upload-title">Drop datasheets here, or click to browse</div>' +
          '<div class="upload-hint">PDF, PNG, JPEG, WebP — up to 50 MB each</div>' +
          '<div class="upload-hint-multi">Hold Ctrl/Cmd to select multiple files for batch extraction</div>') +
      '</div>';

    // Product grid
    var grid = '';
    if (paged.length === 0 && filtered.length === 0) {
      grid = '<div class="empty-state"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>' +
        (state.searchQuery || state.statusFilter !== 'all' ? 'No products match your search or filter.' : 'No products yet. Upload a datasheet to get started.') + '</div>';
    } else if (paged.length === 0 && filtered.length > 0) {
      grid = '<div class="empty-state">No products on this page.</div>';
    } else {
      grid = '<div class="product-grid">';
      paged.forEach(function(p) {
        grid += '<div class="product-card" data-product-id="'+p.id+'">' +
          '<button class="pc-delete-btn" data-card-delete="'+p.id+'" title="Delete product">'+icons.x+'</button>' +
          '<div class="pc-name">'+esc(p.name)+' '+statusBadge(p.status)+'</div>' +
          '<div class="pc-meta">' +
            '<span>'+icons.upload+' '+esc(p.fileName)+'</span>' +
            '<span>'+(p.fieldCount||0)+' fields</span>' +
            (p.reviewCount > 0 ? '<span style="color:var(--amber-600)">'+p.reviewCount+' to review</span>' : '<span style="color:var(--emerald-600)">All approved</span>') +
          '</div>' +
          '<div class="pc-meta" style="margin-top:0.35rem"><span>'+timeAgo(p.createdAt)+'</span></div>' +
        '</div>';
      });
      grid += '</div>';
    }

    // Pagination
    var pagHtml = '';
    if (filtered.length > state.pageSize) {
      pagHtml = '<div class="pagination">';
      pagHtml += '<button class="page-btn" data-page="prev" '+(state.page<=1?'disabled':'')+ '>‹</button>';
      for (var i = 1; i <= totalPages; i++) {
        if (totalPages > 7 && i > 2 && i < totalPages - 1 && Math.abs(i - state.page) > 1) {
          if (i === 3 || i === totalPages - 2) pagHtml += '<span class="page-info">…</span>';
          continue;
        }
        pagHtml += '<button class="page-btn '+(i===state.page?'active':'')+ '" data-page="'+i+'">'+i+'</button>';
      }
      pagHtml += '<button class="page-btn" data-page="next" '+(state.page>=totalPages?'disabled':'')+ '>›</button>';
      pagHtml += '</div>';
    }

    return statsHtml + searchHtml + chipsHtml + batchHtml + uploadHtml +
      '<div class="section-head"><h2>Products<span class="count">'+(filtered.length||"")+'</span></h2></div>' + grid + pagHtml;
  }

  function renderDetail() {
    if (!state.product) return '<div class="empty-state">Loading...</div>';
    var p = state.product;
    var allApproved = state.fields.every(function(f) { return f.status === "approved" || f.status === "edited"; });
    var fieldGroups = '';
    FIELD_GROUPS.forEach(function(g) {
      var gFields = state.fields.filter(function(f) { return f.group === g.key; });
      if (!gFields.length) return;
      fieldGroups += '<div class="field-group"><div class="field-group-title">'+g.label+'</div><div class="field-card">';
      gFields.forEach(function(f) { fieldGroups += renderFieldRow(f); });
      fieldGroups += '</div></div>';
    });
    return '<button class="back-btn" id="back-btn">'+icons.back+' Back to Catalog</button>' +
      '<div class="detail-header">' +
        '<div><h2>'+esc(p.name)+'</h2><div class="dh-meta">'+esc(p.fileName)+' · '+timeAgo(p.createdAt)+'</div></div>' +
        '<div class="detail-actions">' + statusBadge(p.status) +
          (allApproved ? '<button class="btn btn-primary" id="export-json-btn">'+icons.download+' JSON</button><button class="btn-outline" id="export-csv-btn">'+icons.csv+' CSV</button>' : '') +
          '<button class="btn-outline danger" id="delete-product-btn">'+icons.trash+' Delete</button>' +
        '</div>' +
      '</div>' +
      (state.deleteConfirm ? '<div class="delete-confirm">'+icons.alert+' <span>Permanently delete this product and all its fields?</span>' +
        '<button class="btn btn-sm btn-danger" id="confirm-delete-btn" '+(state.deleting?'disabled':'')+'>'+(state.deleting?'Deleting...':'Yes, delete')+'</button>' +
        '<button class="btn btn-sm" id="cancel-delete-btn">Cancel</button></div>' : '') +
      fieldGroups;
  }

  function renderFieldRow(f) {
    if (state.editingFieldId === f.id) {
      return '<div class="field-row"><div class="field-label">'+esc(f.label)+'</div>' +
        '<div style="flex:1;display:flex;gap:0.5rem;align-items:center">' +
          '<input class="field-edit-input" id="edit-input" value="'+esc(f.value)+'" />' +
          '<button class="icon-btn" data-action="save-edit" data-id="'+f.id+'" title="Save">'+icons.check+'</button>' +
          '<button class="icon-btn" data-action="cancel-edit" title="Cancel">'+icons.x+'</button>' +
        '</div></div>';
    }
    var undoBtn = f.originalValue ? '<button class="undo-btn" data-action="undo" data-id="'+f.id+'" title="Revert to original">'+icons.undo+'</button>' : '';
    return '<div class="field-row">' +
      '<div class="field-label">'+esc(f.label)+'</div>' +
      '<div class="field-value field-value-source" data-source-field="'+f.id+'">'+esc(f.value)+'</div>' +
      '<button class="copy-btn" data-action="copy" data-value="'+esc(f.value)+'" title="Copy value">'+icons.copy+'</button>' +
      confBadge(f.confidence) +
      undoBtn +
      '<div class="field-actions">' +
        (f.status==="needs_review" ? '<button class="icon-btn approve" data-action="approve" data-id="'+f.id+'" title="Approve">'+icons.check+'</button>' : '') +
        '<button class="icon-btn edit" data-action="edit" data-id="'+f.id+'" title="Edit">'+icons.pencil+'</button>' +
        (f.status!=="rejected" ? '<button class="icon-btn reject" data-action="reject" data-id="'+f.id+'" title="Reject">'+icons.ban+'</button>' : '') +
      '</div></div>';
  }

  function renderReviewQueue() {
    var s = state.reviewSummary;
    var items = '';
    if (state.reviewQueue.length === 0) {
      items = '<div class="empty-state"><svg width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>All caught up! No fields need review.</div>';
    } else {
      state.reviewQueue.forEach(function(f) {
        items += '<div class="review-field-card">' +
          '<div class="rfc-header"><div class="rfc-product">'+icons.eye+' '+esc(f.productName||"")+' — '+esc(f.productFileName||"")+'</div>'+confBadge(f.confidence)+'</div>' +
          '<div class="rfc-body">' +
            '<div class="rfc-field-name">'+esc(f.label)+'</div>' +
            '<div class="rfc-value field-value-source" data-source-field="'+f.id+'">'+esc(f.value)+'</div>' +
            '<button class="copy-btn" data-action="copy" data-value="'+esc(f.value)+'" title="Copy value">'+icons.copy+'</button>' +
            '<div class="rfc-actions">' +
              '<button class="icon-btn approve" data-action="approve" data-id="'+f.id+'" title="Approve">'+icons.check+'</button>' +
              '<button class="icon-btn edit" data-action="edit" data-id="'+f.id+'" title="Edit">'+icons.pencil+'</button>' +
              '<button class="icon-btn reject" data-action="reject" data-id="'+f.id+'" title="Reject">'+icons.ban+'</button>' +
            '</div></div></div>';
      });
    }
    var bulkBar = '';
    if (s.total > 0) {
      bulkBar = '<div class="bulk-bar"><span style="font-size:0.8rem">Select: <button class="btn btn-sm" data-bulk="select-all">All</button> <button class="btn btn-sm" data-bulk="select-low">Low Only</button></span><div style="display:flex;gap:0.5rem"><button class="btn btn-sm btn-primary" data-bulk="approve-sel">Approve Selected</button><button class="btn btn-sm btn-danger" data-bulk="reject-sel">Reject Selected</button></div></div>';
    }
    return '<div class="review-summary">' +
        '<div class="review-stat"><span class="rs-num">'+s.total+'</span> fields to review</div>' +
        '<div class="review-stat" style="border-color:var(--red-200)"><span class="rs-num" style="color:var(--red-600)">'+s.lowConfidence+'</span> low confidence</div>' +
        '<div class="review-stat"><span class="rs-num">'+s.productCount+'</span> products affected</div>' +
      '</div>' + bulkBar + items;
  }

  function renderFooter() {
    $("#footer").innerHTML = '<p>SpecLens — AI-Powered Product Intelligence · v0.3</p>';
  }

  function renderSourcePanel() {
    var p = $("#source-panel");
    var f = state.sourceField;
    if (!f) { p.classList.remove("open"); return; }
    p.classList.add("open");
    p.innerHTML = '<div class="sp-header"><span class="sp-title">Source Citation</span><button class="sp-close" id="source-close">'+icons.x+'</button></div>' +
      '<div class="sp-field-label">'+esc(f.label||f.fieldName)+'</div>' +
      '<div class="sp-value">'+esc(f.value)+'</div>' +
      '<div class="sp-snippet-label">Source (Page '+(f.sourcePage||"?")+')</div>' +
      '<div class="sp-snippet">'+highlightSnippet(f.sourceSnippet, f.value)+'</div>';
  }

  // ── Settings Panel ───────────────────────────────────────
  function renderSettings() {
    var p = $("#settings-panel");
    if (!p) return;
    var prov = PROVIDERS.find(function(x){return x.id===state.aiProvider;});
    var keySection = "";
    if (state.aiProvider !== "builtin") {
      var validationHtml = "";
      if (state.keyValidState === "valid") validationHtml = '<div class="validation-ok">'+icons.check+' API key is valid</div>';
      else if (state.keyValidState === "invalid") validationHtml = '<div class="validation-err">'+icons.x+' <span>'+esc(state.keyValidError)+'</span></div>';
      var cacheNote = state.cacheKey
        ? icons.lock+' Key is cached in this browser tab.'
        : icons.shield+' Your key stays in browser memory only.';
      keySection = '<div class="key-section"><label class="key-label">API Key</label><div class="key-row"><input type="password" class="key-input" id="key-input" placeholder="Enter your '+(prov?prov.label:"")+ ' API key" value="'+esc(state.aiApiKey)+'" /></div>' + validationHtml +
        '<div class="key-actions"><button class="btn btn-sm" id="test-key-btn" '+(state.keyValidating||!state.aiApiKey?'disabled':'')+'>'+(state.keyValidating?'<span class="spinner" style="width:12px;height:12px;border-width:2px"></span> Testing...':'Test Key')+'</button></div>' +
        '<label class="cache-toggle" id="cache-key-toggle"><span class="cache-toggle-track '+(state.cacheKey?'active':'')+'"><span class="cache-toggle-thumb"></span></span><span class="cache-toggle-label">'+(state.cacheKey?'Key cached':'Cache key')+'</span></label>' +
        '<div class="key-note">'+cacheNote+'</div></div>';
    }
    var dangerHtml = "";
    if (!state.clearConfirm) {
      dangerHtml = '<button class="danger-btn" id="clear-data-btn">'+icons.trash+' Delete All Products</button>';
    } else {
      dangerHtml = '<div class="danger-confirm"><div style="display:flex;align-items:flex-start;gap:0.5rem">'+icons.alert+'<div style="flex:1"><p>This will permanently delete <strong>all ' + state.products.length + ' products</strong> and all extracted fields.</p><p class="dc-hint">Uploaded file data sent to the AI cannot be recalled.</p><div class="dc-actions"><button class="btn btn-sm btn-danger" id="confirm-clear-btn" '+(state.clearing?'disabled':'')+'>'+(state.clearing?'Deleting...':'Yes, delete everything')+'</button><button class="btn btn-sm" id="cancel-clear-btn">Cancel</button></div></div></div></div>';
    }
    var builtinNote = state.aiProvider === "builtin" ? '<div class="builtin-note">'+icons.zap+' Using the built-in vision model. No configuration needed.</div>' : '';
    var settingsHtml = '<div class="sp-header"><h2>Settings</h2><button class="sp-close" id="settings-close">'+icons.x+'</button></div><div class="sp-body">' +
      '<div class="sp-section"><div class="sp-section-title">Appearance</div><div class="theme-cards">' +
        '<button class="theme-card '+(state.theme==='light'?'active':'')+ '" data-theme="light">'+icons.sun+'<span>Light</span></button>' +
        '<button class="theme-card '+(state.theme==='dark'?'active':'')+ '" data-theme="dark">'+icons.moon+'<span>Dark</span></button>' +
        '<button class="theme-card '+(state.theme==='system'?'active':'')+ '" data-theme="system">'+icons.monitor+'<span>System</span></button>' +
      '</div></div><div class="sp-separator"></div>' +
      '<div class="sp-section"><div style="display:flex;align-items:center;margin-bottom:0.75rem"><div class="sp-section-title" style="margin-bottom:0">AI Extraction Model</div><span class="security-badge">'+icons.shield+' Ephemeral keys</span></div>' +
      '<div class="provider-list">';
    PROVIDERS.forEach(function(pr) {
      settingsHtml += '<button class="provider-option '+(state.aiProvider===pr.id?'active':'')+ '" data-provider="'+pr.id+'"><div class="po-label">'+pr.label+' '+(state.aiProvider===pr.id?icons.check:'')+'</div><div class="po-desc">'+pr.desc+'</div></button>';
    });
    settingsHtml += '</div>'+keySection+builtinNote+'</div><div class="sp-separator"></div>' +
      '<div class="sp-section"><div class="sp-section-title red">Danger Zone</div>'+dangerHtml+'</div></div>';
    p.innerHTML = settingsHtml;
  }

  // ── Keyboard Shortcuts Modal ─────────────────────────────
  function renderShortcuts() {
    var el = $("#shortcuts-overlay");
    if (!el) return;
    el.classList.toggle("open", state.shortcutsOpen);
    if (!state.shortcutsOpen) return;
    el.innerHTML = '<div class="shortcuts-modal"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem"><h3>Keyboard Shortcuts</h3><button id="shortcuts-close">'+icons.x+'</button></div>' +
      '<div class="shortcut-row"><span>Upload file</span><div class="shortcut-keys"><span class="kbd">Ctrl</span><span class="kbd">U</span></div></div>' +
      '<div class="shortcut-row"><span>Search products</span><div class="shortcut-keys"><span class="kbd">/</span></div></div>' +
      '<div class="shortcut-row"><span>Settings</span><div class="shortcut-keys"><span class="kbd">Ctrl</span><span class="kbd">,</span></div></div>' +
      '<div class="shortcut-row"><span>Review Queue</span><div class="shortcut-keys"><span class="kbd">Ctrl</span><span class="kbd">R</span></div></div>' +
      '<div class="shortcut-row"><span>Close panel / Escape</span><div class="shortcut-keys"><span class="kbd">Esc</span></div></div>' +
      '<div class="shortcut-row"><span>Show shortcuts</span><div class="shortcut-keys"><span class="kbd">?</span></div></div>' +
    '</div>';
  }

  // ── Events ───────────────────────────────────────────────
  function setupEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("input", handleInput);
    document.addEventListener("keydown", handleKeydown);
    setupUploadZone();
  }

  function handleClick(e) {
    var t = e.target.closest("[data-tab]");
    if (t) { switchTab(t.dataset.tab); return; }
    if (e.target.closest("#settings-open-btn")) { toggleSettings(true); return; }
    if (e.target.closest("#settings-close") || e.target.closest(".settings-backdrop")) { toggleSettings(false); return; }
    if (e.target.closest("#shortcuts-btn")) { state.shortcutsOpen = !state.shortcutsOpen; renderShortcuts(); return; }
    if (e.target.closest("#shortcuts-close")) { state.shortcutsOpen = false; renderShortcuts(); return; }
    if (e.target.closest("[data-theme]")) { setTheme(e.target.closest("[data-theme]").dataset.theme); return; }
    if (e.target.closest("[data-provider]")) { setProvider(e.target.closest("[data-provider]").dataset.provider); return; }
    if (e.target.closest("#cache-key-toggle")) { toggleCacheKey(); return; }
    if (e.target.closest("#test-key-btn")) { validateKey(state.aiProvider, state.aiApiKey); return; }
    if (e.target.closest("#clear-data-btn")) { state.clearConfirm = true; renderSettings(); return; }
    if (e.target.closest("#confirm-clear-btn")) { clearData(); return; }
    if (e.target.closest("#cancel-clear-btn")) { state.clearConfirm = false; renderSettings(); return; }
    var cardDel = e.target.closest("[data-card-delete]");
    if (cardDel) { e.stopPropagation(); deleteProductFromCatalog(cardDel.dataset.cardDelete); return; }
    var pc = e.target.closest("[data-product-id]");
    if (pc) { openDetail(pc.dataset.productId); return; }
    if (e.target.closest("#back-btn")) { state.view="catalog"; state.selectedProductId=null; state.sourceField=null; render(); return; }
    if (e.target.closest("#export-json-btn")) { exportJSON(state.selectedProductId); return; }
    if (e.target.closest("#export-csv-btn")) { exportCSV(state.selectedProductId); return; }
    if (e.target.closest("#delete-product-btn")) { state.deleteConfirm = true; render(); return; }
    if (e.target.closest("#confirm-delete-btn")) { deleteProduct(state.selectedProductId); return; }
    if (e.target.closest("#cancel-delete-btn")) { state.deleteConfirm = false; render(); return; }
    if (e.target.closest("[data-source-field]")) { showSource(e.target.closest("[data-source-field]").dataset.sourceField); return; }
    if (e.target.closest("#source-close")) { state.sourceField=null; renderSourcePanel(); return; }
    if (e.target.closest("[data-filter]")) { state.statusFilter = e.target.closest("[data-filter]").dataset.filter; state.page = 1; render(); return; }
    if (e.target.closest("[data-page]")) { handlePageClick(e.target.closest("[data-page]").dataset.page); return; }
    if (e.target.closest("#search-clear")) { state.searchQuery = ""; state.page = 1; render(); return; }
    var act = e.target.closest("[data-action]");
    if (act) {
      if (act.dataset.action === "copy") { copyValue(act.dataset.value, act); return; }
      if (act.dataset.action === "undo") { updateField(act.dataset.id, "edited", act.dataset.original); return; }
      handleFieldAction(act.dataset.action, act.dataset.id);
      return;
    }
    if (e.target.closest("[data-bulk]")) { handleBulk(e.target.closest("[data-bulk]").dataset.bulk); return; }
  }

  function handleInput(e) {
    if (e.target.id === "key-input") {
      state.aiApiKey = e.target.value; state.keyValidState = null; state.keyValidError = "";
      if (state.cacheKey) saveCachedKey();
      var btn = document.getElementById("test-key-btn");
      if (btn) btn.disabled = !state.aiApiKey || state.keyValidating;
      var ks = e.target && e.target.closest(".key-section");
      var existing = ks && ks.querySelector(".validation-ok,.validation-err");
      if (existing) existing.remove();
    }
    if (e.target.id === "search-input") {
      state.searchQuery = e.target.value;
      state.page = 1;
      debouncedRender();
    }
  }

  var debouncedRender = debounce(function() { render(); }, 200);

  function handleKeydown(e) {
    // Shortcuts modal
    if (e.key === "?" && !e.target.closest("input,textarea")) { e.preventDefault(); state.shortcutsOpen = !state.shortcutsOpen; renderShortcuts(); return; }
    if (e.key === "Escape") {
      if (state.shortcutsOpen) { state.shortcutsOpen = false; renderShortcuts(); return; }
      if (state.settingsOpen) { toggleSettings(false); return; }
      if (state.sourceField) { state.sourceField = null; renderSourcePanel(); return; }
      if (state.editingFieldId) { state.editingFieldId = null; render(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "u") { e.preventDefault(); var fi = $("#file-input"); if (fi) fi.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === ",") { e.preventDefault(); toggleSettings(!state.settingsOpen); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === "r") { e.preventDefault(); switchTab("review"); return; }
    if (e.key === "/" && !e.target.closest("input,textarea")) { e.preventDefault(); state.view="catalog"; switchTab("catalog"); setTimeout(function(){ var si = $("#search-input"); if (si) si.focus(); }, 50); return; }
    if (e.key === "Enter" && state.editingFieldId && e.target.id === "edit-input") {
      var val = e.target.value;
      updateField(state.editingFieldId, "edited", val);
      state.editingFieldId = null;
    }
  }

  function handlePageClick(p) {
    var tp = getTotalPages();
    if (p === "prev") state.page = Math.max(1, state.page - 1);
    else if (p === "next") state.page = Math.min(tp, state.page + 1);
    else state.page = parseInt(p, 10);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function switchTab(tab) {
    if (tab === "catalog") { state.view = "catalog"; state.selectedProductId = null; }
    else if (tab === "review") { state.view = "review"; loadReviewQueue(); }
    state.sourceField = null;
    render();
  }

  function toggleSettings(open) { state.settingsOpen = open; $(".settings-backdrop").classList.toggle("open", open); $("#settings-panel").classList.toggle("open", open); if (open) renderSettings(); }

  function setTheme(t) {
    state.theme = t;
    if (t === "system") { document.documentElement.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches); }
    else { document.documentElement.classList.toggle("dark", t === "dark"); }
    try { localStorage.setItem("speclens-theme", t); } catch {}
    renderSettings();
  }

  function setProvider(p) {
    state.aiProvider = p; state.aiApiKey = ""; state.keyValidState = null; state.keyValidError = "";
    if (state.cacheKey) loadCachedKey();
    renderSettings();
  }

  // ── Key Caching ───────────────────────────────────────────
  function cacheKeyStorageKey() { return "speclens-key-" + state.aiProvider; }
  function saveCachedKey() { try { if (state.cacheKey && state.aiApiKey) sessionStorage.setItem(cacheKeyStorageKey(), state.aiApiKey); } catch {} }
  function loadCachedKey() { try { var s = sessionStorage.getItem(cacheKeyStorageKey()); if (s) state.aiApiKey = s; } catch {} }
  function clearCachedKey() { try { ["openai","anthropic","google","deepseek"].forEach(function(p){sessionStorage.removeItem("speclens-key-"+p);}); } catch {} }
  function toggleCacheKey() {
    state.cacheKey = !state.cacheKey;
    try { sessionStorage.setItem("speclens-cache-key", String(state.cacheKey)); } catch {}
    if (state.cacheKey) { saveCachedKey(); toast("API key will be cached for this tab session"); }
    else { clearCachedKey(); toast("Cache cleared. Key is now ephemeral."); }
    renderSettings();
    var el = document.getElementById("cache-key-toggle"); if (el) el.focus();
  }

  function openDetail(id) { state.view = "detail"; state.selectedProductId = id; state.sourceField = null; state.editingFieldId = null; state.deleteConfirm = false; loadDetail(); }

  function loadDetail() {
    $("#main-content").innerHTML = '<div class="empty-state">Loading...</div>';
    fetchProduct(state.selectedProductId).then(function() { render(); }).catch(function() { toast("Failed to load product","error"); state.view="catalog"; render(); });
  }

  function loadReviewQueue() { fetchReviewQueue().then(function() { render(); }).catch(function() { toast("Failed to load review queue","error"); }); }

  function showSource(fieldId) {
    var f = state.fields.find(function(x){return x.id===fieldId;}) || state.reviewQueue.find(function(x){return x.id===fieldId;});
    if (f) { state.sourceField = f; renderSourcePanel(); }
  }

  function handleFieldAction(action, id) {
    if (action === "approve") { updateField(id, "approved"); toast("Field approved"); }
    else if (action === "reject") { updateField(id, "rejected"); toast("Field rejected"); }
    else if (action === "edit") { state.editingFieldId = id; render(); setTimeout(function(){ var ei = $("#edit-input"); if (ei) ei.focus(); },50); }
    else if (action === "save-edit") { var input = $("#edit-input"); if (input) { updateField(id, "edited", input.value); state.editingFieldId = null; toast("Field updated"); } }
    else if (action === "cancel-edit") { state.editingFieldId = null; render(); }
  }

  function handleBulk(action) {
    var fields = state.reviewQueue; var selected;
    if (action === "select-all") selected = fields.map(function(f){return f.id;});
    else if (action === "select-low") selected = fields.filter(function(f){return f.confidence<0.6;}).map(function(f){return f.id;});
    else if (action === "approve-sel" && fields.length) selected = fields.map(function(f){return f.id;});
    else if (action === "reject-sel" && fields.length) selected = fields.map(function(f){return f.id;});
    else return;
    if (action === "approve-sel") bulkUpdate(selected.map(function(id){return {fieldId:id,status:"approved"};}));
    else if (action === "reject-sel") bulkUpdate(selected.map(function(id){return {fieldId:id,status:"rejected"};}));
  }

  // ── Upload Zone ──────────────────────────────────────────
  function setupUploadZone() {
    var zone = null;
    document.addEventListener("dragover", function(e) { e.preventDefault(); zone = zone || $(".upload-zone"); if (zone) zone.classList.add("drag-over"); });
    document.addEventListener("dragleave", function(e) { if (!e.relatedTarget) { zone = zone || $(".upload-zone"); if (zone) zone.classList.remove("drag-over"); } });
    document.addEventListener("drop", function(e) {
      e.preventDefault(); zone = zone || $(".upload-zone"); if (zone) zone.classList.remove("drag-over");
      var files = e.dataTransfer ? e.dataTransfer.files : [];
      if (files.length > 1) extractBatch(files);
      else if (files.length === 1) extractFile(files[0]);
    });
    document.addEventListener("click", function(e) {
      if (e.target.closest("#upload-zone") && !e.target.closest("input")) { var finput = $("#file-input"); if (finput) finput.click(); }
    });
    document.addEventListener("change", function(e) {
      if (e.target.id === "file-input" && e.target.files.length) {
        if (e.target.files.length > 1) extractBatch(e.target.files);
        else extractFile(e.target.files[0]);
        e.target.value = "";
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────
  function buildShell() {
    var app = $("#app");
    app.innerHTML =
      '<header id="header"></header>' +
      '<main id="main-content"><div class="empty-state">Loading...</div></main>' +
      '<footer id="footer"></footer>' +
      '<div class="settings-backdrop"></div>' +
      '<aside id="settings-panel" class="settings-panel"></aside>' +
      '<div id="source-panel" class="source-panel"></div>' +
      '<div id="toast-container"></div>' +
      '<div id="shortcuts-overlay" class="shortcuts-overlay"></div>';
  }

  async function init() {
    buildShell();
    try { var saved = localStorage.getItem("speclens-theme"); if (saved) { state.theme = saved; setTheme(saved); } } catch {}
    try { var cachePref = sessionStorage.getItem("speclens-cache-key"); if (cachePref === "true") { state.cacheKey = true; loadCachedKey(); } } catch {}
    try { sessionStorage.setItem("speclens-cache-key", String(state.cacheKey)); } catch {}
    setupEvents();
    render();
    try { await fetchProducts(); render(); } catch {}
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
