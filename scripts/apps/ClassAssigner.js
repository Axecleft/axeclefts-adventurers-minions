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

  /* ---------- Local helpers (no foundry.utils.escapeHTML calls) ---------- */
  _ESC(s) {
    try { return Handlebars?.Utils?.escapeExpression(s ?? ""); } catch {}
    const d = document.createElement("div");
    d.textContent = String(s ?? "");
    return d.innerHTML;
  }
  _isOwner(doc) {
    const OWN = (foundry?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER);
    return !!(doc?.testUserPermission?.(game.user, OWN) ?? doc?.isOwner);
  }

  /** Packs limited to D35E.classes and any pack named "Classes" */
  _eligiblePacks() {
    const packs = game.packs ?? [];
    return packs
      .filter(p => p.documentName === "Item")
      .filter(p => {
        const title = (p.title || p.metadata?.label || "").toLowerCase();
        const coll  = (p.collection || "").toLowerCase();
        if (coll === "d35e.classes") return true;
        if (coll.endsWith(".classes")) return true;
        if (title === "classes") return true;
        return false;
      })
      .sort((a,b)=> (a.title||a.collection).localeCompare(b.title||b.collection));
  }

  /** Create <option> HTML from an entry (uses _ESC) */
  _opt(name, uuid, disabled=false) {
    const dn = this._ESC(name ?? "Unnamed");
    const du = this._ESC(uuid ?? "");
    return `<option value="${du}" ${disabled ? "disabled" : ""}>${dn}</option>`;
  }

  /** Heuristic prestige classifier when index lacks full data */
  _isPrestigeish(entryName="") {
    const n = String(entryName).toLowerCase();
    return n.includes("prestige") || n.includes("(prc)") || n.includes("[prc]");
  }

  /** Load class index from eligible packs */
  async _loadClassOptions() {
    const base = [];
    const prest = [];

    const packs = this._eligiblePacks();
    for (const p of packs) {
      try {
        const idx = await p.getIndex({ fields: ["name", "type", "img"] });
        for (const it of idx) {
          const name = it.name || "Unnamed";
          // be permissive across 3.5e packs
          const looksLikeClass = (String(it.type || "").toLowerCase() === "class") || true;
          if (!looksLikeClass) continue;
          const uuid = `Compendium.${p.collection}.${it._id || it.id}`;
          if (this._isPrestigeish(name)) prest.push({ name, uuid });
          else base.push({ name, uuid });
        }
      } catch (e) {
        console.warn("ClassAssigner | Failed indexing pack", p.collection, e);
      }
    }

    base.sort((a,b)=> a.name.localeCompare(b.name));
    prest.sort((a,b)=> a.name.localeCompare(b.name));

    const baseOptions = base.map(o => this._opt(o.name, o.uuid)).join("") || `<option disabled>(no matches)</option>`;
    const prestigeOptions = prest.map(o => this._opt(o.name, o.uuid)).join("") || `<option disabled>(no matches)</option>`;
    return { baseOptions, prestigeOptions };
  }

  /** Build 0..4 extra class rows with same options (filled post-render) */
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

  async getData() {
    const { baseOptions, prestigeOptions } = await this._loadClassOptions();
    const extraRows = this._extraRowsHtml();

    // Level cap default from settings (fallback 20)
    let cap = 20;
    try { cap = Number(game.settings.get("axeclefts-adventurers-minions", "levelCap")) || 20; } catch {}

    return {
      baseOptions,
      prestigeOptions,
      extraRows,
      _emptyMessage: null,
      levelCap: cap
    };
  }

  /** Apply the same 'All' list to extra selects (so search filters affect all) */
  _applyOptionsToAllSelects(html) {
    const baseHTML  = html.find('select[name="baseSel"] optgroup[label="Base"]').html() || "";
    const prestHTML = html.find('select[name="prestigeSel"] optgroup[label="Prestige"]').html() || "";
    const unifiedOptions = (baseHTML + prestHTML) || `<option disabled>(no matches)</option>`;
    html.find('#jt-extra-rows select.class-select').each((_, el) => {
      $(el).html(`<optgroup label="All">${unifiedOptions}</optgroup>`);
    });
  }

  /** Build options for base/prestige selects from strings (provided by getData) */
  _injectInitialOptions(html, baseOptions, prestigeOptions) {
    html.find('select[name="baseSel"]').html(`<optgroup label="Base">${baseOptions}</optgroup>`);
    html.find('select[name="prestigeSel"]').html(`<optgroup label="Prestige">${prestigeOptions}</optgroup>`);
  }

  /** Simple search filter: filters visible <option> across all selects */
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

  /** Read current selections into an array of {uuid, level} */
  _readSelections(html) {
    const rows = [];
    const push = (uuid, lvl) => {
      uuid = (uuid || "").trim();
      const level = Math.max(1, parseInt(lvl,10) || 0);
      if (!uuid || !Number.isFinite(level) || level < 1) return;
      rows.push({ uuid, level });
    };

    const baseUuid = html.find('select[name="baseSel"]').val();
    const baseLvl  = html.find('input[name="baseLvl"]').val();
    push(baseUuid, baseLvl);

    const usePrestige = html.find('input[name="usePrestige"]')[0]?.checked ?? false;
    if (usePrestige) {
      const pUuid = html.find('select[name="prestigeSel"]').val();
      const pLvl  = html.find('input[name="prestigeLvl"]').val();
      push(pUuid, pLvl);
    }

    for (let i=0; i<4; i++) {
      const eUuid = html.find(`select[name="extraSel_${i}"]`).val();
      const eLvl  = html.find(`input[name="extraLvl_${i}"]`).val();
      push(eUuid, eLvl);
    }

    return rows;
  }

  /** Resolve class documents from compendium UUIDs */
  async _fetchClassDocuments(rows) {
    const out = [];
    for (const r of rows) {
      try {
        const doc = await fromUuid(r.uuid);
        if (!doc || doc.documentName !== "Item") continue;
        const data = doc.toObject();
        // Set both fields to cover schema variants
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
  /** Assign to target actor with permission guard */
  async _assign(html) {
    const target = await window.AAM?.resolveTargetActor?.();
    if (!target) return ui.notifications.error("No target Actor found (select a token or set a Target Actor).");

    // PERMISSION GUARD: require OWNER to modify
    if (!this._isOwner(target)) {
      return ui.notifications.error("You must own the target Actor to assign classes.");
    }

    const selections = this._readSelections(html);
    if (!selections.length) return ui.notifications.warn("Pick at least one class and level.");

    // Level cap enforcement
    const enforce = html.find('input[name="enforceCap"]')[0]?.checked ?? true;
    let cap = 20; try { cap = Number(game.settings.get("axeclefts-adventurers-minions", "levelCap")) || 20; } catch {}
    const total = this._sumLevels(selections);
    if (enforce && total > cap) {
      return ui.notifications.error(`Total levels (${total}) exceed cap (${cap}).`);
    }

    // Fetch class documents
    const docs = await this._fetchClassDocuments(selections);
    if (!docs.length) return ui.notifications.error("No class documents resolved from your selection.");

    const wipeFirst = html.find('input[name="wipeFirst"]')[0]?.checked ?? false;

    // Remove existing class items if requested
    if (wipeFirst) {
      const toDelete = target.items.filter(i => String(i.type).toLowerCase() === "class").map(i => i.id);
      if (toDelete.length) await target.deleteEmbeddedDocuments("Item", toDelete);
    }

    // Upsert the selected classes
    for (const { data, level, name } of docs) {
      const existing = target.items.find(i => String(i.type).toLowerCase() === "class" && i.name === name);
      if (existing) {
        const patch = {};
        patch["system.level"]  = level;
        patch["system.levels"] = level;
        await existing.update(patch);
      } else {
        delete data._id; // ensure new embedded
        await target.createEmbeddedDocuments("Item", [data]);
      }
    }

    // Chat summary
    const list = docs.map(d => `• ${this._ESC(d.name)}: <b>${d.level}</b>`).join("<br/>");
    ui.notifications.info("Classes assigned.");
    ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="mono"><b>Class Assigner</b><div>${list}</div></div>`
    });
  }

  activateListeners(html) {
    super.activateListeners(html);

    // If template already injected options, leave them; otherwise inject from data context
    const baseOpt  = html.find('select[name="baseSel"] optgroup[label="Base"]').html();
    const prestOpt = html.find('select[name="prestigeSel"] optgroup[label="Prestige"]').html();
    if (!baseOpt || !prestOpt) {
      // Use the values returned by getData (handled by the template engine)
      const data = this.object ?? {};
      this._injectInitialOptions(html, data.baseOptions, data.prestigeOptions);
    }

    // Unify extras
    this._applyOptionsToAllSelects(html);

    // Toggle prestige block enable/disable
    const $usePrestige = html.find('input[name="usePrestige"]');
    const applyPrestVis = () => {
      const on = $usePrestige[0]?.checked ?? false;
      html.find('select[name="prestigeSel"]').prop("disabled", !on);
      html.find('input[name="prestigeLvl"]').prop("disabled", !on);
    };
    $usePrestige.on("change", applyPrestVis);
    applyPrestVis();

    // Wire search filter
    this._wireSearch(html);

    // Running total summary
    const $sum = html.find("#jt-level-summary b");
    const updateTotal = () => {
      const rows = this._readSelections(html);
      const total = this._sumLevels(rows);
      $sum.text(String(total));
    };
    html.find('input[type="number"], select').on("input change", updateTotal);
    updateTotal();

    // Assign
    html.find('[data-action="assign"]').on("click", () => this._assign(html));
  }
}

window.JT_ClassAssigner = JT_ClassAssigner;
