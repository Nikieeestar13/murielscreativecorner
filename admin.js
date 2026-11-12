(() => {
  const API = (window.MURIELS_CONFIG?.API_BASE_URL || "").replace(/\/$/, "");
  const $ = id => document.getElementById(id);
  let products = [];
  let categories = [];
  let imageChecks = [false, false, false];

  function message(id, text, kind = "info") {
    const el = $(id); el.textContent = text;
    el.className = "text-xs " + (kind === "error" ? "text-red-600" : kind === "success" ? "text-green-700" : "text-[#66625D]");
  }
  async function api(path, options = {}) {
    if (!API || API.includes("YOUR-WORKER")) throw new Error("Set API_BASE_URL in config.js after deploying the Cloudflare Worker.");
    const response = await fetch(API + path, {
      ...options, credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
  }
  function showDashboard() {
    $("login-panel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
  }
  function showLogin() {
    $("dashboard").classList.add("hidden");
    $("login-panel").classList.remove("hidden");
  }
  function renderCategoryOptions() {
    $("product-category").innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    $("category-list").innerHTML = categories.map(c => `
      <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span class="text-sm font-medium">${escapeHtml(c)}</span>
        <div class="flex gap-2">
          <button class="btn btn-secondary rename-category" data-category="${escapeAttr(c)}">Rename</button>
          <button class="btn btn-secondary delete-category" data-category="${escapeAttr(c)}">Delete</button>
        </div>
      </div>`).join("");
    document.querySelectorAll(".rename-category").forEach(b => b.addEventListener("click", () => renameCategory(b.dataset.category)));
    document.querySelectorAll(".delete-category").forEach(b => b.addEventListener("click", () => deleteCategory(b.dataset.category)));
  }
  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  }
  function escapeAttr(v) { return escapeHtml(v); }
  function renderProducts() {
    const q = $("admin-search").value.trim().toLowerCase();
    const filtered = products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(q));
    $("product-total").textContent = `${products.length} products in catalogue`;
    $("product-list").innerHTML = filtered.map(p => `
      <div class="py-3 flex items-center gap-3">
        <img src="${escapeAttr(p.images?.[0] || "")}" alt="" class="w-14 h-14 rounded-lg object-cover bg-[#F2EFEA]">
        <div class="min-w-0 flex-1"><p class="font-semibold text-sm truncate">${escapeHtml(p.name)}</p>
          <p class="text-xs text-[#66625D]">${escapeHtml(p.category)} · ${p.price == null ? "Price on request" : "₹" + Number(p.price).toLocaleString("en-IN")}</p></div>
        <div class="flex gap-1"><button class="btn btn-secondary edit-product" data-id="${escapeAttr(p.id)}">Edit</button><button class="btn btn-secondary delete-product text-red-700" data-id="${escapeAttr(p.id)}">Delete</button></div>
      </div>`).join("") || '<p class="py-6 text-sm text-[#66625D]">No products found.</p>';
    document.querySelectorAll(".edit-product").forEach(b => b.addEventListener("click", () => editProduct(b.dataset.id)));
    document.querySelectorAll(".delete-product").forEach(b => b.addEventListener("click", () => deleteProduct(b.dataset.id)));
  }
  async function refreshData() {
    const [p, c] = await Promise.all([api("/api/products"), api("/api/categories")]);
    products = p.products; categories = c.categories;
    renderCategoryOptions(); renderProducts();
  }
  function clearForm() {
    $("product-id").value = "";
    $("product-form").reset();
    $("form-heading").textContent = "Add New Product";
    $("save-product").textContent = "Add Product";
    $("cancel-edit").classList.add("hidden");
    imageChecks = [false, false, false];
    [0,1,2].forEach(i => { $("preview-" + i).removeAttribute("src"); $("image-status-" + i).textContent = ""; });
    message("product-status", "");
  }
  function editProduct(id) {
    const p = products.find(x => x.id === id); if (!p) return;
    $("product-id").value = p.id;
    $("product-name").value = p.name;
    $("product-category").value = p.category;
    $("product-price").value = p.price ?? "";
    $("product-description").value = p.description;
    p.images.forEach((url, i) => { $("image-" + i).value = url; validateImage(i); });
    $("form-heading").textContent = "Edit Product";
    $("save-product").textContent = "Save Changes";
    $("cancel-edit").classList.remove("hidden");
    $("product-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function validateImage(index) {
    const input = $("image-" + index), url = input.value.trim(), preview = $("preview-" + index);
    imageChecks[index] = false;
    if (!url) { preview.removeAttribute("src"); message("image-status-" + index, "Image URL required.", "error"); return false; }
    try {
      const parsed = new URL(url, window.location.href);
      const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(url);
      if (!isRelative && parsed.protocol !== "https:") throw new Error("Use an HTTPS image URL.");
      if (isRelative && (url.startsWith("//") || url.startsWith("javascript:"))) throw new Error("Enter a valid image path.");
    } catch (e) { preview.removeAttribute("src"); message("image-status-" + index, e.message || "Enter a valid URL.", "error"); return false; }
    return new Promise(resolve => {
      const probe = new Image();
      probe.onload = () => { preview.src = url; imageChecks[index] = true; message("image-status-" + index, "Image loaded.", "success"); resolve(true); };
      probe.onerror = () => { preview.removeAttribute("src"); message("image-status-" + index, "Could not load this image. Use a direct public image URL.", "error"); resolve(false); };
      probe.src = url;
    });
  }
  [0,1,2].forEach(i => $("image-" + i).addEventListener("change", () => validateImage(i)));
  $("product-form").addEventListener("reset", () => setTimeout(clearForm, 0));
  $("cancel-edit").addEventListener("click", clearForm);
  $("reset-product").addEventListener("click", clearForm);

  $("product-form").addEventListener("submit", async event => {
    event.preventDefault();
    const save = $("save-product"); save.disabled = true; save.textContent = "Saving...";
    try {
      const imageResults = await Promise.all([0,1,2].map(validateImage));
      if (imageResults.some(ok => !ok)) throw new Error("Please provide three working image URLs.");
      const existingId = $("product-id").value;
      const product = {
        id: existingId || crypto.randomUUID(),
        name: $("product-name").value.trim(),
        category: $("product-category").value,
        price: Number($("product-price").value),
        description: $("product-description").value.trim(),
        images: [0,1,2].map(i => $("image-" + i).value.trim())
      };
      if (!product.name || !product.category || !Number.isFinite(product.price) || product.price < 0 || !product.description) {
        throw new Error("Complete all required fields and enter a valid numeric price.");
      }
      let updatedProducts;
      if (existingId) {
        const index = products.findIndex(p => p.id === existingId);
        if (index < 0) throw new Error("This product no longer exists. Refresh and try again.");
        updatedProducts = products.map(p => p.id === existingId ? product : p);
      } else updatedProducts = [product, ...products];
      await api("/api/products", { method: "PUT", body: JSON.stringify({ products: updatedProducts }) });
      await refreshData(); clearForm();
      message("product-status", "Product saved to GitHub. The storefront will update after GitHub Pages publishes the commit.", "success");
    } catch (e) { message("product-status", e.message, "error"); }
    finally { save.disabled = false; save.textContent = $("product-id").value ? "Save Changes" : "Add Product"; }
  });

  async function deleteProduct(id) {
    const p = products.find(x => x.id === id); if (!p) return;
    if (!confirm(`Delete "${p.name}"? This cannot be undone from the dashboard.`)) return;
    try {
      await api("/api/products", { method: "PUT", body: JSON.stringify({ products: products.filter(x => x.id !== id) }) });
      await refreshData(); message("global-status", "Product deleted from GitHub.", "success");
    } catch (e) { message("global-status", e.message, "error"); }
  }
  $("admin-search").addEventListener("input", renderProducts);

  $("category-form").addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("new-category").value.trim();
    if (!name) return;
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) { message("category-status", "That category already exists.", "error"); return; }
    try {
      categories.push(name);
      await api("/api/categories", { method: "PUT", body: JSON.stringify({ categories }) });
      $("new-category").value = ""; await refreshData();
      message("category-status", "Category added.", "success");
    } catch (e) { message("category-status", e.message, "error"); }
  });
  async function renameCategory(oldName) {
    const next = prompt("Enter the new category name:", oldName);
    if (!next || !next.trim() || next.trim() === oldName) return;
    const name = next.trim();
    if (categories.some(c => c.toLowerCase() === name.toLowerCase())) { message("category-status", "That category already exists.", "error"); return; }
    try {
      const updatedCategories = categories.map(c => c === oldName ? name : c);
      const updatedProducts = products.map(p => p.category === oldName ? {...p, category:name} : p);
      await api("/api/categories", { method:"PUT", body:JSON.stringify({categories:updatedCategories, products:updatedProducts}) });
      await refreshData(); message("category-status", "Category renamed.", "success");
    } catch(e) { message("category-status", e.message, "error"); }
  }
  async function deleteCategory(name) {
    if (products.some(p => p.category === name)) { message("category-status", "This category is assigned to products. Reassign or delete those products before deleting the category.", "error"); return; }
    if (!confirm(`Delete category "${name}"?`)) return;
    try {
      await api("/api/categories", { method:"PUT", body:JSON.stringify({categories:categories.filter(c=>c!==name)}) });
      await refreshData(); message("category-status", "Category deleted.", "success");
    } catch(e) { message("category-status", e.message, "error"); }
  }

  document.querySelectorAll(".tab").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === button));
    $("products-tab").classList.toggle("hidden", button.dataset.tab !== "products");
    $("categories-tab").classList.toggle("hidden", button.dataset.tab !== "categories");
  }));
  $("login-form").addEventListener("submit", async event => {
    event.preventDefault(); $("login-button").disabled = true;
    try {
      await api("/api/login", { method:"POST", body:JSON.stringify({username:$("username").value.trim(),password:$("password").value}) });
      await refreshData(); showDashboard();
    } catch(e) { message("login-status", e.message, "error"); }
    finally { $("login-button").disabled = false; }
  });
  $("logout-button").addEventListener("click", async () => {
    try { await api("/api/logout", {method:"POST", body:"{}"}); } catch(e) {}
    showLogin(); $("password").value = "";
  });

  // Existing session check: protected endpoints return 401 when there is no valid session.
  (async () => {
    try { await refreshData(); showDashboard(); }
    catch(e) { showLogin(); }
  })();
})();