const corsHeaders = origin => ({
 "Access-Control-Allow-Origin": origin,
 "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
 "Access-Control-Allow-Headers": "Content-Type, Authorization",
 "Vary": "Origin"
});
const json = (data,status=200,headers={}) => new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...headers}});
const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const fromB64url = value => Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64url(await crypto.subtle.sign("HMAC",key,enc.encode(value)));}
async function makeToken(secret){const payload=b64url(enc.encode(JSON.stringify({sub:"admin",exp:Date.now()+2*60*60*1000})));return payload+"."+await sign(payload,secret);}
async function validToken(token,secret){try{const [payload,sig]=token.split(".");if(!payload||!sig||await sign(payload,secret)!==sig)return false;const data=JSON.parse(new TextDecoder().decode(fromB64url(payload)));return data.sub==="admin"&&data.exp>Date.now();}catch{return false;}}
function b64utf8(text){const bytes=enc.encode(text);let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary);}
function decodeContent(b64){const binary=atob(b64.replace(/\n/g,""));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
async function githubRequest(env,path,options={}){return fetch("https://api.github.com"+path,{...options,headers:{"Authorization":"Bearer "+env.GITHUB_TOKEN,"Accept":"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"MurielsCreativeCornerAdmin",...(options.headers||{})}});}
async function readCatalog(env){const path="/repos/"+env.GITHUB_OWNER+"/"+env.GITHUB_REPO+"/contents/catalog.json?ref="+encodeURIComponent(env.GITHUB_BRANCH||"main");const r=await githubRequest(env,path);if(!r.ok)throw new Error("Could not read catalogue from GitHub.");const file=await r.json();return {catalog:JSON.parse(decodeContent(file.content)),sha:file.sha};}
async function writeCatalog(env,catalog,sha){const path="/repos/"+env.GITHUB_OWNER+"/"+env.GITHUB_REPO+"/contents/catalog.json";const r=await githubRequest(env,path,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Update product catalogue from admin dashboard",content:b64utf8(JSON.stringify(catalog,null,2)+"\n"),sha,branch:env.GITHUB_BRANCH||"main"})});const body=await r.json().catch(()=>({}));if(r.status===409||r.status===422)throw new Error("The catalogue changed elsewhere. Reload the dashboard and retry to avoid overwriting newer edits.");if(!r.ok)throw new Error("GitHub could not save the catalogue ("+r.status+"). Check the Worker token permissions.");return body.content.sha;}
function validateCatalog(c){if(!c||!Array.isArray(c.categories)||!Array.isArray(c.products))throw new Error("Invalid catalogue structure.");if(c.categories.length>100)throw new Error("Too many categories.");const names=new Set();for(const name of c.categories){if(typeof name!=="string"||!name.trim()||name.length>40||names.has(name.toLowerCase()))throw new Error("Invalid or duplicate category.");names.add(name.toLowerCase());}const ids=new Set();for(const p of c.products){if(!p||typeof p.id!=="string"||ids.has(p.id)||typeof p.name!=="string"||!p.name.trim()||p.name.length>100||!names.has(String(p.category).toLowerCase())||(p.price===null?!String(p.id).startsWith("legacy-"):(!Number.isFinite(p.price)||p.price<0))||typeof p.description!=="string"||p.description.length>1000||!Array.isArray(p.images)||(String(p.id).startsWith("legacy-")?(p.images.length<1||p.images.length>10):p.images.length!==3))throw new Error("A product has missing or invalid fields.");ids.add(p.id);for(const image of p.images){if(typeof image!=="string"||!image.trim())throw new Error("Every product image must be a valid path or URL.");const legacy=String(p.id).startsWith("legacy-");if(legacy&&!/^https?:\\/\\//i.test(image)){if(image.startsWith("//")||image.split("/").includes(".."))throw new Error("Invalid legacy image path.");continue;}let u;try{u=new URL(image);}catch{throw new Error("Every new product image must be an absolute URL.");}if(!["http:","https:"].includes(u.protocol))throw new Error("Image URLs must use http or https.");}}return {version:1,categories:c.categories,products:c.products};}
export default {async fetch(request,env){
 const origin=request.headers.get("Origin")||"";const allowed=env.ALLOWED_ORIGIN;if(origin!==allowed)return json({error:"Origin not allowed."},403);
 const headers=corsHeaders(allowed);if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 const url=new URL(request.url);
 try{
  if(url.pathname==="/api/login"&&request.method==="POST"){
   const ip=request.headers.get("CF-Connecting-IP")||"unknown";const key="login:"+ip;const attempts=Number(await env.RATE_LIMIT.get(key)||0);if(attempts>=8)return json({error:"Too many login attempts. Try again in 15 minutes."},429,headers);
   const body=await request.json();if(body.username!==env.ADMIN_USERNAME||body.password!==env.ADMIN_PASSWORD){await env.RATE_LIMIT.put(key,String(attempts+1),{expirationTtl:900});return json({error:"Incorrect username or password."},401,headers);}
   await env.RATE_LIMIT.delete(key);return json({token:await makeToken(env.SESSION_SECRET),expiresIn:7200},200,headers);
  }
  const auth=request.headers.get("Authorization")||"";const token=auth.startsWith("Bearer ")?auth.slice(7):"";if(!await validToken(token,env.SESSION_SECRET))return json({error:"Your session has expired. Please log in again."},401,headers);
  if(url.pathname==="/api/catalog"&&request.method==="GET")return json(await readCatalog(env),200,headers);
  if(url.pathname==="/api/catalog"&&request.method==="PUT"){const body=await request.json();const catalog=validateCatalog(body.catalog);if(typeof body.sha!=="string"||!body.sha)return json({error:"Missing catalogue revision. Reload and retry."},400,headers);const sha=await writeCatalog(env,catalog,body.sha);return json({sha},200,headers);}
  return json({error:"Not found."},404,headers);
 }catch(error){return json({error:error.message||"Unexpected server error."},400,headers);}
}};
