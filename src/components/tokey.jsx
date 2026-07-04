import logo from "./logo.png";
import { useState, useEffect, useCallback, useRef } from "react";
import { DEFAULT_USERS, findMatchingUser } from "../auth";

// ============================================================
// BRAND COLORS from TOKEY MIGHTY WORKS logo
// ============================================================
const B = {
  purple:  "#9B27AF",
  purpleD: "#7B1F8A",
  purpleL: "#E8D5EC",
  cyan:    "#00B4D8",
  cyanD:   "#0090AD",
  cyanL:   "#CCF0F8",
  lime:    "#8BC34A",
  limeD:   "#6A9E30",
  limeL:   "#E8F5D5",
  dark:    "#1A0B2E",
  darkM:   "#2D1B4E",
  mid:     "#6B5B80",
  light:   "#F5F0FA",
  white:   "#FFFFFF",
  gray:    "#F0EBF5",
  border:  "#DDD5E8",
  text:    "#2D1B4E",
  muted:   "#7B6B90",
};

// ============================================================
// FIREBASE CONFIG STORAGE (localStorage — not sensitive)
// ============================================================
const FB_KEY = "tmworks_firebase_config";
function getFBConfig() {
  try { return JSON.parse(localStorage.getItem(FB_KEY) || "null"); } catch { return null; }
}
function saveFBConfig(cfg) {
  localStorage.setItem(FB_KEY, JSON.stringify(cfg));
}
function clearFBConfig() {
  localStorage.removeItem(FB_KEY);
}

// ============================================================
// FIREBASE SDK LOADER (dynamic import from CDN)
// ============================================================
let _fb = null; // { app, db } once loaded

async function loadFirebase(config) {
  if (_fb) return _fb;
  const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
  const { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, onSnapshot, enableIndexedDbPersistence }
    = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

  const existing = getApps();
  const app = existing.length ? existing[0] : initializeApp(config);
  const db = getFirestore(app);

  try {
    await enableIndexedDbPersistence(db);
  } catch (e) {
    if (e.code !== "failed-precondition" && e.code !== "unimplemented") console.warn("Persistence:", e.code);
  }

  _fb = { app, db, collection, getDocs, doc, setDoc, deleteDoc, onSnapshot };
  return _fb;
}

