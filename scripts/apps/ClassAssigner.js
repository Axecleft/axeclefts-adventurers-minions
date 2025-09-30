// scripts/apps/ClassAssigner.js
class JT_ClassAssigner extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "jt-class-assigner",
      classes: ["jt-app"],
      title: "Class Assigner",
      template: "modules/axeclefts-adventurers-minions/templates/class-assigner.hbs",
      width: 720,
      height: "auto"
    });
  }

  async render(force, options = {}) {
    try { window.JT_syncThemeWithD35E?.(); } catch {}
    return super.render(force, options);
  }

  // noisy logs until this stabilizes
  _log(...a){ console.log("[AAM ClassAssigner]", ...a); }

  _ESC(s) {
    try { return Handlebars?.Utils?.escapeExpression(s ?? ""); } catch {}
    const d = document.createElement("div"); d.textContent = String(s ?? ""); return d.innerHTML;
  }
  _isOwner(doc) {
    const OWN = (foundry?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    return !!(doc?.testUserPermission?.(game.user, OWN) ?? doc?.isOwner);
  }

  /* ------------------------- classification helpers ------------------------- */
  _readClassTypeLoose(src) {
    const sys   = src?.system ?? src?.data ?? {};
    const flags = src?.flags ?? sys?.flags ?? {};
    const cand = [
      sys.classType,
      sys?.data?.classType,
      src?.data?.data?.classType,
      flags?.d35e?.classType,
      src?.classType
    ];
    const raw = cand.find(v => v !== undefined && v !== null && v !== "");
    return String(raw ?? "").toLowerCase();
  }
  _looksLike(ct) { return ["base","prestige","minion","racial","template"].includes(ct); }
  _toBucket(itemDoc) {
    const t = String(itemDoc?.type || "").toLowerCase();
    let ct = this._readClassTypeLoose(itemDoc);
    if (!this._looksLike(ct)) ct = "";
    if (!ct) { if (t === "class") ct = "base"; else return null; }
    if (ct === "template") return null;
    return ct;
  }

  _wantedPacks() {
    const packs = game.packs ?? [];
    const TITLE = new Set(["classes","minion classes","racial hd"]);
    const keep = packs
      .filter(p => p.documentName === "Item")
      .filter(p => {
        const title = (p.title || p.metadata?.label || "").toLowerCase();
        const coll  = (p.collection || "").toLowerCase();
        return coll === "d35e.classes" || coll.endsWith(".classes") || TITLE.has(title);
      })
      .sort((a,b)=> (a.title||a.collection).localeCompare(b.title||b.collection));
    this._log("Eligible packs:", keep.map(p => p.collection));
    return keep;
  }

  async _scanWorldItems() {
    const items = game.items ?? [];
    const buckets = { base: [], prestige: [], minion: [], racial: [] };
    for (const it of items) {
      const b = this._toBucket(it);
      if (!b) continue;
      buckets[b].push({ name: it.name || "Unnamed", uuid: it.uuid });
    }
    this._log("World items:", Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length])));
    return buckets;
  }

  async _scanPack(p) {
    const buckets = { base: [], prestige: [], minion: [], racial: [] };
    let docs = [];
    try { docs = await p.getDocuments(); }
    catch (e) { console.warn("[AAM ClassAssigner] getDocuments failed:", p.collection, e); }
    for (const d of docs) {
      const b = this._toBucket(d);
      if (!b) continue;
      const uuid = `Compendium.${p.collection}.${d.id}`;
      buckets[b].push({ name: d.name || "Unnamed", uuid });
    }
    this._log("Pack scan:", p.collection, Object.fromEntries(Object.entries(buckets).map(([k,v])=>[k,v.length])));
    return buckets;
  }

  _mergeBuckets(into, from) {
    for (const k of Object.keys(into)) into[k].push(...(from[k]||[]));
  }
  _bucketToHtml(arr) {
    if (!arr.length) return `<option disabled>(no matches)</option>`;
    arr.sort((a,b)=> a.name.localeCompare(b.name));
    return arr.map(o => `<option value="${this._ESC(o.uuid)}">${this._ESC(o.name)}</option>`).join("");
  }
  _extraRowsHtml() {
    const mk = (i) => `
      <div class="jt-row" data-extra="${i}">
        <select class="jt-select class-select" name="extraSel_${i}">
          <optgroup label="All">
            <option disabled>(loading)</option>
          </optgroup>
        </select>
        <input class="jt-input" type="number" name="extraLvl_${i}" min="1" placeholder="Level" />
      </div>`;
    return [0,1,2,3].map(mk).join("");
  }

  async _loadClassOptions() {
    const total = { base: [], prestige: [], minion: [], racial: [] };
    this._mergeBuckets(total, await this._scanWorldItems());
    for (const p of this._wantedPacks()) this._mergeBuckets(total, await this._scanPack(p));
    this._log("Totals:", Object.fromEntries(Object.entries(total).map(([k,v])=>[k,v.length])));
    return {
      baseOptions:     this._bucketToHtml(total.base),
      prestigeOptions: this._bucketToHtml(total.prestige),
      minionOptions:   this._bucketToHtml(total.minion),
      racialOptions:   this._bucketToHtml(total.racial)
    };
  }

  async getData() {
    // keep getData light; we’ll inject options after render
    let cap = 20; try { cap = Number(game.settings.get("axeclefts-adventurers-minions", "levelCap")) || 20; } catch {}
    return { extraRows: this._extraRowsHtml(), _emptyMessage: null, levelCap: cap };
  }

  /* ------------------------------- wiring ------------------------------- */
  _injectInitialOptions(html, data) {
    html.find('select[name="baseSel"]').html(`<optgroup label="Base">${data.baseOptions}</optgroup>`);
    html.find('select[name="prestigeSel"]').html(`<optgroup label="Prestige">${data.prestigeOptions}</optgroup>`);
    html.find('select[name="minionSel"]').html(`<optgroup label="Minion">${data.minionOptions}</optgroup>`);
    html.find('select[name="racialSel"]').html(`<optgroup label="Racial">${data.racialOptions}</optgroup>`);
  }

  // NEW: group the Additional Classes menu by type
  _hasRealOptions(htmlStr) {
    return /<option\s+value=/.test(String(htmlStr || ""));
  }
  _applyExtraOptionsGrouped(html, opts) {
    const parts = [];
    if (this._hasRealOptions(opts.baseOptions))     parts.push(`<optgroup label="Base">${opts.baseOptions}</optgroup>`);
    if (this._hasRealOptions(opts.prestigeOptions)) parts.push(`<optgroup label="Prestige">${opts.prestigeOptions}</optgroup>`);
    if (this._hasRealOptions(opts.minionOptions))   parts.push(`<optgroup label="Minion">${opts.minionOptions}</optgroup>`);
    if (this._hasRealOptions(opts.racialOptions))   parts.push(`<optgroup label="Racial">${opts.racialOptions}</optgroup>`);
    const groupedHTML = parts.length ? parts.join("") : `<option disabled>(no matches)</option>`;
    html.find('#jt-extra-rows select.class-select').each((_, el) => { $(el).html(groupedHTML); });
  }

  _wireSearch(html) {
    const $search = html.find('input[name="search"]');
    const doFilter = () => {
      const q = ($search.val() || "").toString().toLowerCase().trim();
      html.find("select.class-select").each((_, el) => {
        const $el = $(el);
        $el.find("option").each((_, opt) => {
          const $o = $(opt);
          if ($o.is(":disabled")) { $o.show(); return; }
          const name = ($o.text() || "").toLowerCase();
          $o.toggle(!q || name.includes(q));
        });
        const visible = $el.find("option:not(:disabled):visible").length;
        const hasPH = $el.find("option[data-ph]").length > 0;
        if (!visible && !hasPH) $el.append(`<option data-ph disabled>(no matches)</option>`);
        else if (visible && hasPH) $el.find("option[data-ph]").remove();
      });
    };
    $search.on("input", doFilter);
    doFilter();
  }

  _getTargetActorSync() { return window.AAM?.getCurrentTargetActor?.() || null; }
  async _getTargetActor() { return await (window.AAM?.resolveTargetActor?.() ?? (async ()=>null)()); }

  _readExistingClasses(actor) {
    if (!actor) return { list: [], total: 0 };
    const items = actor.items.filter(i => String(i.type).toLowerCase() === "class");
    const list  = items.map(i => ({ name: i.name, level: Number(i.system?.level ?? i.system?.levels ?? 0) || 0 }));
    const total = list.reduce((t,r)=> t + (r.level||0), 0);
    return { list, total };
  }

  _renderExistingUI(html, existing) {
    const $wrap = html.find("#jt-existing-classes");
    if (!existing.list.length) { $wrap.html(`<em>No existing classes on target.</em>`); return; }
    const rows = existing.list
      .sort((a,b)=> a.name.localeCompare(b.name))
      .map(x => `<span class="mono">${this._ESC(x.name)}: <b>${x.level}</b></span>`);
    $wrap.html(rows.join(" &nbsp; "));
  }

  _updateSummary(html, { existingTotal, newTotal, cap, wipeFirst, enforce }) {
    const effExisting = wipeFirst ? 0 : existingTotal;
    const total = effExisting + newTotal;
    html.find("#jt-existing-count").text(String(effExisting));
    html.find("#jt-new-count").text(String(newTotal));
    html.find("#jt-total-count").text(String(total));
    if (enforce && cap && total > cap) html.find("#jt-total-count").css("color", "#ff6b6b");
    else html.find("#jt-total-count").css("color", "");
  }

  _readSelections(html) {
    const rows = [];
    const push = (uuid, lvl) => {
      uuid = (uuid || "").trim();
      const level = Math.max(1, parseInt(lvl,10) || 0);
      if (!uuid || !Number.isFinite(level) || level < 1) return;
      rows.push({ uuid, level });
    };

    // Base
    push(html.find('select[name="baseSel"]').val(), html.find('input[name="baseLvl"]').val());

    // Optional buckets
    const useMinion   = html.find('input[name="useMinion"]')[0]?.checked ?? false;
    const usePrestige = html.find('input[name="usePrestige"]')[0]?.checked ?? false;
    const useRacial   = html.find('input[name="useRacial"]')[0]?.checked ?? false;

    if (useMinion)   push(html.find('select[name="minionSel"]').val(),   html.find('input[name="minionLvl"]').val());
    if (usePrestige) push(html.find('select[name="prestigeSel"]').val(), html.find('input[name="prestigeLvl"]').val());
    if (useRacial)   push(html.find('select[name="racialSel"]').val(),   html.find('input[name="racialLvl"]').val());

    // Extras (grouped list already filled)
    for (let i=0; i<4; i++) {
      push(html.find(`select[name="extraSel_${i}"]`).val(), html.find(`input[name="extraLvl_${i}"]`).val());
    }
    return rows;
  }

  async _fetchClassDocuments(rows) {
    const out = [];
    for (const r of rows) {
      try {
        const doc = await fromUuid(r.uuid);
        if (!doc || doc.documentName !== "Item") continue;
        const data = doc.toObject();
        foundry.utils.setProperty(data, "system.level", r.level);
        foundry.utils.setProperty(data, "system.levels", r.level);
        out.push({ data, level: r.level, name: data.name });
      } catch (e) {
        console.warn("ClassAssigner | failed to load", r.uuid, e);
      }
    }
    return out;
  }

  _sumLevels(rows) { return rows.reduce((t,r)=> t + (parseInt(r.level,10)||0), 0); }

  async _assign(html) {
    const target = await this._getTargetActor();
    if (!target) return ui.notifications.error("No target Actor found (select a token or set a Target Actor).");
    if (!this._isOwner(target)) return ui.notifications.error("You must own the target Actor to assign classes.");

    const selections = this._readSelections(html);
    if (!selections.length) return ui.notifications.warn("Pick at least one class and level.");

    const enforce = html.find('input[name="enforceCap"]')[0]?.checked ?? true;
    let cap = 20; try { cap = Number(game.settings.get("axeclefts-adventurers-minions", "levelCap")) || 20; } catch {}
    const { total: existingTotal } = this._readExistingClasses(target);
    const newTotal = this._sumLevels(selections);
    const wipeFirst = html.find('input[name="wipeFirst"]')[0]?.checked ?? false;
    const effExisting = wipeFirst ? 0 : existingTotal;
    const combined = effExisting + newTotal;
    if (enforce && combined > cap) return ui.notifications.error(`Total levels (${combined}) exceed cap (${cap}).`);

    const docs = await this._fetchClassDocuments(selections);
    if (!docs.length) return ui.notifications.error("No class documents resolved from your selection.");

    if (wipeFirst) {
      const toDelete = target.items.filter(i => String(i.type).toLowerCase() === "class").map(i => i.id);
      if (toDelete.length) await target.deleteEmbeddedDocuments("Item", toDelete);
    }

    for (const { data, level, name } of docs) {
      const existing = target.items.find(i => String(i.type).toLowerCase() === "class" && i.name === name);
      if (existing) {
        const patch = {};
        patch["system.level"]  = level;
        patch["system.levels"] = level;
        await existing.update(patch);
      } else {
        delete data._id;
        await target.createEmbeddedDocuments("Item", [data]);
      }
    }

    const doRefactor = game.settings.get("axeclefts-adventurers-minions", "refactorAttacks") === true;
    await window.AAM.refreshAttacks(target, { refactor: doRefactor });

    const list = docs.map(d => `• ${this._ESC(d.name)}: <b>${d.level}</b>`).join("<br/>");
    ui.notifications.info("Classes assigned.");
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="mono"><b>Class Assigner</b><div>${list}</div></div>`
    });

    const ex = this._readExistingClasses(target);
    this._renderExistingUI(this._htmlRef, ex);
    this._updateSummary(this._htmlRef, { existingTotal: ex.total, newTotal: 0, cap, wipeFirst: false, enforce });
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._htmlRef = html;

    // 1) Load & inject options AFTER render (fixes empty lists)
    (async () => {
      try {
        const opts = await this._loadClassOptions();
        this._injectInitialOptions(html, opts);
        this._applyExtraOptionsGrouped(html, opts);   // << grouped extras

        // make sure toggles reflect enabled selects
        ["useMinion","usePrestige","useRacial"].forEach(n=>{
          const on = !!html.find(`input[name="${n}"]`)[0]?.checked;
          const sel = n==="useMinion" ? "minionSel" : n==="usePrestige" ? "prestigeSel" : "racialSel";
          html.find(`select[name="${sel}"]`).prop("disabled", !on);
          html.find(`input[name="${sel.replace("Sel","Lvl")}"]`).prop("disabled", !on);
        });
      } catch (e) {
        console.error("ClassAssigner | failed to load options", e);
      }
    })();

    // 2) Toggle enable/disable
    const bindToggle = (chk, sel, lvl) => {
      const apply = () => {
        const on = !!(chk[0]?.checked);
        sel.prop("disabled", !on);
        lvl.prop("disabled", !on);
      };
      chk.on("change", apply); apply();
    };
    bindToggle(html.find('input[name="useMinion"]'),   html.find('select[name="minionSel"]'),   html.find('input[name="minionLvl"]'));
    bindToggle(html.find('input[name="usePrestige"]'), html.find('select[name="prestigeSel"]'), html.find('input[name="prestigeLvl"]'));
    bindToggle(html.find('input[name="useRacial"]'),   html.find('select[name="racialSel"]'),   html.find('input[name="racialLvl"]'));

    // 3) Search filter
    this._wireSearch(html);

    // 4) Existing snapshot + live summary
    const tSync = this._getTargetActorSync?.();
    const existing = this._readExistingClasses(tSync);
    this._renderExistingUI(html, existing);

    const cap = Number(this.object?.levelCap ?? 20);
    const updateSummaryLive = () => {
      const rows = this._readSelections(html);
      const newTotal = this._sumLevels(rows);
      const wipeFirst = html.find('input[name="wipeFirst"]')[0]?.checked ?? false;
      const enforce = html.find('input[name="enforceCap"]')[0]?.checked ?? true;
      const { total: existingTotal } = this._readExistingClasses(this._getTargetActorSync?.());
      this._updateSummary(html, { existingTotal, newTotal, cap, wipeFirst, enforce });
    };
    html.find('input[type="number"], select, input[type="checkbox"], input[name="search"]').on("input change", updateSummaryLive);
    updateSummaryLive();

    // 5) Assign
    html.find('[data-action="assign"]').on("click", () => this._assign(html));
  }
}

window.JT_ClassAssigner = JT_ClassAssigner;
