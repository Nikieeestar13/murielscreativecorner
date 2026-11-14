const encoder = new TextEncoder();
const sessions = new Map();

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, env, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type":"application/json; charset=utf-8", ...corsHeaders(env), ...extra }
  });
}
function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}
function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromBase64Url(value) {
  const padded = value.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}
async function validSession(request, env) {
  const token = cookieValue(request, "mcc_session");
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  const expected = await sign(payload, env.SESSION_SECRET);
  if (signature !== expected) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return data.exp > Date.now() && data.user === env.ADMIN_USERNAME;
  } catch { return false; }
}
function cookieHeader(value, maxAge) {
  return `mcc_session=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${maxAge}`;
}
async function githubRead(path, env) {
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
  const response = await fetch(url, {headers:{
    "Authorization":`Bearer ${env.GITHUB_TOKEN}`,
    "Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"Muriels-Creative-Corner-Admin"
  }});
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}).`);
  const data = await response.json();
  const binary = atob(data.content.replace(/\n/g,""));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return { value: JSON.parse(new TextDecoder().decode(bytes)), sha: data.sha };
}
function encodeUtf8Base64(text) {
  const bytes = encoder.encode(text);
  let binary = "";
  for (let i=0; i<bytes.length; i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
async function githubWrite(path, value, message, env) {
  // Read latest SHA immediately before write to avoid stale-SHA overwrites.
  const latest = await githubRead(path, env);
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const response = await fetch(url, {method:"PUT",headers:{
    "Authorization":`Bearer ${env.GITHUB_TOKEN}`,
    "Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28",
    "User-Agent":"Muriels-Creative-Corner-Admin",
    "Content-Type":"application/json"
  },body:JSON.stringify({
    message, content:encodeUtf8Base64(JSON.stringify(value,null,2)+"\n"),
    sha:latest.sha, branch:env.GITHUB_BRANCH
  })});
  if (response.status === 409 || response.status === 422) throw new Error("GitHub detected a concurrent update. Refresh the dashboard and try again.");
  if (!response.ok) throw new Error(`GitHub could not save the file (${response.status}).`);
  return response.json();
}
async function githubUploadImage(mimeType, base64, env) {
  const allowed = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif"
  };
  if (!allowed[mimeType]) throw new Error("Only JPG, PNG, WEBP and GIF images are allowed.");
  if (typeof base64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error("Invalid image data.");
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const byteLength = Math.floor(base64.length * 3 / 4) - padding;
  if (byteLength <= 0 || byteLength >= 700 * 1024) throw new Error("Each image must be smaller than 700 KB.");
  const path = `images/products/${crypto.randomUUID()}.${allowed[mimeType]}`;
  const url = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Muriels-Creative-Corner-Admin",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "Upload product image via admin dashboard",
      content: base64,
      branch: env.GITHUB_BRANCH
    })
  });
  if (response.status === 409 || response.status === 422) throw new Error("GitHub could not create the image file. Please try again.");
  if (!response.ok) throw new Error(`GitHub image upload failed (${response.status}).`);
  return path;
}

function constantTimeEqual(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}
function validateProducts(products, categories) {
  if (!Array.isArray(products)) throw new Error("Products must be an array.");
  const ids = new Set();
  for (const p of products) {
    if (!p || typeof p.id !== "string" || !p.id || ids.has(p.id)) throw new Error("Every product must have a unique ID.");
    ids.add(p.id);
    if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 100) throw new Error("Invalid product name.");
    if (!categories.includes(p.category)) throw new Error(`Unknown category for ${p.name}.`);
    // Null prices are allowed only to retain legacy 'pending' products. New dashboard entries require numeric values.
    if (p.price !== null && (!Number.isFinite(p.price) || p.price < 0)) throw new Error(`Invalid price for ${p.name}.`);
    if (typeof p.description !== "string" || p.description.length > 1000) throw new Error(`Invalid description for ${p.name}.`);
    if (!Array.isArray(p.images) || (p.images.length < 1 || p.images.length > 3) || p.images.some(u => typeof u !== "string" || !/^https:\/\//i.test(u) && !/^[a-z0-9._/-]+$/i.test(u))) {
      throw new Error(`Product "${p.name}" must have between one and three valid image URLs.`);
    }
  }
}
function validateCategories(categories) {
  if (!Array.isArray(categories) || categories.length < 1 || categories.length > 100) throw new Error("Invalid category list.");
  const normalized = categories.map(c => typeof c === "string" ? c.trim() : "");
  if (normalized.some(c => !c || c.length > 40) || new Set(normalized.map(c=>c.toLowerCase())).size !== normalized.length) throw new Error("Category names must be unique and 1–40 characters.");
  return normalized;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:corsHeaders(env)});
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.ALLOWED_ORIGIN) return json({error:"Origin not allowed."},403,env);
    try {
      if (url.pathname === "/api/health" && request.method === "GET") return json({ok:true},200,env);
      if (url.pathname === "/api/login" && request.method === "POST") {
        const body = await request.json();
        if (body.username !== env.ADMIN_USERNAME || !constantTimeEqual(body.password || "", env.ADMIN_PASSWORD)) {
          return json({error:"Incorrect username or password."},401,env);
        }
        const payload = toBase64Url(encoder.encode(JSON.stringify({user:env.ADMIN_USERNAME,exp:Date.now()+8*60*60*1000})));
        const token = payload + "." + await sign(payload,env.SESSION_SECRET);
        return json({ok:true},200,env,{"Set-Cookie":cookieHeader(token,8*60*60)});
      }
      if (url.pathname === "/api/logout" && request.method === "POST") {
        return json({ok:true},200,env,{"Set-Cookie":cookieHeader("",0)});
      }
      if (!await validSession(request,env)) return json({error:"Please log in to continue."},401,env);

      if (url.pathname === "/api/upload-image" && request.method === "POST") {
        const body = await request.json();
        const path = await githubUploadImage(body.mimeType, body.base64, env);
        return json({ok:true,path},201,env);
      }

      if (url.pathname === "/api/products" && request.method === "GET") {
        const data = await githubRead("products.json",env);
        return json({products:data.value},200,env);
      }
      if (url.pathname === "/api/categories" && request.method === "GET") {
        const data = await githubRead("categories.json",env);
        return json({categories:data.value},200,env);
      }
      if (url.pathname === "/api/products" && request.method === "PUT") {
        const body = await request.json();
        const currentCategories = (await githubRead("categories.json",env)).value;
        validateProducts(body.products,currentCategories);
        await githubWrite("products.json",body.products,"Update product catalogue via admin dashboard",env);
        return json({ok:true},200,env);
      }
      if (url.pathname === "/api/categories" && request.method === "PUT") {
        const body = await request.json();
        const updated = validateCategories(body.categories);
        const currentProducts = (await githubRead("products.json",env)).value;
        const productsToSave = Array.isArray(body.products) ? body.products : currentProducts;
        const missing = productsToSave.find(p => !updated.includes(p.category));
        if (missing) return json({error:`Reassign or delete products in "${missing.category}" before removing that category.`},409,env);
        if (Array.isArray(body.products)) validateProducts(productsToSave,updated);
        const oldCategories = (await githubRead("categories.json",env)).value;
        await githubWrite("categories.json",updated,"Update product categories via admin dashboard",env);
        try {
          if (Array.isArray(body.products)) {
            await githubWrite("products.json",productsToSave,"Update product category assignments via admin dashboard",env);
          }
        } catch (writeError) {
          // Best-effort rollback so the public catalogue is not left with orphaned categories.
          try { await githubWrite("categories.json",oldCategories,"Rollback failed category update",env); } catch (_) {}
          throw writeError;
        }
        return json({ok:true},200,env);
      }
      return json({error:"Not found."},404,env);
    } catch (error) {
      return json({error:error.message || "Unexpected server error."},500,env);
    }
  }
};