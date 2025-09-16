// scripts/main.js
(function () {
  const MOD_ID = "axeclefts-adventurers-minions";

  // Expose a small namespace so other files can safely reference shared bits.
  window.AAM = window.AAM || {};
  window.AAM.MOD_ID = MOD_ID;

  /* ========= Handlebars helpers ========= */
  Hooks.once("init", () => {
    try {
      if (typeof Handlebars !== "undefined") {
        if (!Handlebars.helpers.upper) {
          Handlebars.registerHelper("upper", v => (v == null ? "" : String(v).toUpperCase()));
        }
        if (!Handlebars.helpers.array) {
          Handlebars.registerHelper("array", function () {
            const args = Array.from(arguments); args.pop(); return args;
          });
        }
      }
    } catch (e) { console.warn(`${MOD_ID} | helpers`, e); }
  });

  /* ========= D35E theme sync ========= */
  function detectD35ESkinSettingKey() {
    try {
      for (const key of game.settings.settings.keys()) {
        if (!key.startsWith("D35E.")) continue;
        const data = game.settings.settings.get(key);
        const label = `${data?.name ?? ""} ${data?.hint ?? ""}`.toLowerCase();
        const id = key.toLowerCase();
        if (id.includes("skin") || id.includes("theme") || id.includes("appearance") ||
            label.includes("skin") || label.includes("theme") || label.includes("appearance")) return key;
      }
    } catch {}
    return "D35E.useCustomSkin";
  }
  function isD35ECustomSkinEnabled() {
    const key = detectD35ESkinSettingKey();
    try { const [ns, name] = key.split("."); return !!game.settings.get(ns, name); } catch { return false; }
  }
  function syncThemeWithD35E() {
    document.body.classList.toggle("jt-theme", !isD35ECustomSkinEnabled());
  }
  window.JT_syncThemeWithD35E = syncThemeWithD35E;

  /* ========= Critical form styles ========= */
  function JT_injectCriticalFormStyles() {
    const css = `
    .jt-app select,.jt-app .jt-select,.jt-app input[type="text"],.jt-app input[type="number"],.jt-app input[type="search"],.jt-app .jt-input {
      background:#1e1e1e!important;color:#f5f5f5!important;border:1px solid #555!important;border-radius:6px!important;padding:6px 10px!important;line-height:1.5em!important;min-height:2.1em!important;box-sizing:border-box!important;-webkit-text-fill-color:#f5f5f5!important;caret-color:#f5f5f5!important;appearance:none;-webkit-appearance:none;-moz-appearance:none;
    }
    .jt-app select option{background:#1e1e1e!important;color:#f5f5f5!important;padding:6px 10px!important;line-height:1.55em!important;}
    .jt-app select optgroup[label]{color:#c7d0dc!important;font-style:normal!important;}
    .jt-app input::placeholder{color:#9aa5b1!important;opacity:1!important;}
    .jt-app input:focus,.jt-app select:focus{outline:2px solid #7dcfff55!important;border-color:#7dcfff!important;}
    .jt-app select{max-height:340px;overflow-y:auto;}
    `;
    const style = document.createElement("style");
    style.dataset.axecleftsAamCritical = "true";
    style.textContent = css;
    document.head.appendChild(style);
  }
  window.JT_injectCriticalFormStyles = JT_injectCriticalFormStyles;

/* ========= Shared Target Actor ========= */
// Raw string the user typed or picker filled (ID or UUID or @UUID[...] wrapper)
window.AAM = window.AAM || {};
window.AAM.targetActorRaw = window.AAM.targetActorRaw || "";

/** Read the hub input directly (fallback if memory wasn’t set) */
function _readHubInputRaw() {
  try {
    // Find any open hub window and read the field
    const el = document.querySelector('#jt-aamhub input[name="hubActorId"]');
    if (el && el.value && el.value.trim()) return el.value.trim();
  } catch {}
  return "";
}

/** Set + broadcast target */
window.AAM.setTargetActorRaw = function setTargetActorRaw(raw) {
  const val = (raw ?? "").trim();
  window.AAM.targetActorRaw = val;

  // Keep the hub input visually in sync if it’s open
  try {
    const el = document.querySelector('#jt-aamhub input[name="hubActorId"]');
    if (el && el.value !== val) el.value = val;
  } catch {}

  window.dispatchEvent(new CustomEvent("AAM:targetChanged", { detail: { raw: val } }));
};

/** Resolve to an Actor, or fall back to selected token */
window.AAM.resolveTargetActor = async function resolveTargetActor() {
  let raw = window.AAM.targetActorRaw || _readHubInputRaw();
  if (raw) {
    if (raw.startsWith("@UUID[")) raw = raw.slice(6, -1);
    try {
      if (raw.includes(".")) {
        // Full UUID (Actor.x, Compendium.y.z, TokenDocument, etc.)
        const doc = await fromUuid(raw);
        if (doc?.documentName === "Actor") return doc;
        if (doc?.actor) return doc.actor; // token/embedded
      } else {
        // Plain world Actor id
        const byId = game.actors.get(raw);
        if (byId) return byId;
      }
    } catch (e) {
      console.warn("AAM | resolveTargetActor failed for", raw, e);
      ui.notifications.error("Could not resolve the provided Actor ID/UUID.");
    }
    return null;
  }
  const token = canvas?.tokens?.controlled?.[0];
  return token?.actor ?? null;
};

/** Simple, reliable picker (Dialog). Populates the shared value + hub field. */
window.AAM.openActorPicker = function openActorPicker() {
  const makeContent = () => `
    <div class="jt-app jt-grid" style="gap:8px;">
      <div class="jt-row" style="gap:8px;">
        <input class="jt-input" type="search" placeholder="Search actors..." data-aam-pick-search />
      </div>
      <div style="max-height:360px; overflow:auto;" data-aam-pick-list></div>
    </div>`;

  const dlg = new Dialog({
    title: "Select Actor",
    content: makeContent(),
    buttons: {},
    render: html => {
      const $search = html.find('[data-aam-pick-search]');
      const $list   = html.find('[data-aam-pick-list]');

      const render = (q = "") => {
        const qq = q.toLowerCase().trim();
        const rows = game.actors.contents
          .filter(a => !qq || a.name.toLowerCase().includes(qq))
          .sort((a,b)=> a.name.localeCompare(b.name))
          .map(a => `
            <div class="jt-row jt-card" style="justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 8px;">
              <div class="jt-row" style="gap:8px; align-items:center;">
                <img src="${a.img}" width="28" height="28" style="border-radius:4px;" />
                <div>
                  <div class="mono"><b>${foundry.utils.escapeHTML(a.name)}</b></div>
                  <div class="jt-muted mono" style="font-size:11px;">Actor.${a.id}</div>
                </div>
              </div>
              <button class="jt-button" data-aam-pick="${a.uuid}">Select</button>
            </div>
          `).join("") || `<div class="jt-muted">No actors found.</div>`;
        $list.html(rows);
      };

      render();
      $search.on("input", ev => render(ev.currentTarget.value || ""));
      $list.on("click", "[data-aam-pick]", ev => {
        const uuid = ev.currentTarget.getAttribute("data-aam-pick");
        window.AAM.setTargetActorRaw(uuid);
        ui.notifications.info("Target Actor set.");
        dlg.close();
      });
    }
  });
  dlg.render(true);
};


  /* ========= Lazy loader for hub ========= */
  const HUB_SCRIPT_PATH = "modules/axeclefts-adventurers-minions/scripts/apps/aamhub.js";
  window.AAM.HUB_SCRIPT_PATH = HUB_SCRIPT_PATH;

  function jtLoadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => (s.src || "").endsWith(src))) return resolve();
      const el = document.createElement("script"); el.src = src;
      el.onload = () => resolve(); el.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(el);
    });
  }

  async function jtOpenHub() {
    try {
      if (!window.JT_Aamhub) await jtLoadScriptOnce(HUB_SCRIPT_PATH);
      if (!window.JT_Aamhub) return ui.notifications.error("AAM Hub not available.");
      new window.JT_Aamhub().render(true);
    } catch (err) {
      console.error(`${MOD_ID} | open hub`, err);
      ui.notifications.error("Failed to open PC/NPC Generator Hub.");
    }
  }
  window.AAM.jtOpenHub = jtOpenHub;

  /* ========= Settings ========= */
  Hooks.once("init", () => {
    game.settings.register(MOD_ID, "levelCap", {
      name: "Default Total Level Cap",
      hint: "Used by Class Assigner when 'Enforce level cap' is enabled.",
      scope: "world", config: true, type: Number, default: 20
    });
    game.settings.register(MOD_ID, "customStatArray", {
      name: "Custom Stat Array",
      hint: "Six integers used by Ability Assigner when Custom is selected.",
      scope: "world", config: true, type: Array, default: [15,14,13,12,10,8]
    });
  });

  /* ========= Scene control ========= */
  Hooks.on("getSceneControlButtons", (controls) => {
    const tokenCtl = controls.find((c) => c.name === "token");
    if (!tokenCtl) return;
    if (!tokenCtl.tools.some((t) => t?.name === "aamhub")) {
      tokenCtl.tools.push({ name: "aamhub", title: "PC/NPC Generator", icon: "fas fa-user-gear", button: true, onClick: () => jtOpenHub() });
    }
  });

  /* ========= Boot ========= */
  function refreshControlsBar(reason="unspecified"){ try{ ui.controls?.initialize(); ui.controls?.render(true); syncThemeWithD35E(); } catch(e){} }
  Hooks.once("ready", () => { syncThemeWithD35E(); JT_injectCriticalFormStyles(); setTimeout(()=>refreshControlsBar("ready"),0); });
  Hooks.on("canvasReady", () => setTimeout(()=>refreshControlsBar("canvasReady"),0));
  Hooks.on("renderSettingsConfig", () => setTimeout(()=>{ syncThemeWithD35E(); ui.controls?.render(true); }, 50));
})();