// ============================================================
// LOCAL INDEXEDDB LAYER (offline cache)
// ============================================================
const DB_NAME = "tmworks_v2", DB_VER = 3;
const STORES = ["products","sales","customers","services","serviceJobs","stockMovements","users","auditLog","settings","debtors","debtPayments","expenditures"];

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" }); });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readonly");
    const r = t.objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function dbPut(store, item) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readwrite");
    const r = t.objectStore(store).put(item);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
}
async function dbDel(store, id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const t = db.transaction(store, "readwrite");
    const r = t.objectStore(store).delete(id);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

// ============================================================
// FIREBASE SYNC HELPERS
// ============================================================
async function fbPut(store, item) {
  const cfg = getFBConfig();
  if (!cfg) return;
  try {
    const { db, doc, setDoc } = await loadFirebase(cfg);
    // Firestore doesn't allow undefined values — strip them
    const clean = JSON.parse(JSON.stringify(item));
    await setDoc(doc(db, store, item.id), clean);
  } catch (e) { console.warn("Firebase write failed:", e.message); }
}

async function fbDel(store, id) {
  const cfg = getFBConfig();
  if (!cfg) return;
  try {
    const { db, doc, deleteDoc } = await loadFirebase(cfg);
    await deleteDoc(doc(db, store, id));
  } catch (e) { console.warn("Firebase delete failed:", e.message); }
}

async function fbGetAll(store) {
  const cfg = getFBConfig();
  if (!cfg) return null;
  try {
    const { db, collection, getDocs } = await loadFirebase(cfg);
    const snap = await getDocs(collection(db, store));
    return snap.docs.map(d => d.data());
  } catch (e) { console.warn("Firebase read failed:", e.message); return null; }
}

// ============================================================
// SEED DATA
// ============================================================
const mkSeed = () => {
  const now = new Date();
  const past = (d) => { const x = new Date(now); x.setDate(x.getDate()-d); return x.toISOString(); };
  return {
    users: [
      { id:"u1", name:"Owner", username:"TMWORKS", password:"tmworks@123", role:"superadmin", active:true, createdAt:now.toISOString() },
      { id:"u2", name:"Manager Ana", username:"admin", password:"admin123", role:"admin", active:true, createdAt:now.toISOString() },
      { id:"u3", name:"Staff Carlo", username:"staff", password:"staff123", role:"staff", active:true, createdAt:now.toISOString() },
    ],
   products: [
      // Paper Products
      { id:"p1",  name:"A4 Photocopy Paper (Ream)",       category:"Paper Products",            price:4000,  cost:2800, stock:50,  minStock:10,  unit:"ream",  active:true },
      { id:"p2",  name:"Letterhead Paper",                 category:"Paper Products",            price:150,   cost:80,   stock:500, minStock:100, unit:"sheet", active:true },
      { id:"p3",  name:"Cardboard Sheet",                  category:"Paper Products",            price:300,   cost:180,  stock:200, minStock:50,  unit:"sheet", active:true },
      { id:"p4",  name:"Brown Envelope A4",                category:"Paper Products",            price:100,   cost:60,   stock:300, minStock:50,  unit:"pc",    active:true },
      { id:"p5",  name:"Brown Envelope A3",                category:"Paper Products",            price:200,   cost:120,  stock:200, minStock:30,  unit:"pc",    active:true },
      { id:"p6",  name:"White Envelope",                   category:"Paper Products",            price:50,    cost:30,   stock:500, minStock:100, unit:"pc",    active:true },
      { id:"p7",  name:"File",                             category:"Paper Products",            price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p8",  name:"Folder",                           category:"Paper Products",            price:200,   cost:120,  stock:100, minStock:20,  unit:"pc",    active:true },
      // Writing Materials
      { id:"p9",  name:"Biro",                             category:"Writing Materials",         price:100,   cost:60,   stock:300, minStock:50,  unit:"pc",    active:true },
      { id:"p10", name:"Permanent Marker",                 category:"Writing Materials",         price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p11", name:"Whiteboard Marker",                category:"Writing Materials",         price:250,   cost:150,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p12", name:"Highlighter",                      category:"Writing Materials",         price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p13", name:"HB Pencil",                        category:"Writing Materials",         price:100,   cost:60,   stock:200, minStock:50,  unit:"pc",    active:true },
      { id:"p14", name:"2B Pencil",                        category:"Writing Materials",         price:100,   cost:60,   stock:200, minStock:50,  unit:"pc",    active:true },
      { id:"p15", name:"Pencil Sharpener",                 category:"Writing Materials",         price:100,   cost:60,   stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p16", name:"Eraser",                           category:"Writing Materials",         price:50,    cost:30,   stock:200, minStock:50,  unit:"pc",    active:true },
      { id:"p17", name:"Correction Pen",                   category:"Writing Materials",         price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
      // Fastening Items
      { id:"p18", name:"Stapler (Small)",                  category:"Fastening Items",           price:1200,  cost:800,  stock:50,  minStock:10,  unit:"pc",    active:true },
      { id:"p19", name:"Stapler (Large)",                  category:"Fastening Items",           price:2500,  cost:1800, stock:30,  minStock:5,   unit:"pc",    active:true },
      { id:"p20", name:"Staple Pins No. 10",               category:"Fastening Items",           price:150,   cost:80,   stock:200, minStock:50,  unit:"box",   active:true },
      { id:"p21", name:"Staple Pins No. 24/6",             category:"Fastening Items",           price:250,   cost:150,  stock:200, minStock:50,  unit:"box",   active:true },
      { id:"p22", name:"Staple Pins No. 26/6",             category:"Fastening Items",           price:300,   cost:180,  stock:200, minStock:50,  unit:"box",   active:true },
      { id:"p23", name:"Office Pins",                      category:"Fastening Items",           price:150,   cost:80,   stock:150, minStock:30,  unit:"box",   active:true },
      { id:"p24", name:"Safety Pins",                      category:"Fastening Items",           price:150,   cost:80,   stock:150, minStock:30,  unit:"pack",  active:true },
      // Cutting & Measuring Tools
      { id:"p25", name:"Scissors",                         category:"Cutting & Measuring Tools", price:500,   cost:300,  stock:80,  minStock:20,  unit:"pc",    active:true },
      { id:"p26", name:"Paper Cutter",                     category:"Cutting & Measuring Tools", price:8000,  cost:6000, stock:15,  minStock:5,   unit:"pc",    active:true },
      { id:"p27", name:"Cutting Knife",                    category:"Cutting & Measuring Tools", price:800,   cost:500,  stock:60,  minStock:10,  unit:"pc",    active:true },
      { id:"p28", name:"Cutting Blade (Pack)",             category:"Cutting & Measuring Tools", price:300,   cost:180,  stock:100, minStock:20,  unit:"pack",  active:true },
      { id:"p29", name:"Metal Ruler",                      category:"Cutting & Measuring Tools", price:800,   cost:500,  stock:60,  minStock:10,  unit:"pc",    active:true },
      { id:"p30", name:"Plastic Ruler",                    category:"Cutting & Measuring Tools", price:250,   cost:150,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p31", name:"Measuring Tape",                   category:"Cutting & Measuring Tools", price:1200,  cost:800,  stock:40,  minStock:10,  unit:"pc",    active:true },
      // Adhesives
      { id:"p32", name:"Top Bond (Small)",                 category:"Adhesives",                 price:500,   cost:300,  stock:80,  minStock:20,  unit:"pc",    active:true },
      { id:"p33", name:"Glue Stick",                       category:"Adhesives",                 price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p34", name:"Super Glue",                       category:"Adhesives",                 price:300,   cost:180,  stock:80,  minStock:20,  unit:"pc",    active:true },
      { id:"p35", name:"Masking Tape",                     category:"Adhesives",                 price:500,   cost:300,  stock:60,  minStock:15,  unit:"roll",  active:true },
      { id:"p36", name:"Transparent Tape",                 category:"Adhesives",                 price:300,   cost:180,  stock:80,  minStock:20,  unit:"roll",  active:true },
      // Printing & Binding Supplies
      { id:"p37", name:"Binding Stick",                    category:"Printing & Binding",        price:200,   cost:100,  stock:200, minStock:50,  unit:"pc",    active:true },
      { id:"p38", name:"Spiral Binding Coil",              category:"Printing & Binding",        price:200,   cost:120,  stock:200, minStock:50,  unit:"pc",    active:true },
      { id:"p39", name:"Laminating Pouch A4",              category:"Printing & Binding",        price:150,   cost:80,   stock:300, minStock:50,  unit:"pc",    active:true },
      { id:"p40", name:"Laminating Pouch A3",              category:"Printing & Binding",        price:300,   cost:180,  stock:200, minStock:30,  unit:"pc",    active:true },
      { id:"p41", name:"Laminating Pouch ID",              category:"Printing & Binding",        price:50,    cost:30,   stock:500, minStock:100, unit:"pc",    active:true },
      { id:"p42", name:"Lanyard",                          category:"Printing & Binding",        price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p43", name:"ID Card Holder",                   category:"Printing & Binding",        price:150,   cost:80,   stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p44", name:"PVC Card",                         category:"Printing & Binding",        price:500,   cost:300,  stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p45", name:"Transparent PVC Cover",            category:"Printing & Binding",        price:100,   cost:60,   stock:200, minStock:50,  unit:"pc",    active:true },
      { id:"p46", name:"Opaque PVC Cover",                 category:"Printing & Binding",        price:100,   cost:60,   stock:200, minStock:50,  unit:"pc",    active:true },
      // Computer Accessories
      { id:"p47", name:"USB Flash Drive 16GB",             category:"Computer Accessories",      price:7500,  cost:6000, stock:20,  minStock:5,   unit:"pc",    active:true },
      { id:"p48", name:"USB Flash Drive 32GB",             category:"Computer Accessories",      price:9000,  cost:7000, stock:20,  minStock:5,   unit:"pc",    active:true },
      { id:"p49", name:"USB Flash Drive 64GB",             category:"Computer Accessories",      price:12500, cost:10000,stock:15,  minStock:5,   unit:"pc",    active:true },
      { id:"p50", name:"Memory Card 16GB",                 category:"Computer Accessories",      price:7000,  cost:5500, stock:20,  minStock:5,   unit:"pc",    active:true },
      { id:"p51", name:"Memory Card 32GB",                 category:"Computer Accessories",      price:8500,  cost:6800, stock:20,  minStock:5,   unit:"pc",    active:true },
      { id:"p52", name:"Memory Card 64GB",                 category:"Computer Accessories",      price:12000, cost:9500, stock:15,  minStock:5,   unit:"pc",    active:true },
      { id:"p53", name:"Card Reader",                      category:"Computer Accessories",      price:1200,  cost:800,  stock:50,  minStock:10,  unit:"pc",    active:true },
      { id:"p54", name:"USB Cable",                        category:"Computer Accessories",      price:2000,  cost:1500, stock:50,  minStock:10,  unit:"pc",    active:true },
      { id:"p55", name:"HDMI Cable",                       category:"Computer Accessories",      price:2500,  cost:1800, stock:40,  minStock:10,  unit:"pc",    active:true },
      { id:"p56", name:"Extension Socket",                 category:"Computer Accessories",      price:8000,  cost:6500, stock:20,  minStock:5,   unit:"pc",    active:true },
      { id:"p57", name:"USB Mouse",                        category:"Computer Accessories",      price:2500,  cost:1800, stock:40,  minStock:10,  unit:"pc",    active:true },
      { id:"p58", name:"Keyboard",                         category:"Computer Accessories",      price:4500,  cost:3500, stock:30,  minStock:5,   unit:"pc",    active:true },
      { id:"p59", name:"Mouse Pad",                        category:"Computer Accessories",      price:500,   cost:300,  stock:60,  minStock:10,  unit:"pc",    active:true },
      { id:"p60", name:"Headphones",                       category:"Computer Accessories",      price:5500,  cost:4200, stock:20,  minStock:5,   unit:"pc",    active:true },
      { id:"p61", name:"Webcam",                           category:"Computer Accessories",      price:10000, cost:8000, stock:10,  minStock:3,   unit:"pc",    active:true },
      { id:"p62", name:"Laptop Bag",                       category:"Computer Accessories",      price:7000,  cost:5500, stock:15,  minStock:5,   unit:"pc",    active:true },
      { id:"p63", name:"Laptop Wallpaper",                 category:"Computer Accessories",      price:3000,  cost:2000, stock:30,  minStock:5,   unit:"pc",    active:true },
      { id:"p64", name:"Blank CD",                         category:"Computer Accessories",      price:150,   cost:80,   stock:100, minStock:20,  unit:"pc",    active:true },
      { id:"p65", name:"Blank DVD",                        category:"Computer Accessories",      price:300,   cost:180,  stock:100, minStock:20,  unit:"pc",    active:true },
    ],
    customers: [],
    services: [
      // Prints
      { id:"sv1",  name:"Photocopy (Per Page)",            category:"Prints",                    basePrice:50,     active:true },
      { id:"sv2",  name:"Photocopy Front & Back",          category:"Prints",                    basePrice:70,     active:true },
      { id:"sv3",  name:"Black Printing",                  category:"Prints",                    basePrice:100,    active:true },
      { id:"sv4",  name:"Black Printing (Bulk)",           category:"Prints",                    basePrice:70,     active:true },
      { id:"sv5",  name:"Colour Printing",                 category:"Prints",                    basePrice:200,    active:true },
      { id:"sv6",  name:"Colour Printing (Bulk)",          category:"Prints",                    basePrice:150,    active:true },
      { id:"sv7",  name:"Typesetting",                     category:"Prints",                    basePrice:250,    active:true },
      { id:"sv8",  name:"Scanning",                        category:"Prints",                    basePrice:150,    active:true },
      { id:"sv9",  name:"Lamination (A4)",                 category:"Prints",                    basePrice:350,    active:true },
      { id:"sv10", name:"Passport Photograph",             category:"Prints",                    basePrice:1500,   active:true },
      { id:"sv11", name:"Spiral Binding (Small)",          category:"Prints",                    basePrice:400,    active:true },
      { id:"sv12", name:"Spiral Binding (Medium)",         category:"Prints",                    basePrice:600,    active:true },
      { id:"sv13", name:"Spiral Binding (Large)",          category:"Prints",                    basePrice:1200,   active:true },
      // Computer Services
      { id:"sv14", name:"Software Installation",           category:"Computer Services",         basePrice:2500,   active:true },
      { id:"sv15", name:"Windows Installation",            category:"Computer Services",         basePrice:5000,   active:true },
      { id:"sv16", name:"Windows Activation",              category:"Computer Services",         basePrice:2000,   active:true },
      { id:"sv17", name:"Driver Installation",             category:"Computer Services",         basePrice:3000,   active:true },
      { id:"sv18", name:"Laptop Formatting",               category:"Computer Services",         basePrice:2000,   active:true },
      { id:"sv19", name:"Data Backup",                     category:"Computer Services",         basePrice:2000,   active:true },
      { id:"sv20", name:"Data Recovery",                   category:"Computer Services",         basePrice:5000,   active:true },
      { id:"sv21", name:"Printer Installation",            category:"Computer Services",         basePrice:3000,   active:true },
      // Research & Analysis
      { id:"sv22", name:"Reliability of Instrument",       category:"Research & Analysis",       basePrice:40000,  active:true },
      { id:"sv23", name:"SPSS Analysis (M.Sc)",            category:"Research & Analysis",       basePrice:15000,  active:true },
      { id:"sv24", name:"SPSS Analysis (Ph.D)",            category:"Research & Analysis",       basePrice:25000,  active:true },
      // Research Projects
      { id:"sv25", name:"B.Sc / B.Ed Research Project",    category:"Research Projects",         basePrice:80000,  active:true },
      { id:"sv26", name:"PGDE Research Project",           category:"Research Projects",         basePrice:120000, active:true },
      { id:"sv27", name:"M.Ed / M.Sc Research Project",    category:"Research Projects",         basePrice:850000, active:true },
      { id:"sv28", name:"Ph.D Research Project",           category:"Research Projects",         basePrice:1300000,active:true },
      { id:"sv29", name:"Seminar Presentation",            category:"Research Projects",         basePrice:10000,  active:true },
      // Graphics Design
      { id:"sv30", name:"Logo Design",                     category:"Graphics Design",           basePrice:20000,  active:true },
      { id:"sv31", name:"Flyer Design",                    category:"Graphics Design",           basePrice:5000,   active:true },
      { id:"sv32", name:"Poster Design",                   category:"Graphics Design",           basePrice:5000,   active:true },
      { id:"sv33", name:"Banner Design",                   category:"Graphics Design",           basePrice:5000,   active:true },
      { id:"sv34", name:"Business Card Design",            category:"Graphics Design",           basePrice:2000,   active:true },
      { id:"sv35", name:"Letterhead Design",               category:"Graphics Design",           basePrice:2000,   active:true },
      { id:"sv36", name:"ID Card Design",                  category:"Graphics Design",           basePrice:2000,   active:true },
      { id:"sv37", name:"Social Media Design",             category:"Graphics Design",           basePrice:5000,   active:true },
      { id:"sv38", name:"Brochure Design",                 category:"Graphics Design",           basePrice:10000,  active:true },
      { id:"sv39", name:"Catalogue Design",                category:"Graphics Design",           basePrice:10000,  active:true },
      { id:"sv40", name:"Magazine Design",                 category:"Graphics Design",           basePrice:10000,  active:true },
      { id:"sv41", name:"Book Cover Design",               category:"Graphics Design",           basePrice:5000,   active:true },
      { id:"sv42", name:"Wedding Programme Design",        category:"Graphics Design",           basePrice:5000,   active:true },
      { id:"sv43", name:"Invitation Card Design",          category:"Graphics Design",           basePrice:5000,   active:true },
      // Branding
      { id:"sv44", name:"T-Shirt Branding",                category:"Branding",                  basePrice:3000,   active:true },
      { id:"sv45", name:"Mug Branding",                    category:"Branding",                  basePrice:2000,   active:true },
      { id:"sv46", name:"Face Cap Branding",               category:"Branding",                  basePrice:1500,   active:true },
      { id:"sv47", name:"Jotter Branding",                 category:"Branding",                  basePrice:5000,   active:true },
      { id:"sv48", name:"Notebook Branding",               category:"Branding",                  basePrice:5000,   active:true },
      { id:"sv49", name:"Roll-up Banner",                  category:"Branding",                  basePrice:10000,  active:true },
      { id:"sv50", name:"Flex Banner",                     category:"Branding",                  basePrice:5000,   active:true },
      { id:"sv51", name:"Vehicle Branding",                category:"Branding",                  basePrice:80000,  active:true },
      { id:"sv52", name:"Signage",                         category:"Branding",                  basePrice:10000,  active:true },
      // Architectural Design
      { id:"sv53", name:"Building Plan",                   category:"Architectural Design",      basePrice:50000,  active:true },
      { id:"sv54", name:"2D Floor Plan",                   category:"Architectural Design",      basePrice:50000,  active:true },
      { id:"sv55", name:"3D Visualization",                category:"Architectural Design",      basePrice:80000,  active:true },
      { id:"sv56", name:"Product Design",                  category:"Architectural Design",      basePrice:50000,  active:true },
      { id:"sv57", name:"Prototype Design",                category:"Architectural Design",      basePrice:50000,  active:true },
      // Glass, Ceramics & Fibreglass
      { id:"sv58", name:"Fibreglass Products",             category:"Glass, Ceramics & Fibreglass", basePrice:500000, active:true },
      { id:"sv59", name:"Ceramic Products",                category:"Glass, Ceramics & Fibreglass", basePrice:500000, active:true },
      { id:"sv60", name:"Customized Awards",               category:"Glass, Ceramics & Fibreglass", basePrice:20000,  active:true },
      { id:"sv61", name:"Decorative Items",                category:"Glass, Ceramics & Fibreglass", basePrice:10000,  active:true },
    ],
    sales:        [],
    serviceJobs:  [],
    stockMovements:[], auditLog:[],
    settings:[{ id:"main", companyName:"TOKEY MIGHTY WORKS", tagline:"...Zenith of Creativity", currency:"₱" }],
  };
};

// ============================================================
// STORE HOOK — offline-first + Firebase sync
// ============================================================
function useStore() {
  const [state, setState] = useState({
    loaded:false, products:[], sales:[], customers:[], services:[],
    serviceJobs:[], stockMovements:[], users:[], auditLog:[], settings:[],
    debtors:[], debtPayments:[], expenditures:[],
  });
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error
  const unsubRefs = useRef([]);

  const load = useCallback(async () => {
    try {
      // 1. Load from local IndexedDB first (instant, works offline)
      const localUsers = await dbAll("users");
      if (localUsers.length === 0) {
        const seed = mkSeed();
        for (const [store, items] of Object.entries(seed))
          for (const item of items) await dbPut(store, item);
      }
      const keys = ["products","sales","customers","services","serviceJobs","stockMovements","users","auditLog","settings","debtors","debtPayments","expenditures"];
      const results = await Promise.all(keys.map(s => dbAll(s)));
      const local = Object.fromEntries(keys.map((k,i) => [k, results[i]]));
      setState({ loaded:true, ...local, users: local.users });

      // 2. If Firebase is configured, sync from cloud and set up live listeners
      const cfg = getFBConfig();
      if (cfg) {
        setSyncStatus("syncing");
        await syncFromFirebase(local, setState, setSyncStatus, unsubRefs);
      }
    } catch(e) {
      console.error("Load error:", e);
      setState({ ...mkSeed(), loaded:true, auditLog:[], settings:[{ id:"main", companyName:"TOKEY MIGHTY WORKS", tagline:"...Zenith of Creativity", currency:"₦" }], debtors:[], debtPayments:[], expenditures:[] });
    }
  }, []);

  useEffect(() => { load(); return () => unsubRefs.current.forEach(u => u()); }, [load]);

  // Write to local + Firebase
  const update = useCallback(async (store, item) => {
    await dbPut(store, item);
    setState(s => ({ ...s, [store]: s[store].find(x=>x.id===item.id) ? s[store].map(x=>x.id===item.id?item:x) : [...s[store], item] }));
    await fbPut(store, item);
  }, []);

  const remove = useCallback(async (store, id) => {
    await dbDel(store, id);
    setState(s => ({ ...s, [store]: s[store].filter(x=>x.id!==id) }));
    await fbDel(store, id);
  }, []);

  const audit = useCallback(async (action, detail, user) => {
    const log = { id:uid(), action, detail, userId:user?.id||"", userName:user?.name||"", role:user?.role||"", createdAt:new Date().toISOString() };
    await dbPut("auditLog", log);
    setState(s => ({ ...s, auditLog: [...s.auditLog, log] }));
    await fbPut("auditLog", log);
  }, []);

  return { state, update, remove, audit, reload:load, syncStatus };
}

// ============================================================
// FIREBASE SYNC ENGINE
// ============================================================
async function syncFromFirebase(localState, setState, setSyncStatus, unsubRefs) {
  const cfg = getFBConfig();
  if (!cfg) return;
  try {
    const { db, collection, onSnapshot } = await loadFirebase(cfg);
    const stores = ["products","sales","customers","services","serviceJobs","stockMovements","users","auditLog","settings","debtors","debtPayments","expenditures"];

    // Unsubscribe previous listeners
    unsubRefs.current.forEach(u => u());
    unsubRefs.current = [];

    // For each collection, pull from Firestore and merge into local + state
    await Promise.all(stores.map(async store => {
      const cloudData = await fbGetAll(store);
      if (!cloudData) return;

      // Merge cloud into local IndexedDB
      for (const item of cloudData) await dbPut(store, item);

      // Merge cloud items into state (cloud wins for conflict)
      setState(s => {
        const local = s[store] || [];
        const merged = [...local];
        for (const ci of cloudData) {
          const idx = merged.findIndex(x => x.id === ci.id);
          if (idx >= 0) merged[idx] = ci; else merged.push(ci);
        }
        return { ...s, [store]: merged };
      });

      // Set up real-time listener
      const unsub = onSnapshot(collection(db, store), snap => {
        const items = snap.docs.map(d => d.data());
        setState(s => ({ ...s, [store]: items }));
        items.forEach(item => dbPut(store, item));
      }, err => console.warn(`Listener ${store}:`, err.message));
      unsubRefs.current.push(unsub);
    }));

    setSyncStatus("synced");
  } catch(e) {
    console.error("Firebase sync error:", e);
    setSyncStatus("error");
  }
}

// Push ALL local data to Firebase (for first-time setup)
async function pushLocalToFirebase(state) {
  const stores = ["products","sales","customers","services","serviceJobs","stockMovements","users","auditLog","settings","debtors","debtPayments","expenditures"];
  for (const store of stores) {
    const items = state[store] || [];
    for (const item of items) await fbPut(store, item);
  }
}


// ============================================================
// PERMISSIONS
// ============================================================
const PERMS = {
  superadmin: { all:true },
  admin: {
    viewDashboard:true, manageSales:true, manageService:true, manageInventory:true,
    manageCustomers:true, viewReports:true, generateInvoice:true, manageStaff:true,
    approveDiscounts:true, manageServiceCategories:true, correctTransactions:true,
    exportReports:true,
  },
  staff: {
    recordSales:true, createQuotations:true, createServiceJobs:true, updateServiceStatus:true,
    searchInventory:true, viewAssignedCustomers:true, printReceipts:true, viewOwnPerformance:true,
    viewDashboardBasic:true,
  },
};
const can = (user, perm) => {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  return !!PERMS[user.role]?.[perm];
};

// ============================================================
// UI PRIMITIVES
// ============================================================
const Logo = ({ size = 44 }) => (
  <img
    src={logo}
    alt="TOKEY MIGHTY WORKS"
    width={size}
    height={size}
  />
);

const Modal = ({ title, onClose, children, wide, maxW }) => (
  <div style={{ position:"fixed",inset:0,background:"rgba(26,11,46,0.6)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
    <div style={{ background:B.white,borderRadius:16,width:"100%",maxWidth:maxW||( wide?740:520),maxHeight:"92vh",overflow:"auto",boxShadow:"0 24px 80px rgba(155,39,175,0.25)" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 22px",borderBottom:`2px solid ${B.purpleL}`,position:"sticky",top:0,background:B.white,zIndex:1 }}>
        <h3 style={{ margin:0,fontSize:16,fontWeight:800,color:B.dark }}>{title}</h3>
        <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",color:B.muted,padding:4,borderRadius:6,display:"flex" }}>
          <X size={20}/>
        </button>
      </div>
      <div style={{ padding:22 }}>{children}</div>
    </div>
  </div>
);

const Field = ({ label, req, children, half }) => (
  <div style={{ marginBottom:14, gridColumn: half?"span 1":undefined }}>
    <label style={{ display:"block",fontSize:11,fontWeight:700,color:B.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:.6 }}>
      {label}{req&&<span style={{ color:"#e74c3c" }}> *</span>}
    </label>
    {children}
  </div>
);

const inp = { width:"100%",padding:"9px 13px",border:`1.5px solid ${B.border}`,borderRadius:9,fontSize:14,color:B.text,outline:"none",boxSizing:"border-box",background:B.white,fontFamily:"inherit" };
const Inp = (props) => <input {...props} style={{ ...inp,...(props.disabled?{background:B.gray}:{}), ...props.style }}/>;
const Sel = ({ children,...p }) => <select {...p} style={{ ...inp,...p.style }}>{children}</select>;
const Txt = (props) => <textarea {...props} style={{ ...inp,resize:"vertical",minHeight:72,...props.style }}/>;

const Btn = ({ children,onClick,v="primary",sm,icon,disabled,full,style:ext }) => {
  const vs = {
    primary:   { background:`linear-gradient(135deg,${B.purple},${B.purpleD})`,color:B.white,border:"none",boxShadow:"0 3px 12px rgba(155,39,175,0.3)" },
    cyan:      { background:`linear-gradient(135deg,${B.cyan},${B.cyanD})`,color:B.white,border:"none",boxShadow:"0 3px 12px rgba(0,180,216,0.3)" },
    lime:      { background:`linear-gradient(135deg,${B.lime},${B.limeD})`,color:B.white,border:"none",boxShadow:"0 3px 12px rgba(139,195,74,0.3)" },
    ghost:     { background:"none",color:B.purple,border:`1.5px solid ${B.purple}` },
    ghostCyan: { background:"none",color:B.cyan,border:`1.5px solid ${B.cyan}` },
    danger:    { background:"linear-gradient(135deg,#e74c3c,#c0392b)",color:B.white,border:"none" },
    secondary: { background:B.gray,color:B.text,border:`1px solid ${B.border}` },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...vs[v],padding:sm?"6px 13px":"9px 20px",borderRadius:9,fontSize:sm?12:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",display:"inline-flex",alignItems:"center",gap:6,opacity:disabled?.6:1,transition:"opacity .15s,transform .1s",width:full?"100%":"auto",justifyContent:full?"center":"flex-start",...ext }}
      onMouseEnter={e=>{if(!disabled)e.currentTarget.style.transform="translateY(-1px)"}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none"}}>
      {icon&&<SVG name={icon} size={sm?13:15}/>}
      {children}
    </button>
  );
};

const Badge = ({ children,color=B.purple,bg }) => (
  <span style={{ background:bg||(color+"20"),color,border:`1px solid ${color}40`,borderRadius:20,padding:"2px 11px",fontSize:11,fontWeight:700,whiteSpace:"nowrap" }}>{children}</span>
);

const Card = ({ children,style,hover }) => (
  <div style={{ background:B.white,borderRadius:14,padding:22,boxShadow:"0 2px 16px rgba(155,39,175,0.07)",border:`1px solid ${B.border}`,transition:"box-shadow .2s",...style }}
    onMouseEnter={hover?e=>{e.currentTarget.style.boxShadow="0 6px 28px rgba(155,39,175,0.14)"}:undefined}
    onMouseLeave={hover?e=>{e.currentTarget.style.boxShadow="0 2px 16px rgba(155,39,175,0.07)"}:undefined}>
    {children}
  </div>
);

const StatCard = ({ label,value,icon,color,sub,onClick }) => (
  <Card hover style={{ display:"flex",alignItems:"center",gap:16,cursor:onClick?"pointer":"default" }} >
    <div style={{ width:54,height:54,borderRadius:14,background:color+"20",display:"flex",alignItems:"center",justifyContent:"center",color,flexShrink:0 }}>
      <SVG name={icon} size={26}/>
    </div>
    <div style={{ minWidth:0 }}>
      <div style={{ fontSize:22,fontWeight:900,color:B.dark,letterSpacing:-1 }}>{value}</div>
      <div style={{ fontSize:12,color:B.muted,fontWeight:600 }}>{label}</div>
      {sub&&<div style={{ fontSize:11,color,fontWeight:700,marginTop:2 }}>{sub}</div>}
    </div>
  </Card>
);

// inline SVG icon set
const X=({size=18})=><svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>;
const SVG = ({ name,size=18 }) => {
  const d = {
    dashboard:"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    sales:"M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    service:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    inventory:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    customers:"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    reports:"M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    users:"M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
    plus:"M12 4v16m8-8H4",
    edit:"M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    trash:"M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    search:"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    check:"M5 13l4 4L19 7",
    alert:"M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    logout:"M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    download:"M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
    invoice:"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    menu:"M4 6h16M4 12h16M4 18h16",
    wifi:"M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0",
    wifi_off:"M9.172 16.172a4 4 0 015.656 0M12 20h.01M3 3l18 18",
    audit:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    catalog:"M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    chart:"M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z",
    wrench:"M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z",
    stock:"M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4",
    debtor:"M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    money:"M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 13v-1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    paid:"M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    expense:"M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    tag:"M7 7h.01M7 3H5a2 2 0 00-2 2v2c0 .384.1.742.28 1.054l7 12A2 2 0 0012 21a2 2 0 001.72-.946l7-12A2 2 0 0021 7V5a2 2 0 00-2-2h-2M7 7a2 2 0 100-4 2 2 0 000 4z",
    cloud:"M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
    cloudUp:"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
    cloudDown:"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10",
    key:"M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
    sync:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
    cloud:"M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z",
    cloud_up:"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
    settings:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  };
  return <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d={d[name]||d.dashboard}/></svg>;
};

const Tbl = ({ cols,data,actions }) => (
  <div style={{ overflowX:"auto" }}>
    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13 }}>
      <thead>
        <tr style={{ background:B.light }}>
          {cols.map(c=><th key={c.k} style={{ padding:"9px 13px",textAlign:"left",fontWeight:800,color:B.muted,fontSize:11,textTransform:"uppercase",letterSpacing:.7,borderBottom:`2px solid ${B.border}`,whiteSpace:"nowrap" }}>{c.l}</th>)}
          {actions&&<th style={{ padding:"9px 13px",textAlign:"right",fontWeight:800,color:B.muted,fontSize:11,textTransform:"uppercase",letterSpacing:.7,borderBottom:`2px solid ${B.border}` }}>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {data.length===0
          ? <tr><td colSpan={cols.length+(actions?1:0)} style={{ textAlign:"center",padding:36,color:B.muted,fontSize:13 }}>No records found</td></tr>
          : data.map((row,i)=>(
            <tr key={row.id||i} style={{ borderBottom:`1px solid ${B.gray}`,transition:"background .1s" }} onMouseEnter={e=>e.currentTarget.style.background=B.light} onMouseLeave={e=>e.currentTarget.style.background=""}>
              {cols.map(c=><td key={c.k} style={{ padding:"10px 13px",color:B.text,verticalAlign:"middle" }}>{c.r?c.r(row):row[c.k]}</td>)}
              {actions&&<td style={{ padding:"8px 13px",textAlign:"right",whiteSpace:"nowrap" }}>{actions(row)}</td>}
            </tr>
          ))}
      </tbody>
    </table>
  </div>
);

const php = v => `₦${Number(v||0).toLocaleString("en-PH",{minimumFractionDigits:2})}`;
const fmtDate = d => new Date(d).toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
const fmtDateTime = d => new Date(d).toLocaleString("en-PH",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});

const PageHead = ({ title,children }) => (
  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22,flexWrap:"wrap",gap:10 }}>
    <h2 style={{ margin:0,color:B.dark,fontSize:22,fontWeight:900,letterSpacing:-0.5 }}>{title}</h2>
    <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>{children}</div>
  </div>
);

const Tabs = ({ tabs,active,onChange }) => (
  <div style={{ display:"flex",gap:6,marginBottom:18,borderBottom:`2px solid ${B.border}`,paddingBottom:0 }}>
    {tabs.map(t=>(
      <button key={t.k} onClick={()=>onChange(t.k)} style={{
        padding:"8px 18px",border:"none",background:"none",cursor:"pointer",
        color:active===t.k?B.purple:B.muted,fontWeight:700,fontSize:13,
        borderBottom:active===t.k?`3px solid ${B.purple}`:"3px solid transparent",
        marginBottom:-2,transition:"color .15s",display:"flex",alignItems:"center",gap:6
      }}>{t.icon&&<SVG name={t.icon} size={14}/>}{t.l}</button>
    ))}
  </div>
);

// Toast
function useToast() {
  const [toasts,setToasts] = useState([]);
  const toast = useCallback((msg,type="success") => {
    const id = uid();
    setToasts(t=>[...t,{id,msg,type}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200);
  },[]);
  const ToastContainer = () => (
    <div style={{ position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8 }}>
      {toasts.map(t=>(
        <div key={t.id} style={{ background:t.type==="error"?"#e74c3c":t.type==="warning"?B.lime:B.purple,color:B.white,padding:"11px 18px",borderRadius:10,fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,.2)",minWidth:220,display:"flex",alignItems:"center",gap:8 }}>
          {t.type==="success"&&<SVG name="check" size={15}/>}{t.msg}
        </div>
      ))}
    </div>
  );
  return { toast, ToastContainer };
}

// ============================================================
// LOGIN PAGE
// ============================================================
function LoginPage({ onLogin,state }) {
  const [un,setUn]=useState(""); const [pw,setPw]=useState(""); const [err,setErr]=useState("");
  const go = () => {
    const storedUsers = Array.isArray(state?.users) ? state.users : [];
    const candidateUsers = [...storedUsers, ...DEFAULT_USERS];
    const u = findMatchingUser(candidateUsers, un, pw);
    if(u) onLogin(u); else setErr("Invalid username or password.");
  };
  return (
    <div style={{ minHeight:"100vh",background:`linear-gradient(135deg,${B.dark} 0%,${B.darkM} 60%,${B.purpleD} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div style={{ background:B.white,borderRadius:20,padding:40,width:"100%",maxWidth:420,boxShadow:"0 32px 96px rgba(155,39,175,0.4)" }}>
        <div style={{ textAlign:"center",marginBottom:32 }}>
          <Logo size={72}/>
          <h1 style={{ margin:"12px 0 4px",fontSize:22,fontWeight:900,background:`linear-gradient(135deg,${B.purple},${B.cyan})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1 }}>TOKEY MIGHTY WORKS</h1>
          <p style={{ margin:0,fontSize:12,color:B.muted,fontStyle:"italic" }}>...Zenith of Creativity</p>
          <p style={{ margin:"10px 0 0",fontSize:13,color:B.mid }}>Sales & Service Management System</p>
        </div>
        {err&&<div style={{ background:"#ffe8e8",color:"#e74c3c",padding:"10px 14px",borderRadius:9,fontSize:13,marginBottom:16,fontWeight:600 }}>{err}</div>}
        <Field label="Username" req><Inp value={un} onChange={e=>setUn(e.target.value)} placeholder="Enter username"/></Field>
        <Field label="Password" req><Inp type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Enter password" onKeyDown={e=>e.key==="Enter"&&go()}/></Field>
        <Btn onClick={go} full style={{ marginTop:8,justifyContent:"center" }}>Sign In</Btn>
        
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD
// ============================================================
function Dashboard({ state, cu }) {
  const today = new Date().toDateString();
  const todaySales = state.sales.filter(s=>new Date(s.createdAt).toDateString()===today);
  const todayJobs = state.serviceJobs.filter(j=>new Date(j.createdAt).toDateString()===today);
  const allSalesRev = state.sales.reduce((a,s)=>a+s.total,0);
  const allSvcRev = state.serviceJobs.reduce((a,j)=>a+j.total,0);
  const allProfit = state.sales.reduce((a,s)=>a+(s.profit||0),0);
  const lowStock = state.products.filter(p=>p.stock<=p.minStock);
  const todayRev = todaySales.reduce((a,s)=>a+s.total,0)+todayJobs.reduce((a,j)=>a+j.total,0);

  // This month expenses
  const nowD = new Date();
  const monthExp = (state.expenditures||[]).filter(e=>{ const d=new Date(e.date||e.createdAt); return d.getMonth()===nowD.getMonth()&&d.getFullYear()===nowD.getFullYear(); });
  const monthExpTotal = monthExp.reduce((a,e)=>a+(+e.amount||0),0);
  const monthSalesProfit = state.sales.filter(s=>{ const d=new Date(s.createdAt); return d.getMonth()===nowD.getMonth()&&d.getFullYear()===nowD.getFullYear(); }).reduce((a,s)=>a+(s.profit||0),0);
  const netProfitMonth = monthSalesProfit - monthExpTotal;

  // 7-day bar
  const week = Array.from({length:7},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i));
    const ds=d.toDateString();
    const s=state.sales.filter(x=>new Date(x.createdAt).toDateString()===ds).reduce((a,x)=>a+x.total,0);
    const sv=state.serviceJobs.filter(x=>new Date(x.createdAt).toDateString()===ds).reduce((a,x)=>a+x.total,0);
    return {day:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()],s,sv,t:s+sv};
  });
  const maxW = Math.max(...week.map(d=>d.t),1);

  return (
    <div>
      <PageHead title="Dashboard">
        <div style={{ fontSize:12,color:B.muted,background:B.light,padding:"6px 14px",borderRadius:20,fontWeight:600 }}>
          {new Date().toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
        </div>
      </PageHead>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:22 }}>
        <StatCard label="Today's Revenue" value={php(todayRev)} icon="sales" color={B.purple} sub={`${todaySales.length} sale(s) · ${todayJobs.length} job(s)`}/>
        <StatCard label="Total Sales Revenue" value={php(allSalesRev)} icon="invoice" color={B.cyan}/>
        <StatCard label="Total Service Revenue" value={php(allSvcRev)} icon="service" color={B.lime}/>
        <StatCard label="This Month Expenses" value={php(monthExpTotal)} icon="expense" color="#e74c3c" sub={`${monthExp.length} expense(s)`}/>
        <StatCard label="This Month Net Profit" value={php(netProfitMonth)} icon="chart" color={netProfitMonth>=0?B.lime:"#e74c3c"} sub={netProfitMonth>=0?"Profitable ✓":"Check expenses"}/>
        <StatCard label="Low Stock Alerts" value={lowStock.length} icon="alert" color="#e67e22" sub={lowStock.length>0?"Needs restocking":"All stocked"}/>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:16 }}>
        <Card>
          <h3 style={{ margin:"0 0 18px",fontSize:14,fontWeight:800,color:B.dark }}>7-Day Revenue Overview</h3>
          <div style={{ display:"flex",alignItems:"flex-end",gap:8,height:130 }}>
            {week.map(d=>(
              <div key={d.day} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                <div style={{ width:"100%",display:"flex",flexDirection:"column",gap:2,height:100,justifyContent:"flex-end" }}>
                  <div style={{ background:B.lime,height:`${(d.sv/maxW)*100}px`,borderRadius:"4px 4px 0 0",minHeight:d.sv>0?4:0,transition:"height .4s" }} title={`Service: ${php(d.sv)}`}/>
                  <div style={{ background:B.purple,height:`${(d.s/maxW)*100}px`,borderRadius:d.sv>0?0:"4px 4px 0 0",minHeight:d.s>0?4:0,transition:"height .4s" }} title={`Sales: ${php(d.s)}`}/>
                </div>
                <span style={{ fontSize:10,color:B.muted,fontWeight:600 }}>{d.day}</span>
              </div>
            ))}
          </div>
          <div style={{ display:"flex",gap:18,marginTop:12 }}>
            <span style={{ fontSize:11,color:B.purple,fontWeight:700 }}>■ Sales</span>
            <span style={{ fontSize:11,color:B.lime,fontWeight:700 }}>■ Service</span>
          </div>
        </Card>
        <Card>
          <h3 style={{ margin:"0 0 12px",fontSize:14,fontWeight:800,color:B.dark }}>⚠ Low Stock Alerts</h3>
          {lowStock.length===0
            ? <p style={{ color:B.muted,fontSize:13 }}>All products are well-stocked.</p>
            : lowStock.map(p=>(
              <div key={p.id} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}>
                <span style={{ color:B.text,fontWeight:600 }}>{p.name}</span>
                <Badge color="#e67e22">{p.stock} {p.unit}</Badge>
              </div>
            ))}
        </Card>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <Card>
          <h3 style={{ margin:"0 0 12px",fontSize:14,fontWeight:800,color:B.dark }}>Recent Sales</h3>
          {[...state.sales].reverse().slice(0,5).map(s=>(
            <div key={s.id} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}>
              <div><div style={{ fontWeight:700,color:B.text }}>{s.invoiceNo}</div><div style={{ color:B.muted,fontSize:11 }}>{s.customerName} · {fmtDate(s.createdAt)}</div></div>
              <div style={{ fontWeight:800,color:B.purple }}>{php(s.total)}</div>
            </div>
          ))}
        </Card>
        <Card>
          <h3 style={{ margin:"0 0 12px",fontSize:14,fontWeight:800,color:B.dark }}>Recent Service Jobs</h3>
          {[...state.serviceJobs].reverse().slice(0,5).map(j=>(
            <div key={j.id} style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}>
              <div><div style={{ fontWeight:700,color:B.text }}>{j.jobNo}</div><div style={{ color:B.muted,fontSize:11 }}>{j.customerName} · {fmtDate(j.createdAt)}</div></div>
              <Badge color={j.status==="completed"?B.lime:j.status==="in-progress"?B.cyan:"#e67e22"}>{j.status}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// INVENTORY
// ============================================================
function InventoryPage({ state,update,remove,cu,audit,toast }) {
  const [tab,setTab]=useState("products");
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [stockM,setStockM]=useState(null);

  const isAdmin = can(cu,"manageInventory");
  const products = state.products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.category?.toLowerCase().includes(search.toLowerCase()));

  const save = async () => {
    if(!form.name){toast("Product name is required","error");return;}
    const item={...form,id:form.id||uid(),price:+form.price||0,cost:+form.cost||0,stock:+form.stock||0,minStock:+form.minStock||5,active:true};
    await update("products",item);
    await audit(form.id?"Edit Product":"Add Product",`${item.name}`,cu);
    toast(`Product ${form.id?"updated":"added"} successfully`);
    setModal(null);
  };

  const del = async id => {
    if(!window.confirm("Delete this product?"))return;
    await remove("products",id);
    await audit("Delete Product",id,cu);
    toast("Product deleted");
  };

  const doStock = async mv => {
    const p=state.products.find(x=>x.id===stockM.id);
    const q=+mv.qty;
    const ns=mv.type==="in"?p.stock+q:p.stock-q;
    if(ns<0){toast("Insufficient stock!","error");return;}
    await update("products",{...p,stock:ns});
    await update("stockMovements",{id:uid(),productId:p.id,productName:p.name,type:mv.type,qty:q,reason:mv.reason||"Manual",before:p.stock,after:ns,createdAt:new Date().toISOString(),createdBy:cu.name});
    await audit("Stock Adjustment",`${p.name}: ${mv.type} ${q}`,cu);
    toast(`Stock ${mv.type==="in"?"added":"removed"} successfully`);
    setStockM(null);
  };

  return (
    <div>
      <PageHead title="Inventory">
        {isAdmin&&<Btn icon="plus" onClick={()=>{setForm({category:"General",unit:"pc",price:0,cost:0,stock:0,minStock:5});setModal("form");}}>Add Product</Btn>}
      </PageHead>
      <Tabs tabs={[{k:"products",l:"Products",icon:"inventory"},{k:"movements",l:"Stock Movements",icon:"stock"}]} active={tab} onChange={setTab}/>

      {tab==="products"&&<>
        <div style={{ position:"relative",marginBottom:16 }}>
          <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:B.muted }}><SVG name="search" size={16}/></span>
          <Inp placeholder="Search products…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:38 }}/>
        </div>
        <Card style={{ padding:0 }}>
          <Tbl
            cols={[
              {k:"name",l:"Product",r:r=><span style={{ fontWeight:700 }}>{r.name}</span>},
              {k:"category",l:"Category"},
              {k:"stock",l:"Stock",r:r=><span style={{ fontWeight:800,color:r.stock<=r.minStock?"#e67e22":B.lime }}>{r.stock} {r.unit}</span>},
              {k:"price",l:"Sell Price",r:r=>php(r.price)},
              {k:"cost",l:"Cost",r:r=>can(cu,"viewReports")?php(r.cost):"—"},
              {k:"minStock",l:"Min Stock"},
            ]}
            data={products}
            actions={r=>(
              <div style={{ display:"flex",gap:5,justifyContent:"flex-end" }}>
                <Btn sm v="ghostCyan" onClick={()=>setStockM(r)}>Stock</Btn>
                {isAdmin&&<Btn sm v="secondary" icon="edit" onClick={()=>{setForm({...r});setModal("form");}}/>}
                {can(cu,"all")&&<Btn sm v="danger" icon="trash" onClick={()=>del(r.id)}/>}
              </div>
            )}
          />
        </Card>
      </>}

      {tab==="movements"&&(
        <Card style={{ padding:0 }}>
          <Tbl
            cols={[
              {k:"createdAt",l:"Date",r:r=>fmtDateTime(r.createdAt)},
              {k:"productName",l:"Product"},
              {k:"type",l:"Type",r:r=><Badge color={r.type==="in"?B.lime:"#e74c3c"}>{r.type==="in"?"▲ In":"▼ Out"}</Badge>},
              {k:"qty",l:"Qty",r:r=><strong>{r.qty}</strong>},
              {k:"before",l:"Before"},{k:"after",l:"After"},
              {k:"reason",l:"Reason"},{k:"createdBy",l:"By"},
            ]}
            data={[...state.stockMovements].reverse()}
          />
        </Card>
      )}

      {modal==="form"&&(
        <Modal title={form.id?"Edit Product":"Add Product"} onClose={()=>setModal(null)}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px" }}>
            <Field label="Product Name" req><Inp value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Field>
            <Field label="Category" req><Inp value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/></Field>
            <Field label="Unit"><Inp value={form.unit||""} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}/></Field>
            <Field label="Current Stock"><Inp type="number" value={form.stock||0} onChange={e=>setForm(f=>({...f,stock:e.target.value}))}/></Field>
            <Field label="Selling Price (₦)" req><Inp type="number" value={form.price||0} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/></Field>
            <Field label="Cost Price (₦)"><Inp type="number" value={form.cost||0} onChange={e=>setForm(f=>({...f,cost:e.target.value}))}/></Field>
            <Field label="Minimum Stock Alert"><Inp type="number" value={form.minStock||5} onChange={e=>setForm(f=>({...f,minStock:e.target.value}))}/></Field>
          </div>
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:18 }}>
            <Btn v="secondary" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn onClick={save}>Save Product</Btn>
          </div>
        </Modal>
      )}

      {stockM&&<StockModal product={stockM} onSave={doStock} onClose={()=>setStockM(null)}/>}
    </div>
  );
}

function StockModal({product,onSave,onClose}){
  const [f,setF]=useState({type:"in",qty:1,reason:""});
  return(
    <Modal title={`Adjust Stock — ${product.name}`} onClose={onClose}>
      <p style={{ fontSize:13,color:B.muted,marginBottom:16 }}>Current stock: <strong style={{ color:B.purple }}>{product.stock} {product.unit}</strong></p>
      <Field label="Movement"><Sel value={f.type} onChange={e=>setF(x=>({...x,type:e.target.value}))}><option value="in">Stock In (Add)</option><option value="out">Stock Out (Remove)</option></Sel></Field>
      <Field label="Quantity"><Inp type="number" min={1} value={f.qty} onChange={e=>setF(x=>({...x,qty:e.target.value}))}/></Field>
      <Field label="Reason"><Inp value={f.reason} onChange={e=>setF(x=>({...x,reason:e.target.value}))} placeholder="Purchase, Sale correction, Damaged…"/></Field>
      <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:16 }}>
        <Btn v="secondary" onClick={onClose}>Cancel</Btn>
        <Btn v={f.type==="in"?"lime":"danger"} onClick={()=>onSave(f)}>Confirm {f.type==="in"?"Add":"Remove"}</Btn>
      </div>
    </Modal>
  );
}

