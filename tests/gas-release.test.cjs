'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const release = path.join(__dirname, '../google-apps-script');

function installation() {
  let tables = [{properties:{sheetId:1,title:'Owner notes',gridProperties:{rowCount:100,columnCount:5}},rows:[['preserve']]}];
  const properties = { DATABASE_ID:'private-spreadsheet-123456', GOOGLE_CLIENT_ID:'123456-validwebclient.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET:'test-only-provider-secret', APP_URL:'https://script.google.com/macros/s/test-deployment/exec' };
  let locked = false, reject = false;
  const context = vm.createContext({ Date, JSON, Object, Array, String, Number, Boolean, RegExp, Error, isFinite,
    Math:Object.assign(Object.create(Math),{random:()=>0.99}), console:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,setProperty:(k,v)=>{properties[k]=v;},deleteProperty:k=>{delete properties[k];},getProperties:()=>({...properties})})},
    LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},
    Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()]},
    Sheets:{Spreadsheets:{
      get:()=>structuredClone({sheets:tables.map(t=>({properties:t.properties}))}),
      Values:{batchGet:(_,options)=>({valueRanges:options.ranges.map(range=>({values:structuredClone(tables.find(t=>range.startsWith(`'${t.properties.title}'!`)).rows)}))})},
      batchUpdate:batch=>{
        const next=structuredClone(tables);
        for(const request of batch.requests){
          if(request.addSheet) next.push({properties:structuredClone(request.addSheet.properties),rows:[]});
          else if(request.appendDimension) next.find(t=>t.properties.sheetId===request.appendDimension.sheetId).properties.gridProperties.rowCount+=request.appendDimension.length;
          else if(request.updateCells){
            const update=request.updateCells;
            const table=next.find(t=>t.properties.sheetId===update.range.sheetId);
            table.rows=update.rows.map(row=>row.values.map(cell=>{
              assert.deepEqual(Object.keys(cell.userEnteredValue),['stringValue']);return cell.userEnteredValue.stringValue;
            }));
          } else throw new Error('Unexpected Sheet operation');
        }
        if(reject){reject=false;throw new Error('Test atomic failure');}
        tables=next;
      }
    }}
  });
  vm.runInContext(fs.readFileSync(path.join(release,'Code.gs'),'utf8'),context,{filename:'Code.gs'});
  context.initializeDatabase_();
  const tokens={};
  for(const account of ['A','B','C']){
    const user=context.runtime_().service.upsertUser({sub:'release-'+account,email:account.toLowerCase()+'@example.com',emailVerified:true,name:account});
    tokens[account]='release-test-session-'+account+'x'.repeat(64);
    properties['private:auth:session:'+context.digest_(tokens[account])]=JSON.stringify({userId:user.id,expiresAt:Date.now()+3600000});
  }
  const raw=(actor,operation,payload={},expectedVersion,requestId)=>{
    const request={operation,payload,sessionToken:tokens[actor],requestId:requestId||crypto.randomUUID()};
    if(expectedVersion!==undefined)request.expectedVersion=expectedVersion;
    return JSON.parse(JSON.stringify(context.api(request)));
  };
  const run=(...args)=>{const result=raw(...args);assert.equal(result.ok,true,JSON.stringify(result.error));return result.data;};
  return {context,run,raw,properties,tables:()=>structuredClone(tables),reject:()=>{reject=true;}};
}

test('paste-ready files match canonical source, preserve server helpers and valid templates',()=>{
  const code=fs.readFileSync(path.join(release,'Code.gs'),'utf8');
  for(const name of ['store','domain','catalog','gm-catalog','investigators','play','story','library','features','google-services','auth','apps-script'])assert.ok(code.includes(fs.readFileSync(path.join(__dirname,'../src/server',name+'.js'),'utf8')),name+' release is stale');
  assert.doesNotThrow(()=>new vm.Script(code));
  for(const name of ['Index','Styles','Client','Features'])assert.equal(fs.readFileSync(path.join(release,name+'.html'),'utf8'),fs.readFileSync(path.join(__dirname,'../src/client',name+'.html'),'utf8'));
  const manifest=JSON.parse(fs.readFileSync(path.join(release,'appsscript.json'),'utf8'));
  assert.equal(manifest.runtimeVersion,'V8');assert.ok(manifest.dependencies.enabledAdvancedServices.some(s=>s.userSymbol==='Drive'&&s.version==='v3'));
  assert.equal(fs.readFileSync(path.join(release,'appsscript.json'),'utf8'),fs.readFileSync(path.join(__dirname,'../src/appsscript.json'),'utf8'));
  for(const name of ['Index','Styles','Client','Features'])assert.ok(fs.readFileSync(path.join(release,'INSTALL.html'),'utf8').includes(name+'.html'));
});

