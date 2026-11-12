(() => {
const API = (window.MURIELS_ADMIN_CONFIG?.apiBase || "").replace(/\/$/,"");
const $ = id => document.getElementById(id);
let catalog = {version:1,categories:[],products:[]}, catalogSha = "", token = "";
const status = (id,msg,ok=false) => { $(id).textContent=msg; $(id).style.color=ok?"#28734c":"#a33"; };
const esc = s => String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const api = async (path,options={}) => {
 if(!API || API.includes("YOUR-WORKER")) throw new Error("Admin API is not configured yet. Complete the Cloudflare Worker setup first.");
 const response=await fetch(API+path,{...options,headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})}});
 const body=await response.json().catch(()=>({error:"Unexpected server response"}));
 if(!response.ok) throw new Error(body.error||"Request failed ("+response.status+")");
 return body;
};
function showDashboard(){ $("login-panel").hidden=true; $("dashboard").hidden=false; }
function showLogin(){ $("login-panel").hidden=false; $("dashboard").hidden=true; }
async function loadCatalog(){ const data=await api("/api/catalog"); catalog=data.catalog; catalogSha=data.sha; renderAll(); }
function renderAll(){
 $("product-total").textContent=catalog.products.length; $("category-total").textContent=catalog.categories.length;
 $("product-category").innerHTML=catalog.categories.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join("");
 $("category-list").innerHTML=catalog.categories.map(c=>'<div class="category-row"><span class="category-name">'+esc(c)+'</span><span class="small-actions"><button class="secondary" data-rename="'+esc(c)+'">Rename</button><button class="secondary" data-delete-category="'+esc(c)+'">Delete</button></span></div>').join("");
 $("product-list").innerHTML=catalog.products.map(p=>'<div class="product-row" data-search="'+esc((p.name+" "+p.category).toLowerCase())+'"><div class="product-info"><img src="'+esc(p.images[0])+'" alt=""><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.category)+' · ₹'+(p.price==null?(p.priceLabel||'Price not set'):(p.price==null?(p.priceLabel||'Price not set'):'₹'+Number(p.price).toLocaleString('en-IN')))+'</small></div></div><span class="small-actions"><button class="secondary" data-edit="'+esc(p.id)+'">Edit</button><button class="secondary" data-delete="'+esc(p.id)+'">Delete</button></span></div>').join("");
}
async function saveCatalog(){
 status("publish-status","Publishing changes to GitHub…");
 const result=await api("/api/catalog",{method:"PUT",body:JSON.stringify({catalog,sha:catalogSha})});
 catalogSha=result.sha; status("publish-status","Published successfully. The storefront will update as GitHub Pages deploys.",true); renderAll();
}
function clearForm(){ $("product-form").reset(); $("product-id").value=""; $("form-heading").textContent="Add a product"; $("save-product").textContent="Add product"; $("cancel-edit").hidden=true; $("previews").innerHTML="<div>Image preview 1</div><div>Image preview 2</div><div>Image preview 3</div>"; }
function editProduct(id){const p=catalog.products.find(x=>x.id===id);if(!p)return;$("product-id").value=p.id;$("product-name").value=p.name;$("product-category").value=p.category;$("product-price").value=p.price;$("product-description").value=p.description;$("image-1").value=p.images[0];$("image-2").value=p.images[1];$("image-3").value=p.images[2];$("form-heading").textContent="Edit product";$("save-product").textContent="Save changes";$("cancel-edit").hidden=false;previewImages();window.scrollTo({top:0,behavior:"smooth"});}
function previewImages(){const urls=[1,2,3].map(n=>$("image-"+n).value.trim());$("previews").innerHTML=urls.map((url,i)=>'<div>Image preview '+(i+1)+'</div>').join("");urls.forEach((url,i)=>{if(!url)return;const img=new Image();img.onload=()=>{const box=$("previews").children[i];box.innerHTML="";box.appendChild(img);};img.onerror=()=>{$("previews").children[i].textContent="Image could not load";};img.src=url;});}
[1,2,3].forEach(n=>$("image-"+n).addEventListener("change",previewImages));
$("login-form").addEventListener("submit",async e=>{e.preventDefault();try{status("login-status","Signing in…",true);const r=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("username").value,password:$("password").value})});token=r.token;sessionStorage.setItem("mcc_admin_token",token);await loadCatalog();showDashboard();}catch(err){status("login-status",err.message);}});
$("logout").addEventListener("click",()=>{token="";sessionStorage.removeItem("mcc_admin_token");showLogin();});
$("product-form").addEventListener("submit",async e=>{e.preventDefault();try{
 const images=[1,2,3].map(n=>$("image-"+n).value.trim());if(images.some(x=>!/^https?:\/\//i.test(x)))throw new Error("Enter three valid http or https image URLs.");
 const name=$("product-name").value.trim(),price=Number($("product-price").value),category=$("product-category").value,description=$("product-description").value.trim();
 if(!name||!category||!description||!Number.isFinite(price)||price<0)throw new Error("Complete all fields with a valid numeric price.");
 for(const url of images){const probe=await new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(true);im.onerror=()=>resolve(false);im.src=url;});if(!probe)throw new Error("One of the image URLs could not be loaded. Check the links.");}
 const id=$("product-id").value||("p-"+crypto.randomUUID());
 const item={id,name,category,price,description,images};
 const index=catalog.products.findIndex(p=>p.id===id);if(index>=0)catalog.products[index]=item;else catalog.products.unshift(item);
 await saveCatalog();clearForm();status("form-status","Product saved and published.",true);
 }catch(err){status("form-status",err.message);}});