// ============================================================
// SALES
// ============================================================
function SalesPage({state,update,remove,cu,audit,toast}){
  const [view,setView]=useState("list");
  const [search,setSearch]=useState("");
  const [viewSale,setViewSale]=useState(null);

  const sales=[...state.sales].reverse().filter(s=>
    s.invoiceNo?.toLowerCase().includes(search.toLowerCase())||
    s.customerName?.toLowerCase().includes(search.toLowerCase())
  );
  const canDeleteSale = can(cu,"all");
  const canProcessRefund = true;

  const deleteSale=async(sale)=>{
    if(!canDeleteSale){toast("Only the owner can delete sales.","error");return;}
    if(!window.confirm(`Delete sale ${sale.invoiceNo}? This will restore inventory and remove the record.`)) return;
    for(const item of sale.items||[]){
      const p=state.products.find(x=>x.id===item.productId);
      if(!p) continue;
      const before=Number(p.stock||0);
      const after=before+Number(item.qty||0);
      await update("products",{...p,stock:after});
      await update("stockMovements",{id:uid(),productId:p.id,productName:p.name,type:"in",qty:Number(item.qty||0),reason:"Sale deleted / refund",before,after,createdAt:new Date().toISOString(),createdBy:cu.name});
    }
    await remove("sales",sale.id);
    await audit("Delete Sale",`${sale.invoiceNo} — stock restored`,cu);
    toast("Sale deleted and inventory restored");
    if(viewSale?.id===sale.id) setViewSale(null);
  };

  return(
    <div>
      <PageHead title="Sales Management">
        {(can(cu,"manageSales")||can(cu,"recordSales"))&&<Btn icon="plus" onClick={()=>setView("new")}>New Sale</Btn>}
      </PageHead>
      {view==="new"
        ? <NewSaleForm state={state} update={update} cu={cu} audit={audit} toast={toast} onDone={s=>{setViewSale(s);setView("list");}}/>
        : viewSale
          ? <InvoiceView sale={viewSale} onClose={()=>setViewSale(null)} canDelete={canDeleteSale} onDelete={()=>deleteSale(viewSale)}/>
          : <>
              <div style={{ position:"relative",marginBottom:16 }}>
                <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:B.muted }}><SVG name="search" size={16}/></span>
                <Inp placeholder="Search by invoice # or customer…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:38 }}/>
              </div>
              <Card style={{ padding:0 }}>
                <Tbl
                  cols={[
                    {k:"invoiceNo",l:"Invoice #",r:r=><strong style={{ color:B.purple }}>{r.invoiceNo}</strong>},
                    {k:"createdAt",l:"Date",r:r=>fmtDate(r.createdAt)},
                    {k:"customerName",l:"Customer"},
                    {k:"items",l:"Items",r:r=>`${r.items?.length||0} item(s)`},
                    {k:"total",l:"Total",r:r=><strong style={{ color:B.dark }}>{php(r.total)}</strong>},
                    {k:"profit",l:"Profit",r:r=>can(cu,"viewReports")?<span style={{ color:B.lime,fontWeight:700 }}>{php(r.profit)}</span>:"—"},
                    {k:"status",l:"Status",r:r=><Badge color={B.lime}>{r.status}</Badge>},
                    {k:"createdByName",l:"By"},
                  ]}
                  data={sales}
                  actions={r=><div style={{ display:"flex", gap:6 }}>
                    <Btn sm v="ghost" icon="invoice" onClick={()=>setViewSale(r)}>View</Btn>
                    {canProcessRefund&&<Btn sm v="cyan" icon="check" onClick={()=>deleteSale(r)}>Return / Refund</Btn>}
                    {canDeleteSale&&<Btn sm v="danger" icon="trash" onClick={()=>deleteSale(r)}>Delete</Btn>}
                  </div>}
                />
              </Card>
            </>
      }
    </div>
  );
}

