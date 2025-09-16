// scripts/apps/aamhub.js
(function(){
  const MOD_ID = window.AAM?.MOD_ID || "axeclefts-adventurers-minions";

//  /* Tiny picker to select an Actor */
//  class JT_ActorPicker extends Application {
//    static get defaultOptions() {
//      return foundry.utils.mergeObject(super.defaultOptions, {
//        id: "jt-actor-picker",
//        title: "Select Actor",
//        classes: ["jt-app"],
//        template: null,
//        width: 520, height: 500, resizable: true
//      });
//    }
//    async _renderInner() {
//      const wrap = document.createElement("div");
//      wrap.className = "jt-app jt-card jt-grid";
//      wrap.style.gap = "8px";
//      wrap.innerHTML = `
//        <div class="jt-row" style="gap:8px;">
//          <input class="jt-input" type="search" placeholder="Search actors..." data-pick-search />
//        </div>
//        <div style="overflow:auto; max-height:380px;" data-pick-list></div>
//      `;
//      const list = wrap.querySelector("[data-pick-list]");
//      const render = (q="") => {
//        const qq = q.toLowerCase();
//        const rows = game.actors.contents
//          .filter(a => !qq || a.name.toLowerCase().includes(qq))
//          .sort((a,b)=>a.name.localeCompare(b.name))
//          .map(a =>
//            `<div class="jt-row jt-card" style="justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 8px;">
//              <div class="jt-row" style="gap:8px; align-items:center;">
//                <img src="${a.img}" width="28" height="28" style="border-radius:4px;" />
//                <div>
//                  <div class="mono"><b>${foundry.utils.escapeHTML(a.name)}</b></div>
//                  <div class="jt-muted mono" style="font-size:11px;">Actor.${a.id}</div>
//                </div>
//              </div>
//              <button class="jt-button" data-pick-id="${a.uuid}">Select</button>
//            </div>`
//          ).join("") || `<div class="jt-muted">No actors found.</div>`;
//        list.innerHTML = rows;
//      };
//      render();
//      wrap.querySelector("[data-pick-search]").addEventListener("input", (ev)=> render(ev.target.value));
//      list.addEventListener("click", (ev) => {
//        const btn = ev.target.closest("[data-pick-id]"); if (!btn) return;
//        const uuid = btn.getAttribute("data-pick-id");
//        window.AAM.setTargetActorRaw(uuid);
//        ui.notifications.info("Target Actor set.");
//        this.close();
//      });
//      return $(wrap);
//    }
//  }

  class JT_Aamhub extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "jt-aamhub",
        classes: ["jt-app"],
        title: "PC/NPC Generator",
        template: "modules/axeclefts-adventurers-minions/templates/aamhub.hbs",
        width: 800, height: 560, resizable: false, minWidth: 520, minHeight: 360,
        tabs: [{ navSelector: ".tabs", contentSelector: ".tab-content", initial: "ability" }]
      });
    }

    async render(force, options = {}) { try { window.JT_syncThemeWithD35E?.(); } catch {} return super.render(force, options); }

    async getData() {
      // Pull sub-apps if present
      this._abilityApp = (typeof window.JT_AbilityAssigner === "function") ? new window.JT_AbilityAssigner() : null;
      this._classApp   = (typeof window.JT_ClassAssigner   === "function") ? new window.JT_ClassAssigner()   : null;

      // Render sub-templates (embed into tabs)
      let abilityHtml = `<div class="jt-muted">Ability Assigner not available.</div>`;
      if (this._abilityApp?.getData) {
        const abilityData = (await this._abilityApp.getData()) ?? {};
        abilityHtml = await renderTemplate(this._abilityApp.options.template, abilityData);
      }
      let classAssignerHtml = `<div class="jt-muted">Class Assigner not available.</div>`;
      if (this._classApp?.getData) {
        const classData = (await this._classApp.getData()) ?? {};
        classAssignerHtml = await renderTemplate(this._classApp.options.template, classData);
      }

      // Provide the current target actor raw text to bind into the hub field
      return { abilityHtml, classAssignerHtml, targetRaw: window.AAM.targetActorRaw || "" };
    }

    activateListeners(html) {
      super.activateListeners(html);
      try { window.JT_syncThemeWithD35E?.(); } catch {}

      // Bind sub-app listeners to their tab roots
      const $ability = html.find("#tab-ability");
      const $classes = html.find("#tab-classes");
      if (this._abilityApp?.activateListeners) { this._abilityApp._element = $ability; this._abilityApp.activateListeners($ability); }
      if (this._classApp?.activateListeners)   { this._classApp._element   = $classes; this._classApp.activateListeners($classes); }

      // Tabs
      const tabs = new Tabs({ navSelector: ".tabs", contentSelector: ".tab-content",
        initial: this.options.tabs?.[0]?.initial ?? "ability",
        callback: () => { try { window.JT_syncThemeWithD35E?.(); } catch {} } }, html[0]);
      tabs.bind(html[0]);

      // === Shared Target Actor field ===
      const $input = html.find('input[name="hubActorId"]');
      $input.val(window.AAM.targetActorRaw || "");
      $input.on("change input", (ev) => window.AAM.setTargetActorRaw(ev.currentTarget.value || ""));
      html.find('[data-action="pick-actor"]').on("click", () => window.AAM.openActorPicker());

      // Keep field in sync if changed elsewhere
      const onChange = (ev) => { if ($input.val() !== (ev.detail?.raw ?? "")) $input.val(ev.detail?.raw ?? ""); };
      window.addEventListener("AAM:targetChanged", onChange);
      this.once("close", () => window.removeEventListener("AAM:targetChanged", onChange));

      // === Custom resize handle ===
      const $handle = html.find('[data-resize-handle]');
      if ($handle.length) {
        const winEl = this.element[0], opts = this.options;
        const onMouseDown = (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const startX = ev.clientX, startY = ev.clientY, rect = winEl.getBoundingClientRect();
          const startW = rect.width, startH = rect.height;
          const mm = (e) => { const dx = e.clientX-startX, dy=e.clientY-startY;
            this.setPosition({ width: Math.max(opts.minWidth ?? 520, startW+dx), height: Math.max(opts.minHeight ?? 360, startH+dy) });
            const wc = winEl.querySelector(".window-content"); if (wc) wc.style.overflow = "auto"; };
          const mu = () => { window.removeEventListener("mousemove", mm, true); window.removeEventListener("mouseup", mu, true); document.body.style.userSelect=""; document.body.style.cursor=""; };
          window.addEventListener("mousemove", mm, true); window.addEventListener("mouseup", mu, true);
          document.body.style.userSelect="none"; document.body.style.cursor="se-resize";
        };
        $handle.off("mousedown").on("mousedown", onMouseDown);
      }
    }
  }

  window.JT_Aamhub = JT_Aamhub;
})();