$("cancel-edit").addEventListener("click",clearForm);
$("category-form").addEventListener("submit",async e=>{e.preventDefault();const name=$("new-category").value.trim();if(!name)return;if(catalog.categories.some(c=>c.toLowerCase()===name.toLowerCase()))return alert("That category already exists.");catalog.categories.push(name);try{await saveCatalog();$("new-category").value="";}catch(err){status("publish-status",err.message);}});
$("category-list").addEventListener("click",async e=>{
 const rename=e.target.dataset.rename, del=e.target.dataset.deleteCategory;
 if(rename){const next=prompt("New category name:",rename)?.trim();if(!next||next===rename)return;if(catalog.categories.some(c=>c.toLowerCase()===next.toLowerCase()))return alert("That category already exists.");catalog.categories=catalog.categories.map(c=>c===rename?next:c);catalog.products=catalog.products.map(p=>p.category===rename?{...p,category:next}:p);}
 if(del){if(catalog.products.some(p=>p.category===del))return alert("Move or delete the products in this category before deleting it.");if(!confirm('Delete category "'+del+'"?'))return;catalog.categories=catalog.categories.filter(c=>c!==del);}
 try{await saveCatalog();}catch(err){status("publish-status",err.message);}
});
$("product-list").addEventListener("click",async e=>{
 const edit=e.target.dataset.edit,del=e.target.dataset.delete;
 if(edit){editProduct(edit);return;}
 if(del){const p=catalog.products.find(x=>x.id===del);if(!p||!confirm('Delete "'+p.name+'"? This cannot be undone.'))return;catalog.products=catalog.products.filter(x=>x.id!==del);try{await saveCatalog();}catch(err){status("publish-status",err.message);}}
});
$("product-search").addEventListener("input",()=>{const q=$("product-search").value.toLowerCase();document.querySelectorAll(".product-row").forEach(row=>row.hidden=!row.dataset.search.includes(q));});
const saved=sessionStorage.getItem("mcc_admin_token");if(saved){token=saved;loadCatalog().then(showDashboard).catch(()=>{sessionStorage.removeItem("mcc_admin_token");token="";showLogin();});}
})();