// scripts/apps/ClassAssigner.js
(function(){
  const MOD_ID = window.AAM?.MOD_ID || "axeclefts-adventurers-minions";

  class JT_ClassAssigner extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "jt-class-assigner", classes: ["jt-app"], title: "Class Assigner",
        template: "modules/axeclefts-adventurers-minions/templates/class-assigner.hbs", width: 720
      });
    }

    async render(force, options = {}) { try { window.JT_syncThemeWithD35E?.(); } catch {} return super.render(force, options); }

    _isClassesPack(pack){ try{ const label=String(pack?.metadata?.label??""); const collection=String(pack?.collection??""); return collection==="D35E.classes" || label==="Classes"; } catch{ return false; } }

    async _collectEntriesSafe() {
      const entries=[]; try{
        const packs=game.packs.filter(p=>this._isClassesPack(p));
        for (const pack of packs){
          try{
            const idx=await pack.getIndex({ fields:["name","type","img","system.classType","system.subType","system.subtype","system.isPrestige","system.category"] });
            for (const i of idx){ if (String(i.type)!=="class") continue;
              entries.push({ id:i._id, name:i.name, pack, packCollection:pack.collection, system:i.system??{} });
            }
          } catch(e2){ console.error(`ClassAssigner: index error for ${pack?.collection}`, e2); }
        }
        entries.sort((a,b)=> a.name.localeCompare(b.name) || a.packCollection.localeCompare(b.packCollection));
      } catch(e){ console.error("ClassAssigner: collect error", e); }
      return entries;
    }

    _isPrestige(e){ const s=e.system??{}; const t=(s.classType||s.subType||s.subtype||s.category||"").toString().toLowerCase();
      const flag=[s.isPrestige,s.prestige,s.isPrestigeClass,t.includes("prestige")].some(Boolean);
      return flag || /prestige/i.test(e.packCollection) || /\bprestige\b/i.test(e.name); }

    async getData(){
      try{
        const entries=await this._collectEntriesSafe();
        if (!entries.length) return { baseOptions:"", prestigeOptions:"", extraRows:"", _emptyMessage:"No classes found in D35E.classes or packs labeled exactly “Classes”." };
        const base=entries.filter(e=>!this._isPrestige(e)), pre=entries.filter(e=>this._isPrestige(e));
        const opt = (arr)=>arr.map(e=>`<option value="${e.packCollection}::${e.id}">${e.name} — [${e.packCollection}]</option>`).join("");
        const baseOptions=opt(base), prestigeOptions=opt(pre);
        const makeRow=(i)=>`
          <div class="jt-row">
            <div class="jt-grow">
              <select class="jt-select class-select" name="extraSel${i}">
                <optgroup label="Base">${baseOptions}</optgroup>
                <optgroup label="Prestige">${prestigeOptions}</optgroup>
              </select>
            </div>
            <div style="width:7em;">
              <input class="jt-input jt-level-input" type="number" name="extraLvl${i}" placeholder="-" min="1" />
            </div>
            <label class="jt-muted"><input type="checkbox" name="extraUse${i}"/> Use</label>
          </div>`;
        return { baseOptions, prestigeOptions, extraRows:[0,1,2,3].map(makeRow).join("") };
      } catch(e){
        console.error("ClassAssigner: getData failed", e);
        return { baseOptions:"", prestigeOptions:"", extraRows:"", _emptyMessage:"An error occurred while preparing data." };
      }
    }

    activateListeners(html){
      super.activateListeners(html);
      const empty = html.find("[data-empty-state]"); if (empty.length) return;

      html.find("[data-action='assign']").on("click", this._assign.bind(this));

      // Live search model
      const $search=html.find('input[name="search"]'), $selects=html.find(".class-select");
      const model=new Map();
      $selects.each(function(){ const el=this, groups=[]; for (const child of Array.from(el.children)){
        if (child.tagName==="OPTGROUP"){ const label=child.getAttribute("label")||"";
          const opts=Array.from(child.querySelectorAll("option")).map(opt=>({value:opt.value,text:(opt.textContent||"").trim()}));
          groups.push({label, options:opts}); }
        else if (child.tagName==="OPTION"){ const text=(child.textContent||"").trim(), value=child.value;
          let grp=groups.find(g=>g.label===""); if(!grp){ grp={label:"",options:[]}; groups.push(grp); } grp.options.push({value,text}); } }
        model.set(el, groups); });

      function rebuildFromModel(selectEl, query){
        const groups=model.get(selectEl); if(!groups) return;
        const q=String(query||"").toLowerCase().trim(); const prev=selectEl.value;
        while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
        let total=0;
        for (const g of groups){
          const filtered=q? g.options.filter(o=>o.text.toLowerCase().includes(q)) : g.options.slice();
          if (!filtered.length) continue;
          if (g.label){ const og=document.createElement("optgroup"); og.label=g.label;
            for (const o of filtered){ const opt=document.createElement("option"); opt.value=o.value; opt.textContent=o.text; og.appendChild(opt); total++; }
            selectEl.appendChild(og);
          } else {
            for (const o of filtered){ const opt=document.createElement("option"); opt.value=o.value; opt.textContent=o.text; selectEl.appendChild(opt); total++; }
          }
        }
        if (total===0){ const ph=document.createElement("option"); ph.disabled=true; ph.selected=true; ph.textContent="(no matches)"; selectEl.appendChild(ph); return; }
        selectEl.value=prev; if (selectEl.value!==prev){ const first=selectEl.querySelector("option"); if(first) selectEl.value=first.value; }
      }
      $selects.each(function(){ rebuildFromModel(this,""); });
      $search.on("input",(ev)=>{ const q=ev.target.value; $selects.each(function(){ rebuildFromModel(this,q); }); });

      // Running total summary based on current target actor
      const $summary=html.find("#jt-level-summary");
      const valOrZero = (v)=>{ const n=Number(v); return Number.isFinite(n)&&n>=1?Math.floor(n):0; };
      const capSetting = game.settings.get(MOD_ID, "levelCap") ?? 20;

      const calcExisting = async () => {
        const actor = await window.AAM.resolveTargetActor();
        if (!actor) return 0;
        return actor.items.filter(i=>String(i.type)==="class")
          .reduce((sum, it)=> sum + (Number(getProperty(it,"system.levels"))||0), 0);
      };

      let existingTotal = 0;
      (async()=>{ existingTotal = await calcExisting(); updateSummary(); })();

      const updateSummary = () => {
        let selected=0;
        selected += valOrZero(html.find("input[name='baseLvl']").val());
        if (html.find("input[name='usePrestige']")[0]?.checked) selected += valOrZero(html.find("input[name='prestigeLvl']").val());
        for (let i=0;i<4;i++){ const use=html.find(`input[name='extraUse${i}']`)[0]?.checked; if(!use) continue; selected += valOrZero(html.find(`input[name='extraLvl${i}']`).val()); }
        const wipe = html.find("input[name='wipeFirst']")[0]?.checked;
        const includeExisting = !wipe;
        const existing = includeExisting ? existingTotal : 0;
        const enforceCap = html.find("input[name='enforceCap']")[0]?.checked;
        const cap = capSetting;
        const projected = selected + existing;
        let capText = enforceCap ? ` / Cap ${cap}` : " / Epic (no cap)";
        let htmlText = `Total Levels: <b>${projected}</b> <span class="jt-muted">(Selected: ${selected}${includeExisting?` + Existing: ${existing}`:""})</span>${capText}`;
        if (enforceCap && projected > cap) htmlText = htmlText.replace(/<b>(\d+)<\/b>/, `<b style="color:#ff6b6b;">$1</b>`);
        $summary.html(htmlText);
      };

      const events="input change";
      html.find("input[name='baseLvl']").on(events, updateSummary);
      html.find("input[name='prestigeLvl']").on(events, updateSummary);
      html.find("input[name='usePrestige']").on(events, updateSummary);
      for (let i=0;i<4;i++){ html.find(`input[name='extraLvl${i}']`).on(events, updateSummary); html.find(`input[name='extraUse${i}']`).on(events, updateSummary); }
      html.find("input[name='wipeFirst']").on(events, updateSummary);
      html.find("input[name='enforceCap']").on(events, updateSummary);

      // Recompute existing total when the shared target changes
      const onTarget = async ()=>{ existingTotal = await calcExisting(); updateSummary(); };
      window.addEventListener("AAM:targetChanged", onTarget);
      this.once("close", ()=> window.removeEventListener("AAM:targetChanged", onTarget));

      updateSummary();
    }

    _level(n){ let v=Number(n); if(!Number.isFinite(v)) return null; if(v<1) v=1; return v; }

    async _assign(){
      const html=this.element;
      const actor = await window.AAM.resolveTargetActor();
      if (!actor) return ui.notifications.error("No target actor found. Use the Target Actor field (hub) or select a token.");

      const selections=[];
      const baseSel=html.find("select[name='baseSel']").val();
      const baseLvl=this._level(html.find("input[name='baseLvl']").val());
      if (!baseSel || baseLvl===null) return ui.notifications.error("Pick a Base class and a valid level (≥ 1).");
      selections.push({ sel: baseSel, level: baseLvl });

      if (html.find("input[name='usePrestige']")[0]?.checked){
        const preSel=html.find("select[name='prestigeSel']").val();
        const preLvl=this._level(html.find("input[name='prestigeLvl']").val());
        if (!preSel || preLvl===null) return ui.notifications.error("Prestige class level invalid.");
        selections.push({ sel: preSel, level: preLvl });
      }

      for (let i=0;i<4;i++){
        const use=html.find(`input[name='extraUse${i}']`)[0]?.checked; if(!use) continue;
        const s=html.find(`select[name='extraSel${i}']`).val();
        const l=this._level(html.find(`input[name='extraLvl${i}']`).val());
        if (!s || l===null) return ui.notifications.error(`Extra class #${i+1} invalid.`);
        selections.push({ sel:s, level:l });
      }

      const wipeFirst=html.find("input[name='wipeFirst']")[0]?.checked;
      if (wipeFirst){ const toDelete=actor.items.filter(i=>String(i.type)==="class").map(i=>i.id); if(toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete); }

      const enforceCap=html.find("input[name='enforceCap']")[0]?.checked;
      const cap=game.settings.get(MOD_ID, "levelCap") ?? 20;

      let existingTotal=0;
      if (!wipeFirst){
        existingTotal = actor.items.filter(i=>String(i.type)==="class").reduce((sum,it)=> sum + (Number(getProperty(it,"system.levels"))||0), 0);
      }

      if (enforceCap){
        let remaining=Math.max(0, cap-existingTotal); const original=selections.map(s=>({...s}));
        for (const s of selections){ if (remaining<=0){ s.level=0; continue; } s.level=Math.max(1, Math.min(s.level, remaining)); remaining -= s.level; }
        const requested=original.reduce((t,s)=>t+s.level,0), applied=selections.reduce((t,s)=>t+s.level,0);
        if (applied<requested) ui.notifications.warn(`Total level cap ${cap} enforced (including existing): adjusted selected levels to ${applied}.`);
        for (let i=selections.length-1;i>=0;i--) if(selections[i].level<=0) selections.splice(i,1);
        if (!selections.length) return ui.notifications.error(`No levels could be assigned under the total cap of ${cap}.`);
      }

      // Build lookup
      const byKey=new Map();
      for (const pack of game.packs.filter(p=>this._isClassesPack(p))){
        const idx=await pack.getIndex(); for (const i of idx) byKey.set(`${pack.collection}::${i._id}`, { pack, id:i._id });
      }

      const results=[];
      for (const {sel,level} of selections){
        const ref=byKey.get(sel); if(!ref){ ui.notifications.warn(`Not found: ${sel}`); continue; }
        try{
          const doc=await ref.pack.getDocument(ref.id);
          const data=doc.toObject(); foundry.utils.setProperty(data,"system.levels", level);
          const created = await actor.createEmbeddedDocuments("Item", [data]);
          results.push({ name:data.name, level, pack:ref.pack.collection, id:created?.[0]?.id });
        } catch(err){ console.error("ClassAssigner: createEmbeddedDocuments failed", err); ui.notifications.error(`Failed to add a class from ${ref.pack.collection}.`); }
      }

      if (results.length){
        const lines=results.map(r=>`Added: <b>${r.name}</b> (Level ${r.level}) [${r.pack}]`);
        ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }),
          content:`<div class="mono"><b>Class Assigner</b><ul><li>${lines.join("</li><li>")}</li></ul></div>` });
      }
      ui.notifications.info(`Class assignment complete for ${actor.name}.`);
    }
  }

  window.JT_ClassAssigner = JT_ClassAssigner;
})();
