/* Dynamic Pool System. Natural faces are preserved; browser dice never establish results. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;
Arkham.handlers = Arkham.handlers || {};
(function (A) {
  'use strict';
  var H = A.handlers;
  function rulesVersion() { return A.catalog && A.catalog.sourceVersion || 'corebook-2024-7901c7c8cf06'; }
  function citation(page) { return {bookId:A.catalog && A.catalog.provenance && A.catalog.provenance.bookId || 'arkham-rpg-corebook-2024',printedPage:page,pdfPageIndex:page,sourceVersion:rulesVersion()}; }
  function die(ctx) { var n = ctx.dependencies.d6 ? ctx.dependencies.d6() : Math.floor(Math.random()*6)+1; return ctx.integer(n,1,6,'server die'); }
  function character(ctx,p) { var c=ctx.record('characters',p.characterId); ctx.own(c); if(p.sessionId!==undefined && p.sessionId!==null)ctx.record('sessions',p.sessionId); return c; }
  function playable(ctx,p) {
    var c=character(ctx,p);
    if(c.status!=='APPROVED' || c.outOfPlay) ctx.fail('VALIDATION','An approved investigator able to act is required.');
    var s=ctx.record('sessions',p.sessionId);
    if(s.status!=='ACTIVE') ctx.fail('CONFLICT','Play requires an active session.');
    var attendance=ctx.records('attendance').some(function(r){return r.sessionId===s.id && r.characterId===c.id && r.userId===c.ownerUserId && r.attendance==='PRESENT';});
    if(!attendance) ctx.fail('FORBIDDEN','Investigator must be marked present in this session.');
    return {character:c,session:s};
  }
  function discard(c,n) { var normal=Math.min(c.normalDice,n); c.normalDice-=normal; c.horrorDice=Math.max(0,c.horrorDice-(n-normal)); }
  function activeInjuries(c) { return (c.injuries || []).filter(function(i){return !i.healedAt;}); }
  function requireResolvedTrauma(ctx,c) {
    if((c.effects||[]).some(function(e){return e.type==='PENDING_TRAUMA' && !e.resolvedAt;})) ctx.fail('CONFLICT','Resolve the pending horror consequence before another action.');
  }
  function injuryIds(c) { return activeInjuries(c).map(function(i){return i.entityId;}); }
  function blockedHealing(c) { return injuryIds(c).some(function(id){return ['nasty-cut','comatose','dire'].indexOf(id)>=0;}); }
  function refill(c) {
    var available=c.normalDice+c.horrorDice;
    var missing=Math.max(0,c.poolLimit-available);
    var horror=Math.min(missing,Math.max(0,Math.min(c.horrorLimit,c.poolLimit)-c.horrorDice));
    c.horrorDice+=horror; c.normalDice+=missing-horror;
  }
  A.refillPool = refill;
  A.discardPoolDice = discard;
  function stateView(c) { return {poolMaximum:c.poolMaximum,poolLimit:c.poolLimit,normalDice:c.normalDice,horrorDice:c.horrorDice,horrorLimit:c.horrorLimit,insightCurrent:c.insightCurrent,insightLimit:c.insightLimit,version:c.version}; }
  function event(ctx,c,type,data,sessionId) {
    var id=ctx.id('event','events');
    ctx.state.events[id]={id:id,campaignId:c.campaignId,characterId:c.id,sessionId:sessionId||null,type:type,text:type,details:data,actor:ctx.user.id,visibility:'CAMPAIGN_PLAYERS',createdAt:ctx.at,updatedAt:ctx.at,version:1};
  }
  function ownAuthorize(ctx,p) { character(ctx,p); }
  function safeCharacter(ctx,c) { return A.characterView ? A.characterView(ctx,c) : ctx.clone(c); }
  function adjudicationSource(ctx,p,c) {
    var groups={KNACK:'knacks',PERSONALITY:'personalities',EQUIPMENT:'equipment'},group=groups[p.kind];
    if(!group)ctx.fail('VALIDATION','Choose a knack, personality, or equipment rule source.');
    var entry=((A.catalog||{})[group]||[]).find(function(e){return e.id===p.entityId;});
    if(!entry || entry.verificationStatus!=='VERIFIED' || entry.status!=='VERIFIED' || entry.sourceVersion!==rulesVersion())ctx.fail('RULE_NOT_VERIFIED','A verified canonical rule source is required.');
    var owned=p.kind==='KNACK'?(c.knacks||[]).indexOf(entry.id)>=0:p.kind==='PERSONALITY'?c.build&&c.build.personalityId===entry.id:(c.equipment||[]).some(function(item){return item.entityId===entry.id && Number.isInteger(item.quantity) && item.quantity>0;});
    if(!owned)ctx.fail('VALIDATION','The investigator must own the selected knack or equipment, or have the selected personality.');
    var source=citation(entry.printedPage);source.entityId=entry.id;source.name=entry.name;source.verificationStatus='VERIFIED';
    source.sha256=(entry.source||{}).sha256 || ((A.catalog||{}).provenance||{}).sha256;
    return source;
  }
  function adjudicationContext(ctx,p) {
    ctx.mustGM();var c=character(ctx,p);
    if(c.status!=='APPROVED')ctx.fail('VALIDATION','An approved investigator is required.');
    var s=ctx.record('sessions',p.sessionId);
    if(['ACTIVE','PAUSED'].indexOf(s.status)<0)ctx.fail('CONFLICT','Rule effects require an active or paused session.');
    return {character:c,session:s,source:adjudicationSource(ctx,p,c)};
  }
  function activeRuleEffects(ctx,c,session) {
    return (c.effects||[]).filter(function(effect){
      if(effect.type!=='GM_RULE_EFFECT' || effect.resolvedAt || effect.expiredAt || effect.sessionId!==session.id)return false;
      var parameters=effect.parameters||{},duration=parameters.duration;
      if(['NEXT_ACTION','SCENE','SESSION','GM_RESOLVED'].indexOf(duration)<0)return false;
      if(duration==='SCENE' && (!effect.sceneId || effect.sceneId!==session.currentSceneId || !session.sceneStatuses || session.sceneStatuses[effect.sceneId]!=='ACTIVE'))return false;
      return Number.isInteger(parameters.modifier) && parameters.modifier>=-6 && parameters.modifier<=6 && typeof parameters.advantage==='boolean' && typeof parameters.disadvantage==='boolean';
    });
  }
  H.applyRuleEffect={fields:['campaignId','characterId','sessionId','entityId','kind','reason','parameters'],mutation:true,authorize:function(ctx,p){adjudicationContext(ctx,p);},run:function(ctx,p){
    var selected=adjudicationContext(ctx,p),c=selected.character,s=selected.session;ctx.version(c);
    var reason=ctx.text(p.reason,'GM adjudication reason',2000,true);
    if(reason.length<3)ctx.fail('VALIDATION','Explain the situation that makes this rule effect apply.');
    ctx.fields(p.parameters,['modifier','advantage','disadvantage','duration'],'rule effect parameters');
    var modifier=p.parameters.modifier===undefined?0:ctx.integer(p.parameters.modifier,-6,6,'rule modifier');
    ['advantage','disadvantage'].forEach(function(key){if(p.parameters[key]!==undefined && typeof p.parameters[key]!=='boolean')ctx.fail('VALIDATION','Invalid '+key+'.');});
    var parameters={modifier:modifier,advantage:!!p.parameters.advantage,disadvantage:!!p.parameters.disadvantage,duration:p.parameters.duration};
    if(['NEXT_ACTION','SCENE','SESSION','GM_RESOLVED'].indexOf(parameters.duration)<0)ctx.fail('VALIDATION','Choose a supported rule effect duration.');
    if(parameters.duration==='SCENE' && (!s.currentSceneId || !s.sceneStatuses || s.sceneStatuses[s.currentSceneId]!=='ACTIVE'))ctx.fail('CONFLICT','A scene effect requires a current active scene.');
    if(s.currentSceneId)ctx.record('scenes',s.currentSceneId);
    var effect={id:ctx.id('effect','events'),type:'GM_RULE_EFFECT',kind:p.kind,entityId:p.entityId,source:selected.source,parameters:parameters,sessionId:s.id,sceneId:s.currentSceneId||null,createdAt:ctx.at,adjudication:'GM_ADJUDICATED'};
    c.effects=c.effects||[];c.effects.push(effect);ctx.touch(c);
    var eventId=ctx.id('event','events');
    ctx.state.events[eventId]={id:eventId,campaignId:c.campaignId,characterId:c.id,sessionId:s.id,type:'GM_RULE_EFFECT',text:'GM rule adjudication',details:{effect:ctx.clone(effect),reason:reason},actor:ctx.user.id,visibility:'CO_GM',createdAt:ctx.at,updatedAt:ctx.at,version:1};
    return {effect:ctx.clone(effect),character:safeCharacter(ctx,c)};
  }};
  H.rollDice={fields:['campaignId','characterId','sessionId','skillId','diceCount','horrorCount','difficulty','advantage','disadvantage','useInsight'],mutation:true,authorize:function(ctx,p){playable(ctx,p);},run:function(ctx,p){
    var live=playable(ctx,p),c=live.character; ctx.version(c);
    requireResolvedTrauma(ctx,c);
    var count=ctx.integer(p.diceCount,1,100,'dice count');
    if(count>c.normalDice+c.horrorDice) ctx.fail('VALIDATION','Not enough available pool dice.');
    var threshold=c.skills && c.skills[p.skillId];
    if(!Number.isInteger(threshold)||threshold<2||threshold>6) ctx.fail('VALIDATION','Unknown investigator skill.');
    ['advantage','disadvantage','useInsight'].forEach(function(k){if(p[k]!==undefined && typeof p[k]!=='boolean')ctx.fail('VALIDATION','Invalid '+k+'.');});
    var difficulty=p.difficulty===undefined?1:ctx.integer(p.difficulty,1,3,'difficulty');
    var before=stateView(c),ids=injuryIds(c),sicknessLimit=null;
    if(ids.indexOf('sickened')>=0){sicknessLimit=Math.ceil(die(ctx)/2);count=Math.min(count,sicknessLimit);}
    var horror=p.horrorCount===undefined?Math.max(0,count-c.normalDice):ctx.integer(p.horrorCount,0,count,'horror dice count');
    if(horror>c.horrorDice || count-horror>c.normalDice) ctx.fail('VALIDATION','Choose dice available in your normal and horror pools.');
    var ruleEffects=activeRuleEffects(ctx,c,live.session);
    var advantage=!!p.advantage || ruleEffects.some(function(e){return e.parameters.advantage;}), disadvantage=!!p.disadvantage || ids.indexOf('burned')>=0 || ruleEffects.some(function(e){return e.parameters.disadvantage;});
    var extraLow=advantage?1:0;
    if(p.useInsight){
      if(c.insightCurrent<1)ctx.fail('VALIDATION','Not enough Insight.');
      c.insightCurrent--;
      advantage=true;extraLow=1;
      if(c.build && c.build.personalityId==='imaginative') extraLow=2;
    }
    if(ids.indexOf('choking')>=0)difficulty=Math.max(2,difficulty);
    var modifier=0;
    if(ids.indexOf('concussed')>=0 && ['wits','intuition','knowledge','lore'].indexOf(p.skillId)>=0)modifier--;
    if(ids.indexOf('injured-arm')>=0 && ['athletics','agility','ranged-combat','melee-combat'].indexOf(p.skillId)>=0)modifier--;
    if(ids.indexOf('injured-leg')>=0 && ['athletics','agility','melee-combat'].indexOf(p.skillId)>=0)modifier--;
    if(ids.indexOf('severely-injured')>=0)modifier-=2;
    var injuryModifier=modifier;
    var adjudicatedModifier=Math.max(-6,Math.min(6,ruleEffects.reduce(function(total,e){return total+e.parameters.modifier;},0)));
    modifier+=adjudicatedModifier;
    c.normalDice-=count-horror;c.horrorDice-=horror;
    var results=[];
    for(var i=0;i<count;i++)results.push({face:die(ctx),type:i<horror?'HORROR':'NORMAL',external:false,discarded:false});
    for(var j=0;j<extraLow+(disadvantage?1:0);j++)results.push({face:die(ctx),type:'NORMAL',external:true,discarded:false});
    // Ties use stable die order; record every face, including discarded horror ones.
    function remove(high) { var candidates=results.filter(function(d){return !d.discarded;}); var face=Math[high?'max':'min'].apply(Math,candidates.map(function(d){return d.face;})); var d=candidates.find(function(d){return d.face===face;}); d.discarded=true; }
    if(disadvantage)remove(true);
    for(var k=0;k<extraLow;k++)remove(false);
    var successes=results.filter(function(d){return !d.discarded && (d.face===6 || (d.face!==1 && d.face+modifier>=threshold));}).length;
    var horrorOnes=results.filter(function(d){return d.type==='HORROR' && d.face===1;}).length;
    if(ids.indexOf('burned')>=0)discard(c,results.filter(function(d){return d.face===1;}).length);
    var rollId=ctx.id('roll','rolls');
    var r={id:rollId,campaignId:c.campaignId,characterId:c.id,sessionId:p.sessionId,actor:ctx.user.id,skillId:p.skillId,threshold:threshold,diceCount:count,horrorCount:horror,difficulty:difficulty,advantage:advantage,disadvantage:disadvantage,modifier:modifier,results:results,successes:successes,successful:successes>=difficulty,horrorOnes:horrorOnes,pendingTrauma:horrorOnes>0,sicknessLimit:sicknessLimit,visibility:'CAMPAIGN_PLAYERS',stateBefore:before,rulesVersion:rulesVersion(),sources:[citation(17),citation(34),citation(36),citation(37)],createdAt:ctx.at,updatedAt:ctx.at,version:1};
    if(injuryModifier)r.sources.push(citation(32));
    if(ruleEffects.length){
      r.adjudication='GM_ADJUDICATED';r.adjudicatedModifier=adjudicatedModifier;r.ruleEffects=ctx.clone(ruleEffects);
      ruleEffects.forEach(function(e){r.sources.push(ctx.clone(e.source));if(e.parameters.duration==='NEXT_ACTION'){e.resolvedAt=ctx.at;e.consumedByRollId=rollId;}});
    }
    if(ids.some(function(id){return ['burned','choking','sickened'].indexOf(id)>=0;}))r.sources.push(citation(35));
    if(p.useInsight){r.sources.push(citation(38));if(c.build && c.build.personalityId==='imaginative')r.sources.push(citation(46));}
    if(horrorOnes)c.effects.push({id:ctx.id('effect','events'),type:'PENDING_TRAUMA',rollId:rollId,sessionId:p.sessionId,createdAt:ctx.at,source:citation(37)});
    ctx.touch(c);r.stateAfter=stateView(c);ctx.state.rolls[rollId]=r;
    return {roll:ctx.clone(r),character:safeCharacter(ctx,c)};
  }};
  H.poolAction={fields:['campaignId','characterId','sessionId','action','amount','reason','effectId','entityId'],mutation:true,authorize:function(ctx,p){
    character(ctx,p);if(['SPEND','SIMPLE','STRAIN'].indexOf(p.action)<0)ctx.mustGM();
  },run:function(ctx,p){
    var c=character(ctx,p);ctx.version(c);var before=stateView(c),amount=p.amount===undefined?1:ctx.integer(p.amount,1,100,'amount'),action=p.action;
    if(['SPEND','SIMPLE','STRAIN','REFILL'].indexOf(action)>=0)requireResolvedTrauma(ctx,c);
    if(['SPEND','SIMPLE','STRAIN'].indexOf(action)>=0)playable(ctx,p);
    if(ctx.isGM)ctx.text(p.reason||'','reason',1000,true);
    switch(action){
      case 'REFILL': if(!p.sessionId)ctx.fail('VALIDATION','Session is required for a scene/turn refill.');playable(ctx,p);refill(c);break;
      case 'BONUS':c.normalDice+=amount;break;
      case 'DAMAGE':c.poolLimit=Math.max(0,c.poolLimit-amount);discard(c,Math.max(0,c.normalDice+c.horrorDice-c.poolLimit));break;
      case 'HEAL':if(blockedHealing(c))ctx.fail('VALIDATION','An active injury blocks normal healing (Corebook p32).');c.poolLimit=Math.min(c.poolMaximum,c.poolLimit+amount);break;
      case 'HORROR':c.horrorLimit=Math.min(c.poolMaximum,c.horrorLimit+amount);break;
      case 'RECOVER_HORROR':
        if((c.effects||[]).some(function(e){return e.type==='PERSONALITY_NEGATIVE' && e.personalityId==='imaginative' && !e.resolvedAt && ctx.records('sessions').some(function(s){return s.id===e.sessionId && ['ACTIVE','PAUSED'].indexOf(s.status)>=0;});}))ctx.fail('VALIDATION','Imaginative prevents horror-limit recovery for the remainder of this session (Corebook p46).');
        c.horrorLimit=Math.max(0,c.horrorLimit-amount);break;
      case 'SPEND':if(amount>c.normalDice+c.horrorDice)ctx.fail('VALIDATION','Not enough pool dice.');discard(c,amount);break;
      case 'SIMPLE': {
        var s=ctx.record('sessions',p.sessionId),scene=s.currentSceneId?ctx.record('scenes',s.currentSceneId):null;
        var cost=scene && scene.sceneType==='NARRATIVE'?0:1;
        if(injuryIds(c).indexOf('choking')>=0)cost*=2;
        if(c.normalDice+c.horrorDice<cost)ctx.fail('VALIDATION','Not enough pool dice.');discard(c,cost);break;
      }
      case 'STRAIN':if(c.poolLimit>=c.poolMaximum || blockedHealing(c))ctx.fail('VALIDATION','Straining is unavailable (Corebook p31–32).');c.poolLimit=c.poolMaximum;c.effects.push({id:ctx.id('effect','events'),type:'STRAIN_INJURY_DUE',sessionId:p.sessionId,createdAt:ctx.at,source:citation(31)});break;
      case 'REMOVE_EFFECT':{
        var effect=(c.effects||[]).find(function(e){return e.id===p.effectId && !e.resolvedAt;});if(!effect)ctx.fail('VALIDATION','Effect not found.');
        if(effect.type==='PENDING_TRAUMA')ctx.fail('VALIDATION','Use consequence resolution for pending trauma.');effect.resolvedAt=ctx.at;break;
      }
      case 'HEAL_INJURY':{
        var injury=(c.injuries||[]).find(function(i){return i.id===p.effectId && !i.healedAt;});if(!injury)ctx.fail('VALIDATION','Injury not found.');injury.healedAt=ctx.at;break;
      }
      default:ctx.fail('VALIDATION','Unknown pool action.');
    }
    ctx.touch(c);event(ctx,c,action,{amount:amount,reason:p.reason||'',before:before,after:stateView(c)},p.sessionId);
    return {character:safeCharacter(ctx,c),source:citation(['HORROR','RECOVER_HORROR'].indexOf(action)>=0?36:action==='HEAL'?33:action==='REFILL'?16:31)};
  }};
  var injuryTable=[['heavy-blow',1],['slowed',2],['nasty-cut',3],['concussed',4],['injured-arm',5],['injured-leg',6],['loss-of-a-sense',7],['severely-injured',8],['comatose',9],['dire',10],['dead',11]];
  H.resolveConsequence={fields:['campaignId','characterId','sessionId','rollId','kind','reason','spendInsight','entityId'],mutation:true,authorize:function(ctx,p){character(ctx,p);if(p.kind!=='TRAUMA')ctx.mustGM();if(p.rollId){var r=ctx.record('rolls',p.rollId);if(r.characterId!==p.characterId)ctx.fail('FORBIDDEN','Roll access denied.');}},run:function(ctx,p){
    var c=character(ctx,p);ctx.version(c);var result;
    if(p.spendInsight!==undefined && typeof p.spendInsight!=='boolean')ctx.fail('VALIDATION','Invalid Insight suppression choice.');
    if(p.kind==='INJURY'){
      ctx.text(p.reason,'reason',1000,true);
      var face=die(ctx),severity=face+activeInjuries(c).length;
      var entry=injuryTable[Math.min(severity,11)-1];
      result={id:ctx.id('injury','events'),entityId:entry[0],severity:severity,face:face,createdAt:ctx.at,source:citation(32),reason:p.reason};
      c.injuries.push(result);
      if(severity>=9){c.poolLimit=0;c.normalDice=0;c.horrorDice=0;}
      if(severity>=11)c.outOfPlay='DEAD';
      (c.effects||[]).filter(function(e){return e.type==='STRAIN_INJURY_DUE'&&!e.resolvedAt;}).slice(0,1).forEach(function(e){e.resolvedAt=ctx.at;});
    }else if(p.kind==='TRAUMA'){
      var roll=ctx.record('rolls',p.rollId);
      if(!roll.pendingTrauma || roll.characterId!==c.id)ctx.fail('CONFLICT','This roll has no pending trauma.');
      if(p.sessionId && p.sessionId!==roll.sessionId)ctx.fail('VALIDATION','Resolve trauma in the session where the action occurred.');
      var face=die(ctx),sessionId=roll.sessionId,modifier=(c.traumas||[]).filter(function(t){return t.sessionId===sessionId&&!t.expiredAt;}).reduce(function(n,t){return n+(t.severityModifier||0);},0);
      var analytical=(c.effects||[]).some(function(e){return e.type==='PERSONALITY_NEGATIVE'&&e.personalityId==='analytical'&&!e.resolvedAt&&e.sessionId===sessionId;});
      var faces=[face];if(analytical){faces.push(die(ctx));face=Math.max.apply(Math,faces);}
      var severity=face+roll.horrorOnes+modifier;
      var id=severity<=2?'subtle-strangeness':severity===3?'shocked':severity===4?'stunned':severity<=7?'overcome-by-horror':severity<=10?'mind-undone':'lost-forever';
      var penalty=0;
      if(id==='shocked'){if(c.normalDice+c.horrorDice)discard(c,1);else penalty=1;}
      if(id==='stunned'){if(c.normalDice+c.horrorDice){c.normalDice=0;c.horrorDice=0;}else penalty=1;}
      if(id==='mind-undone')penalty=1;
      result={id:ctx.id('trauma','events'),entityId:id,severity:severity,faces:faces,horrorOnes:roll.horrorOnes,sessionId:sessionId,severityModifier:penalty,duration:'SESSION',createdAt:ctx.at,source:citation(39)};
      if(id==='overcome-by-horror'||id==='mind-undone'){
        var cost=id==='mind-undone'?2:1;
        if(p.spendInsight===true){if(c.insightCurrent<cost)ctx.fail('VALIDATION','Not enough Insight to suppress the personality trigger.');c.insightCurrent-=cost;result.suppressed=true;}
        else c.effects.push({id:ctx.id('effect','events'),type:'PERSONALITY_NEGATIVE',personalityId:c.build.personalityId,sessionId:sessionId,sceneId:ctx.record('sessions',sessionId).currentSceneId||null,duration:id==='mind-undone'?'EXTENDED':'SOURCE',requiresGMResolution:true,createdAt:ctx.at,source:citation(39)});
      }
      if(id==='lost-forever')c.outOfPlay='LOST_FOREVER';
      c.traumas.push(result);roll.pendingTrauma=false;ctx.touch(roll);
      c.effects.filter(function(e){return e.type==='PENDING_TRAUMA'&&e.rollId===roll.id;}).forEach(function(e){e.resolvedAt=ctx.at;});
    }else if(['BURNED','CHOKING','SICKENED'].indexOf(p.kind)>=0){
      ctx.text(p.reason,'reason',1000,true);result={id:ctx.id('injury','events'),entityId:p.kind.toLowerCase(),createdAt:ctx.at,source:citation(35),reason:p.reason};c.injuries.push(result);
      if(activeInjuries(c).filter(function(i){return i.entityId===result.entityId;}).length>=3)c.outOfPlay='DEAD';
    }else ctx.fail('VALIDATION','Unknown consequence kind.');
    ctx.touch(c);event(ctx,c,p.kind,result,p.kind==='TRAUMA'?roll.sessionId:p.sessionId);return {consequence:ctx.clone(result),character:safeCharacter(ctx,c)};
  }};
  H.useInsight={fields:['campaignId','characterId','sessionId','kind','rollId','amount','reason'],mutation:true,authorize:ownAuthorize,run:function(ctx,p){
    var c=character(ctx,p);ctx.version(c);var cost=1;
    if(c.status!=='APPROVED')ctx.fail('VALIDATION','An approved investigator is required.');
    if(p.kind==='AVOID_DEATH'){
      if(!c.outOfPlay || c.insightLimit<2)ctx.fail('VALIDATION','Avoiding death requires a fatal consequence and Insight limit at least2.');
      c.insightLimit-=2;c.insightCurrent=Math.min(c.insightCurrent,c.insightLimit);c.outOfPlay=null;
      // Keep the fatal consequence as immutable history, mark survival explicitly.
      c.effects.push({id:ctx.id('effect','events'),type:'SURVIVED_FATAL_CONSEQUENCE',createdAt:ctx.at,requiresGMResolution:true,source:citation(38)});
    }else if(p.kind==='EXTRA_SUCCESS'||p.kind==='ANALYTICAL'){
      var r=ctx.record('rolls',p.rollId);
      if(r.characterId!==c.id)ctx.fail('FORBIDDEN','Roll access denied.');
      // State versions order actions even when two rolls share a timestamp; random IDs do not.
      if(!r.stateAfter || r.stateAfter.version!==c.version)ctx.fail('CONFLICT','Insight must follow this action before other state changes.');
      if(c.insightCurrent<1)ctx.fail('VALIDATION','Not enough Insight.');
      if(p.kind==='EXTRA_SUCCESS'){
        if(!r.successful || r.insightAdded)ctx.fail('VALIDATION','Insight adds success only after an already successful action, once.');
        r.successes+=(c.build.personalityId==='ambitious'?2:1);r.insightAdded=true;
      }else{
        if(c.build.personalityId!=='analytical'||!r.pendingTrauma||!r.horrorOnes)ctx.fail('VALIDATION','Analytical requires a pending horror1 before trauma resolution.');
        r.horrorOnes--;r.pendingTrauma=r.horrorOnes>0;
        if(!r.pendingTrauma)c.effects.filter(function(e){return e.type==='PENDING_TRAUMA'&&e.rollId===r.id;}).forEach(function(e){e.resolvedAt=ctx.at;});
      }
      c.insightCurrent--;ctx.touch(r);ctx.touch(c);r.stateAfter=stateView(c);
      return {roll:ctx.clone(r),character:safeCharacter(ctx,c),source:citation(p.kind==='ANALYTICAL'?46:c.build.personalityId==='ambitious'?45:38)};
    }else if(p.kind==='NARRATIVE'||p.kind==='CLUE'){
      ctx.mustGM();cost=ctx.integer(p.amount,1,10,'Insight cost');ctx.text(p.reason,'reason',1000,true);if(c.insightCurrent<cost)ctx.fail('VALIDATION','Not enough Insight.');c.insightCurrent-=cost;
    }else ctx.fail('VALIDATION','For advantage spend Insight on the roll before rolling; unknown Insight action.');
    ctx.touch(c);event(ctx,c,'INSIGHT_'+p.kind,{cost:cost,reason:p.reason||''},p.sessionId);return {character:safeCharacter(ctx,c),source:citation(38)};
  }};
})(Arkham);
