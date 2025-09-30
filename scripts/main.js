// scripts/main.js — permission-aware multi-source picker + locked-pack indicators + per-user persistent filters + helpers + settings + hub launcher
(function () {
  const MOD_ID = "axeclefts-adventurers-minions";
  window.AAM = window.AAM || {};
  window.AAM.MOD_ID = MOD_ID;

  /* ========= Settings ========= */
  // Register world setting: whether AAM should refactor attack items after changes
  Hooks.once("init", () => {
    const MODID = "axeclefts-adventurers-minions";
    game.settings.register(MODID, "refactorAttacks", {
      name: "AAM: Refactor attacks after stat/class changes",
      hint: "When enabled, AAM will try to normalize attack items (use BAB, pick STR/DEX, clear flat bonuses) after abilities/classes are updated. Leave off if you prefer the system or other modules to control attack math.",
      scope: "world",
      config: true,
      default: false,
      type: Boolean
    });
  });
  Hooks.once("init", () => {
    try {
      if (!game.settings.settings.has?.(`${MOD_ID}.customStatArray`)) {
        game.settings.register(MOD_ID, "customStatArray", {
          name: "Custom Stat Array",
          hint: "Six integers used by Ability Assigner when Custom is selected.",
          scope: "world", config: true, type: Array, default: [15,14,13,12,10,8]
        });
      }
      if (!game.settings.settings.has?.(`${MOD_ID}.levelCap`)) {
        game.settings.register(MOD_ID, "levelCap", {
          name: "Default Total Level Cap",
          hint: "Used by Class Assigner when 'Enforce level cap' is enabled.",
          scope: "world", config: true, type: Number, default: 20
        });
      }
      // Per-user (client) persistent picker filters
      if (!game.settings.settings.has?.(`${MOD_ID}.pickerPrefs`)) {
        game.settings.register(MOD_ID, "pickerPrefs", {
          name: "AAM Picker Filters",
          hint: "Per-user filter preferences for the actor picker (scene/actors/compendiums).",
          scope: "client", config: false, type: Object,
          default: { includeScene: true, includeActors: true, includePacks: {} }
        });
      }
    } catch (e) { console.error(`${MOD_ID} | settings register failed`, e); }
  });

  /* ========= Handlebars helpers ========= */
  Hooks.once("init", () => {
    try {
      if (typeof Handlebars !== "undefined") {
        if (!Handlebars.helpers.upper) Handlebars.registerHelper("upper", v => (v==null?"":String(v).toUpperCase()));
        if (!Handlebars.helpers.array) Handlebars.registerHelper("array", function(){ const a=Array.from(arguments); a.pop(); return a; });
      }
    } catch (e) { console.warn(`${MOD_ID} | helpers`, e); }
  });

  /* ========= D35E theme sync ========= */
  function syncThemeWithD35E() {
    try { const enabled = !!game.settings.get("D35E","useCustomSkin"); document.body.classList.toggle("jt-theme", !enabled); } catch {}
  }
  window.JT_syncThemeWithD35E = syncThemeWithD35E;

  /* ========= Critical form styles ========= */
  function JT_injectCriticalFormStyles() {
    const css = `.jt-app select,.jt-app .jt-select,.jt-app input[type="text"],.jt-app input[type="number"],.jt-app input[type="search"],.jt-app .jt-input{background:#1e1e1e!important;color:#f5f5f5!important;border:1px solid #555!important;border-radius:6px!important;padding:6px 10px!important;line-height:1.5em!important;min-height:2.1em!important;box-sizing:border-box!important;-webkit-text-fill-color:#f5f5f5!important;caret-color:#f5f5f5!important;appearance:none;-webkit-appearance:none;-moz-appearance:none}.jt-app select option{background:#1e1e1e!important;color:#f5f5f5!important;padding:6px 10px!important;line-height:1.55em!important}.jt-app select optgroup[label]{color:#c7d0dc!important;font-style:normal!important}.jt-app input::placeholder{color:#9aa5b1!important;opacity:1!important}.jt-app input:focus,.jt-app select:focus{outline:2px solid #7dcfff55!important;border-color:#7dcfff!important}.jt-app select{max-height:340px;overflow-y:auto}`;
    if (!document.querySelector('style[data-aam-critical]')) { const s=document.createElement("style"); s.setAttribute("data-aam-critical","true"); s.textContent=css; document.head.appendChild(s); }
  }
  window.JT_injectCriticalFormStyles = JT_injectCriticalFormStyles;

  /* ========= Shared Target Actor + Resolver ========= */
  window.AAM.targetActorRaw = window.AAM.targetActorRaw || "";
  function _readHubInputRaw(){ try{ const el=document.querySelector('#jt-aamhub input[name="hubActorId"]'); if(el&&el.value&&el.value.trim()) return el.value.trim(); }catch{} return ""; }
  window.AAM.setTargetActorRaw = function(raw){ const val=(raw??"").trim(); window.AAM.targetActorRaw=val; try{ const el=document.querySelector('#jt-aamhub input[name="hubActorId"]'); if(el&&el.value!==val) el.value=val; }catch{} window.dispatchEvent(new CustomEvent("AAM:targetChanged",{detail:{raw:val}})); };

  window.AAM.resolveTargetActor = async function resolveTargetActor() {
    let raw = window.AAM.targetActorRaw || _readHubInputRaw();
    if (raw) {
      if (raw.startsWith("@UUID[")) raw = raw.slice(6,-1);
      try {
        if (raw.includes(".")) {
          const doc = await fromUuid(raw);
          if (doc?.documentName === "Actor") return doc;
          if (doc?.actor) return doc.actor;
        } else {
          const byId = game.actors.get(raw);
          if (byId) return byId;
        }
      } catch (e) {
        console.warn("AAM | resolveTargetActor failed for", raw, e);
        ui.notifications?.error?.("Could not resolve the provided Actor ID/UUID.");
      }
      return null;
    }
    const token = canvas?.tokens?.controlled?.[0];
    return token?.actor ?? null;
  };

  /* ========= Per-user pickerPrefs ========= */
  function loadPickerPrefs() {
    try {
      const p = game.settings.get(MOD_ID, "pickerPrefs");
      return {
        includeScene: !!p?.includeScene,
        includeActors: !!p?.includeActors,
        includePacks: p?.includePacks && typeof p.includePacks === "object" ? { ...p.includePacks } : {}
      };
    } catch { return { includeScene: true, includeActors: true, includePacks: {} }; }
  }
  async function savePickerPrefs(p){ try{ await game.settings.set(MOD_ID,"pickerPrefs",p); }catch(e){ console.warn("AAM | savePickerPrefs",e); } }
  window.AAM.pickerPrefs = loadPickerPrefs();

  /* ========= Utilities ========= */
  const OWN = (foundry?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
  const OBS = (foundry?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OBSERVER ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
  function escHTML(s){ try{ return Handlebars?.Utils?.escapeExpression(s??""); }catch{} const d=document.createElement("div"); d.textContent=String(s??""); return d.innerHTML; }
  function imgForActorLike(a){ return (a?.prototypeToken?.texture?.src) || a?.img || "icons/svg/mystery-man.svg"; }
  function packMeta(p){ const title=p.title||p.metadata?.label||p.collection; const pkg=p.metadata?.packageName||p.package||p.metadata?.package||"world"; const collection=p.collection; const locked=!!(p.locked ?? p.metadata?.locked ?? p.flags?.locked); return {title,pkg,collection,locked}; }
  function indexToArray(idx){ const out=[]; if(!idx) return out; if(Array.isArray(idx)){ for(const it of idx) out.push({id:it._id||it.id,name:it.name,img:it.img}); return out; } if(typeof idx.entries==="function"){ for(const [id,data] of idx.entries()) out.push({id,name:data?.name,img:data?.img}); return out; } if(Array.isArray(idx.contents)){ for(const it of idx.contents) out.push({id:it._id||it.id,name:it.name,img:it.img}); return out; } try{ for(const [id,data] of idx) out.push({id,name:data?.name,img:data?.img}); }catch{} return out; }

  /* ========= Filters UI ========= */
  function renderFilters(html, packs, prefs) {
    const $filters = html.find('[data-aam-filters]');
    const packBoxes = packs.map(p => {
      const { title, pkg, collection, locked } = packMeta(p);
      const checked = (prefs.includePacks[collection] !== undefined) ? !!prefs.includePacks[collection] : !locked;
      const lockIcon = locked ? `<i class="fas fa-lock" style="margin-left:4px; color:#e16363;" title="Edit-locked"></i>` : "";
      const rowStyle = locked ? "background:#2a1f1f;" : "";
      return `
        <label class="jt-row" style="gap:6px; align-items:center; ${rowStyle}" title="${escHTML(collection)}">
          <input type="checkbox" data-aam-pack="${collection}" ${checked ? "checked" : ""}/>
          <span>${escHTML(title)} <span class="mono" style="opacity:.8;">(${escHTML(pkg)})</span>${lockIcon}</span>
        </label>`;
    }).join("");

    const checkedScene  = prefs.includeScene ? "checked" : "";
    const checkedActors = prefs.includeActors ? "checked" : "";

    $filters.html(`
      <details open class="jt-card" style="padding:8px;">
        <summary class="jt-row" style="gap:8px; align-items:center;"><b>Sources</b></summary>
        <div class="jt-grid" style="gap:10px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));">
          <div class="jt-card" style="padding:8px;">
            <div class="jt-title" style="font-size:13px;">Scene</div>
            <label class="jt-row" style="gap:6px; align-items:center;">
              <input type="checkbox" data-aam-scene ${checkedScene}/>
              <span>Include tokens on current scene</span>
            </label>
          </div>
          <div class="jt-card" style="padding:8px;">
            <div class="jt-title" style="font-size:13px;">Actors Directory</div>
            <label class="jt-row" style="gap:6px; align-items:center;">
              <input type="checkbox" data-aam-actors ${checkedActors}/>
              <span>Include actors in directory</span>
            </label>
          </div>
          <div class="jt-card" style="padding:8px;">
            <div class="jt-row" style="justify-content:space-between; align-items:center;">
              <div class="jt-title" style="font-size:13px;">Actor Compendiums</div>
              <div class="jt-row" style="gap:6px;">
                <button type="button" class="jt-button jt-muted" data-aam-packs-all>All</button>
                <button type="button" class="jt-button jt-muted" data-aam-packs-none>None</button>
              </div>
            </div>
            <div class="jt-grid" style="gap:4px; max-height:200px; overflow:auto;">
              ${packBoxes || `<div class="jt-muted">No Actor compendiums found.</div>`}
            </div>
          </div>
        </div>
      </details>
    `);

    // Persisting handlers
    $filters.off("change.aam-filters click.aam-filters");
    $filters.on("change.aam-filters", "[data-aam-scene]",  ev => { prefs.includeScene  = !!ev.currentTarget.checked; savePickerPrefs(prefs); html.trigger("aam:refresh"); });
    $filters.on("change.aam-filters", "[data-aam-actors]", ev => { prefs.includeActors = !!ev.currentTarget.checked; savePickerPrefs(prefs); html.trigger("aam:refresh"); });
    $filters.on("change.aam-filters", "[data-aam-pack]",   ev => { const col=ev.currentTarget.getAttribute("data-aam-pack"); prefs.includePacks[col] = !!ev.currentTarget.checked; savePickerPrefs(prefs); html.trigger("aam:refresh"); });
    $filters.on("click.aam-filters", "[data-aam-packs-all]",  () => { packs.forEach(p => prefs.includePacks[p.collection] = true);  savePickerPrefs(prefs); renderFilters(html,packs,prefs); html.trigger("aam:refresh"); });
    $filters.on("click.aam-filters", "[data-aam-packs-none]", () => { packs.forEach(p => prefs.includePacks[p.collection] = false); savePickerPrefs(prefs); renderFilters(html,packs,prefs); html.trigger("aam:refresh"); });
  }
  /* ========= Permission-aware Multi-source Actor Picker ========= */
  window.AAM.openActorPicker = function openActorPicker() {
    const content = `
      <div class="jt-app jt-grid" style="gap:8px;">
        <div class="jt-row" style="gap:8px; align-items:center;">
          <input class="jt-input" type="search" placeholder="Search by name…" data-aam-pick-search style="flex:1;"/>
          <span class="jt-muted" style="font-size:12px;">Click a row to select</span>
        </div>
        <div data-aam-filters></div>
        <div data-aam-results style="max-height:420px; overflow:auto;"></div>
      </div>`;

    const dlg = new Dialog({
      title: "Select Actor / Token / Compendium Entry",
      content,
      buttons: { close: { label: "Close" } },
      close: () => savePickerPrefs(window.AAM.pickerPrefs),
      render: async html => {
        const $search  = html.find('[data-aam-pick-search]');
        const $results = html.find('[data-aam-results]');

        // Collect Actor compendiums
        const packs = game.packs
          .filter(p => p.documentName === "Actor")
          .sort((a,b)=> (a.title||a.collection).localeCompare(b.title||b.collection));

        // Seed defaults: locked OFF, unlocked ON if not set yet for this user
        let seeded=false;
        for (const p of packs) {
          const { collection, locked } = packMeta(p);
          if (window.AAM.pickerPrefs.includePacks[collection] === undefined) {
            window.AAM.pickerPrefs.includePacks[collection] = !locked;
            seeded = true;
          }
        }
        if (seeded) savePickerPrefs(window.AAM.pickerPrefs);

        // Filters UI
        renderFilters(html, packs, window.AAM.pickerPrefs);

        // Preload indexes once
        const packIndexes = {};
        await Promise.all(packs.map(async p => { try { await p.getIndex(); packIndexes[p.collection] = p.index; } catch { packIndexes[p.collection] = null; } }));

        function renderRows(q = "") {
          const qq = (q || "").toLowerCase().trim();
          const sections = [];

          // === Scene tokens (filter to OBSERVER and mark non-owners) ===
          if (window.AAM.pickerPrefs.includeScene) {
            const tokens = (canvas?.tokens?.placeables || [])
              .map(t => t.document)
              .filter(td => {
                const a = td.actor;
                if (!a) return false;
                const canSee = a?.testUserPermission?.(game.user, OBS) ?? true;
                if (!canSee) return false;
                const tn = (td.name || a?.name || "").toLowerCase();
                return !qq || tn.includes(qq);
              })
              .sort((a,b)=> (a.name||"").localeCompare(b.name||""));

            if (tokens.length) {
              const rows = tokens.map(td => {
                const a = td.actor;
                const name = escHTML(td.name || a?.name || "Token");
                const img  = td.texture?.src || a?.img || "icons/svg/mystery-man.svg";
                const uuid = td.uuid; // TokenDocument
                const isOwner = a?.testUserPermission?.(game.user, OWN) ?? a?.isOwner ?? false;
                const style = isOwner ? "" : "opacity:.65; pointer-events:none;"; // non-owners not clickable
                const badge = isOwner ? "" : `<span class="jt-muted mono" style="font-size:11px;">(read-only)</span>`;
                return `
                  <div class="jt-row jt-card" data-aam-pick="${isOwner ? uuid : ""}" style="justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 8px; ${style}">
                    <div class="jt-row" style="gap:8px; align-items:center;">
                      <img src="${img}" width="28" height="28" style="border-radius:4px;" onerror="this.onerror=null; this.src='icons/svg/mystery-man.svg';" />
                      <div>
                        <div class="mono"><b>${name}</b> ${badge}</div>
                        <div class="jt-muted mono" style="font-size:11px;">Scene Token</div>
                      </div>
                    </div>
                  </div>`;
              }).join("");
              sections.push(`<div class="jt-title" style="font-size:12px; opacity:.8; margin-top:6px;">Scene Tokens</div>${rows}`);
            }
          }

          // === Actors directory (filter to OBSERVER; non-owners dimmed) ===
          if (window.AAM.pickerPrefs.includeActors) {
            const actorsArr = (game.actors?.contents && Array.isArray(game.actors.contents)) ? game.actors.contents.slice() : Array.from(game.actors ?? []);
            const actors = actorsArr
              .filter(a => {
                const canSee = a?.testUserPermission?.(game.user, OBS) ?? a?.isOwner ?? false;
                if (!canSee) return false;
                const nm = (a?.name || "").toLowerCase();
                return !qq || nm.includes(qq);
              })
              .sort((a,b)=> (a?.name||"").localeCompare(b?.name||""));
            if (actors.length) {
              const rows = actors.map(a => {
                const name = escHTML(a?.name || "Unnamed");
                const img  = imgForActorLike(a);
                const uuid = a?.uuid;
                const isOwner = a?.testUserPermission?.(game.user, OWN) ?? a?.isOwner ?? false;
                const style = isOwner ? "" : "opacity:.65; pointer-events:none;";
                const badge = isOwner ? "" : `<span class="jt-muted mono" style="font-size:11px;">(read-only)</span>`;
                return `
                  <div class="jt-row jt-card" data-aam-pick="${isOwner ? uuid : ""}" style="justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 8px; ${style}">
                    <div class="jt-row" style="gap:8px; align-items:center;">
                      <img src="${img}" width="28" height="28" style="border-radius:4px;" onerror="this.onerror=null; this.src='icons/svg/mystery-man.svg';" />
                      <div>
                        <div class="mono"><b>${name}</b> ${badge}</div>
                        <div class="jt-muted mono" style="font-size:11px;">Actor Directory</div>
                      </div>
                    </div>
                  </div>`;
              }).join("");
              sections.push(`<div class="jt-title" style="font-size:12px; opacity:.8; margin-top:6px;">Actors</div>${rows}`);
            }
          }

          // === Actor compendiums (permission enforced on click) ===
          for (const p of packs) {
            const { title, pkg, collection, locked } = packMeta(p);
            const enabled = window.AAM.pickerPrefs.includePacks[collection] !== false;
            if (!enabled) continue;

            const items = indexToArray(packIndexes[collection]).filter(it => {
              const nm = (it.name || "").toLowerCase();
              return !qq || nm.includes(qq);
            }).sort((a,b) => (a.name||"").localeCompare(b.name||""));

            if (!items.length) continue;

            const lockIcon = locked ? ` <i class="fas fa-lock" style="color:#e16363;" title="Edit-locked"></i>` : "";
            const header = `${escHTML(title)} <span class="mono" style="opacity:.8;">(${escHTML(pkg)})</span>${lockIcon}`;
            const packRowTint = locked ? "background:#2a1f1f;" : "";

            const rows = items.map(it => {
              const name = escHTML(it.name || "Unnamed");
              const uuid = `Compendium.${collection}.${it.id}`;
              const img  = it.img || "icons/svg/mystery-man.svg";
              return `
                <div class="jt-row jt-card" data-aam-pick="${uuid}" style="justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 8px; cursor:pointer; ${packRowTint}">
                  <div class="jt-row" style="gap:8px; align-items:center;">
                    <img src="${img}" width="28" height="28" style="border-radius:4px;" onerror="this.onerror=null; this.src='icons/svg/mystery-man.svg';" />
                    <div>
                      <div class="mono"><b>${name}</b></div>
                      <div class="jt-muted mono" style="font-size:11px;">${header}</div>
                    </div>
                  </div>
                </div>`;
            }).join("");

            sections.push(`<div class="jt-title" style="font-size:12px; opacity:.8; margin-top:6px;">${header}</div>${rows}`);
          }

          $results.html(sections.join("") || `<div class="jt-muted">No matches in enabled sources.</div>`);
        }

        // First render
        renderRows("");

        // typing
        $search.on("keydown", ev => { if (ev.key === "Enter") ev.preventDefault(); });
        $search.on("input", ev => renderRows(ev.currentTarget.value || ""));

        // filter change
        html.on("aam:refresh", () => renderRows($search.val() || ""));

        // click-to-select with permission checks
        $results.on("click", "[data-aam-pick]", async ev => {
          const uuid = ev.currentTarget.getAttribute("data-aam-pick");
          if (!uuid) return; // non-owner entries are non-clickable
          try {
            const doc = await fromUuid(uuid);
            const actor = doc?.documentName === "Actor" ? doc : (doc?.actor || null);
            if (!actor) return ui.notifications?.warn?.("That selection didn’t resolve to an Actor.");

            const canObserve = actor?.testUserPermission?.(game.user, OBS) ?? actor?.isOwner ?? false;
            if (!canObserve) return ui.notifications?.warn?.("You don’t have permission to view that Actor.");

            const canEdit = actor?.testUserPermission?.(game.user, OWN) ?? actor?.isOwner ?? false;
            if (!canEdit) ui.notifications?.info?.("Selected read-only Actor. Editing will be blocked.");

            window.AAM.setTargetActorRaw(actor.uuid);
            dlg.close();
          } catch (e) {
            console.warn("AAM | pick permission check failed", e);
            ui.notifications?.error?.("Failed to resolve selection.");
          }
        });
      }
    });

    dlg.render(true);
  };

  /* ========= Scene control: open hub ========= */
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenCtl = controls.find(c => c.name === "token");
    if (!tokenCtl) return;
    if (!tokenCtl.tools.some(t => t?.name === "aamhub")) {
      tokenCtl.tools.push({
        name: "aamhub",
        title: "PC/NPC Generator",
        icon: "fas fa-user-gear",
        button: true,
        onClick: () => {
          try {
            const path = "modules/axeclefts-adventurers-minions/scripts/apps/aamhub.js";
            if (!window.JT_Aamhub && ![...document.scripts].some(s => (s.src||"").endsWith(path))) {
              const el = document.createElement("script"); el.src = path;
              el.onload = () => new window.JT_Aamhub().render(true);
              document.head.appendChild(el);
            } else {
              new window.JT_Aamhub().render(true);
            }
          } catch (e) {
            console.error(`${MOD_ID} | open hub`, e);
            ui.notifications?.error?.("Failed to open PC/NPC Generator Hub.");
          }
        }
      });
    }
  });

  /* ========= Boot ========= */
  Hooks.once("ready", () => { JT_injectCriticalFormStyles(); syncThemeWithD35E(); });
  Hooks.on("canvasReady", () => syncThemeWithD35E());
})();

