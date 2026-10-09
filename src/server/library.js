/* Campaign-scoped source library, translation, private scanner and grounded assistant. */
var Arkham = typeof Arkham === 'undefined' ? {} : Arkham;
(function (A) {
  'use strict';
  A.handlers = A.handlers || {};
  var MAX_IMAGE_BYTES = 750 * 1024;
  var ENTITY_TYPES = ['RULE', 'SKILL', 'PERSONALITY_TRAIT', 'ARCHETYPE', 'KNACK', 'WEAPON', 'EQUIPMENT', 'INJURY', 'TRAUMA', 'NPC', 'CREATURE', 'ANCIENT_ONE', 'LOCATION'];
  var LANGUAGES = ['en', 'th'];
  var VISIBILITIES = ['OWNER_ONLY', 'GM_ONLY', 'CO_GM', 'CAMPAIGN_PLAYERS', 'SELECTED_PLAYERS'];
  var CORE_CHECKSUM = '7901c7c8cf0657d6cc2f65104ad6c7b46077cc489f653c6310897d5f2cd86d7a';
  var PROMPT_VERSION = 'arkham-grounding-1';

  function enumValue(ctx, value, allowed, label, fallback) {
    if (value === undefined && fallback !== undefined) return fallback;
    if (allowed.indexOf(value) < 0) ctx.fail('VALIDATION', 'Invalid ' + label + '.');
    return value;
  }
  function list(value) { return Array.isArray(value) ? value : []; }
  function values(value) { return Array.isArray(value) ? value : Object.keys(value || {}).map(function (key) { return value[key]; }); }
  function permission(ctx, item) {
    if (!item || (item.campaignId && item.campaignId !== ctx.campaign.id)) return false;
    var visibility = item.visibility || 'CAMPAIGN_PLAYERS';
    visibility = ({ PLAYER: 'CAMPAIGN_PLAYERS', CAMPAIGN: 'CAMPAIGN_PLAYERS', GM: 'GM_ONLY', GM_CO_GM: 'CO_GM' })[visibility] || visibility;
    if (visibility === 'OWNER_ONLY') return item.ownerUserId === ctx.user.id;
    if (visibility === 'GM_ONLY') return ctx.membership.role === 'GM';
    if (visibility === 'CO_GM') return ctx.isGM;
    if (visibility === 'CAMPAIGN_PLAYERS') return true;
    return visibility === 'SELECTED_PLAYERS' && (ctx.isGM || list(item.selectedUserIds).indexOf(ctx.user.id) >= 0);
  }
  A.libraryCanView = permission;
  function visible(ctx, item) {
    if (!permission(ctx, item)) ctx.fail('FORBIDDEN', 'Source access denied.');
    return item;
  }
  function materialView(ctx, material) {
    if (!permission(ctx, material)) return null;
    var result = ctx.clone(material);
    delete result.driveFileId;
    result.hasFile = !!material.driveFileId;
    return result;
  }
  A.materialView = materialView;
  function sourceText(record) {
    return record.englishText || record.description || record.englishDescription || record.summary ||
      [record.name, record.positiveEffect, record.negativeEffect, record.effect].filter(function (value) { return typeof value === 'string'; }).join('\n');
  }
  function citation(record) {
    var printedPage = Number.isInteger(record.printedPage) ? record.printedPage : null;
    var pdfPageIndex = Number.isInteger(record.pdfPageIndex) ? record.pdfPageIndex : null;
    return { sourceId: record.id, bookId: record.bookId || 'corebook-2024', title: record.sourceTitle || 'Arkham Horror RPG Core Rulebook',
      printedPage: printedPage, pdfPageIndex: pdfPageIndex, pdfPage: pdfPageIndex === null ? null : pdfPageIndex + 1,
      sourceVersion: String(record.sourceVersion || record.version || 'corebook-2024-v1') };
  }
  function catalogSources() {
    var sources = [];
    [{ catalog: A.catalog || {}, prefix: '', visibility: 'CAMPAIGN_PLAYERS', categories: {
      ruleEntries: 'RULE', skills: 'SKILL', personalities: 'PERSONALITY_TRAIT', archetypes: 'ARCHETYPE', knacks: 'KNACK', equipment: 'EQUIPMENT', injuries: 'INJURY', traumas: 'TRAUMA' } },
    { catalog: A.gmCatalog || {}, prefix: 'gm:', visibility: 'CO_GM', categories: {
      npcs: 'NPC', creatures: 'CREATURE', ancientOnes: 'ANCIENT_ONE', locations: 'LOCATION' } }].forEach(function (collection) {
      var catalog = collection.catalog;
      Object.keys(collection.categories).forEach(function (category) {
        values(catalog[category]).forEach(function (record) {
        if (!record || typeof record !== 'object' || typeof record.id !== 'string') return;
        var source = Object.assign({}, record);
        source.id = 'catalog:' + collection.prefix + record.id;
        source.entityId = collection.prefix + record.id;
        source.bookId = record.bookId || (record.source && record.source.bookId) || (catalog.source && catalog.source.bookId) || 'corebook-2024';
        source.type = collection.categories[category];
        var facts = {};
        Object.keys(record).forEach(function (key) {
          if (['id', 'name', 'thaiName', 'description', 'summary', 'positiveEffect', 'negativeEffect', 'effect', 'source', 'sourceVersion', 'sourceTitle', 'sourceChecksum', 'sourcePages', 'printedPage', 'pdfPageIndex', 'status', 'statusSource', 'verificationStatus', 'visibility', 'translationStatus'].indexOf(key) < 0) facts[key] = record[key];
        });
        source.englishText = [sourceText(record), record.positiveEffect && 'Positive: ' + record.positiveEffect, record.negativeEffect && 'Negative: ' + record.negativeEffect,
          Object.keys(facts).length ? 'Facts: ' + JSON.stringify(facts) : ''].filter(Boolean).join('\n');
        source.visibility = collection.prefix ? collection.visibility : record.visibility || collection.visibility;
        source.verificationStatus = (record.statusSource === 'VERIFIED' || record.verificationStatus === 'VERIFIED') ? 'VERIFIED' : 'NEEDS_REVIEW';
        source.sourceVersion = record.sourceVersion || catalog.sourceVersion || 'corebook-2024-v1';
        source.sourceTitle = (catalog.source && catalog.source.title) || 'Arkham Horror RPG Core Rulebook';
        source.sourceChecksum = (catalog.source && (catalog.source.checksum || catalog.source.sha256)) || CORE_CHECKSUM;
        sources.push(source);
        });
      });
    });
    return sources;
  }
  function canonicalSource(entity, catalogIndex) {
    var original = catalogIndex ? catalogIndex[entity.canonicalCatalogId] : catalogSources().filter(function (source) { return source.entityId === entity.canonicalCatalogId; })[0];
    if (!original) return null;
    // Persisted canonical rows are references, never an alternate source of facts or permissions.
    return Object.assign({}, original, { id: entity.id, campaignId: entity.campaignId, bookId: entity.campaignId + ':corebook',
      canonicalCatalogId: entity.canonicalCatalogId, ownerUserId: entity.ownerUserId, version: entity.version || 1 });
  }
  function allSources(ctx, withStory) {
    var sources = catalogSources();
    var catalogIndex = {};
    sources.forEach(function (source) { catalogIndex[source.entityId] = source; });
    var seeded = ctx.records('entities').filter(function (entity) { return !!entity.canonicalCatalogId; });
    sources = sources.filter(function (source) { return !seeded.some(function (entity) { return entity.canonicalCatalogId === source.entityId && !!catalogIndex[entity.canonicalCatalogId]; }); });
    ctx.records('entities').forEach(function (entity) {
      if (entity.campaignId !== ctx.campaign.id) return;
      var source = entity.canonicalCatalogId ? canonicalSource(entity, catalogIndex) : ctx.clone(entity);
      if (!source) return;
      if (!entity.canonicalCatalogId) source.englishText = sourceText(entity);
      var book = ctx.state.books[source.bookId];
      if (!entity.canonicalCatalogId && book && book.campaignId === ctx.campaign.id) { source.sourceTitle = book.title; source.sourceChecksum = book.checksum; }
      sources.push(source);
    });
    ctx.records('materials').forEach(function (material) {
      if (material.campaignId !== ctx.campaign.id || !material.englishText) return;
      var source = ctx.clone(material);
      source.type = 'CAMPAIGN_MATERIAL'; source.name = material.title; source.sourceTitle = material.source || material.title;
      sources.push(source);
    });
    if (withStory) ['assets', 'scenes'].forEach(function (table) {
      ctx.records(table).forEach(function (asset) {
        if (asset.campaignId !== ctx.campaign.id || !permission(ctx, asset)) return;
        var view = A.storyView ? A.storyView(ctx, asset) : asset;
        if (!view) return;
        var source = { id: asset.id, campaignId: asset.campaignId, type: 'CAMPAIGN_STORY', name: view.name,
          englishText: [view.description, view.originalText, view.gmNotes].filter(function (part) { return typeof part === 'string'; }).join('\n'),
          visibility: asset.visibility, selectedUserIds: asset.selectedUserIds, ownerUserId: asset.ownerUserId,
          version: asset.version, sourceVersion: String(asset.version), sourceTitle: view.name || 'Campaign story', verificationStatus: 'CAMPAIGN_SOURCE' };
        sources.push(source);
      });
    });
    return sources.filter(function (source) { return permission(ctx, source); });
  }
  function tokens(query) {
    var text = String(query || '').toLowerCase();
    var glossary = { 'บาดเจ็บ': 'injury damage wounded', 'ความกลัว': 'horror trauma', 'ทอย': 'dice roll skill', 'ทักษะ': 'skill', 'ลางสังหรณ์': 'insight', 'เงิน': 'money equipment', 'ประสบการณ์': 'xp advancement', 'บุคลิก': 'personality', 'อุปกรณ์': 'equipment weapon', 'แคมเปญ': 'campaign' };
    Object.keys(glossary).forEach(function (thai) { if (text.indexOf(thai) >= 0) text += ' ' + glossary[thai]; });
    return text.split(/[^a-z0-9\u0E00-\u0E7F]+/).filter(function (word) { return word.length > 1 && ['the', 'and', 'how', 'what', 'does', 'can', 'for', 'with', 'this', 'that', 'are'].indexOf(word) < 0; });
  }
  function rank(sources, query) {
    var terms = tokens(query);
    return sources.map(function (source) {
      var text = [source.name, source.thaiName, source.englishText, list(source.keywords).join(' ')].join(' ').toLowerCase();
      var score = terms.reduce(function (total, term) { return total + (text.indexOf(term) >= 0 ? 1 : 0); }, 0);
      if (source.sourceChecksum === CORE_CHECKSUM && source.verificationStatus === 'VERIFIED') score += 0.1;
      return { source: source, score: score };
    }).filter(function (item) { return !terms.length || item.score >= 1; }).sort(function (left, right) {
      return right.score - left.score || String(left.source.name).localeCompare(String(right.source.name));
    }).map(function (item) { return item.source; });
  }
  function findSource(ctx, type, id) {
    if (type === 'entity') {
      var canonical = catalogSources().filter(function (item) { return item.id === id || item.entityId === id; })[0];
      var source = canonical || ctx.record('entities', id);
      if (source.canonicalCatalogId) source = canonicalSource(source);
      return visible(ctx, source);
    }
    var table = { material: 'materials', asset: 'assets', scene: 'scenes' }[type];
    if (!table) ctx.fail('VALIDATION', 'Invalid source type.');
    return visible(ctx, ctx.record(table, id));
  }
  function sourceByRef(ctx, ref) {
    var found = catalogSources().filter(function (record) { return record.id === ref.sourceId; })[0];
    ['entities', 'materials', 'assets', 'scenes'].forEach(function (table) {
      if (!found && ctx.state[table] && ctx.state[table][ref.sourceId]) found = ctx.state[table][ref.sourceId];
    });
    if (found && found.canonicalCatalogId) found = canonicalSource(found);
    return found && permission(ctx, found) && citation(found).sourceVersion === ref.sourceVersion ? found : null;
  }
  function mayReadHistory(ctx, history) {
    return permission(ctx, history) && list(history.citations).concat(list(history.contextSources)).every(function (ref) { return !!sourceByRef(ctx, ref); });
  }
  function authorizeReplayHistory(ctx) {
    ctx.records('aiHistory').filter(function (entry) { return entry.requestId === ctx.request.requestId && entry.userId === ctx.user.id; }).forEach(function (entry) {
      if (!mayReadHistory(ctx, entry)) ctx.fail('FORBIDDEN', 'The original answer sources are no longer accessible.');
    });
  }
  function aiLimit(ctx) {
    var since = Date.parse(ctx.at) - 60000;
    if (ctx.records('aiHistory').filter(function (entry) { return entry.userId === ctx.user.id && Date.parse(entry.createdAt) >= since; }).length >= 10) {
      ctx.fail('RATE_LIMITED', 'Wait one minute before sending more AI requests.');
    }
  }
  function aiCall(ctx, request) {
    aiLimit(ctx);
    if (typeof ctx.dependencies.ai !== 'function') return { configured: false };
    try {
      var result = ctx.dependencies.ai(request);
      if (!result || result.configured === false || result.unavailable) return { configured: false };
      return result;
    } catch (_) { return { configured: false, unavailable: true }; }
  }
  function sourceStamp(ctx, sources) {
    return ctx.dependencies.digest(JSON.stringify(sources.map(function (source) {
      return { id: source.id, version: source.version || 1, citation: citation(source), text: String(source.englishText || sourceText(source)),
        visibility: source.visibility || 'CAMPAIGN_PLAYERS', selectedUserIds: source.selectedUserIds || [], ownerUserId: source.ownerUserId || null,
        verificationStatus: source.verificationStatus || null, sourceChecksum: source.sourceChecksum || null };
    })));
  }
  function freshPrepared(ctx, sources) {
    if (ctx.prepared && ctx.prepared.sourceStamp && ctx.prepared.sourceStamp !== sourceStamp(ctx, sources)) {
      ctx.fail('CONFLICT', 'The source changed while AI was processing. Review it and send a new request.');
    }
  }
  function historyRecord(ctx, fields) {
    var id = ctx.id('ai', 'aiHistory');
    var record = Object.assign({ id: id, campaignId: ctx.campaign.id, userId: ctx.user.id, ownerUserId: ctx.user.id,
      visibility: 'OWNER_ONLY', createdAt: ctx.at, updatedAt: ctx.at, version: 1, requestId: ctx.request.requestId,
      promptVersion: PROMPT_VERSION, citations: [] }, fields);
    ctx.state.aiHistory[id] = record;
    return record;
  }
  function selected(ctx, ids) {
    if (!Array.isArray(ids) || ids.length > 100) ctx.fail('VALIDATION', 'Invalid selected users.');
    var unique = [];
    ids.forEach(function (id) {
      if (typeof id !== 'string' || (ctx.activeMember && !ctx.activeMember(id))) ctx.fail('VALIDATION', 'Select active campaign members only.');
      if (unique.indexOf(id) < 0) unique.push(id);
    });
    return unique;
  }
  function page(ctx, payload) {
    return { offset: ctx.integer(payload.offset === undefined ? 0 : payload.offset, 0, 1000000, 'offset'),
      limit: ctx.integer(payload.limit === undefined ? 25 : payload.limit, 1, 100, 'limit') };
  }

  A.handlers.searchRules = { fields: ['campaignId', 'query', 'language', 'offset', 'limit'], mutation: false,
    authorize: function () {}, run: function (ctx, payload) {
      var query = ctx.text(payload.query || '', 'query', 500, false);
      var language = enumValue(ctx, payload.language, LANGUAGES, 'language', 'en');
      var paging = page(ctx, payload);
      var results = rank(allSources(ctx, false), query);
      return { results: results.slice(paging.offset, paging.offset + paging.limit).map(function (source) {
        var text = String(source.englishText || '');
        var translations = ctx.records('translations').filter(function (record) { return record.sourceId === source.id && record.sourceVersion === citation(source).sourceVersion && record.language === language && record.mode === 'TRANSLATE'; });
        var translation = translations.filter(function (record) { return record.status !== 'ENGLISH_FALLBACK'; })[0] || translations[0];
        return { id: source.id, type: source.type, name: source.name, thaiName: source.thaiName || null, englishText: text,
          snippet: text.slice(0, 600), translation: translation ? translation.text : null,
          translationStatus: translation ? translation.status : 'ENGLISH_FALLBACK', citation: citation(source), verificationStatus: source.verificationStatus,
          version: source.version || 1, sourceType: source.type === 'CAMPAIGN_MATERIAL' ? 'material' : 'entity',
          canonicalCatalogId: source.canonicalCatalogId || (source.id.indexOf('catalog:') === 0 ? source.entityId : null) };
      }), offset: paging.offset, limit: paging.limit, total: results.length, incompleteIndex: ctx.records('books').some(function (book) { return book.campaignId === ctx.campaign.id && book.importStatus !== 'COMPLETE'; }) };
    } };

  A.handlers.askAssistant = { fields: ['campaignId', 'question', 'language', 'mode', 'sessionId'], mutation: true,
    authorize: function (ctx, payload) {
      if (payload.mode === 'PREPARE') ctx.mustGM();
      if (payload.sessionId) ctx.record('sessions', payload.sessionId);
      authorizeReplayHistory(ctx);
    }, run: function (ctx, payload) {
      aiLimit(ctx);
      var question = ctx.text(payload.question, 'question', 2000, true);
      var language = enumValue(ctx, payload.language, LANGUAGES, 'language', 'en');
      var mode = enumValue(ctx, payload.mode, ['RULES', 'EXPLAIN', 'PREPARE'], 'assistant mode', 'RULES');
      var sources = rank(allSources(ctx, mode === 'PREPARE'), question).slice(0, 8);
      freshPrepared(ctx, sources);
      var refs = sources.map(citation);
      var response = { configured: false };
      if (ctx.prepared) response = ctx.prepared.response;
      else if (sources.length) response = aiCall(ctx, { kind: 'assistant', mode: mode, language: language, question: question,
        context: sources.map(function (source) { return { sourceId: source.id, text: String(source.englishText || '').slice(0, 6000), name: source.name, verificationStatus: source.verificationStatus, citation: citation(source) }; }), citations: refs });
      var text, status, answerType, used = [];
      if (!sources.length) {
        text = language === 'th' ? 'ไม่พบหลักฐานที่เข้าถึงได้เพียงพอ ลองค้นด้วยชื่อทักษะหรือหัวข้อกฎที่เจาะจงขึ้น' : 'No accessible supporting sources were found. Try a specific skill name or rule topic.';
        status = 'SOURCE_UNAVAILABLE'; answerType = 'SOURCE_UNAVAILABLE';
      } else if (response.configured === false) {
        used = refs;
        text = (language === 'th' ? 'AI ไม่พร้อมใช้งาน แสดงข้อความอ้างอิงภาษาอังกฤษที่ตรวจสอบได้:\n\n' : 'AI is unavailable. Retrieved English references:\n\n') + sources.map(function (source) { return source.name + ': ' + String(source.englishText || '').slice(0, 1200); }).join('\n\n');
        status = 'ENGLISH_REFERENCE_FALLBACK'; answerType = sources.every(function (source) { return source.sourceChecksum === CORE_CHECKSUM && source.verificationStatus === 'VERIFIED'; }) ? 'OFFICIAL_RULE' : 'EXPLANATION';
      } else {
        var provided = list(response.citations);
        var valid = provided.length > 0 && provided.every(function (ref) {
          var id = typeof ref === 'string' ? ref : ref && ref.sourceId;
          var match = refs.filter(function (source) { return source.sourceId === id; })[0];
          return !!match && (typeof ref === 'string' ||
            (ref.printedPage === undefined || ref.printedPage === match.printedPage) &&
            (ref.pdfPageIndex === undefined || ref.pdfPageIndex === match.pdfPageIndex) &&
            (ref.sourceVersion === undefined || ref.sourceVersion === match.sourceVersion));
        });
        if (!valid || typeof response.answer !== 'string' || !response.answer.trim() || response.answer.length > 12000) {
          text = language === 'th' ? 'คำตอบจาก AI มีแหล่งอ้างอิงไม่ถูกต้อง จึงไม่แสดงคำตอบ กรุณาดูข้อความต้นฉบับหรือถามใหม่' : 'The AI answer failed citation validation. Read the retrieved sources or try again.';
          status = 'REJECTED_CITATIONS'; answerType = 'SOURCE_UNAVAILABLE';
        } else {
          text = response.answer.trim(); status = 'MODEL_GENERATED';
          // A model explanation is never promoted to a verified canonical rule.
          answerType = mode === 'PREPARE' ? 'AI_SUGGESTION' : 'EXPLANATION';
          used = provided.map(function (ref) { var id = typeof ref === 'string' ? ref : ref.sourceId; return refs.filter(function (source) { return source.sourceId === id; })[0]; });
        }
      }
      var history = historyRecord(ctx, { question: question, text: text, answerType: answerType, citations: used, contextSources: refs,
        language: language, mode: mode, sessionId: payload.sessionId || null, status: status, model: response.model || null });
      // Even rejected output remains tied to the permissions of all submitted contexts.
      history.citations = used.length ? used : refs;
      return { answer: ctx.clone(history) };
    } };
  A.handlers.askAssistant.replay = function (ctx, payload, previous) {
    var answer = previous && previous.answer;
    var current = answer && ctx.record('aiHistory', answer.id);
    if (!current || current.userId !== ctx.user.id || !mayReadHistory(ctx, current)) ctx.fail('FORBIDDEN', 'The original answer sources are no longer accessible.');
    return { answer: ctx.clone(current) };
  };

  A.handlers.registerBook = { fields: ['campaignId', 'title', 'edition', 'checksum', 'driveFileId'], mutation: true,
    authorize: function (ctx) { ctx.mustGM(); }, run: function (ctx, payload) {
      var checksum = ctx.text(payload.checksum, 'checksum', 64, true).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(checksum)) ctx.fail('VALIDATION', 'Use the SHA-256 checksum of the original book.');
      var fileId = payload.driveFileId ? ctx.text(payload.driveFileId, 'file ID', 200, true) : null;
      if (fileId) {
        if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
        var file = ctx.prepared ? ctx.prepared.file : ctx.dependencies.files({ action: 'register', fileId: fileId });
        if (file && file.checksum && file.checksum.toLowerCase() !== checksum) ctx.fail('VALIDATION', 'The checksum does not match the registered private file.');
      }
      var id = ctx.id('book', 'books');
      var book = { id: id, campaignId: ctx.campaign.id, title: ctx.text(payload.title, 'title', 200, true), edition: ctx.text(payload.edition || '', 'edition', 120, false),
        checksum: checksum, driveFileId: fileId, visibility: 'CO_GM', ownerUserId: ctx.user.id, importedAt: null, importStatus: 'REGISTERED',
        createdAt: ctx.at, updatedAt: ctx.at, version: 1 };
      ctx.state.books[id] = book;
      var result = ctx.clone(book); delete result.driveFileId;
      return { book: result };
    } };

  A.handlers.importEntities = { fields: ['campaignId', 'book', 'entities', 'checkpoint', 'complete'], mutation: true,
    authorize: function (ctx, payload) { ctx.mustGM(); ctx.record('books', payload.book); }, run: function (ctx, payload) {
      var book = ctx.record('books', payload.book);
      ctx.version(book);
      if (payload.complete !== undefined && typeof payload.complete !== 'boolean') ctx.fail('VALIDATION', 'Import completion must be true or false.');
      if (!Array.isArray(payload.entities) || !payload.entities.length || payload.entities.length > 100) ctx.fail('VALIDATION', 'Import one to 100 structured entities per batch.');
      var checkpoint = ctx.text(payload.checkpoint || '', 'checkpoint', 200, false);
      var imported = [];
      payload.entities.forEach(function (entity) {
        ctx.fields(entity, ['id', 'type', 'name', 'englishText', 'printedPage', 'pdfPageIndex', 'section', 'keywords', 'thaiName', 'visibility', 'selectedUserIds'], 'entity');
        var slug = ctx.text(entity.id, 'canonical ID', 120, true);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) ctx.fail('VALIDATION', 'Canonical entity IDs must be English slugs.');
        var id = book.id + ':' + slug;
        if (ctx.state.entities[id]) ctx.fail('CONFLICT', 'The entity already exists; resume with a new batch or review it.');
        var type = enumValue(ctx, entity.type, ENTITY_TYPES, 'entity type');
        var visibility = enumValue(ctx, entity.visibility, VISIBILITIES, 'visibility', 'CO_GM');
        var record = { id: id, campaignId: ctx.campaign.id, bookId: book.id, ownerUserId: ctx.user.id, type: type,
          name: ctx.text(entity.name, 'name', 200, true), englishText: ctx.text(entity.englishText, 'English text', 20000, true),
          thaiName: ctx.text(entity.thaiName || '', 'Thai name', 200, false), printedPage: ctx.integer(entity.printedPage, 0, 100000, 'printed page'),
          pdfPageIndex: ctx.integer(entity.pdfPageIndex, 0, 100000, 'PDF page index'), section: ctx.text(entity.section || '', 'section', 200, false),
          keywords: list(entity.keywords).map(function (term) { return ctx.text(term, 'keyword', 80, true); }).slice(0, 30),
          visibility: visibility, selectedUserIds: selected(ctx, entity.selectedUserIds || []), verificationStatus: 'NEEDS_REVIEW',
          extractionStatus: 'STRUCTURED_IMPORT', sourceVersion: book.checksum + ':' + slug + ':1', createdAt: ctx.at, updatedAt: ctx.at, version: 1 };
        ctx.state.entities[id] = record; imported.push(id);
      });
      var id = ctx.id('import', 'imports');
      ctx.state.imports[id] = { id: id, campaignId: ctx.campaign.id, bookId: book.id, checkpoint: checkpoint, entityIds: imported, ownerUserId: ctx.user.id, createdAt: ctx.at, updatedAt: ctx.at, version: 1 };
      book.importedAt = book.importedAt || ctx.at; book.importStatus = payload.complete ? 'COMPLETE' : 'PARTIAL'; book.lastCheckpoint = checkpoint; ctx.touch(book);
      // Checkpoints are append-only; imports cannot alter the canonical mechanics catalog.
      var bookView = ctx.clone(book); delete bookView.driveFileId;
      return { imported: imported, checkpoint: checkpoint, importId: id, book: bookView, verificationStatus: 'NEEDS_REVIEW' };
    } };

  A.handlers.reviewSource = { fields: ['campaignId', 'sourceType', 'sourceId', 'decision', 'notes'], mutation: true,
    authorize: function (ctx, payload) { ctx.mustGM(); findSource(ctx, payload.sourceType, payload.sourceId); }, run: function (ctx, payload) {
      enumValue(ctx, payload.sourceType, ['entity', 'material'], 'review source type');
      var source = findSource(ctx, payload.sourceType, payload.sourceId);
      if (source.id.indexOf('catalog:') === 0 || source.canonicalCatalogId) ctx.fail('FORBIDDEN', 'The canonical catalog is maintained with source review and tests.');
      ctx.version(source);
      if (!sourceText(source)) ctx.fail('VALIDATION', 'Correct and save the source text before review.');
      source.verificationStatus = enumValue(ctx, payload.decision, ['VERIFIED', 'NEEDS_REVIEW'], 'review decision');
      source.reviewNotes = ctx.text(payload.notes || '', 'review notes', 2000, false);
      source.reviewedBy = ctx.user.id; source.reviewedAt = ctx.at; ctx.touch(source);
      return payload.sourceType === 'material' ? { material: materialView(ctx, source) } : { entity: ctx.clone(source) };
    } };

  A.handlers.translateContent = { fields: ['campaignId', 'sourceType', 'sourceId', 'language', 'mode'], mutation: true,
    authorize: function (ctx, payload) { findSource(ctx, payload.sourceType, payload.sourceId); authorizeReplayHistory(ctx); }, run: function (ctx, payload) {
      var source = findSource(ctx, payload.sourceType, payload.sourceId);
      freshPrepared(ctx, [source]);
      var language = enumValue(ctx, payload.language, LANGUAGES, 'language', 'th');
      var mode = enumValue(ctx, payload.mode, ['TRANSLATE', 'NARRATE'], 'translation mode', 'TRANSLATE');
      if (mode === 'NARRATE' && ['CAMPAIGN_PLAYERS', 'SELECTED_PLAYERS', 'PLAYER', 'CAMPAIGN'].indexOf(source.visibility || 'CAMPAIGN_PLAYERS') < 0) {
        ctx.fail('FORBIDDEN', 'Player narration requires a revealed, player-safe source.');
      }
      var original = sourceText(source);
      if (!original) ctx.fail('SOURCE_UNAVAILABLE', 'The source text has not been corrected and saved yet.');
      var sourceVersion = citation(source).sourceVersion;
      var key = ctx.campaign.id + ':' + source.id + ':' + sourceVersion + ':' + language + ':' + mode;
      var existing = ctx.records('translations').filter(function (record) { return record.key === key && record.status !== 'ENGLISH_FALLBACK'; })[0];
      if (existing) return { translation: ctx.clone(existing) };
      aiLimit(ctx);
      var response = ctx.prepared ? ctx.prepared.response : language === 'en' && mode === 'TRANSLATE' ? { text: original, model: null } : aiCall(ctx, {
        kind: 'translate', language: language, mode: mode, text: original.slice(0, 20000), glossary: (A.catalog && A.catalog.glossary) || {}, citations: [citation(source)] });
      var valid = typeof response.text === 'string' && !!response.text.trim() && response.text.length <= 20000;
      // Do not silently accept altered numerical game facts in generated translation.
      if (valid) {
        var numbers = original.match(/\d+(?:\.\d+)?/g) || [];
        var translatedNumbers = response.text.match(/\d+(?:\.\d+)?/g) || [];
        valid = numbers.sort().join('|') === translatedNumbers.sort().join('|');
      }
      var id = ctx.id('translation', 'translations');
      var translation = { id: id, key: key, campaignId: ctx.campaign.id, sourceType: payload.sourceType, sourceId: source.id, sourceVersion: sourceVersion,
        language: language, mode: mode, text: valid ? response.text.trim() : original, status: valid ? 'NEEDS_REVIEW' : 'ENGLISH_FALLBACK',
        model: response.model || null, promptVersion: PROMPT_VERSION, reviewedBy: null, ownerUserId: ctx.user.id,
        visibility: source.visibility || 'CAMPAIGN_PLAYERS', selectedUserIds: ctx.clone(source.selectedUserIds || []), createdAt: ctx.at, updatedAt: ctx.at, version: 1 };
      ctx.state.translations[id] = translation;
      historyRecord(ctx, { question: mode + ' ' + source.id, text: translation.text, answerType: 'TRANSLATION', citations: [citation(source)], language: language,
        mode: mode, status: translation.status, model: response.model || null });
      return { translation: ctx.clone(translation) };
    } };
  A.handlers.translateContent.replay = function (ctx, payload, previous) {
    var translation = previous && previous.translation;
    var current = translation && ctx.record('translations', translation.id);
    var source = findSource(ctx, payload.sourceType, payload.sourceId);
    if (!current || current.sourceId !== source.id || current.sourceVersion !== citation(source).sourceVersion) ctx.fail('FORBIDDEN', 'The original translation source is no longer current.');
    return { translation: ctx.clone(current) };
  };

  function validateImage(ctx, mimeType, base64) {
    enumValue(ctx, mimeType, ['image/png', 'image/jpeg', 'image/webp'], 'image type');
    if (typeof base64 !== 'string' || !base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) ctx.fail('VALIDATION', 'Upload a valid base64 image.');
    var size = base64.length * 3 / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (size > MAX_IMAGE_BYTES || size < 12) ctx.fail('VALIDATION', 'Images must be no larger than 750 KB.');
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var bytes = [];
    for (var i = 0; i < Math.min(20, base64.length); i += 4) {
      var bits = (alphabet.indexOf(base64[i]) << 18) | (alphabet.indexOf(base64[i + 1]) << 12) | ((alphabet.indexOf(base64[i + 2]) & 63) << 6) | (alphabet.indexOf(base64[i + 3]) & 63);
      bytes.push((bits >>> 16) & 255, (bits >>> 8) & 255, bits & 255);
    }
    var png = [137, 80, 78, 71, 13, 10, 26, 10].every(function (byte, index) { return bytes[index] === byte; });
    var jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    var webp = String.fromCharCode.apply(null, bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode.apply(null, bytes.slice(8, 12)) === 'WEBP';
    if (!(mimeType === 'image/png' && png || mimeType === 'image/jpeg' && jpeg || mimeType === 'image/webp' && webp)) ctx.fail('VALIDATION', 'The image contents do not match its type.');
    return size;
  }
  A.validateMaterialImage = validateImage;
  A.handlers.uploadMaterial = { fields: ['campaignId', 'title', 'type', 'mimeType', 'base64', 'source', 'printedPage'], mutation: true,
    authorize: function () {}, run: function (ctx, payload) {
      var size = validateImage(ctx, payload.mimeType, payload.base64);
      var title = ctx.text(payload.title, 'title', 200, true);
      var type = enumValue(ctx, payload.type, ['BOOK_PAGE', 'CARD', 'HANDOUT', 'CHARACTER_SHEET', 'OTHER_IMAGE'], 'material type');
      var source = ctx.text(payload.source || '', 'source', 200, false);
      var printedPage = payload.printedPage === undefined || payload.printedPage === null ? null : ctx.integer(payload.printedPage, 0, 100000, 'printed page');
      if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
      var file = ctx.prepared ? ctx.prepared.file : ctx.dependencies.files({ action: 'save', name: title, mimeType: payload.mimeType, base64: payload.base64 });
      if (!file || typeof file.fileId !== 'string') ctx.fail('SOURCE_UNAVAILABLE', 'The private image could not be saved.');
      if (!ctx.prepared && ctx.effects) ctx.effects.push({ kind: 'file', fileId: file.fileId });
      var id = ctx.id('material', 'materials');
      var material = { id: id, campaignId: ctx.campaign.id, ownerUserId: ctx.user.id, title: title, type: type, mimeType: payload.mimeType,
        size: size, driveFileId: file.fileId, source: source, printedPage: printedPage, pdfPageIndex: null, englishText: '', extractedText: '',
        visibility: 'OWNER_ONLY', selectedUserIds: [], processingStatus: 'UPLOADED', verificationStatus: 'NEEDS_REVIEW',
        sourceVersion: '1', createdAt: ctx.at, updatedAt: ctx.at, version: 1 };
      ctx.state.materials[id] = material;
      return { material: materialView(ctx, material) };
    } };
  function ownMaterial(ctx, payload) {
    var material = visible(ctx, ctx.record('materials', payload.materialId));
    if (material.ownerUserId !== ctx.user.id && !ctx.isGM) ctx.fail('FORBIDDEN', 'Only the uploader or a permitted GM can modify this material.');
    return material;
  }
  A.handlers.analyzeMaterial = { fields: ['campaignId', 'materialId'], mutation: true,
    authorize: function (ctx, payload) { ownMaterial(ctx, payload); authorizeReplayHistory(ctx); }, run: function (ctx, payload) {
      aiLimit(ctx);
      var material = ownMaterial(ctx, payload); ctx.version(material);
      freshPrepared(ctx, [material]);
      if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
      var response;
      if (ctx.prepared) response = ctx.prepared.response;
      else {
        var file = ctx.dependencies.files({ action: 'read', fileId: material.driveFileId });
        validateImage(ctx, file.mimeType, file.base64);
        response = aiCall(ctx, { kind: 'ocr', mimeType: file.mimeType, base64: file.base64, title: material.title });
      }
      var valid = typeof response.englishText === 'string' && response.englishText.trim() && response.englishText.length <= 18000;
      material.extractedText = valid ? response.englishText.trim() : '';
      material.processingStatus = valid ? 'OCR_NEEDS_REVIEW' : 'AI_UNAVAILABLE';
      material.verificationStatus = 'NEEDS_REVIEW'; material.analyzedAt = ctx.at; material.model = response.model || null;
      ctx.touch(material);
      historyRecord(ctx, { question: 'OCR ' + material.title, text: valid ? 'OCR draft created; correct and save before use.' : 'AI unavailable.',
        answerType: 'OCR', citations: [{ sourceId: material.id, sourceVersion: citation(material).sourceVersion }], status: material.processingStatus, model: response.model || null });
      return { material: materialView(ctx, material) };
    } };
  A.handlers.saveMaterial = { fields: ['campaignId', 'materialId', 'englishText', 'title', 'source', 'printedPage', 'visibility', 'selectedUserIds'], mutation: true,
    authorize: function (ctx, payload) { ownMaterial(ctx, payload); }, run: function (ctx, payload) {
      var material = ownMaterial(ctx, payload); ctx.version(material);
      material.englishText = ctx.text(payload.englishText, 'corrected English text', 18000, true);
      if (payload.title !== undefined) material.title = ctx.text(payload.title, 'title', 200, true);
      if (payload.source !== undefined) material.source = ctx.text(payload.source, 'source', 200, false);
      if (payload.printedPage !== undefined) material.printedPage = payload.printedPage === null ? null : ctx.integer(payload.printedPage, 0, 100000, 'printed page');
      if (payload.visibility !== undefined) material.visibility = enumValue(ctx, payload.visibility, VISIBILITIES, 'visibility');
      if (payload.selectedUserIds !== undefined) material.selectedUserIds = selected(ctx, payload.selectedUserIds);
      if (material.visibility === 'SELECTED_PLAYERS' && !material.selectedUserIds.length) ctx.fail('VALIDATION', 'Select at least one active member.');
      material.processingStatus = 'CORRECTED'; material.verificationStatus = 'NEEDS_REVIEW';
      material.sourceVersion = String(Number(material.sourceVersion || 1) + 1); ctx.touch(material);
      return { material: materialView(ctx, material) };
    } };
  A.handlers.getMaterialFile = { fields: ['campaignId', 'materialId'], mutation: false,
    authorize: function (ctx, payload) { fileMaterial(ctx, payload.materialId); }, run: function (ctx, payload) {
      var material = fileMaterial(ctx, payload.materialId);
      if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
      var file = ctx.dependencies.files({ action: 'read', fileId: material.driveFileId });
      var size = validateImage(ctx, file.mimeType, file.base64);
      return { file: { mimeType: file.mimeType, base64: file.base64, size: size } };
    } };
  A.handlers.getAIHistory = { fields: ['campaignId', 'offset', 'limit'], mutation: false,
    authorize: function () {}, run: function (ctx, payload) {
      var paging = page(ctx, payload);
      var history = ctx.records('aiHistory').filter(function (entry) { return entry.campaignId === ctx.campaign.id && mayReadHistory(ctx, entry); })
        .sort(function (left, right) { return right.createdAt.localeCompare(left.createdAt); });
      return { history: ctx.clone(history.slice(paging.offset, paging.offset + paging.limit)), offset: paging.offset, limit: paging.limit, total: history.length };
    } };
  ['uploadMaterial', 'analyzeMaterial', 'saveMaterial', 'reviewSource'].forEach(function (operation) {
    A.handlers[operation].replay = function (ctx, payload, previous) {
      if (previous.material) return { material: materialView(ctx, visible(ctx, ctx.record('materials', previous.material.id))) };
      if (previous.entity) return { entity: ctx.clone(findSource(ctx, 'entity', previous.entity.id)) };
      ctx.fail('FORBIDDEN', 'The original source is no longer accessible.');
    };
  });

  function fileMaterial(ctx, materialId) {
    var material = ctx.record('materials', materialId);
    if (permission(ctx, material)) return material;
    var handout = ctx.records('assets').some(function (asset) {
      return asset.materialId === material.id && ['HANDOUT', 'CLUE'].indexOf(asset.kind) >= 0 && asset.status !== 'ARCHIVED' && permission(ctx, asset);
    });
    if (!handout) ctx.fail('FORBIDDEN', 'Material file access denied.');
    return material;
  }

  // The coordinator invokes prepare against an authorized snapshot before taking the
  // mutation lock, then rechecks authorization and source freshness during commit.
  A.handlers.askAssistant.prepare = function (ctx, payload) {
    var question = ctx.text(payload.question, 'question', 2000, true);
    var language = enumValue(ctx, payload.language, LANGUAGES, 'language', 'en');
    var mode = enumValue(ctx, payload.mode, ['RULES', 'EXPLAIN', 'PREPARE'], 'assistant mode', 'RULES');
    var sources = rank(allSources(ctx, mode === 'PREPARE'), question).slice(0, 8);
    var stamp = sourceStamp(ctx, sources);
    var response = { configured: false };
    if (sources.length) response = aiCall(ctx, { kind: 'assistant', mode: mode, language: language, question: question,
      context: sources.map(function (source) { return { sourceId: source.id, text: String(source.englishText || '').slice(0, 6000), name: source.name, verificationStatus: source.verificationStatus, citation: citation(source) }; }), citations: sources.map(citation) });
    return { response: response, sourceStamp: stamp };
  };
  A.handlers.translateContent.prepare = function (ctx, payload) {
    var source = findSource(ctx, payload.sourceType, payload.sourceId);
    var language = enumValue(ctx, payload.language, LANGUAGES, 'language', 'th');
    var mode = enumValue(ctx, payload.mode, ['TRANSLATE', 'NARRATE'], 'translation mode', 'TRANSLATE');
    if (mode === 'NARRATE' && ['CAMPAIGN_PLAYERS', 'SELECTED_PLAYERS', 'PLAYER', 'CAMPAIGN'].indexOf(source.visibility || 'CAMPAIGN_PLAYERS') < 0) ctx.fail('FORBIDDEN', 'Player narration requires a revealed, player-safe source.');
    var original = sourceText(source);
    if (!original) ctx.fail('SOURCE_UNAVAILABLE', 'The source text has not been corrected and saved yet.');
    var stamp = sourceStamp(ctx, [source]);
    var key = ctx.campaign.id + ':' + source.id + ':' + citation(source).sourceVersion + ':' + language + ':' + mode;
    var existing = ctx.records('translations').filter(function (record) { return record.key === key && record.status !== 'ENGLISH_FALLBACK'; })[0];
    var response = existing ? { text: existing.text, model: existing.model } : language === 'en' && mode === 'TRANSLATE' ? { text: original, model: null } : aiCall(ctx, {
      kind: 'translate', language: language, mode: mode, text: original.slice(0, 20000), glossary: (A.catalog && A.catalog.glossary) || {}, citations: [citation(source)] });
    return { response: response, sourceStamp: stamp };
  };
  A.handlers.uploadMaterial.prepare = function (ctx, payload) {
    validateImage(ctx, payload.mimeType, payload.base64);
    var title = ctx.text(payload.title, 'title', 200, true);
    enumValue(ctx, payload.type, ['BOOK_PAGE', 'CARD', 'HANDOUT', 'CHARACTER_SHEET', 'OTHER_IMAGE'], 'material type');
    ctx.text(payload.source || '', 'source', 200, false);
    if (payload.printedPage !== undefined && payload.printedPage !== null) ctx.integer(payload.printedPage, 0, 100000, 'printed page');
    if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
    var file = ctx.dependencies.files({ action: 'save', name: title, mimeType: payload.mimeType, base64: payload.base64 });
    if (!file || typeof file.fileId !== 'string') ctx.fail('SOURCE_UNAVAILABLE', 'The private image could not be saved.');
    ctx.effects.push({ kind: 'file', fileId: file.fileId });
    return { file: file };
  };
  A.handlers.analyzeMaterial.prepare = function (ctx, payload) {
    var material = ownMaterial(ctx, payload); ctx.version(material);
    var stamp = sourceStamp(ctx, [material]);
    if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
    var file = ctx.dependencies.files({ action: 'read', fileId: material.driveFileId });
    validateImage(ctx, file.mimeType, file.base64);
    var response = aiCall(ctx, { kind: 'ocr', mimeType: file.mimeType, base64: file.base64, title: material.title });
    return { response: response, sourceStamp: stamp };
  };
  A.handlers.registerBook.prepare = function (ctx, payload) {
    var checksum = ctx.text(payload.checksum, 'checksum', 64, true).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum)) ctx.fail('VALIDATION', 'Use the SHA-256 checksum of the original book.');
    ctx.text(payload.title, 'title', 200, true); ctx.text(payload.edition || '', 'edition', 120, false);
    if (!payload.driveFileId) return { file: null };
    if (!ctx.dependencies.files) ctx.fail('CONFIGURATION', 'Private Drive storage is not configured.');
    var file = ctx.dependencies.files({ action: 'register', fileId: ctx.text(payload.driveFileId, 'file ID', 200, true) });
    if (file && file.checksum && file.checksum.toLowerCase() !== checksum) ctx.fail('VALIDATION', 'The checksum does not match the registered private file.');
    return { file: file };
  };
})(Arkham);
if (typeof module !== 'undefined' && module.exports) module.exports = Arkham;