function NewSaleForm({state,update,cu,audit,toast,onDone}){
  const [custId,setCustId]=useState("");
  const [custName,setCustName]=useState("");
  const [items,setItems]=useState([]);
  const [disc,setDisc]=useState(0);
  const [notes,setNotes]=useState("");

  const addItem=()=>setItems(it=>[...it,{productId:"",name:"",qty:1,price:0,cost:0}]);
  const pickProd=(i,pid)=>{
    const p=state.products.find(x=>x.id===pid);
    if(p) setItems(it=>it.map((x,j)=>j===i?{...x,productId:p.id,name:p.name,price:p.price,cost:p.cost}:x));
  };
  const upd=(i,f,v)=>setItems(it=>it.map((x,j)=>j===i?{...x,[f]:v}:x));
  const rem=i=>setItems(it=>it.filter((_,j)=>j!==i));
  const subtotal=items.reduce((a,it)=>a+(+it.qty*+it.price),0);
  const total=subtotal-+disc;
  const profit=items.reduce((a,it)=>a+(+it.qty*(+it.price-+it.cost)),0)-+disc;

  const save=async()=>{
    if(!custName){toast("Enter customer name","error");return;}
    if(items.length===0){toast("Add at least one item","error");return;}
    for(const item of items){
      const p=state.products.find(x=>x.id===item.productId);
      if(!p){toast("Select a valid product for all items","error");return;}
      if(p.stock<+item.qty){toast(`Insufficient stock: ${p.name}`,"error");return;}
    }
    for(const item of items){
      const p=state.products.find(x=>x.id===item.productId);
      await update("products",{...p,stock:p.stock-+item.qty});
      await update("stockMovements",{id:uid(),productId:p.id,productName:p.name,type:"out",qty:+item.qty,reason:"Sale",before:p.stock,after:p.stock-+item.qty,createdAt:new Date().toISOString(),createdBy:cu.name});
    }
    const sale={id:uid(),invoiceNo:`INV-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,customerId:custId,customerName:custName,items,subtotal,discount:+disc,total,profit,notes,status:"paid",createdAt:new Date().toISOString(),createdBy:cu.id,createdByName:cu.name};
    await update("sales",sale);
    await audit("New Sale",`${sale.invoiceNo} — ${php(total)}`,cu);
    toast(`Invoice ${sale.invoiceNo} created!`);
    onDone(sale);
  };

  return(
    <Card>
      <h3 style={{ margin:"0 0 20px",fontSize:16,fontWeight:800,color:B.dark }}>New Sale</h3>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px",marginBottom:16 }}>
        <Field label="Select Customer">
          <Sel value={custId} onChange={e=>{setCustId(e.target.value);setCustName(state.customers.find(c=>c.id===e.target.value)?.name||"");}}>
            <option value="">— Walk-in / Select —</option>
            {state.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </Sel>
        </Field>
        <Field label="Customer Name" req><Inp value={custName} onChange={e=>setCustName(e.target.value)} placeholder="Type name if walk-in…"/></Field>
      </div>

      <div style={{ marginBottom:14 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <label style={{ fontSize:11,fontWeight:800,color:B.muted,textTransform:"uppercase",letterSpacing:.7 }}>Items</label>
          <Btn sm v="ghost" icon="plus" onClick={addItem}>Add Item</Btn>
        </div>
        {items.length===0&&<div style={{ padding:"18px",background:B.light,borderRadius:9,textAlign:"center",color:B.muted,fontSize:13 }}>No items added yet. Click "Add Item" to start.</div>}
        {items.map((item,i)=>(
          <div key={i} style={{ display:"grid",gridTemplateColumns:"3fr 1fr 1fr 90px 28px",gap:8,marginBottom:8,alignItems:"flex-end" }}>
            <Sel value={item.productId} onChange={e=>pickProd(i,e.target.value)}>
              <option value="">Select product…</option>
              {state.products.map(p=><option key={p.id} value={p.id}>{p.name} (Stock:{p.stock})</option>)}
            </Sel>
            <Inp type="number" min={1} value={item.qty} onChange={e=>upd(i,"qty",e.target.value)} placeholder="Qty"/>
            <Inp type="number" value={item.price} onChange={e=>upd(i,"price",e.target.value)} placeholder="Price"/>
            <div style={{ padding:"9px 4px",fontSize:13,fontWeight:800,color:B.purple }}>{php(item.qty*item.price)}</div>
            <button onClick={()=>rem(i)} style={{ background:"none",border:"none",cursor:"pointer",color:"#e74c3c",padding:2 }}><SVG name="trash" size={16}/></button>
          </div>
        ))}
      </div>

      <Field label="Notes"><Txt value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional remarks…" style={{ minHeight:52 }}/></Field>

      <div style={{ display:"flex",justifyContent:"flex-end" }}>
        <div style={{ width:280,background:B.light,borderRadius:12,padding:16 }}>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:13 }}><span>Subtotal</span><strong>{php(subtotal)}</strong></div>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:13,alignItems:"center" }}>
            <span>Discount (₦)</span>
            <Inp type="number" value={disc} onChange={e=>setDisc(e.target.value)} style={{ width:100,textAlign:"right" }}/>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"10px 0",fontSize:16,borderTop:`2px solid ${B.border}`,fontWeight:900,color:B.purple }}><span>TOTAL</span><span>{php(total)}</span></div>
        </div>
      </div>
      <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:16 }}>
        <Btn v="secondary" onClick={()=>window.location.reload()}>Cancel</Btn>
        <Btn icon="check" onClick={save}>Save & Print Invoice</Btn>
      </div>
    </Card>
  );
}

function InvoiceView({sale,onClose,canDelete,onDelete}){
  const print=()=>{
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>Invoice ${sale.invoiceNo}</title><style>
    body{font-family:Arial,sans-serif;padding:30px;max-width:680px;margin:0 auto;color:#2D1B4E}
    h1{background:linear-gradient(135deg,#9B27AF,#00B4D8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:24px;margin:0}
    .brand{text-align:center;margin-bottom:24px;border-bottom:3px solid #9B27AF;padding-bottom:16px}
    .tagline{font-style:italic;color:#7B6B90;font-size:13px}
    .logo{width:82px;height:auto;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;margin:16px 0}
    th{background:#F5F0FA;padding:10px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#7B6B90}
    td{padding:10px;border-bottom:1px solid #F0EBF5}
    .total{font-size:20px;font-weight:900;color:#9B27AF}
    .footer{text-align:center;margin-top:24px;color:#7B6B90;font-size:12px;font-style:italic}
    </style></head><body>
    <div class="brand"><img class="logo" src="${logo}" alt="TOKEY MIGHTY WORKS" /><h1>TOKEY MIGHTY WORKS</h1><p class="tagline">...Zenith of Creativity</p></div>
    <p><strong>Invoice No:</strong> ${sale.invoiceNo} &nbsp;&nbsp; <strong>Date:</strong> ${fmtDate(sale.createdAt)}<br>
    <strong>Customer:</strong> ${sale.customerName} &nbsp;&nbsp; <strong>Staff:</strong> ${sale.createdByName||""}</p>
    <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
    ${sale.items?.map(i=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>₦${Number(i.price).toFixed(2)}</td><td>₦${(i.qty*i.price).toFixed(2)}</td></tr>`).join("")}
    </table>
    <p>Subtotal: ₦${Number(sale.subtotal).toFixed(2)}<br>Discount: ₦${Number(sale.discount).toFixed(2)}</p>
    <p class="total">TOTAL: ₦${Number(sale.total).toFixed(2)}</p>
    ${sale.notes?`<p><em>Notes: ${sale.notes}</em></p>`:""}
    <div class="footer">Thank you for your business! — TOKEY MIGHTY WORKS, ...Zenith of Creativity</div>
    </body></html>`);
    w.print();
  };
  return(
    <Card>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8 }}>
        <div>
          <h3 style={{ margin:0,fontSize:20,fontWeight:900,background:`linear-gradient(135deg,${B.purple},${B.cyan})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" }}>{sale.invoiceNo}</h3>
          <p style={{ margin:"4px 0 0",fontSize:12,color:B.muted }}>{fmtDate(sale.createdAt)} · by {sale.createdByName}</p>
        </div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          <Btn sm icon="download" v="cyan" onClick={print}>Print / PDF</Btn>
          {canProcessRefund&&<Btn sm v="cyan" icon="check" onClick={onDelete}>Return / Refund</Btn>}
          {canDelete&&<Btn sm v="danger" icon="trash" onClick={onDelete}>Delete Sale</Btn>}
          <Btn sm v="secondary" onClick={onClose}>← Back</Btn>
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16 }}>
        <p style={{ margin:"4px 0",fontSize:13 }}><strong>Customer:</strong> {sale.customerName}</p>
        <p style={{ margin:"4px 0",fontSize:13 }}><strong>Status:</strong> <Badge color={B.lime}>{sale.status}</Badge></p>
      </div>
      <table style={{ width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:16 }}>
        <thead><tr style={{ background:B.light }}>
          {["Item","Qty","Price","Total"].map(h=><th key={h} style={{ padding:"9px 12px",textAlign:h==="Item"?"left":"right",fontSize:11,textTransform:"uppercase",letterSpacing:.6,color:B.muted,borderBottom:`2px solid ${B.border}` }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {sale.items?.map((item,i)=>(
            <tr key={i} style={{ borderBottom:`1px solid ${B.gray}` }}>
              <td style={{ padding:"9px 12px",fontWeight:600 }}>{item.name}</td>
              <td style={{ padding:"9px 12px",textAlign:"right" }}>{item.qty}</td>
              <td style={{ padding:"9px 12px",textAlign:"right" }}>{php(item.price)}</td>
              <td style={{ padding:"9px 12px",textAlign:"right",fontWeight:700,color:B.purple }}>{php(item.qty*item.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:"flex",justifyContent:"flex-end" }}>
        <div style={{ width:240,background:B.light,borderRadius:12,padding:16 }}>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13 }}><span>Subtotal</span><span>{php(sale.subtotal)}</span></div>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13 }}><span>Discount</span><span>-{php(sale.discount)}</span></div>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:16,fontWeight:900,borderTop:`2px solid ${B.border}`,color:B.purple }}><span>TOTAL</span><span>{php(sale.total)}</span></div>
        </div>
      </div>
      {sale.notes&&<p style={{ fontSize:13,color:B.muted,marginTop:12 }}><em>Notes: {sale.notes}</em></p>}
    </Card>
  );
}

// ============================================================
// SERVICE JOBS
// ============================================================
function ServicePage({state,update,cu,audit,toast}){
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [viewJob,setViewJob]=useState(null);

  const jobs=[...state.serviceJobs].reverse().filter(j=>
    j.jobNo?.toLowerCase().includes(search.toLowerCase())||
    j.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const save=async()=>{
    if(!form.customerName){toast("Customer name is required","error");return;}
    const pT=form.parts?.reduce((a,p)=>a+(+p.qty*+p.price),0)||0;
    const sT=form.services?.reduce((a,s)=>a+(+s.price),0)||0;
    const total=pT+sT+(+form.laborCharge||0);
    const job={...form,id:form.id||uid(),jobNo:form.jobNo||`JOB-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`,partsTotal:pT,servicesTotal:sT,total,createdAt:form.createdAt||new Date().toISOString(),createdBy:form.createdBy||cu.id,createdByName:form.createdByName||cu.name};
    await update("serviceJobs",job);
    await audit(form.id?"Update Service Job":"New Service Job",`${job.jobNo}`,cu);
    toast(`Job ${job.jobNo} saved!`);
    setModal(null);
  };

  const updateStatus=async(job,status)=>{
    await update("serviceJobs",{...job,status});
    await audit("Update Job Status",`${job.jobNo} → ${status}`,cu);
    toast(`Status updated to ${status}`);
    if(viewJob?.id===job.id) setViewJob({...job,status});
  };

  return(
    <div>
      <PageHead title="Service Jobs">
        {(can(cu,"manageService")||can(cu,"createServiceJobs"))&&<Btn icon="plus" onClick={()=>{setForm({services:[],parts:[],laborCharge:0,status:"pending"});setModal("form");}}>New Job</Btn>}
      </PageHead>

      {viewJob
        ? <JobDetail job={viewJob} onClose={()=>setViewJob(null)} onUpdateStatus={updateStatus} cu={cu}/>
        : <>
            <div style={{ position:"relative",marginBottom:16 }}>
              <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:B.muted }}><SVG name="search" size={16}/></span>
              <Inp placeholder="Search by job # or customer…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:38 }}/>
            </div>
            <Card style={{ padding:0 }}>
              <Tbl
                cols={[
                  {k:"jobNo",l:"Job #",r:r=><strong style={{ color:B.cyan }}>{r.jobNo}</strong>},
                  {k:"createdAt",l:"Date",r:r=>fmtDate(r.createdAt)},
                  {k:"customerName",l:"Customer"},
                  {k:"total",l:"Total",r:r=><strong>{php(r.total)}</strong>},
                  {k:"status",l:"Status",r:r=><Badge color={r.status==="completed"?B.lime:r.status==="in-progress"?B.cyan:"#e67e22"}>{r.status}</Badge>},
                  {k:"createdByName",l:"By"},
                ]}
                data={jobs}
                actions={r=><Btn sm v="ghostCyan" onClick={()=>setViewJob(r)}>View</Btn>}
              />
            </Card>
          </>
      }

      {modal==="form"&&(
        <Modal title="New Service Job" onClose={()=>setModal(null)} wide>
          <div style={{ display:"grid",gridTemplateColumns:"1fr",gap:"0 14px" }}>
            <Field label="Customer Name" req><Inp value={form.customerName||""} onChange={e=>setForm(f=>({...f,customerName:e.target.value}))}/></Field>
          </div>

          <Field label="Services">
            <div style={{ marginBottom:8 }}>
              <Sel onChange={e=>{const sv=JSON.parse(e.target.value);setForm(f=>({...f,services:[...(f.services||[]),{serviceId:sv.id,name:sv.name,price:sv.basePrice}]}))}} value="">
                <option value="">+ Add a service…</option>
                {state.services.map(s=><option key={s.id} value={JSON.stringify(s)}>{s.name} (₦{s.basePrice})</option>)}
              </Sel>
            </div>
            {form.services?.map((s,i)=>(
              <div key={i} style={{ display:"flex",gap:8,marginBottom:6,alignItems:"center" }}>
                <span style={{ flex:1,fontSize:13,fontWeight:600 }}>{s.name}</span>
                <Inp type="number" value={s.price} onChange={e=>setForm(f=>({...f,services:f.services.map((x,j)=>j===i?{...x,price:+e.target.value}:x)}))} style={{ width:120 }}/>
                <button onClick={()=>setForm(f=>({...f,services:f.services.filter((_,j)=>j!==i)}))} style={{ background:"none",border:"none",cursor:"pointer",color:"#e74c3c" }}><SVG name="trash" size={15}/></button>
              </div>
            ))}
          </Field>

          <Field label="Inventory Used">
            <div style={{ marginBottom:8 }}>
              <Sel onChange={e=>{const p=JSON.parse(e.target.value);setForm(f=>({...f,parts:[...(f.parts||[]),{productId:p.id,name:p.name,qty:1,price:p.price,cost:p.cost}]}))}} value="">
                <option value="">+ Add a part…</option>
                {state.products.map(p=><option key={p.id} value={JSON.stringify(p)}>{p.name} (Stock:{p.stock})</option>)}
              </Sel>
            </div>
            {form.parts?.map((p,i)=>(
              <div key={i} style={{ display:"flex",gap:8,marginBottom:6,alignItems:"center" }}>
                <span style={{ flex:1,fontSize:13,fontWeight:600 }}>{p.name}</span>
                <Inp type="number" min={1} value={p.qty} onChange={e=>setForm(f=>({...f,parts:f.parts.map((x,j)=>j===i?{...x,qty:+e.target.value}:x)}))} style={{ width:70 }} placeholder="Qty"/>
                <Inp type="number" value={p.price} onChange={e=>setForm(f=>({...f,parts:f.parts.map((x,j)=>j===i?{...x,price:+e.target.value}:x)}))} style={{ width:110 }} placeholder="Price"/>
                <button onClick={()=>setForm(f=>({...f,parts:f.parts.filter((_,j)=>j!==i)}))} style={{ background:"none",border:"none",cursor:"pointer",color:"#e74c3c" }}><SVG name="trash" size={15}/></button>
              </div>
            ))}
          </Field>

          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px" }}>
            <Field label="Labor Charge (₦)"><Inp type="number" value={form.laborCharge||0} onChange={e=>setForm(f=>({...f,laborCharge:e.target.value}))}/></Field>
            <Field label="Status">
              <Sel value={form.status||"pending"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
              </Sel>
            </Field>
          </div>
          <Field label="Notes"><Txt value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Additional remarks…" style={{ minHeight:52 }}/></Field>

          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:16 }}>
            <Btn v="secondary" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn v="cyan" onClick={save}>Save Job Order</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function JobDetail({job,onClose,onUpdateStatus,cu}){
  const print=()=>{
    const w=window.open("","_blank");
    w.document.write(`<html><head><title>${job.jobNo}</title><style>
    body{font-family:Arial;padding:30px;max-width:680px;margin:0 auto;color:#2D1B4E}
    h1{color:#9B27AF}h2{color:#00B4D8}
    table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #F0EBF5;text-align:left}th{background:#F5F0FA;font-size:11px;text-transform:uppercase}
    </style></head><body>
    <h1>TOKEY MIGHTY WORKS</h1><p style="font-style:italic;color:#7B6B90">...Zenith of Creativity</p>
    <h2>Job Order: ${job.jobNo}</h2>
    <p><strong>Customer:</strong> ${job.customerName}<br><strong>Date:</strong> ${fmtDate(job.createdAt)}<br><strong>Status:</strong> ${job.status}</p>
    <h3>Services</h3><table><tr><th>Service</th><th>Charge</th></tr>${job.services?.map(s=>`<tr><td>${s.name}</td><td>₦${s.price}</td></tr>`).join("")||"<tr><td colspan=2>None</td></tr>"}</table>
    <h3>Inventory Used</h3><table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${job.parts?.map(p=>`<tr><td>${p.name}</td><td>${p.qty}</td><td>₦${p.price}</td><td>₦${p.qty*p.price}</td></tr>`).join("")||"<tr><td colspan=4>None</td></tr>"}</table>
    <p>Labor: ₦${job.laborCharge||0}</p>
    <h2>TOTAL: ₦${Number(job.total).toFixed(2)}</h2>
    ${job.notes?`<p><em>${job.notes}</em></p>`:""}
    <p style="margin-top:32px;text-align:center;color:#7B6B90;font-size:12px">TOKEY MIGHTY WORKS — Zenith of Creativity</p>
    </body></html>`);
    w.print();
  };
  return(
    <Card>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:8 }}>
        <div>
          <h3 style={{ margin:0,fontSize:20,fontWeight:900,color:B.cyan }}>{job.jobNo}</h3>
          <p style={{ margin:"4px 0 0",fontSize:12,color:B.muted }}>{fmtDate(job.createdAt)} · by {job.createdByName}</p>
        </div>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          {job.status==="pending"&&(can(cu,"manageService")||can(cu,"updateServiceStatus"))&&<Btn sm v="lime" onClick={()=>onUpdateStatus(job,"in-progress")}>Mark In Progress</Btn>}
          {job.status==="in-progress"&&(can(cu,"manageService")||can(cu,"updateServiceStatus"))&&<Btn sm v="lime" onClick={()=>onUpdateStatus(job,"completed")}>Mark Completed</Btn>}
          <Btn sm v="cyan" icon="download" onClick={print}>Print</Btn>
          <Btn sm v="secondary" onClick={onClose}>← Back</Btn>
        </div>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20 }}>
        <div style={{ background:B.light,borderRadius:10,padding:12 }}><div style={{ fontSize:11,color:B.muted,fontWeight:700 }}>CUSTOMER</div><div style={{ fontWeight:700,color:B.dark,marginTop:3 }}>{job.customerName}</div></div>
        <div style={{ background:B.light,borderRadius:10,padding:12 }}><div style={{ fontSize:11,color:B.muted,fontWeight:700 }}>STATUS</div><div style={{ marginTop:3 }}><Badge color={job.status==="completed"?B.lime:job.status==="in-progress"?B.cyan:"#e67e22"}>{job.status}</Badge></div></div>
      </div>
      {job.services?.length>0&&<>
        <h4 style={{ fontSize:12,fontWeight:800,color:B.muted,textTransform:"uppercase",letterSpacing:.7,marginBottom:8 }}>Services</h4>
        {job.services.map((s,i)=><div key={i} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}><span style={{ fontWeight:600 }}>{s.name}</span><strong>{php(s.price)}</strong></div>)}
      </>}
      {job.parts?.length>0&&<>
        <h4 style={{ fontSize:12,fontWeight:800,color:B.muted,textTransform:"uppercase",letterSpacing:.7,margin:"14px 0 8px" }}>Inventory Used</h4>
        {job.parts.map((p,i)=><div key={i} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}><span style={{ fontWeight:600 }}>{p.name} <span style={{ color:B.muted }}>×{p.qty}</span></span><strong>{php(p.qty*p.price)}</strong></div>)}
      </>}
      {job.notes&&<p style={{ fontSize:13,color:B.muted,marginTop:12,fontStyle:"italic" }}>Notes: {job.notes}</p>}
      <div style={{ display:"flex",justifyContent:"flex-end",marginTop:16 }}>
        <div style={{ width:240,background:B.light,borderRadius:12,padding:16 }}>
          {job.servicesTotal>0&&<div style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13 }}><span>Services</span><span>{php(job.servicesTotal)}</span></div>}
          {job.partsTotal>0&&<div style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13 }}><span>Parts</span><span>{php(job.partsTotal)}</span></div>}
          <div style={{ display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:13 }}><span>Labor</span><span>{php(job.laborCharge)}</span></div>
          <div style={{ display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:16,fontWeight:900,borderTop:`2px solid ${B.border}`,color:B.cyan }}><span>TOTAL</span><span>{php(job.total)}</span></div>
        </div>
      </div>
    </Card>
  );
}

