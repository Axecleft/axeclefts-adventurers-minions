// scripts/apps/AbilityAssigner.js
(function(){
  const MOD_ID = window.AAM?.MOD_ID || "axeclefts-adventurers-minions";

  class JT_AbilityAssigner extends Application {
    static get defaultOptions() {
      return foundry.utils.mergeObject(super.defaultOptions, {
        id: "jt-ability-assigner",
        classes: ["jt-app"],
        title: "Ability Assigner",
        template: "modules/axeclefts-adventurers-minions/templates/ability-assigner.hbs",
        width: 720, height: "auto"
      });
    }

    async render(force, options = {}) { try { window.JT_syncThemeWithD35E?.(); } catch {} return super.render(force, options); }

    _arrays() {
      return {
        low: [13,12,11,10,9,8],
        standard: [15,14,13,12,10,8],
        high: [16,15,14,12,10,8],
        custom: game.settings.get(MOD_ID, "customStatArray") ?? [15,14,13,12,10,8]
      };
    }

    _pointCost(s){const t={8:0,9:1,10:2,11:3,12:4,13:5,14:6,15:8,16:10,17:13,18:16};return t[s]??Infinity;}
    _sumPointBuy(a){return a.reduce((t,s)=>t+this._pointCost(s),0);}
    _clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
    _roll3d6(){return Array.from({length:6},()=> (1+Math.floor(Math.random()*6))+(1+Math.floor(Math.random()*6))+(1+Math.floor(Math.random()*6))); }
    _roll4d6dl(){ function once(){const d=[1,2,3,4].map(()=>1+Math.floor(Math.random()*6)).sort((a,b)=>a-b); return d.slice(1).reduce((a,b)=>a+b,0);} return Array.from({length:6}, once); }

    async getData() {
      return { arrays: this._arrays(), pb: {budget:28,min:8,max:18,scores:[8,8,8,8,8,8]}, roll:{mode:"4d6dl",scores:[]},
        abilityOrder:["str","dex","con","int","wis","cha"], abilityLabels:{str:"STR",dex:"DEX",con:"CON",int:"INT",wis:"WIS",cha:"CHA"} };
    }

    _readMethod(html){return html.find('select[name="method"]').val()||"arrays";}
    _getPrimarySecondary(html){return { primary: html.find('select[name="primary"]').val() || "str", secondary: html.find('select[name="secondary"]').val() || "" };}

    _readArrayPreset(html, arrays){
      const key = html.find('select[name="arrayPreset"]').val() || "standard";
      if (key === "custom") {
        const txt = html.find('input[name="customArray"]').val().trim();
        const nums = txt.split(/[,\s]+/).map(n=>parseInt(n,10)).filter(Number.isFinite);
        return nums.length===6 ? nums : arrays.custom.slice();
      }
      return arrays[key].slice();
    }

    _saveCustomArray(html){
      const txt = html.find('input[name="customArray"]').val().trim();
      const arr = txt.split(/[,\s]+/).map(n=>parseInt(n,10)).filter(Number.isFinite);
      if (arr.length !== 6) return ui.notifications.warn("Custom array must contain exactly 6 integers.");
      game.settings.set(MOD_ID, "customStatArray", arr);
      ui.notifications.info("Saved custom array to world settings.");
    }

    _readPointBuy(html){
      const budget = parseInt(html.find('input[name="pbBudget"]').val(),10) || 28;
      const min    = parseInt(html.find('input[name="pbMin"]').val(),10)    || 8;
      const max    = parseInt(html.find('input[name="pbMax"]').val(),10)    || 18;
      const scores = ["str","dex","con","int","wis","cha"].map(a=>{
        const v = parseInt(html.find(`input[name="pb_${a}"]`).val(),10);
        return this._clamp(Number.isFinite(v) ? v : 8, min, max);
      });
      return {budget,min,max,scores};
    }

    _readRoll(html){
      const mode = html.find('select[name="rollMode"]').val() || "4d6dl";
      const txt  = html.find('input[name="rolledArray"]').val().trim();
      const scores = txt ? txt.split(/[,\s]+/).map(n=>parseInt(n,10)).filter(Number.isFinite) : [];
      return {mode,scores};
    }

    _gatherSix(html, arrays){
      const m = this._readMethod(html);
      if (m==="arrays") return this._readArrayPreset(html, arrays);
      if (m==="pointbuy") return this._readPointBuy(html).scores;
      const {scores}=this._readRoll(html); if (scores.length!==6) throw new Error("Please generate rolls first."); return scores;
    }

    _mapScoresAuto(six, primary, secondary){
      const order=["str","dex","con","int","wis","cha"], sorted=six.slice().sort((a,b)=>b-a), assign={};
      if (!order.includes(primary)) primary="str"; assign[primary]=sorted.shift();
      if (secondary && secondary!==primary && order.includes(secondary)) assign[secondary]=sorted.shift();
      const rem = order.filter(a=>!(a in assign));
      for (let i=sorted.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [sorted[i],sorted[j]]=[sorted[j],sorted[i]];}
      for (let i=0;i<rem.length;i++) assign[rem[i]]=sorted[i]; return assign;
    }

    async _applyToActor(html, assign){
      const actor = await window.AAM.resolveTargetActor();
      if (!actor) return ui.notifications.error("No target actor found. Use the Target Actor field (hub) or select a token.");
      const patch={system:{abilities:{}}}; for (const [k,v] of Object.entries(assign)) patch.system.abilities[k]={value:v};
      if (!(actor?.testUserPermission?.(game.user, (foundry?.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) ?? actor?.isOwner)) {
      return ui.notifications.error("You must own the target Actor to assign ability scores.");
      }
      await actor.update(patch);
      ui.notifications.info(`Ability scores assigned to ${actor.name}.`);
      const lines = Object.entries(assign).map(([a,v])=> `${a.toUpperCase()}: <b>${v}</b>`);
      ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }),
        content:`<div class="mono"><b>Ability Assigner</b><ul><li>${lines.join("</li><li>")}</li></ul></div>` });
    }

    _updateArrayPreview(html, six){ html.find("#jt-ability-preview").text(six.join(", ")); this._refreshManualMapOptions(html, six); }
    _isManualMapEnabled(html){ const m=this._readMethod(html); if (m==="pointbuy") return false; return html.find('input[name="manualMap"]')[0]?.checked ?? false; }

    _refreshManualMapOptions(html, six){
      const m=this._readMethod(html), enabled=this._isManualMapEnabled(html)&&(m==="arrays"||m==="roll");
      const panel=html.find('[data-pane="manualMap"]'); panel.toggle(enabled); if (!enabled) return;
      const optsHtml=six.map((v,i)=>`<option value="${i}">${v}</option>`).join(""), abilities=["str","dex","con","int","wis","cha"];
      for (const a of abilities){const sel=html.find(`select[name="map_${a}"]`); const prev=sel.val(); sel.html(optsHtml); if(Number(prev)>=0&&Number(prev)<six.length) sel.val(prev); else sel.val("");}
      const updateDisables=()=>{const chosen=new Set(); for (const a of abilities){const v=html.find(`select[name="map_${a}"]`).val(); if(v!==""&&v!=null) chosen.add(String(v));}
        for (const a of abilities){ const sel=html.find(`select[name="map_${a}"]`); sel.find("option").prop("disabled", false);
          for (const idx of chosen){ if (sel.val()===idx) continue; sel.find(`option[value="${idx}"]`).prop("disabled", true); } } };
      if (!panel.data("wired")){ panel.on("change", "select", updateDisables); panel.data("wired", true); }
      updateDisables();
    }

    _readManualMapping(html, six){
      const abilities=["str","dex","con","int","wis","cha"], indices=[], result={};
      for (const a of abilities){ const v=html.find(`select[name="map_${a}"]`).val(); if(v===""||v==null) return null;
        const idx=Number(v); if(!Number.isInteger(idx)||idx<0||idx>=six.length) return null; indices.push(idx); result[a]=six[idx]; }
      if (new Set(indices).size !== 6) return null; return result;
    }

    activateListeners(html){
      super.activateListeners(html);
      html.find('[data-action="saveCustom"]').on("click",()=>this._saveCustomArray(html));

      const panes = { arrays: html.find('[data-pane="arrays"]'), pointbuy: html.find('[data-pane="pointbuy"]'), roll: html.find('[data-pane="roll"]'), manualMap: html.find('[data-pane="manualMap"]') };
      const arrays=this._arrays();
      const applyVis = () => {
        const m=this._readMethod(html);
        panes.arrays.toggle(m==="arrays"); panes.pointbuy.toggle(m==="pointbuy"); panes.roll.toggle(m==="roll");
        const six = (()=>{ try{ return this._gatherSix(html, arrays);} catch{ return []; } })();
        this._refreshManualMapOptions(html, six);
        if (six.length===6) this._updateArrayPreview(html, six);
      };
      html.find('select[name="method"]').on("change", applyVis);
      html.find('input[name="manualMap"]').on("change", ()=>{ try{ this._refreshManualMapOptions(html, this._gatherSix(html, arrays)); } catch{ this._refreshManualMapOptions(html, []); } });
      applyVis();

      html.find('select[name="arrayPreset"], input[name="customArray"]').on("input change", ()=>{ const six=this._readArrayPreset(html, arrays); this._updateArrayPreview(html, six); });

      const pbInputs=['input[name="pbBudget"]','input[name="pbMin"]','input[name="pbMax"]','input[name="pb_str"]','input[name="pb_dex"]','input[name="pb_con"]','input[name="pb_int"]','input[name="pb_wis"]','input[name="pb_cha"]'];
      const refreshPB = () => {
        const {budget,min,max,scores}=this._readPointBuy(html);
        ["str","dex","con","int","wis","cha"].forEach((a,i)=>{ const v=this._clamp(scores[i],min,max); html.find(`input[name="pb_${a}"]`).val(v); scores[i]=v; });
        const remain = budget - this._sumPointBuy(scores); const $r=html.find("#pb-remaining"); $r.text(`${remain>=0?remain:0}`); $r.css("color", remain<0 ? "#ff6b6b" : ""); this._updateArrayPreview(html, scores);
      };
      for (const sel of pbInputs) html.find(sel).on("input change", refreshPB);
      html.find("[data-pb-inc]").on("click", ev=>{ const a=ev.currentTarget.getAttribute("data-pb-inc"); const $inp=html.find(`input[name="pb_${a}"]`); $inp.val((parseInt($inp.val(),10)||8)+1); refreshPB();});
      html.find("[data-pb-dec]").on("click", ev=>{ const a=ev.currentTarget.getAttribute("data-pb-dec"); const $inp=html.find(`input[name="pb_${a}"]`); $inp.val((parseInt($inp.val(),10)||8)-1); refreshPB();});
      html.find("[data-pb-preset]").on("click", ev=>{ const b=parseInt(ev.currentTarget.getAttribute("data-pb-preset"),10); html.find('input[name="pbBudget"]').val(b); refreshPB();});
      refreshPB();

      const doRoll=()=>{ const mode=html.find('select[name="rollMode"]').val()||"4d6dl"; const arr=(mode==="3d6")?this._roll3d6():this._roll4d6dl();
        html.find('input[name="rolledArray"]').val(arr.join(", ")); this._updateArrayPreview(html, arr); };
      html.find('[data-action="rollNow"]').on("click", doRoll);
      html.find('input[name="rolledArray"]').on("input",()=>{ const arr=html.find('input[name="rolledArray"]').val().trim().split(/[,\s]+/).map(n=>parseInt(n,10)).filter(Number.isFinite); if(arr.length===6) this._updateArrayPreview(html, arr); });

      html.find('[data-action="assign"]').on("click", async ()=>{
        let six; try{ six=this._gatherSix(html, arrays);} catch(e){ return ui.notifications.error(e.message||"Unable to gather six ability scores."); }
        if (!Array.isArray(six)||six.length!==6||six.some(v=>!Number.isFinite(v))) return ui.notifications.error("Provide exactly six numeric scores.");
        const m=this._readMethod(html), manual=this._isManualMapEnabled(html)&&(m==="arrays"||m==="roll");
        let mapping;
        if (manual){ const mm=this._readManualMapping(html, six); if(!mm) return ui.notifications.error("Manual mapping must choose each value exactly once."); mapping=mm; }
        else if (m==="pointbuy"){ const [str,dex,con,int,wis,cha]=this._readPointBuy(html).scores; mapping={str,dex,con,int,wis,cha}; }
        else { const {primary,secondary}=this._getPrimarySecondary(html); mapping=this._mapScoresAuto(six,primary,secondary); }
        await this._applyToActor(html, mapping);
      });

      // If target changes while the app is open, nothing special is needed here,
      // but you could listen if you want to refresh any future summaries.
    }
  }

  window.JT_AbilityAssigner = JT_AbilityAssigner;
})();