test('combined Code.gs initializes real adapters and runs investigator/session/dice/snapshot workflows',()=>{
  const f=installation();
  assert.equal(f.context.checkInstallation_().ready,true);
  assert.deepEqual(f.tables()[0].rows,[['preserve']]);
  assert.equal(f.tables().length,Object.keys(f.context.Arkham.tables).length+1);
  const campaign=f.run('A','createCampaign',{name:'Release RPC',notes:'PRIVATE_RELEASE_GM_NOTE'}).campaign;
  const invite=f.run('A','inviteMember',{campaignId:campaign.id,email:'b@example.com'}).invitation;
  f.run('B','respondInvite',{inviteId:invite.id,decision:'ACCEPT'});
  const catalog=f.context.Arkham.catalog, archetype=catalog.archetypes.find(a=>a.id==='adventurer');
  const skills={};catalog.skills.forEach((s,index)=>{skills[s.id]=index<3?5:index===3?4:6;});
  let character=f.run('B','createInvestigator',{campaignId:campaign.id,name:'RPC Investigator'}).character;
  character=f.run('B','saveInvestigator',{campaignId:campaign.id,characterId:character.id,name:character.name,build:{background:{narrative:'Private background'},personalityId:'analytical',archetypeId:archetype.id,skills,startingKnackId:archetype.knacks[1][0],package:'gear',equipment:[]}},character.version).character;
  character=f.run('B','submitInvestigator',{campaignId:campaign.id,characterId:character.id},character.version).character;
  assert.equal(f.raw('B','reviewInvestigator',{campaignId:campaign.id,characterId:character.id,decision:'APPROVE'},character.version).error.code,'FORBIDDEN');
  character=f.run('A','reviewInvestigator',{campaignId:campaign.id,characterId:character.id,decision:'APPROVE',approvedItemIds:[]},character.version).character;
  let session=f.run('A','createSession',{campaignId:campaign.id,name:'Chapter 1'}).session;
  f.run('A','setAttendance',{campaignId:campaign.id,sessionId:session.id,userId:character.ownerUserId,characterId:character.id,attendance:'PRESENT'});
  session=f.run('A','sessionAction',{campaignId:campaign.id,sessionId:session.id,action:'START'},session.version).session;
  character=f.run('B','bootstrap',{campaignId:campaign.id}).activeCampaign.characters.find(c=>c.id===character.id);
  const payload={campaignId:campaign.id,characterId:character.id,sessionId:session.id,skillId:'agility',diceCount:2,difficulty:1};
  const roll=f.run('B','rollDice',payload,character.version,'release-roll-once');
  assert.equal(roll.roll.successes,2);assert.equal(roll.character.normalDice,4);
  assert.deepEqual(f.run('B','rollDice',payload,character.version,'release-roll-once'),roll);
  const endPayload={campaignId:campaign.id,sessionId:session.id,action:'END',summary:'A chapter ends.',gmNotes:'PRIVATE_RELEASE_END',xpAwards:[{characterId:character.id,amount:3}]};
  const before=f.tables();f.reject();assert.equal(f.raw('A','sessionAction',endPayload,session.version,'release-end-once').error.code,'SERVER_ERROR');assert.deepEqual(f.tables(),before);
  const ended=f.run('A','sessionAction',endPayload,session.version,'release-end-once');assert.equal(ended.session.status,'COMPLETED');
  assert.deepEqual(f.run('A','sessionAction',endPayload,session.version,'release-end-once'),ended);
  const player=f.run('B','bootstrap',{campaignId:campaign.id});assert.ok(!JSON.stringify(player).includes('PRIVATE_RELEASE_'));
  assert.equal(player.activeCampaign.characters[0].xpEarned,3);assert.equal(player.activeCampaign.characters[0].normalDice,4);
  assert.equal(f.raw('C','bootstrap',{campaignId:campaign.id}).error.code,'FORBIDDEN');
  const state=f.context.sheetsStore_().read(s=>s);
  assert.ok(Object.values(state.entities).some(e=>e.canonicalCatalogId==='gm:cthulhu'&&e.campaignId===campaign.id));
  assert.ok(f.run('A','searchRules',{campaignId:campaign.id,query:'Cthulhu'}).total>0);
  assert.equal(f.run('B','searchRules',{campaignId:campaign.id,query:'Cthulhu'}).results.some(r=>r.canonicalCatalogId==='gm:cthulhu'),false);
});