// ============================================================
// CUSTOMERS
// ============================================================
function CustomersPage({state,update,remove,cu,audit,toast}){
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [search,setSearch]=useState("");

  const customers=state.customers.filter(c=>c.name?.toLowerCase().includes(search.toLowerCase())||c.phone?.includes(search));
  const save=async()=>{
    if(!form.name){toast("Name is required","error");return;}
    const item={...form,id:form.id||uid(),createdAt:form.createdAt||new Date().toISOString()};
    await update("customers",item);
    await audit(form.id?"Edit Customer":"Add Customer",form.name,cu);
    toast("Customer saved!"); setModal(null);
  };

  return(
    <div>
      <PageHead title="Customers">
        {can(cu,"manageCustomers")&&<Btn icon="plus" onClick={()=>{setForm({});setModal("form");}}>Add Customer</Btn>}
      </PageHead>
      <div style={{ position:"relative",marginBottom:16 }}>
        <span style={{ position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:B.muted }}><SVG name="search" size={16}/></span>
        <Inp placeholder="Search by name or phone…" value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:38 }}/>
      </div>
      <Card style={{ padding:0 }}>
        <Tbl
          cols={[
            {k:"name",l:"Name",r:r=><strong>{r.name}</strong>},
            {k:"phone",l:"Phone"},{k:"email",l:"Email"},{k:"address",l:"Address"},
            {k:"createdAt",l:"Since",r:r=>fmtDate(r.createdAt)},
          ]}
          data={customers}
          actions={r=>(
            <div style={{ display:"flex",gap:5 }}>
              {can(cu,"manageCustomers")&&<Btn sm v="secondary" icon="edit" onClick={()=>{setForm(r);setModal("form");}}/>}
              {can(cu,"all")&&<Btn sm v="danger" icon="trash" onClick={()=>{if(window.confirm("Delete?"))remove("customers",r.id);}}/>}
            </div>
          )}
        />
      </Card>
      {modal&&(
        <Modal title={form.id?"Edit Customer":"New Customer"} onClose={()=>setModal(null)}>
          <Field label="Full Name" req><Inp value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Field>
          <Field label="Phone"><Inp value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></Field>
          <Field label="Email"><Inp value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></Field>
          <Field label="Address"><Inp value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></Field>
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:16 }}>
            <Btn v="secondary" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn onClick={save}>Save Customer</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// SERVICE CATALOG
// ============================================================
function ServiceCatalogPage({state,update,remove,cu,audit,toast}){
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const save=async()=>{
    await update("services",{...form,id:form.id||uid(),active:true});
    await audit(form.id?"Edit Service":"Add Service",form.name,cu);
    toast("Service saved!"); setModal(null);
  };
  return(
    <div>
      <PageHead title="Service Catalog">
        {(can(cu,"manageServiceCategories")||can(cu,"all"))&&<Btn icon="plus" onClick={()=>{setForm({basePrice:0});setModal("form");}}>Add Service</Btn>}
      </PageHead>
      <Card style={{ padding:0 }}>
        <Tbl
          cols={[{k:"name",l:"Service Name",r:r=><strong>{r.name}</strong>},{k:"category",l:"Category"},{k:"basePrice",l:"Base Price",r:r=>php(r.basePrice)}]}
          data={state.services}
          actions={r=>(
            <div style={{ display:"flex",gap:5 }}>
              <Btn sm v="secondary" icon="edit" onClick={()=>{setForm(r);setModal("form");}}/>
              {can(cu,"all")&&<Btn sm v="danger" icon="trash" onClick={()=>{if(window.confirm("Delete?"))remove("services",r.id);}}/>}
            </div>
          )}
        />
      </Card>
      {modal&&(
        <Modal title={form.id?"Edit Service":"Add Service"} onClose={()=>setModal(null)}>
          <Field label="Service Name" req><Inp value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Field>
          <Field label="Category"><Inp value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))}/></Field>
          <Field label="Base Price (₦)"><Inp type="number" value={form.basePrice||0} onChange={e=>setForm(f=>({...f,basePrice:+e.target.value}))}/></Field>
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:16 }}>
            <Btn v="secondary" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn onClick={save}>Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// REPORTS
// ============================================================
function ReportsPage({state,cu}){
  const [period,setPeriod]=useState("month");
  const now=new Date();
  const flt=items=>items.filter(item=>{
    const d=new Date(item.createdAt);
    if(period==="today") return d.toDateString()===now.toDateString();
    if(period==="week"){ const w=new Date(now); w.setDate(now.getDate()-7); return d>=w; }
    if(period==="month") return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(period==="year") return d.getFullYear()===now.getFullYear();
    return true;
  });

  const fSales=flt(state.sales);
  const fJobs=flt(state.serviceJobs);
  const sRev=fSales.reduce((a,s)=>a+s.total,0);
  const jRev=fJobs.reduce((a,j)=>a+j.total,0);
  const profit=fSales.reduce((a,s)=>a+(s.profit||0),0);

  const topProds={};
  fSales.forEach(s=>s.items?.forEach(i=>{topProds[i.name]=(topProds[i.name]||0)+i.qty*i.price;}));
  const top=Object.entries(topProds).sort((a,b)=>b[1]-a[1]).slice(0,6);

  const exportCSV=(data,fn)=>{
    if(!data.length){toast("No data","warning");return;}
    const keys=Object.keys(data[0]);
    const csv=[keys.join(","),...data.map(r=>keys.map(k=>`"${r[k]||""}"`).join(","))].join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=fn;a.click();
  };

  const periods=["today","week","month","year","all"];
  return(
    <div>
      <PageHead title="Reports & Analytics">
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {periods.map(p=>(
            <button key={p} onClick={()=>setPeriod(p)} style={{ padding:"6px 14px",borderRadius:8,border:`1.5px solid ${period===p?B.purple:B.border}`,background:period===p?B.purple:B.white,color:period===p?B.white:B.muted,fontWeight:700,cursor:"pointer",fontSize:12,textTransform:"capitalize" }}>{p}</button>
          ))}
        </div>
      </PageHead>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16,marginBottom:22 }}>
        <StatCard label="Sales Revenue" value={php(sRev)} icon="sales" color={B.purple}/>
        <StatCard label="Service Revenue" value={php(jRev)} icon="service" color={B.cyan}/>
        <StatCard label="Combined Revenue" value={php(sRev+jRev)} icon="reports" color={B.lime}/>
        <StatCard label="Gross Profit" value={php(profit)} icon="chart" color={B.purpleD} sub={`${fSales.length} sales · ${fJobs.length} jobs`}/>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16 }}>
        <Card>
          <h3 style={{ margin:"0 0 14px",fontSize:14,fontWeight:800,color:B.dark }}>Top Products by Revenue</h3>
          {top.length===0?<p style={{ color:B.muted,fontSize:13 }}>No sales data for this period.</p>
            :top.map(([name,rev],i)=>(
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4 }}>
                  <span style={{ fontWeight:700,color:B.text }}>{name}</span><span style={{ color:B.purple,fontWeight:700 }}>{php(rev)}</span>
                </div>
                <div style={{ height:7,background:B.gray,borderRadius:4 }}>
                  <div style={{ height:"100%",background:`linear-gradient(90deg,${B.purple},${B.cyan})`,borderRadius:4,width:`${(rev/top[0][1])*100}%`,transition:"width .5s" }}/>
                </div>
              </div>
            ))}
        </Card>
        <Card>
          <h3 style={{ margin:"0 0 14px",fontSize:14,fontWeight:800,color:B.dark }}>Service Jobs Summary</h3>
          {["pending","in-progress","completed"].map(st=>{
            const cnt=fJobs.filter(j=>j.status===st).length;
            const rev=fJobs.filter(j=>j.status===st).reduce((a,j)=>a+j.total,0);
            return(
              <div key={st} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}>
                <Badge color={st==="completed"?B.lime:st==="in-progress"?B.cyan:"#e67e22"}>{st}</Badge>
                <span><strong>{cnt}</strong> job(s) · <strong>{php(rev)}</strong></span>
              </div>
            );
          })}
          <div style={{ padding:"9px 0",display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:800 }}>
            <span>Total</span><span style={{ color:B.cyan }}>{php(jRev)}</span>
          </div>
        </Card>
      </div>

      <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
        <Btn v="ghost" icon="download" onClick={()=>exportCSV(fSales.map(s=>({Invoice:s.invoiceNo,Date:fmtDate(s.createdAt),Customer:s.customerName,Items:s.items?.length||0,Total:s.total,Profit:s.profit||0,By:s.createdByName,Status:s.status})),"sales-report.csv")}>Export Sales CSV</Btn>
        <Btn v="ghostCyan" icon="download" onClick={()=>exportCSV(fJobs.map(j=>({JobNo:j.jobNo,Date:fmtDate(j.createdAt),Customer:j.customerName,Total:j.total,Status:j.status,By:j.createdByName})),"service-report.csv")}>Export Service CSV</Btn>
        <Btn v="ghost" icon="download" onClick={()=>exportCSV(state.products.map(p=>({Name:p.name,Category:p.category,Stock:p.stock,MinStock:p.minStock,Price:p.price,Cost:p.cost,Unit:p.unit})),"inventory-report.csv")}>Export Inventory CSV</Btn>
        <Btn v="ghost" icon="download" onClick={()=>exportCSV(state.stockMovements.map(m=>({Date:fmtDateTime(m.createdAt),Product:m.productName,Type:m.type,Qty:m.qty,Before:m.before,After:m.after,Reason:m.reason,By:m.createdBy})),"stock-movements.csv")}>Export Stock Movements</Btn>
      </div>
    </div>
  );
}

