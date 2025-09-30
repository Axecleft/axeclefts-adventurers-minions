// scripts/apps/aamhub.js — Target chip + Open Sheet button (enabled when actor resolves)
(function(){
  const MOD_ID = window.AAM?.MOD_ID || "axeclefts-adventurers-minions";

  // Minimal fallback picker (in case main.js didn't define AAM.openActorPicker)
  function _fallbackPicker() {
    const content = `
      <div class="jt-app jt-grid" style="gap:8px;">
        <div class="jt-row" style="gap:8px;">
          <input class="jt-input" type="search" placeholder="Search actors..." data-aam-pick-search />
        </div>
        <div style="max-height:360px; overflow:auto;" data-aam-pick-list></div>
      </div>`;
    const dlg = new Dialog({
      title: "Select Actor",
      content,
      buttons: { close: { label: "Close" } },
      render: html => {
        const $s = html.find('[data-aam-pick-search]');
        const $l = html.find('[data-aam-pick-list]');
        const render = (q="")=>{
          const qq=q.toLowerCase().trim();
          const rows = game.actors.contents
            .filter(a=>!qq || (a.name||"").toLowerCase().includes(qq))
            .sort((a,b)=>(a.name||"").localeCompare(b.name||""))
            .map(a=>`
              <div class="jt-row jt-card" style="justify-content:space-between; align-items:center; margin-bottom:6px; padding:6px 8px;">
                <div class="jt-row" style="gap:8px; align-items:center;">
                  <img src="${(a.prototypeToken?.texture?.src)||a.img||"icons/svg/mystery-man.svg"}" width="28" height="28" style="border-radius:4px;" onerror="this.onerror=null; this.src='icons/svg/mystery-man.svg';" />
                  <div>
                    <div class="mono"><b>${Handlebars?.Utils?.escapeExpression(a.name||"Unnamed")}</b></div>
                    <div class="jt-muted mono" style="font-size:11px;">Actor.${a.id}</div>
                  </div>
                </div>
                <button class="jt-button" data-aam-pick="${a.uuid}">Select</button>
              </div>`).join("") || `<div class="jt-muted">No actors found.</div>`;
          $l.html(rows);
        };
        render();
        $s.on("keydown", ev => { if (ev.key === "Enter") ev.preventDefault(); });
        $s.on("input", ev => render(ev.currentTarget.value || ""));
        $l.on("click", "[data-aam-pick]", ev => {
          const uuid = ev.currentTarget.getAttribute("data-aam-pick");
          window.AAM?.setTargetActorRaw?.(uuid);
          ui.notifications?.info?.("Target Actor set.");
          dlg.close();
        });
      }
    });
    dlg.render(true);
  }
  const _openPicker = () =>
    (window.AAM && typeof window.AAM.openActorPicker === "function")
      ? window.AAM.openActorPicker()
      : _fallbackPicker();

  class JT_Aamhub extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "jt-aamhub",
        classes: ["jt-app"],
        title: "PC/NPC Generator",
        template: "modules/axeclefts-adventurers-minions/templates/aamhub.hbs",
        width: 800, height: 560,
        resizable: false, minWidth: 520, minHeight: 360,
        tabs: [{ navSelector: ".tabs", contentSelector: ".tab-content", initial: "ability" }]
      });
    }

    async render(force, options = {}) {
      try { window.JT_syncThemeWithD35E?.(); } catch {}
      return super.render(force, options);
    }

    async getData() {
      // Pre-render sub-templates for both tabs
      let abilityHtml = `<div class="jt-muted">Ability Assigner not available.</div>`;
      if (typeof window.JT_AbilityAssigner === "function") {
        try { const app = new window.JT_AbilityAssigner(); abilityHtml = await renderTemplate(app.options.template, await app.getData()); }
        catch (e) { console.error(`${MOD_ID} | ability render`, e); }
      }
      let classAssignerHtml = `<div class="jt-muted">Class Assigner not available.</div>`;
      if (typeof window.JT_ClassAssigner === "function") {
        try { const app = new window.JT_ClassAssigner(); classAssignerHtml = await renderTemplate(app.options.template, await app.getData()); }
        catch (e) { console.error(`${MOD_ID} | class render`, e); }
      }

      return { abilityHtml, classAssignerHtml, targetRaw: window.AAM?.targetActorRaw || "" };
    }

    activateListeners(html) {
      super.activateListeners(html);
      try { window.JT_syncThemeWithD35E?.(); } catch {}

      // Delegate sub-app listeners to their tab roots
      const $ability = html.find("#tab-ability");
      const $classes = html.find("#tab-classes");
      if (typeof window.JT_AbilityAssigner === "function") { try { const inst = new window.JT_AbilityAssigner(); inst._element = $ability; inst.activateListeners($ability); } catch {} }
      if (typeof window.JT_ClassAssigner === "function")  { try { const inst = new window.JT_ClassAssigner(); inst._element = $classes; inst.activateListeners($classes); } catch {} }

      // Tabs
      const tabs = new Tabs({ navSelector: ".tabs", contentSelector: ".tab-content", initial: this.options.tabs?.[0]?.initial ?? "ability",
        callback: () => { try { window.JT_syncThemeWithD35E?.(); } catch {} } }, html[0]);
      tabs.bind(html[0]);

      // Shared Target Actor input
      const $input = html.find('input[name="hubActorId"]');
      $input.val(window.AAM?.targetActorRaw || "");
      $input.on("input change", (ev) => window.AAM?.setTargetActorRaw?.(ev.currentTarget.value || ""));

      // Live target chip elements
      const $chipName = html.find("[data-aam-chip-name]");
      const $chipImg  = html.find("[data-aam-chip-img]");
      const $btnOpen  = html.find("[data-action='open-actor-sheet']");

      const refreshTargetChip = async () => {
        try {
          const actor = await window.AAM?.resolveTargetActor?.();
          if (actor) {
            const name = actor.name || "Unnamed";
            const img  = (actor.prototypeToken?.texture?.src) || actor.img || "icons/svg/mystery-man.svg";
            $chipName.text(name).removeClass("jt-muted");
            $chipImg.attr("src", img).css("display", "");
            $btnOpen.prop("disabled", false).attr("title", `Open ${name}`).data("aamUuid", actor.uuid);
          } else {
            $chipName.text("(using selected token)").addClass("jt-muted");
            $chipImg.css("display", "none");
            $btnOpen.prop("disabled", true).attr("title", "Open Actor Sheet").data("aamUuid", "");
          }
        } catch {
            $chipName.text("(using selected token)").addClass("jt-muted");
            $chipImg.css("display", "none");
            $btnOpen.prop("disabled", true).attr("title", "Open Actor Sheet").data("aamUuid", "");
        }
      };

      // Initial chip state
      refreshTargetChip();

      // Sync chip when target changes anywhere
      const onChange = () => refreshTargetChip();
      window.addEventListener("AAM:targetChanged", onChange);
      this._aamOnTargetChanged = onChange;

      // PICK button bindings (direct + delegated + global safety net)
      const handlerPick = (ev) => { ev?.preventDefault?.(); ev?.stopPropagation?.(); _openPicker(); };
      html.find("[data-action='pick-actor']").off(".aam-pick").on("click.aam-pick", handlerPick);
      html.off("click.aam-pick-delegated").on("click.aam-pick-delegated", "[data-action='pick-actor']", handlerPick);
      $(document).off("click.aam-pick-global", "[data-action='pick-actor']")
                 .on("click.aam-pick-global", "[data-action='pick-actor']", (ev)=>{
                    const $win = $(ev.target).closest("#jt-aamhub"); if (!$win.length) return; handlerPick(ev);
                  });

      // OPEN SHEET button (delegated + direct)
      const handlerOpen = async (ev) => {
        ev?.preventDefault?.(); ev?.stopPropagation?.();
        // Prefer currently resolved actor (handles selected token fallback)
        const actor = await window.AAM?.resolveTargetActor?.();
        if (actor?.sheet) return actor.sheet.render(true);
        ui.notifications?.warn?.("No actor to open.");
      };
      html.find("[data-action='open-actor-sheet']").off(".aam-open").on("click.aam-open", handlerOpen);
      html.off("click.aam-open-delegated").on("click.aam-open-delegated", "[data-action='open-actor-sheet']", handlerOpen);

      html.find("[data-action='pick-actor']").attr("title", "Pick from Actors Directory");
    }

    async close(options={}) {
      try {
        if (this._aamOnTargetChanged) {
          window.removeEventListener("AAM:targetChanged", this._aamOnTargetChanged);
          this._aamOnTargetChanged = null;
        }
      } catch {}
      return super.close(options);
    }
  }

  window.JT_Aamhub = JT_Aamhub;
})();