/* === Manual resize for AAM Hub (uses the little corner handle) === */
(function () {
  function wireAamhubResize(app, html) {
    const $handle = html.find('[data-resize-handle]');
    if (!$handle.length) return;

    // Avoid double-binding if re-rendered
    if ($handle.data('jtResizeWired')) return;
    $handle.data('jtResizeWired', true);

    let startX, startY, startW, startH;
    const MIN_W = 560;   // tweak if you want smaller minimums
    const MIN_H = 420;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const w  = Math.max(MIN_W, startW + dx);
      const h  = Math.max(MIN_H, startH + dy);
      // Foundry will handle window chrome + content sizing
      app.setPosition({ width: w, height: h });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('jt-resizing');
    };

    $handle.on('mousedown.jtResize', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      // starting mouse + window sizes
      const pos = app.position || {};
      startX = ev.clientX;
      startY = ev.clientY;
      startW = Number(pos.width)  || html.closest('.window-app').outerWidth()  || 720;
      startH = Number(pos.height) || html.closest('.window-app').outerHeight() || 520;

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.body.classList.add('jt-resizing');
    });
  }

  // Wire on render of the Hub app
  Hooks.on('renderJT_Aamhub', (app, html) => wireAamhubResize(app, html));
})();
/* === AAM: Attack Refresh / (optional) Refactor === */
window.AAM ||= {};