// ============================================================
// USERS PAGE
// ============================================================
function UsersPage({state,update,remove,cu,audit,toast}){
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});

  if(!can(cu,"manageStaff")&&!can(cu,"all"))
    return <Card><p style={{ color:B.muted,textAlign:"center",padding:36 }}>You don't have permission to manage users.</p></Card>;

  const canCreateAdmin = can(cu,"all"); // only superadmin
  const save=async()=>{
    if(!form.name||!form.username){toast("Name and username required","error");return;}
    if(!form.id&&!form.password){toast("Password required for new user","error");return;}
    if(!canCreateAdmin&&form.role==="admin"){toast("You cannot create Admin accounts","error");return;}
    if(!canCreateAdmin&&form.role==="superadmin"){toast("Unauthorized","error");return;}
    const item={...form,id:form.id||uid(),active:form.active!==false,createdAt:form.createdAt||new Date().toISOString()};
    await update("users",item);
    await audit(form.id?"Edit User":"Add User",`${item.name} (${item.role})`,cu);
    toast("User saved!"); setModal(null);
  };

  const suspend=async u=>{
    await update("users",{...u,active:!u.active});
    await audit(u.active?"Suspend User":"Activate User",u.name,cu);
    toast(`User ${u.active?"suspended":"activated"}`);
  };

  const roleColor={superadmin:B.purple,admin:B.cyan,staff:B.lime};
  return(
    <div>
      <PageHead title="User Management">
        <Btn icon="plus" onClick={()=>{setForm({role:"staff",active:true});setModal("form");}}>Add User</Btn>
      </PageHead>
      <Card style={{ padding:0 }}>
        <Tbl
          cols={[
            {k:"name",l:"Name",r:r=><strong>{r.name}</strong>},
            {k:"username",l:"Username"},
            {k:"role",l:"Role",r:r=><Badge color={roleColor[r.role]||B.muted}>{r.role}</Badge>},
            {k:"active",l:"Status",r:r=><Badge color={r.active?B.lime:"#999"}>{r.active?"Active":"Suspended"}</Badge>},
            {k:"createdAt",l:"Created",r:r=>fmtDate(r.createdAt)},
          ]}
          data={state.users}
          actions={r=>(
            <div style={{ display:"flex",gap:5 }}>
              <Btn sm v="secondary" icon="edit" onClick={()=>{setForm({...r,password:""});setModal("form");}}/>
              {r.id!==cu.id&&<Btn sm v={r.active?"secondary":"lime"} onClick={()=>suspend(r)}>{r.active?"Suspend":"Activate"}</Btn>}
            </div>
          )}
        />
      </Card>
      {modal&&(
        <Modal title={form.id?"Edit User":"Add User"} onClose={()=>setModal(null)}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 14px" }}>
            <Field label="Full Name" req><Inp value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></Field>
            <Field label="Username" req><Inp value={form.username||""} onChange={e=>setForm(f=>({...f,username:e.target.value}))}/></Field>
            <Field label={form.id?"New Password (leave blank to keep)":"Password"} req={!form.id}><Inp type="password" value={form.password||""} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/></Field>
            <Field label="Role">
              <Sel value={form.role||"staff"} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                {canCreateAdmin&&<option value="superadmin">Super Admin (Owner)</option>}
                {canCreateAdmin&&<option value="admin">Admin (Manager)</option>}
                <option value="staff">Staff</option>
              </Sel>
            </Field>
          </div>
          <div style={{ background:B.light,borderRadius:10,padding:14,marginTop:8,fontSize:12,color:B.muted }}>
            <strong style={{ color:B.dark }}>Role permissions:</strong><br/>
            {form.role==="superadmin"&&"Full system access — no restrictions."}
            {form.role==="admin"&&"Manage inventory, sales, service, customers, staff. Cannot change system settings or view audit logs."}
            {form.role==="staff"&&"Record sales/services, update job status, search inventory, view own performance only."}
          </div>
          <div style={{ display:"flex",gap:8,justifyContent:"flex-end",marginTop:16 }}>
            <Btn v="secondary" onClick={()=>setModal(null)}>Cancel</Btn>
            <Btn onClick={save}>Save User</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// AUDIT LOG
// ============================================================
function AuditPage({state,cu}){
  if(!can(cu,"all"))
    return <Card><p style={{ color:B.muted,textAlign:"center",padding:36 }}>Audit logs are only accessible to the Super Admin.</p></Card>;
  const roleColor={superadmin:B.purple,admin:B.cyan,staff:B.lime};
  return(
    <div>
      <PageHead title="Audit Log"/>
      <Card style={{ padding:0 }}>
        <Tbl
          cols={[
            {k:"createdAt",l:"Date & Time",r:r=>fmtDateTime(r.createdAt)},
            {k:"userName",l:"User"},
            {k:"role",l:"Role",r:r=><Badge color={roleColor[r.role]||B.muted}>{r.role}</Badge>},
            {k:"action",l:"Action",r:r=><strong style={{ color:B.purple }}>{r.action}</strong>},
            {k:"detail",l:"Detail"},
          ]}
          data={[...state.auditLog].reverse()}
        />
      </Card>
    </div>
  );
}

// ============================================================
// MY PERFORMANCE (staff)
// ============================================================
function MyPerformancePage({state,cu}){
  const mySales=state.sales.filter(s=>s.createdBy===cu.id);
  const myJobs=state.serviceJobs.filter(j=>j.createdBy===cu.id);
  const myRev=mySales.reduce((a,s)=>a+s.total,0);
  const myJRev=myJobs.reduce((a,j)=>a+j.total,0);
  return(
    <div>
      <PageHead title={`My Performance — ${cu.name}`}/>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16,marginBottom:22 }}>
        <StatCard label="My Sales Count" value={mySales.length} icon="sales" color={B.purple}/>
        <StatCard label="My Sales Revenue" value={php(myRev)} icon="invoice" color={B.cyan}/>
        <StatCard label="My Service Jobs" value={myJobs.length} icon="service" color={B.lime}/>
        <StatCard label="My Service Revenue" value={php(myJRev)} icon="chart" color={B.purpleD}/>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
        <Card>
          <h3 style={{ margin:"0 0 12px",fontSize:14,fontWeight:800,color:B.dark }}>My Recent Sales</h3>
          {mySales.slice(-6).reverse().map(s=>(
            <div key={s.id} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}>
              <div><div style={{ fontWeight:700 }}>{s.invoiceNo}</div><div style={{ color:B.muted,fontSize:11 }}>{s.customerName} · {fmtDate(s.createdAt)}</div></div>
              <strong style={{ color:B.purple }}>{php(s.total)}</strong>
            </div>
          ))}
          {mySales.length===0&&<p style={{ color:B.muted,fontSize:13 }}>No sales recorded yet.</p>}
        </Card>
        <Card>
          <h3 style={{ margin:"0 0 12px",fontSize:14,fontWeight:800,color:B.dark }}>My Service Jobs</h3>
          {myJobs.slice(-6).reverse().map(j=>(
            <div key={j.id} style={{ display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${B.gray}`,fontSize:13 }}>
              <div><div style={{ fontWeight:700 }}>{j.jobNo}</div><div style={{ color:B.muted,fontSize:11 }}>{j.customerName} · {fmtDate(j.createdAt)}</div></div>
              <Badge color={j.status==="completed"?B.lime:j.status==="in-progress"?B.cyan:"#e67e22"}>{j.status}</Badge>
            </div>
          ))}
          {myJobs.length===0&&<p style={{ color:B.muted,fontSize:13 }}>No jobs recorded yet.</p>}
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// EXPENDITURES PAGE
// ============================================================
const EXPENSE_CATEGORIES = [
  "Rent / Utilities","Salaries / Wages","Supplies & Materials","Equipment & Tools",
  "Vehicle & Fuel","Marketing & Advertising","Repairs & Maintenance","Government Fees & Taxes",
  "Office Expenses","Miscellaneous",
];

function ExpendituresPage({ state, update, remove, cu, audit, toast }) {
  const [tab, setTab] = useState("list");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterPeriod, setFilterPeriod] = useState("month");

  const canManage = can(cu, "manageSales") || can(cu, "all");
  const canDelete = can(cu, "all");

  const now = new Date();
  const periodFilter = items => items.filter(item => {
    const d = new Date(item.date || item.createdAt);
    if (filterPeriod === "today") return d.toDateString() === now.toDateString();
    if (filterPeriod === "week") { const w = new Date(now); w.setDate(now.getDate()-7); return d >= w; }
    if (filterPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (filterPeriod === "year") return d.getFullYear() === now.getFullYear();
    return true;
  });

  const allExp = [...state.expenditures].sort((a,b) => new Date(b.date||b.createdAt) - new Date(a.date||a.createdAt));
  const periodExp = periodFilter(allExp);
  const filtered = periodExp.filter(e =>
    (filterCat === "all" || e.category === filterCat) &&
    (e.title?.toLowerCase().includes(search.toLowerCase()) ||
     e.category?.toLowerCase().includes(search.toLowerCase()) ||
     e.paidTo?.toLowerCase().includes(search.toLowerCase()))
  );

  // Summary stats
  const totalSpent = periodExp.reduce((a, e) => a + (+e.amount || 0), 0);
  const byCategory = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: periodExp.filter(e => e.category === cat).reduce((a, e) => a + (+e.amount || 0), 0),
    count: periodExp.filter(e => e.category === cat).length,
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

  // P&L quick view
  const salesRev = periodFilter(state.sales).reduce((a, s) => a + s.total, 0);
  const svcRev = periodFilter(state.serviceJobs).reduce((a, j) => a + j.total, 0);
  const grossProfit = periodFilter(state.sales).reduce((a, s) => a + (s.profit || 0), 0);
  const netProfit = grossProfit - totalSpent;

  const saveExpense = async () => {
    if (!form.title) { toast("Title / description is required", "error"); return; }
    if (!form.amount || +form.amount <= 0) { toast("Amount must be greater than 0", "error"); return; }
    if (!form.category) { toast("Please select a category", "error"); return; }
    const item = {
      ...form,
      id: form.id || uid(),
      amount: +form.amount,
      date: form.date || new Date().toISOString().split("T")[0],
      createdAt: form.createdAt || new Date().toISOString(),
      createdBy: form.createdBy || cu.name,
    };
    await update("expenditures", item);
    await audit(form.id ? "Edit Expenditure" : "Add Expenditure", `${item.title} — ${php(item.amount)}`, cu);
    toast(`Expense ${form.id ? "updated" : "recorded"} successfully`);
    setModal(null);
    setForm({});
  };

  const deleteExpense = async id => {
    if (!window.confirm("Delete this expense record?")) return;
    await remove("expenditures", id);
    await audit("Delete Expenditure", id, cu);
    toast("Expense deleted");
  };

  const exportCSV = () => {
    if (!filtered.length) { toast("No data to export", "warning"); return; }
    const keys = ["date","title","category","amount","paidTo","paymentMethod","reference","note","createdBy"];
    const csv = [keys.join(","), ...filtered.map(r => keys.map(k => `"${r[k]||""}"`).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    a.download = `expenditures-${filterPeriod}.csv`; a.click();
  };

  return (
    <div>
      <PageHead title="Expenditures">
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {canManage && <Btn icon="plus" onClick={() => { setForm({ category: EXPENSE_CATEGORIES[0], paymentMethod:"Cash", date: new Date().toISOString().split("T")[0] }); setModal("form"); }}>Add Expense</Btn>}
          <Btn v="ghost" icon="download" onClick={exportCSV}>Export CSV</Btn>
        </div>
      </PageHead>

      {/* Period filter */}
      <div style={{ display:"flex", gap:6, marginBottom:18, flexWrap:"wrap" }}>
        {["today","week","month","year","all"].map(p => (
          <button key={p} onClick={() => setFilterPeriod(p)} style={{ padding:"6px 14px", borderRadius:8, border:`1.5px solid ${filterPeriod===p?B.purple:B.border}`, background:filterPeriod===p?B.purple:B.white, color:filterPeriod===p?B.white:B.muted, fontWeight:700, cursor:"pointer", fontSize:12, textTransform:"capitalize" }}>{p}</button>
        ))}
      </div>

      {/* Summary stat cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:20 }}>
        <StatCard label="Total Expenses" value={php(totalSpent)} icon="expense" color="#e74c3c" sub={`${periodExp.length} record(s)`}/>
        <StatCard label="Total Revenue" value={php(salesRev + svcRev)} icon="sales" color={B.cyan}/>
        <StatCard label="Gross Profit" value={php(grossProfit)} icon="chart" color={B.lime}/>
        <StatCard label="Net Profit" value={php(netProfit)} icon="money" color={netProfit >= 0 ? B.lime : "#e74c3c"} sub={netProfit >= 0 ? "Profitable ✓" : "Operating at Loss"}/>
      </div>

      <Tabs
        tabs={[{ k:"list", l:"All Expenses", icon:"expense" }, { k:"summary", l:"By Category", icon:"tag" }, { k:"pl", l:"P&L Overview", icon:"reports" }]}
        active={tab}
        onChange={setTab}
      />

      {tab === "list" && (
        <>
          <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
            <div style={{ position:"relative", flex:1, minWidth:200 }}>
              <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted }}><SVG name="search" size={16}/></span>
              <Inp placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft:38 }}/>
            </div>
            <Sel value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width:220 }}>
              <option value="all">All Categories</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Sel>
          </div>
          <Card style={{ padding:0 }}>
            <Tbl
              cols={[
                { k:"date", l:"Date", r:r => <span style={{ fontWeight:600 }}>{fmtDate(r.date || r.createdAt)}</span> },
                { k:"title", l:"Description", r:r => <strong>{r.title}</strong> },
                { k:"category", l:"Category", r:r => <Badge color={B.purple}>{r.category}</Badge> },
                { k:"amount", l:"Amount", r:r => <strong style={{ color:"#e74c3c", fontSize:14 }}>{php(r.amount)}</strong> },
                { k:"paidTo", l:"Paid To", r:r => r.paidTo || <span style={{ color:B.muted }}>—</span> },
                { k:"paymentMethod", l:"Method", r:r => <Badge color={r.paymentMethod==="Cash"?B.lime:r.paymentMethod==="GCash"?B.cyan:B.purple}>{r.paymentMethod||"Cash"}</Badge> },
                { k:"createdBy", l:"By" },
              ]}
              data={filtered}
              actions={r => (
                <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
                  {canManage && <Btn sm v="secondary" icon="edit" onClick={() => { setForm({ ...r }); setModal("form"); }}/>}
                  {canDelete && <Btn sm v="danger" icon="trash" onClick={() => deleteExpense(r.id)}/>}
                </div>
              )}
            />
          </Card>
          {filtered.length > 0 && (
            <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12 }}>
              <div style={{ background:B.white, borderRadius:12, padding:"12px 20px", border:`1px solid ${B.border}`, fontSize:14 }}>
                <span style={{ color:B.muted, fontWeight:600 }}>Period Total: </span>
                <strong style={{ color:"#e74c3c", fontSize:16 }}>{php(filtered.reduce((a,e) => a+(+e.amount||0), 0))}</strong>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "summary" && (
        <Card>
          <h3 style={{ margin:"0 0 18px", fontSize:14, fontWeight:800, color:B.dark }}>Expenses by Category</h3>
          {byCategory.length === 0
            ? <p style={{ color:B.muted, fontSize:13, textAlign:"center", padding:24 }}>No expenses recorded for this period.</p>
            : byCategory.map(({ cat, total, count }) => (
              <div key={cat} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <div>
                    <span style={{ fontWeight:700, color:B.text, fontSize:13 }}>{cat}</span>
                    <span style={{ color:B.muted, fontSize:11, marginLeft:8 }}>{count} expense{count!==1?"s":""}</span>
                  </div>
                  <strong style={{ color:"#e74c3c" }}>{php(total)}</strong>
                </div>
                <div style={{ height:9, background:B.gray, borderRadius:6 }}>
                  <div style={{ height:"100%", background:`linear-gradient(90deg,${B.purple},${B.cyan})`, borderRadius:6, width:`${(total/byCategory[0].total)*100}%`, transition:"width .5s" }}/>
                </div>
                <div style={{ fontSize:11, color:B.muted, marginTop:3, textAlign:"right" }}>
                  {totalSpent > 0 ? ((total/totalSpent)*100).toFixed(1) : 0}% of total
                </div>
              </div>
            ))
          }
          {byCategory.length > 0 && (
            <div style={{ borderTop:`2px solid ${B.border}`, paddingTop:14, display:"flex", justifyContent:"space-between", fontWeight:800, fontSize:15 }}>
              <span>Total Expenses</span>
              <span style={{ color:"#e74c3c" }}>{php(totalSpent)}</span>
            </div>
          )}
        </Card>
      )}

      {tab === "pl" && (
        <div>
          <Card style={{ marginBottom:16 }}>
            <h3 style={{ margin:"0 0 20px", fontSize:15, fontWeight:900, color:B.dark }}>Profit & Loss Overview
              <span style={{ fontSize:12, fontWeight:600, color:B.muted, marginLeft:10, textTransform:"capitalize" }}>({filterPeriod})</span>
            </h3>
            {[
              { label:"Sales Revenue", value:salesRev, color:B.cyan, indent:false },
              { label:"Service Revenue", value:svcRev, color:B.lime, indent:false },
              { label:"Total Revenue", value:salesRev+svcRev, color:B.dark, indent:false, bold:true, border:true },
              { label:"Cost of Goods Sold", value:(salesRev+svcRev)-grossProfit, color:"#e74c3c", indent:true },
              { label:"Gross Profit", value:grossProfit, color:B.purple, indent:false, bold:true, border:true },
              { label:"Total Expenses", value:totalSpent, color:"#e74c3c", indent:false },
              { label:"Net Profit / Loss", value:netProfit, color:netProfit>=0?B.lime:"#e74c3c", indent:false, bold:true, border:true, big:true },
            ].map(({ label, value, color, indent, bold, border, big }, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:`${big?"14":"9"}px ${indent?"20":"0"}px`, borderTop:border?`2px solid ${B.border}`:"none", marginTop:border?6:0 }}>
                <span style={{ fontSize:big?15:13, fontWeight:bold?800:500, color:bold?B.dark:B.muted }}>{label}</span>
                <span style={{ fontSize:big?18:14, fontWeight:bold?900:600, color }}>{value < 0 ? `(${php(Math.abs(value))})` : php(value)}</span>
              </div>
            ))}
          </Card>

          {/* Expense breakdown in P&L */}
          {byCategory.length > 0 && (
            <Card>
              <h4 style={{ margin:"0 0 14px", fontSize:13, fontWeight:800, color:B.dark }}>Expense Breakdown</h4>
              {byCategory.map(({ cat, total }) => (
                <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${B.gray}`, fontSize:13 }}>
                  <span style={{ color:B.muted }}>{cat}</span>
                  <span style={{ fontWeight:700, color:"#e74c3c" }}>{php(total)}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", padding:"10px 0 0", fontSize:14, fontWeight:800 }}>
                <span>Total</span><span style={{ color:"#e74c3c" }}>{php(totalSpent)}</span>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal === "form" && (
        <Modal title={form.id ? "Edit Expense" : "Record Expense"} onClose={() => { setModal(null); setForm({}); }} wide>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
            <Field label="Description / Title" req>
              <Inp value={form.title || ""} onChange={e => setForm(f => ({ ...f, title:e.target.value }))} placeholder="e.g. Monthly rent, Diesel fuel…"/>
            </Field>
            <Field label="Amount (₦)" req>
              <Inp type="number" min={0} value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount:e.target.value }))} placeholder="0.00"/>
            </Field>
            <Field label="Category" req>
              <Sel value={form.category || ""} onChange={e => setForm(f => ({ ...f, category:e.target.value }))}>
                <option value="">— Select category —</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </Sel>
            </Field>
            <Field label="Date" req>
              <Inp type="date" value={form.date || ""} onChange={e => setForm(f => ({ ...f, date:e.target.value }))}/>
            </Field>
            <Field label="Paid To / Payee">
              <Inp value={form.paidTo || ""} onChange={e => setForm(f => ({ ...f, paidTo:e.target.value }))} placeholder="Supplier, landlord, employee…"/>
            </Field>
            <Field label="Payment Method">
              <Sel value={form.paymentMethod || "Cash"} onChange={e => setForm(f => ({ ...f, paymentMethod:e.target.value }))}>
                {["Cash","GCash","Bank Transfer","Check","Credit Card","Other"].map(m => <option key={m} value={m}>{m}</option>)}
              </Sel>
            </Field>
          </div>
          <Field label="Reference / Receipt #">
            <Inp value={form.reference || ""} onChange={e => setForm(f => ({ ...f, reference:e.target.value }))} placeholder="e.g. OR-2024-001, GCash ref #…"/>
          </Field>
          <Field label="Notes">
            <Txt value={form.note || ""} onChange={e => setForm(f => ({ ...f, note:e.target.value }))} placeholder="Additional details…" style={{ minHeight:60 }}/>
          </Field>

          {/* Quick-add common expenses */}
          {!form.id && (
            <div style={{ marginTop:4, marginBottom:4 }}>
              <div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:.6, marginBottom:8 }}>Quick Fill</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {[
                  { title:"Monthly Rent", category:"Rent / Utilities" },
                  { title:"Electricity Bill", category:"Rent / Utilities" },
                  { title:"Water Bill", category:"Rent / Utilities" },
                  { title:"Staff Salary", category:"Salaries / Wages" },
                  { title:"Diesel / Fuel", category:"Vehicle & Fuel" },
                  { title:"Office Supplies", category:"Office Expenses" },
                ].map(q => (
                  <button key={q.title} onClick={() => setForm(f => ({ ...f, title:q.title, category:q.category }))}
                    style={{ padding:"5px 11px", borderRadius:8, border:`1px solid ${B.border}`, background:B.light, color:B.text, fontSize:11, fontWeight:600, cursor:"pointer" }}>
                    {q.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:18 }}>
            <Btn v="secondary" onClick={() => { setModal(null); setForm({}); }}>Cancel</Btn>
            <Btn icon="check" onClick={saveExpense}>Save Expense</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// FIREBASE SETTINGS PAGE
// ============================================================
function FirebaseSettingsPage({ state, toast, reload, syncStatus }) {
  const existing = getFBConfig();
  const [cfg, setCfg] = useState(existing ? JSON.stringify(existing, null, 2) : "");
  const [tab, setTab] = useState(existing ? "status" : "setup");
  const [pushing, setPushing] = useState(false);
  const [testing, setTesting] = useState(false);
  const isConnected = !!existing;

  const saveConfig = async () => {
    try {
      const parsed = JSON.parse(cfg);
      const required = ["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"];
      const missing = required.filter(k => !parsed[k]);
      if (missing.length) { toast(`Missing fields: ${missing.join(", ")}`, "error"); return; }
      saveFBConfig(parsed);
      toast("Firebase config saved! Reloading…");
      setTimeout(() => window.location.reload(), 1200);
    } catch { toast("Invalid JSON — check your config and try again", "error"); }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const parsed = JSON.parse(cfg);
      saveFBConfig(parsed);
      const result = await fbGetAll("users");
      if (result !== null) toast("✓ Connection successful! Firebase is reachable.");
      else toast("Connection failed — check your config or Firestore rules", "error");
    } catch (e) { toast(`Error: ${e.message}`, "error"); }
    setTesting(false);
  };

  const pushToCloud = async () => {
    setPushing(true);
    try {
      await pushLocalToFirebase(state);
      toast("✓ All local data pushed to Firebase!");
    } catch (e) { toast(`Push failed: ${e.message}`, "error"); }
    setPushing(false);
  };

  const disconnect = () => {
    if (!window.confirm("Disconnect Firebase? The app will go back to local-only mode. Your local data is kept.")) return;
    clearFBConfig();
    toast("Firebase disconnected. Reloading…");
    setTimeout(() => window.location.reload(), 1200);
  };

  const statusColor = { synced:B.lime, syncing:B.cyan, error:"#e74c3c", idle:B.muted };
  const statusLabel = { synced:"✓ Connected & Synced", syncing:"↻ Syncing…", error:"⚠ Sync Error — check config", idle:"Not connected" };

  return (
    <div>
      <PageHead title="Cloud Sync — Firebase"/>
      <Tabs
        tabs={[
          { k:"setup", l:isConnected?"Update Config":"Setup", icon:"key" },
          { k:"status", l:"Status & Controls", icon:"cloud" },
          { k:"guide", l:"How to Get Firebase", icon:"reports" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "status" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:16, marginBottom:22 }}>
            <StatCard label="Firebase Status" value={isConnected?"Connected":"Not Set Up"} icon="cloud" color={isConnected?B.lime:B.muted}/>
            <StatCard label="Sync Status" value={statusLabel[syncStatus]||"—"} icon="cloudUp" color={statusColor[syncStatus]||B.muted}/>
            <StatCard label="Local Records" value={Object.values(state).filter(Array.isArray).reduce((a,v)=>a+v.length,0)} icon="inventory" color={B.purple}/>
            <StatCard label="Project ID" value={existing?.projectId||"—"} icon="key" color={B.cyan}/>
          </div>
          {isConnected ? (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <Card>
                <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:800, color:B.dark }}>Sync Controls</h3>
                <p style={{ fontSize:13, color:B.muted, marginBottom:16, lineHeight:1.6 }}>
                  Use <strong>Push to Cloud</strong> to upload all local data to Firebase — useful when setting up a new device or recovering from a sync issue.
                </p>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  <Btn icon="cloudUp" v="cyan" onClick={pushToCloud} disabled={pushing} full>{pushing?"Pushing…":"Push All Local Data to Cloud"}</Btn>
                  <Btn icon="cloudDown" v="ghost" onClick={reload} full>Pull Latest from Cloud</Btn>
                </div>
              </Card>
              <Card>
                <h3 style={{ margin:"0 0 14px", fontSize:14, fontWeight:800, color:B.dark }}>Connection Info</h3>
                <div style={{ fontSize:13, lineHeight:2, color:B.text }}>
                  {existing && Object.entries(existing).map(([k,v])=>(
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", borderBottom:`1px solid ${B.gray}`, padding:"4px 0" }}>
                      <span style={{ color:B.muted, fontWeight:600 }}>{k}</span>
                      <span style={{ fontFamily:"monospace", fontSize:12, color:B.dark, maxWidth:220, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{String(v).slice(0,40)}{String(v).length>40?"…":""}</span>
                    </div>
                  ))}
                </div>
                <Btn v="danger" icon="logout" onClick={disconnect} style={{ marginTop:16 }}>Disconnect Firebase</Btn>
              </Card>
            </div>
          ) : (
            <Card><p style={{ fontSize:14, color:B.muted, textAlign:"center", padding:24 }}>Firebase is not configured. Go to the <strong>Setup</strong> tab to connect.</p></Card>
          )}
        </div>
      )}

      {tab === "setup" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Card>
            <h3 style={{ margin:"0 0 6px", fontSize:15, fontWeight:800, color:B.dark }}>{isConnected?"Update Firebase Config":"Connect Firebase"}</h3>
            <p style={{ fontSize:13, color:B.muted, marginBottom:16, lineHeight:1.6 }}>
              Paste your Firebase project config below. Get it from the Firebase Console → Project Settings → Your Apps → Web App.
            </p>
            <Field label="Firebase Config (JSON)" req>
              <Txt value={cfg} onChange={e=>setCfg(e.target.value)}
                placeholder={'{\n  "apiKey": "AIza...",\n  "authDomain": "your-app.firebaseapp.com",\n  "projectId": "your-app-id",\n  "storageBucket": "your-app.appspot.com",\n  "messagingSenderId": "123456789",\n  "appId": "1:123:web:abc"\n}'}
                style={{ minHeight:200, fontFamily:"monospace", fontSize:12 }}/>
            </Field>
            <div style={{ display:"flex", gap:10, marginTop:4 }}>
              <Btn v="secondary" icon="cloud" onClick={testConnection} disabled={testing||!cfg.trim()}>{testing?"Testing…":"Test Connection"}</Btn>
              <Btn icon="cloudUp" onClick={saveConfig} disabled={!cfg.trim()}>{isConnected?"Update & Reconnect":"Save & Connect"}</Btn>
            </div>
            {isConnected && (
              <div style={{ marginTop:16, padding:12, background:B.limeL, borderRadius:9, fontSize:12, color:B.limeD, fontWeight:600 }}>
                ✓ Firebase is currently connected to: <strong>{existing.projectId}</strong>
              </div>
            )}
          </Card>
          <Card>
            <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800, color:B.dark }}>Config Format</h3>
            <p style={{ fontSize:12, color:B.muted, marginBottom:12, lineHeight:1.7 }}>Your config from Firebase looks like this. Copy the entire object including curly braces.</p>
            <div style={{ background:B.dark, borderRadius:10, padding:16, fontFamily:"monospace", fontSize:12, color:"#a8d8ea", lineHeight:1.8, overflowX:"auto" }}>
              <span style={{ color:"#8bc34a" }}>{"{"}</span><br/>
              &nbsp;&nbsp;<span style={{ color:"#f9ca74" }}>"apiKey"</span>: <span style={{ color:"#f8c291" }}>"AIzaSy..."</span>,<br/>
              &nbsp;&nbsp;<span style={{ color:"#f9ca74" }}>"authDomain"</span>: <span style={{ color:"#f8c291" }}>"tmworks.firebaseapp.com"</span>,<br/>
              &nbsp;&nbsp;<span style={{ color:"#f9ca74" }}>"projectId"</span>: <span style={{ color:"#f8c291" }}>"tmworks-app"</span>,<br/>
              &nbsp;&nbsp;<span style={{ color:"#f9ca74" }}>"storageBucket"</span>: <span style={{ color:"#f8c291" }}>"tmworks-app.appspot.com"</span>,<br/>
              &nbsp;&nbsp;<span style={{ color:"#f9ca74" }}>"messagingSenderId"</span>: <span style={{ color:"#f8c291" }}>"123456789"</span>,<br/>
              &nbsp;&nbsp;<span style={{ color:"#f9ca74" }}>"appId"</span>: <span style={{ color:"#f8c291" }}>"1:123:web:abc"</span><br/>
              <span style={{ color:"#8bc34a" }}>{"}"}</span>
            </div>
            <div style={{ marginTop:16, padding:12, background:B.cyanL, borderRadius:9, fontSize:12, color:B.cyanD, lineHeight:1.7 }}>
              <strong>After connecting:</strong> Click <em>Push All Local Data to Cloud</em> to upload your existing data. Then all devices sync automatically in real-time.
            </div>
          </Card>
        </div>
      )}

      {tab === "guide" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <Card>
            <h3 style={{ margin:"0 0 16px", fontSize:15, fontWeight:800, color:B.dark }}>Step-by-Step Firebase Setup</h3>
            {[
              { n:1, title:"Go to Firebase Console", body:"Open firebase.google.com and sign in with your Google account." },
              { n:2, title:'Click "Add project"', body:'Name it "tokey-mighty-works". Disable Google Analytics (optional). Click Create.' },
              { n:3, title:"Add a Web App", body:'In the project overview, click the </> Web icon. Give it a name like "tmworks". Click Register App.' },
              { n:4, title:"Copy the Config", body:"Firebase shows you a config object with apiKey, projectId, etc. Copy the entire JSON object." },
              { n:5, title:"Set Up Firestore Database", body:'Left sidebar → Build → Firestore Database → Create database → Start in Test mode → Choose asia-southeast1 (Singapore — closest to Philippines).' },
              { n:6, title:"Set Firestore Rules", body:'Firestore → Rules tab → paste the rules from the other panel. Click Publish.' },
              { n:7, title:"Paste Config & Connect", body:'Go to Setup tab, paste the config JSON, click Test Connection, then Save & Connect.' },
              { n:8, title:"Push Local Data", body:'Go to Status tab → click Push All Local Data to Cloud. Done! All devices now sync.' },
            ].map(s=>(
              <div key={s.n} style={{ display:"flex", gap:14, marginBottom:18, alignItems:"flex-start" }}>
                <div style={{ width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${B.purple},${B.cyan})`,color:B.white,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,flexShrink:0 }}>{s.n}</div>
                <div><div style={{ fontWeight:800,color:B.dark,fontSize:13,marginBottom:3 }}>{s.title}</div><div style={{ fontSize:12,color:B.muted,lineHeight:1.6 }}>{s.body}</div></div>
              </div>
            ))}
          </Card>
          <Card>
            <h3 style={{ margin:"0 0 12px", fontSize:14, fontWeight:800, color:B.dark }}>Firestore Security Rules</h3>
            <p style={{ fontSize:12, color:B.muted, marginBottom:12, lineHeight:1.6 }}>Copy and paste this into Firestore → Rules. Click Publish to save.</p>
            <div style={{ background:B.dark, borderRadius:10, padding:16, fontFamily:"monospace", fontSize:11, color:"#a8d8ea", lineHeight:1.9, whiteSpace:"pre" }}>
              {`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
            </div>
            <div style={{ marginTop:16 }}>
              <h4 style={{ fontSize:13, fontWeight:800, color:B.dark, marginBottom:10 }}>Free Tier Limits</h4>
              {[
                { label:"Reads per day", value:"50,000" },
                { label:"Writes per day", value:"20,000" },
                { label:"Storage", value:"1 GB" },
                { label:"Cost", value:"₦0 — Free forever" },
              ].map(r=>(
                <div key={r.label} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${B.gray}`, fontSize:13 }}>
                  <span style={{ color:B.muted }}>{r.label}</span>
                  <strong style={{ color:r.label==="Cost"?B.lime:B.dark }}>{r.value}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop:14, padding:12, background:B.purpleL, borderRadius:9, fontSize:12, color:B.purpleD, lineHeight:1.7 }}>
              <strong>How it works:</strong> Once connected, any device that opens your app URL and logs in will automatically receive live data. Staff just open the URL — no install needed.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============================================================
function LogoutModal({ onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(26,11,46,0.7)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div style={{ background:B.white,borderRadius:18,padding:36,maxWidth:380,width:"100%",boxShadow:"0 24px 80px rgba(155,39,175,0.3)",textAlign:"center" }}>
        <div style={{ width:64,height:64,borderRadius:20,background:`linear-gradient(135deg,${B.purple}22,${B.cyan}22)`,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:18 }}>
          <SVG name="logout" size={30} />
        </div>
        <h3 style={{ margin:"0 0 8px",fontSize:20,fontWeight:900,color:B.dark }}>Sign Out?</h3>
        <p style={{ margin:"0 0 24px",fontSize:14,color:B.muted,lineHeight:1.6 }}>
          You are about to sign out of <strong style={{ color:B.purple }}>TOKEY MIGHTY WORKS</strong>.<br/>
          All your data is saved. You can sign back in anytime.
        </p>
        <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
          <Btn v="secondary" onClick={onCancel} style={{ minWidth:110,justifyContent:"center" }}>Cancel</Btn>
          <Btn v="primary" icon="logout" onClick={onConfirm} style={{ minWidth:110,justifyContent:"center" }}>Sign Out</Btn>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DEBTORS PAGE
// ============================================================
function DebtorsPage({ state, update, remove, cu, audit, toast }) {
  const [tab, setTab] = useState("list");
  const [modal, setModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [viewDebtor, setViewDebtor] = useState(null);
  const [form, setForm] = useState({});
  const [payForm, setPayForm] = useState({ amount: "", note: "" });
  const [search, setSearch] = useState("");

  const canManage = can(cu, "manageSales") || can(cu, "all");

  // Compute balance for each debtor
  const debtorsWithBalance = state.debtors.map(d => {
    const payments = state.debtPayments.filter(p => p.debtorId === d.id);
    const paid = payments.reduce((a, p) => a + (+p.amount), 0);
    const balance = d.totalOwed - paid;
    return { ...d, paid, balance, payments };
  });

  const filtered = debtorsWithBalance.filter(d =>
    d.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.phone?.includes(search)
  );

  const totalOwed = debtorsWithBalance.reduce((a, d) => a + Math.max(d.balance, 0), 0);
  const fullyPaid = debtorsWithBalance.filter(d => d.balance <= 0).length;
  const outstanding = debtorsWithBalance.filter(d => d.balance > 0).length;

  const saveDebtor = async () => {
    if (!form.name) { toast("Customer name is required", "error"); return; }
    if (!form.totalOwed || +form.totalOwed <= 0) { toast("Amount owed must be greater than 0", "error"); return; }
    const item = {
      ...form,
      id: form.id || uid(),
      totalOwed: +form.totalOwed,
      dueDate: form.dueDate || "",
      createdAt: form.createdAt || new Date().toISOString(),
      createdBy: form.createdBy || cu.name,
      status: "unpaid",
    };
    await update("debtors", item);
    await audit(form.id ? "Edit Debtor" : "Add Debtor", `${item.name} — ${php(item.totalOwed)}`, cu);
    toast(`Debtor ${form.id ? "updated" : "added"} successfully`);
    setModal(null);
    setForm({});
  };

  const recordPayment = async () => {
    if (!payForm.amount || +payForm.amount <= 0) { toast("Enter a valid payment amount", "error"); return; }
    const debtor = debtorsWithBalance.find(d => d.id === payModal.id);
    if (+payForm.amount > debtor.balance) { toast("Payment exceeds remaining balance", "error"); return; }
    const payment = {
      id: uid(),
      debtorId: payModal.id,
      debtorName: payModal.name,
      amount: +payForm.amount,
      note: payForm.note || "",
      createdAt: new Date().toISOString(),
      createdBy: cu.name,
    };
    await update("debtPayments", payment);
    // Mark fully paid if balance becomes 0
    const newBalance = debtor.balance - +payForm.amount;
    if (newBalance <= 0) {
      await update("debtors", { ...payModal, status: "paid" });
    }
    await audit("Debt Payment", `${payModal.name} paid ${php(payForm.amount)}`, cu);
    toast(`Payment of ${php(payForm.amount)} recorded!`);
    setPayModal(null);
    setPayForm({ amount: "", note: "" });
    if (viewDebtor?.id === payModal.id) setViewDebtor(null);
  };

  const deleteDebtor = async id => {
    if (!window.confirm("Delete this debtor record? All payments will also be removed.")) return;
    await remove("debtors", id);
    const relatedPayments = state.debtPayments.filter(p => p.debtorId === id);
    for (const p of relatedPayments) await remove("debtPayments", p.id);
    await audit("Delete Debtor", id, cu);
    toast("Debtor record deleted");
    if (viewDebtor?.id === id) setViewDebtor(null);
  };

  if (viewDebtor) {
    const d = debtorsWithBalance.find(x => x.id === viewDebtor.id) || viewDebtor;
    const pct = Math.min((d.paid / d.totalOwed) * 100, 100);
    return (
      <div>
        <PageHead title={`Debtor — ${d.name}`}>
          {canManage && d.balance > 0 && (
            <Btn v="lime" icon="money" onClick={() => setPayModal(d)}>Record Payment</Btn>
          )}
          <Btn v="secondary" onClick={() => setViewDebtor(null)}>← Back</Btn>
        </PageHead>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:20 }}>
          <StatCard label="Total Owed" value={php(d.totalOwed)} icon="debtor" color={B.purple} />
          <StatCard label="Total Paid" value={php(d.paid)} icon="paid" color={B.lime} />
          <StatCard label="Balance Due" value={php(Math.max(d.balance, 0))} icon="alert" color={d.balance <= 0 ? B.lime : "#e74c3c"} sub={d.balance <= 0 ? "Fully Paid ✓" : "Outstanding"} />
        </div>

        <Card style={{ marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
            <div><div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", marginBottom:4 }}>Customer</div><div style={{ fontWeight:700, color:B.text }}>{d.name}</div></div>
            <div><div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", marginBottom:4 }}>Phone</div><div style={{ fontWeight:700, color:B.text }}>{d.phone || "—"}</div></div>
            <div><div style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", marginBottom:4 }}>Due Date</div><div style={{ fontWeight:700, color:d.dueDate && new Date(d.dueDate) < new Date() && d.balance > 0 ? "#e74c3c" : B.text }}>{d.dueDate ? fmtDate(d.dueDate) : "No due date"}</div></div>
          </div>
          {d.description && <p style={{ margin:0, fontSize:13, color:B.muted, fontStyle:"italic" }}>{d.description}</p>}

          {/* Progress bar */}
          <div style={{ marginTop:16 }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:6, fontWeight:600, color:B.muted }}>
              <span>Payment Progress</span><span>{pct.toFixed(0)}%</span>
            </div>
            <div style={{ height:10, background:B.gray, borderRadius:8 }}>
              <div style={{ height:"100%", background:pct >= 100 ? `linear-gradient(90deg,${B.lime},${B.limeD})` : `linear-gradient(90deg,${B.cyan},${B.purple})`, borderRadius:8, width:`${pct}%`, transition:"width .5s" }}/>
            </div>
          </div>
        </Card>

        <Card style={{ padding:0 }}>
          <div style={{ padding:"16px 20px 10px", borderBottom:`1px solid ${B.border}` }}>
            <h3 style={{ margin:0, fontSize:14, fontWeight:800, color:B.dark }}>Payment History</h3>
          </div>
          <Tbl
            cols={[
              { k:"createdAt", l:"Date", r:r => fmtDateTime(r.createdAt) },
              { k:"amount", l:"Amount Paid", r:r => <strong style={{ color:B.lime }}>{php(r.amount)}</strong> },
              { k:"note", l:"Note" },
              { k:"createdBy", l:"Recorded By" },
            ]}
            data={d.payments || []}
          />
          {(!d.payments || d.payments.length === 0) && (
            <p style={{ textAlign:"center", color:B.muted, fontSize:13, padding:"20px 0" }}>No payments recorded yet.</p>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead title="Debtors & Credit">
        {canManage && (
          <Btn icon="plus" onClick={() => { setForm({}); setModal("form"); }}>Add Debtor</Btn>
        )}
      </PageHead>

      {/* Summary cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:16, marginBottom:20 }}>
        <StatCard label="Total Outstanding" value={php(totalOwed)} icon="debtor" color={totalOwed > 0 ? "#e74c3c" : B.lime} />
        <StatCard label="Active Debtors" value={outstanding} icon="customers" color={B.purple} />
        <StatCard label="Fully Paid" value={fullyPaid} icon="paid" color={B.lime} />
        <StatCard label="Total Records" value={state.debtors.length} icon="audit" color={B.cyan} />
      </div>

      <Tabs
        tabs={[{ k:"list", l:"All Debtors", icon:"debtor" }, { k:"outstanding", l:"Outstanding", icon:"alert" }, { k:"paid", l:"Paid", icon:"paid" }]}
        active={tab}
        onChange={setTab}
      />

      <div style={{ position:"relative", marginBottom:16 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted }}><SVG name="search" size={16}/></span>
        <Inp placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft:38 }}/>
      </div>

      <Card style={{ padding:0 }}>
        <Tbl
          cols={[
            { k:"name", l:"Customer", r:r => <strong style={{ color:B.purple, cursor:"pointer" }} onClick={() => setViewDebtor(r)}>{r.name}</strong> },
            { k:"phone", l:"Phone" },
            { k:"totalOwed", l:"Total Owed", r:r => php(r.totalOwed) },
            { k:"paid", l:"Paid", r:r => <span style={{ color:B.lime, fontWeight:700 }}>{php(r.paid)}</span> },
            { k:"balance", l:"Balance Due", r:r => <strong style={{ color:r.balance <= 0 ? B.lime : "#e74c3c", fontSize:14 }}>{r.balance <= 0 ? "✓ Paid" : php(r.balance)}</strong> },
            { k:"dueDate", l:"Due Date", r:r => r.dueDate ? <span style={{ color: r.balance > 0 && new Date(r.dueDate) < new Date() ? "#e74c3c" : B.text, fontWeight:600 }}>{fmtDate(r.dueDate)}{r.balance > 0 && new Date(r.dueDate) < new Date() ? " ⚠" : ""}</span> : <span style={{ color:B.muted }}>—</span> },
            { k:"createdAt", l:"Added", r:r => fmtDate(r.createdAt) },
          ]}
          data={filtered.filter(d => {
            if (tab === "outstanding") return d.balance > 0;
            if (tab === "paid") return d.balance <= 0;
            return true;
          })}
          actions={r => (
            <div style={{ display:"flex", gap:5, justifyContent:"flex-end" }}>
              <Btn sm v="ghost" onClick={() => setViewDebtor(r)}>View</Btn>
              {canManage && r.balance > 0 && (
                <Btn sm v="lime" icon="money" onClick={() => setPayModal(r)}>Pay</Btn>
              )}
              {canManage && (
                <Btn sm v="secondary" icon="edit" onClick={() => { setForm({ ...r }); setModal("form"); }}/>
              )}
              {can(cu, "all") && (
                <Btn sm v="danger" icon="trash" onClick={() => deleteDebtor(r.id)}/>
              )}
            </div>
          )}
        />
      </Card>

      {/* Add/Edit Modal */}
      {modal === "form" && (
        <Modal title={form.id ? "Edit Debtor Record" : "New Debtor Record"} onClose={() => { setModal(null); setForm({}); }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
            <Field label="Customer Name" req>
              <Inp value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name…"/>
            </Field>
            <Field label="Phone">
              <Inp value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="09XXXXXXXXX"/>
            </Field>
          </div>
          <Field label="Amount Owed (₦)" req>
            <Inp type="number" min={0} value={form.totalOwed || ""} onChange={e => setForm(f => ({ ...f, totalOwed: e.target.value }))} placeholder="0.00"/>
          </Field>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
            <Field label="Due Date">
              <Inp type="date" value={form.dueDate || ""} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}/>
            </Field>
            <Field label="Link to Customer (optional)">
              <Sel value={form.customerId || ""} onChange={e => {
                const c = state.customers.find(x => x.id === e.target.value);
                setForm(f => ({ ...f, customerId: e.target.value, phone: c?.phone || f.phone, name: c?.name || f.name }));
              }}>
                <option value="">— Select existing customer —</option>
                {state.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Sel>
            </Field>
          </div>
          <Field label="Description / Reason for Debt">
            <Txt value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Credit sale of Engine Oil, Service job balance…" style={{ minHeight:64 }}/>
          </Field>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
            <Btn v="secondary" onClick={() => { setModal(null); setForm({}); }}>Cancel</Btn>
            <Btn icon="check" onClick={saveDebtor}>Save Debtor</Btn>
          </div>
        </Modal>
      )}

      {/* Payment Modal */}
      {payModal && (
        <Modal title={`Record Payment — ${payModal.name}`} onClose={() => { setPayModal(null); setPayForm({ amount:"", note:"" }); }}>
          <div style={{ background:B.light, borderRadius:12, padding:16, marginBottom:18 }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, fontSize:13 }}>
              <div><div style={{ color:B.muted, fontSize:11, fontWeight:700 }}>TOTAL OWED</div><div style={{ fontWeight:800, color:B.dark }}>{php(payModal.totalOwed)}</div></div>
              <div><div style={{ color:B.muted, fontSize:11, fontWeight:700 }}>PAID SO FAR</div><div style={{ fontWeight:800, color:B.lime }}>{php(payModal.paid)}</div></div>
              <div><div style={{ color:B.muted, fontSize:11, fontWeight:700 }}>BALANCE DUE</div><div style={{ fontWeight:800, color:"#e74c3c" }}>{php(Math.max(payModal.balance, 0))}</div></div>
            </div>
          </div>
          <Field label="Payment Amount (₦)" req>
            <Inp type="number" min={1} max={payModal.balance} value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder={`Max: ${php(payModal.balance)}`}/>
          </Field>
          <div style={{ display:"flex", gap:8, marginBottom:14 }}>
            {[payModal.balance, payModal.balance / 2, payModal.balance / 4].filter(v => v > 0).map((v, i) => (
              <button key={i} onClick={() => setPayForm(f => ({ ...f, amount: v.toFixed(2) }))}
                style={{ padding:"5px 12px", borderRadius:8, border:`1.5px solid ${B.purple}`, background:B.light, color:B.purple, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                {i === 0 ? "Full" : i === 1 ? "½" : "¼"} ({php(v)})
              </button>
            ))}
          </div>
          <Field label="Note / Reference">
            <Inp value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Cash payment, GCash ref #…"/>
          </Field>
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:16 }}>
            <Btn v="secondary" onClick={() => { setPayModal(null); setPayForm({ amount:"", note:"" }); }}>Cancel</Btn>
            <Btn v="lime" icon="check" onClick={recordPayment}>Confirm Payment</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================

// ============================================================
function getNav(cu){
  const all=[
    {k:"dashboard",l:"Dashboard",icon:"dashboard",access:()=>true},
    {k:"sales",l:"Sales",icon:"sales",access:u=>can(u,"manageSales")||can(u,"recordSales")},
    {k:"services",l:"Service Jobs",icon:"wrench",access:u=>can(u,"manageService")||can(u,"createServiceJobs")},
    {k:"inventory",l:"Inventory",icon:"inventory",access:u=>can(u,"manageInventory")||can(u,"searchInventory")},
    {k:"catalog",l:"Service Catalog",icon:"catalog",access:u=>can(u,"manageServiceCategories")||can(u,"all")},
    {k:"customers",l:"Customers",icon:"customers",access:u=>can(u,"manageCustomers")||can(u,"viewAssignedCustomers")},
    {k:"debtors",l:"Debtors & Credit",icon:"debtor",access:u=>can(u,"manageSales")||can(u,"all")||can(u,"recordSales")},
    {k:"expenditures",l:"Expenditures",icon:"expense",access:u=>can(u,"viewReports")||can(u,"manageSales")||can(u,"all")},
    {k:"reports",l:"Reports",icon:"reports",access:u=>can(u,"viewReports")||can(u,"all")},
    {k:"myperformance",l:"My Performance",icon:"chart",access:u=>u.role==="staff"},
    {k:"users",l:"User Management",icon:"users",access:u=>can(u,"manageStaff")||can(u,"all")},
    {k:"audit",l:"Audit Log",icon:"audit",access:u=>can(u,"all")},
    {k:"firebase",l:"Cloud Sync",icon:"cloud",access:u=>can(u,"all")},
  ];
  return all.filter(n=>n.access(cu));
}

// ============================================================
// APP ROOT
// ============================================================
export default function App(){
  const {state,update,remove,audit,syncStatus,reload} = useStore();
  const [cu,setCu]=useState(null);
  const [page,setPage]=useState("dashboard");
  const [sidebar,setSidebar]=useState(true);
  const [online,setOnline]=useState(navigator.onLine);
  const [showLogout,setShowLogout]=useState(false);
  const {toast,ToastContainer}=useToast();

  useEffect(()=>{
    const on=()=>setOnline(true); const off=()=>setOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on); window.removeEventListener("offline",off);};
  },[]);

  if(!state.loaded)
    return <div style={{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:B.dark }}><div style={{ color:B.white,fontSize:16,fontWeight:700 }}>Loading TOKEY MIGHTY WORKS…</div></div>;

  if(!cu) return <LoginPage onLogin={u=>{setCu(u);setPage("dashboard");}} state={state}/>;

  const nav=getNav(cu);
  const props={state,update,remove,cu,audit,toast,reload};

  const renderPage=()=>{
    switch(page){
      case "dashboard":      return <Dashboard {...props}/>;
      case "sales":          return <SalesPage {...props}/>;
      case "services":       return <ServicePage {...props}/>;
      case "inventory":      return <InventoryPage {...props}/>;
      case "catalog":        return <ServiceCatalogPage {...props}/>;
      case "customers":      return <CustomersPage {...props}/>;
      case "debtors":        return <DebtorsPage {...props}/>;
      case "expenditures":   return <ExpendituresPage {...props}/>;
      case "reports":        return <ReportsPage {...props}/>;
      case "myperformance":  return <MyPerformancePage {...props}/>;
      case "users":          return <UsersPage {...props}/>;
      case "audit":          return <AuditPage {...props}/>;
      case "firebase":       return <FirebaseSettingsPage {...props} syncStatus={syncStatus}/>;
      default:               return <Dashboard {...props}/>;
    }
  };

  const roleColor={superadmin:B.purple,admin:B.cyan,staff:B.lime};
  const roleLabel={superadmin:"Super Admin",admin:"Admin",staff:"Staff"};

  return(
    <div style={{ display:"flex",minHeight:"100vh",background:B.light,fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      {/* SIDEBAR */}
      <div style={{ width:sidebar?240:0,minWidth:sidebar?240:0,background:B.dark,color:B.white,display:"flex",flexDirection:"column",transition:"width .2s,min-width .2s",overflow:"hidden",flexShrink:0,position:"relative" }}>
        {/* Brand */}
        <div style={{ padding:"20px 16px 14px",borderBottom:"1px solid rgba(255,255,255,0.08)",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:12 }}>
          <Logo size={42}/>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13,fontWeight:900,letterSpacing:-.3,background:`linear-gradient(135deg,${B.cyan},${B.lime})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",whiteSpace:"nowrap" }}>TOKEY MIGHTY</div>
            <div style={{ fontSize:11,fontWeight:800,color:B.purple,letterSpacing:.5 }}>WORKS</div>
            <div style={{ fontSize:9,color:"rgba(255,255,255,0.4)",fontStyle:"italic",marginTop:1 }}>...Zenith of Creativity</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1,padding:"10px 8px",overflowY:"auto",overflowX:"hidden" }}>
          {nav.map(n=>(
            <button key={n.k} onClick={()=>setPage(n.k)} style={{
              display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",
              background:page===n.k?`linear-gradient(135deg,${B.purple}22,${B.cyan}11)`:"none",
              border:"none",borderRadius:10,
              color:page===n.k?B.white:"rgba(255,255,255,0.55)",
              cursor:"pointer",textAlign:"left",fontWeight:page===n.k?700:500,fontSize:13,
              borderLeft:page===n.k?`3px solid ${B.cyan}`:"3px solid transparent",
              marginBottom:2,whiteSpace:"nowrap",transition:"all .15s"
            }}>
              <SVG name={n.icon} size={16}/>{n.l}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding:"12px 8px",borderTop:"1px solid rgba(255,255,255,0.08)",whiteSpace:"nowrap" }}>
          <div style={{ padding:"8px 12px",marginBottom:4 }}>
            <div style={{ fontWeight:800,color:B.white,fontSize:13,marginBottom:3 }}>{cu.name}</div>
            <Badge color={roleColor[cu.role]} bg={roleColor[cu.role]+"33"}>{roleLabel[cu.role]}</Badge>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:6,padding:"6px 12px",fontSize:11,color:online?"rgba(139,195,74,0.9)":"rgba(231,76,60,0.9)",fontWeight:600 }}>
            <SVG name={online?"wifi":"wifi_off"} size={14}/>
            {online?"Online — data synced":"Offline — saved locally"}
          </div>
          {/* Outstanding debtors alert */}
          {(() => { const owed = state.debtors.reduce((a,d)=>{ const paid=state.debtPayments.filter(p=>p.debtorId===d.id).reduce((x,p)=>x+(+p.amount),0); return a+Math.max(d.totalOwed-paid,0); },0); return owed>0 ? (
            <button onClick={()=>setPage("debtors")} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 12px",background:"rgba(231,76,60,0.15)",border:"none",borderRadius:8,color:"#ff6b6b",cursor:"pointer",fontSize:12,fontWeight:700,marginBottom:2 }}>
              <SVG name="alert" size={14}/> {php(owed)} owed
            </button>
          ) : null; })()}
          {/* This month expenses quick-link */}
          {(() => {
            const now = new Date();
            const monthExp = state.expenditures.filter(e=>{ const d=new Date(e.date||e.createdAt); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }).reduce((a,e)=>a+(+e.amount||0),0);
            return monthExp>0 ? (
              <button onClick={()=>setPage("expenditures")} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 12px",background:"rgba(155,39,175,0.12)",border:"none",borderRadius:8,color:B.purpleL,cursor:"pointer",fontSize:12,fontWeight:700,marginBottom:2 }}>
                <SVG name="expense" size={14}/> {php(monthExp)} spent
              </button>
            ) : null;
          })()}
          <button onClick={()=>setShowLogout(true)} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"8px 12px",background:"none",border:"none",color:"rgba(255,255,255,0.5)",cursor:"pointer",borderRadius:8,fontSize:13,fontWeight:500,transition:"color .15s" }}
            onMouseEnter={e=>e.currentTarget.style.color=B.white} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.5)"}>
            <SVG name="logout" size={15}/>Sign Out
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1,display:"flex",flexDirection:"column",minWidth:0 }}>
        {/* Topbar */}
        <div style={{ background:B.white,borderBottom:`1px solid ${B.border}`,padding:"0 22px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,boxShadow:"0 1px 6px rgba(155,39,175,0.06)" }}>
          <button onClick={()=>setSidebar(s=>!s)} style={{ background:"none",border:"none",cursor:"pointer",color:B.muted,padding:4,display:"flex",borderRadius:8 }}>
            <SVG name="menu" size={20}/>
          </button>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            {/* Sync status pill */}
            {(() => {
              const cfg = getFBConfig();
              const colors = { synced:`linear-gradient(135deg,${B.lime},${B.limeD})`, syncing:`linear-gradient(135deg,${B.cyan},${B.cyanD})`, error:"linear-gradient(135deg,#e74c3c,#c0392b)", idle:"none" };
              const labels = { synced:"☁ Synced", syncing:"↻ Syncing…", error:"⚠ Sync Error", idle:"" };
              if (!cfg) return (
                can(cu,"all") ? (
                  <button onClick={()=>setPage("firebase")} style={{ fontSize:11,padding:"5px 12px",borderRadius:20,border:`1.5px dashed ${B.border}`,background:"none",color:B.muted,cursor:"pointer",fontWeight:600 }}>
                    ☁ Set up Cloud Sync
                  </button>
                ) : null
              );
              return (
                <button onClick={()=>can(cu,"all")&&setPage("firebase")} style={{ fontSize:11,padding:"5px 14px",borderRadius:20,border:"none",background:colors[syncStatus]||colors.idle,color:B.white,fontWeight:700,cursor:can(cu,"all")?"pointer":"default",boxShadow:"0 2px 8px rgba(0,0,0,.15)" }}>
                  {labels[syncStatus]||"☁ Firebase"}
                </button>
              );
            })()}
            <span style={{ fontSize:12,color:B.muted,background:B.light,padding:"5px 14px",borderRadius:20,fontWeight:600,border:`1px solid ${B.border}` }}>
              {new Date().toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1,padding:24,overflowY:"auto" }}>
          {renderPage()}
        </div>
      </div>

      <ToastContainer/>
      {showLogout && (
        <LogoutModal
          onConfirm={()=>{ setShowLogout(false); setCu(null); setPage("dashboard"); }}
          onCancel={()=>setShowLogout(false)}
        />
      )}
    </div>
  );
}