/**
 * Refresh (and optionally refactor) attacks after stats/classes change.
 * @param {Actor} actor
 * @param {object} opts
 * @param {boolean} [opts.refactor=false]  set true to attempt opinionated cleanup
 */
window.AAM.refreshAttacks = async function(actor, { refactor=false } = {}) {
  if (!actor) return;

  // 1) Let the system recompute derived data (BAB, ability mods, size, etc.)
  try { actor.prepareData?.(); } catch {}
  try { actor.prepareDerivedData?.(); } catch {}

  // 2) Optional: normalize weapon/attack items (guarded; best-effort)
  if (refactor) {
    const items = actor.items.filter(i => {
      const t = String(i.type || "").toLowerCase();
      return t.includes("weapon") || t.includes("attack");
    });

    for (const it of items) {
      const sys = it.system || {};
      const patch = {};

      // Heuristic: ranged if flagged or significant range
      const flags = sys?.properties || sys?.props || {};
      const rangeVal = Number(sys?.range?.value ?? sys?.range ?? NaN);
      const isRanged = (flags.ranged === true) || (Number.isFinite(rangeVal) && rangeVal > 5) || sys?.isRanged === true;
      const isFinesse = !!(flags.finesse || flags.fin);

      const ability = isRanged ? "dex" : (isFinesse ? "dex" : "str");

      // Try common schema spots
      if (sys.attackAbility !== undefined) patch["system.attackAbility"] = ability;
      else if (sys.ability !== undefined)  patch["system.ability"]       = ability;
      else if (sys.attack?.ability !== undefined) patch["system.attack.ability"] = ability;

      // Prefer using BAB if toggle exists
      if (sys.useBab !== undefined)         patch["system.useBab"] = true;
      if (sys.attack?.useBab !== undefined) patch["system.attack.useBab"] = true;

      // Clear flat manual bonuses if present (let system compute)
      if (typeof sys.attackBonus === "number") patch["system.attackBonus"] = 0;
      if (sys.attack?.bonus !== undefined)     patch["system.attack.bonus"] = 0;

      // Seed parts if array exists and is empty (defensive)
      if (Array.isArray(sys?.attackBonus?.parts) && !sys.attackBonus.parts.length) {
        patch["system.attackBonus.parts"] = [
          ["@bab", "BAB"],
          [`@abilities.${ability}.mod`, ability.toUpperCase()]
        ];
      }

      if (Object.keys(patch).length) {
        try { await it.update(patch); } catch (e) { console.warn("AAM refreshAttacks: item patch failed", it, e); }
      }
    }
  }

  // 3) Rerender sheet to reflect changes immediately
  try { actor.render?.(true); } catch {}
};
