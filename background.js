// background.js v1.7.1 (Click + Type Commit → JSON URLs, immediate storage)

const STORAGE_KEY = 'captures'; // [{ index, img, event, networks: [] }]
const CONSOLE_KEY = 'consoleLogs'; // [{ ts, level, text, url, tabId }]

// --- In-memory state (transient) ---
const recentClicks = new Map();
const windows = new Map(); // index -> { start, end }
let debuggerAttached = false;
let debuggerTargetTabId = null;
const pendingRequests = new Map(); // requestId -> partial entry
let recordedAPIs = new Map(); // url -> network entry
let currentNetworkFilter = null; // user-provided filter string (substring) or regex with prefix 're:'

// --- Persisted state (survives service worker restart) ---
// We use chrome.storage.session which is in-memory but persists for the browser session.
const getSessionState = async () => (await chrome.storage.session.get(['recordingTabId', 'actionIndex', 'tabStates'])) || {};
const setSessionState = (state) => chrome.storage.session.set(state);

// Initialize state on startup
(async () => {
  const state = await getSessionState();
  if (!state.tabStates) {
    // First time init
    await setSessionState({ recordingTabId: null, actionIndex: 0, tabStates: {} });
  }
})();

function setNetworkFilter(f){ 
  try{ 
    if(!f) currentNetworkFilter = null; 
    else currentNetworkFilter = String(f).trim(); 
  }catch(e){ 
    currentNetworkFilter = null; 
  } 
}

async function resetStorage(){ 
  await chrome.storage.local.set({ [STORAGE_KEY]: [], [CONSOLE_KEY]: [] }); 
  await setSessionState({ actionIndex: 0 }); 
  windows.clear(); 
}

function pushCapture(capture){ 
  return new Promise((resolve)=>{ 
    chrome.storage.local.get([STORAGE_KEY], (res)=>{ 
      const list = res[STORAGE_KEY] || []; 
      list.push(capture); 
      chrome.storage.local.set({ [STORAGE_KEY]: list }, resolve); 
    }); 
  }); 
}

function appendConsoleLog(log){ 
  return new Promise((resolve)=>{ 
    chrome.storage.local.get([CONSOLE_KEY], (res)=>{ 
      const list = res[CONSOLE_KEY] || []; 
      list.push(log); 
      chrome.storage.local.set({ [CONSOLE_KEY]: list }, resolve); 
    }); 
  }); 
}

function appendNetworkEvent(index, event){
  return new Promise((resolve)=>{
    chrome.storage.local.get([STORAGE_KEY], (res)=>{
      const capturesList = res[STORAGE_KEY] || [];
      try {
        const i = capturesList.findIndex(x => x.index === index);
        if (i !== -1) {
          const arr = capturesList[i].networks || [];
          // Merge detailed info into existing entry for same URL when available
          if (event.hasOwnProperty('requestHeaders') || event.hasOwnProperty('responseHeaders') || event.hasOwnProperty('statusCode')){
            const existing = arr.find(x => x.url === event.url);
            if (existing) Object.assign(existing, event);
            else arr.push(event);
          } else {
            arr.push(event);
          }
          capturesList[i].networks = arr;
        }
      } catch (e) { console.error('appendNetworkEvent error', e); }
      chrome.storage.local.set({ [STORAGE_KEY]: capturesList }, resolve);
    });
  });
}

function injectContentScript(tabId){ 
  return chrome.scripting.executeScript({ 
    target: { tabId, allFrames: true }, 
    files: ['content.js'] 
  }); 
}

function setBadge(tabId, status){ 
  let text='', color='#777'; 
  if(status==='recording'){ 
    text='REC'; 
    color='#2e7d32'; 
  } else if(status==='paused'){ 
    text='PAU'; 
    color='#f9ab00'; 
  } 
  chrome.action.setBadgeText({tabId: tabId, text: text}); 
  chrome.action.setBadgeBackgroundColor({tabId: tabId, color: color}); 
}

async function requestConsent(tabId){ 
  try{ 
    await injectContentScript(tabId); 
  }catch(e){}
  
  chrome.tabs.sendMessage(tabId, { type: 'request-consent' }).catch(()=>{});
  
  return new Promise((resolve)=>{
    const listener = (msg, sender) => { 
      if (sender.tab?.id !== tabId) return; 
      if (msg?.type === 'consent-response') { 
        chrome.runtime.onMessage.removeListener(listener); 
        resolve(!!msg.allow); 
      } 
    };
    chrome.runtime.onMessage.addListener(listener);
    setTimeout(()=>{ 
      try{ 
        chrome.runtime.onMessage.removeListener(listener); 
      }catch(e){} 
      resolve(false); 
    }, 20000);
  });
}

async function startRecording(tabId){


  // try to attach debugger to capture richer network events
  try {
    await attachDebugger(tabId);
  } catch (e) {
    // continue even if debugger attach fails; webRequest fallback will still work
    console.warn('Debugger attach failed', e);
  }

  // Inject console forwarder into page context (MAIN world) to avoid CSP blocking inline scripts
  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        func: function(){
          try{
            if (window.__clickshot_forwarder_installed) return;
            window.__clickshot_forwarder_installed = true;
            const methods=['log','info','warn','error','debug'];
            methods.forEach((m)=>{
              const orig = console[m] ? console[m].bind(console) : function(){};
              console[m] = function(){
                try{
                  const args = Array.prototype.slice.call(arguments).map(a=>{
                    try{ if (typeof a === 'object') return JSON.stringify(a); }catch(e){}
                    try{ return String(a); }catch(e){ return '' }
                  });
                  window.postMessage({ __clickshot_console: true, level: m, args: args, ts: Date.now() }, '*');
                }catch(e){}
                try{ orig.apply(console, arguments); }catch(e){}
              };
            });
          }catch(e){}
        }
      });
    }
  } catch (e) {
    console.warn('Console forwarder injection failed', e);
  }

  // After attempting injection, try to pull any buffered events from the page(s)
  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      const results = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        func: function(){
          try{
            const evs = window.__clickshot_pendingEvents || [];
            window.__clickshot_pendingEvents = [];
            return evs;
          }catch(e){ return []; }
        }
      });
      
      if (Array.isArray(results)){
        // helper to get tab info
        const getTabInfo = (id) => new Promise((resolve)=>{ 
          try{ 
            chrome.tabs.get(id, (t)=>{ resolve(t); }); 
          }catch(e){ 
            resolve(null); 
          } 
        });
        
        for (const r of results){
          const evs = r && r.result ? r.result : [];
          if (Array.isArray(evs) && evs.length){
            for (const ev of evs){
              try{
                if (!ev) continue;
                
                // console entry
                if (ev.type === 'console' || ev.level){
                  const text = Array.isArray(ev.args) ? ev.args.join(' ') : String(ev.args || '');
                  const entry = { ts: ev.ts || Date.now(), level: ev.level || 'log', text, url: ev.url || '', tabId };
                  appendConsoleLog(entry).catch((e)=>{ console.error('[console-log] appendConsoleLog failed for buffered event', e); });
                  continue;
                }
                
                // user action events buffered on page
                if (ev.type === 'user-click' || ev.type === 'user-type-commit'){
                  const kind = ev.type === 'user-click' ? 'click' : 'type-commit';
                  const payload = ev.payload || ev;
                  try{
                    const tabInfo = await getTabInfo(tabId);
                    const sender = { tab: { id: tabId, windowId: tabInfo?.windowId, url: payload?.url || tabInfo?.url || '' } };
                    handleUserAction(kind, payload, sender);
                  }catch(e){ console.error('Error replaying buffered user action', e); }
                  continue;
                }
                
                // unknown buffered item - ignore or log
                // console.log('Unknown buffered event', ev);
              }catch(e){ console.error('Error processing buffered event', e); }
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve pending console events', e);
  }

  await resetStorage();
  const { tabStates = {} } = await getSessionState();
  tabStates[tabId] = {status:'recording', consent:true};
  await setSessionState({ recordingTabId: tabId, tabStates });
  setBadge(tabId,'recording');
  chrome.tabs.sendMessage(tabId,{type:'recording-status',status:'started'}).catch(()=>{});
  return {ok:true};
}

async function stopRecording(tabId){
  const { tabStates = {} } = await getSessionState();
  tabStates[tabId] = {status:'idle', consent:true};
  await setSessionState({ tabStates, recordingTabId: null });
  setBadge(tabId,'idle');
  chrome.tabs.sendMessage(tabId,{type:'recording-status',status:'stopped'}).catch(()=>{});
  
  // detach debugger if attached
  try {
    await detachDebugger();
  } catch(e){}
  
  windows.clear();
}

async function pauseRecording(tabId){
  const { tabStates = {} } = await getSessionState();
  const s = tabStates[tabId] || {status:'idle'};
  if(s.status==='recording'){
    tabStates[tabId] = {status:'paused', consent:true};
    await setSessionState({ tabStates });
    setBadge(tabId,'paused');
    chrome.tabs.sendMessage(tabId,{type:'recording-status',status:'paused'}).catch(()=>{});
  }
}

async function resumeRecording(tabId){
  const { tabStates = {} } = await getSessionState();
  const s = tabStates[tabId] || {status:'idle'};
  if(s.status==='paused'){
    tabStates[tabId] = {status:'recording', consent:true};
    await setSessionState({ tabStates });
    setBadge(tabId,'recording');
    chrome.tabs.sendMessage(tabId,{type:'recording-status',status:'resumed'}).catch(()=>{});
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => { 
  if (changeInfo.status === 'complete') { 
    const { tabStates = {} } = await getSessionState(); 
    const s = tabStates[tabId]; 
    if (s?.status === 'recording' || s?.status === 'paused') { 
      injectContentScript(tabId).then(()=>{ 
        const status = s.status === 'recording' ? 'started' : 'paused'; 
        chrome.tabs.sendMessage(tabId, { type: 'recording-status', status }).catch(()=>{}); 
      }).catch(()=>{}); 
    } 
  } 
});

chrome.tabs.onRemoved.addListener(async (tabId)=>{
  const { tabStates = {}, recordingTabId } = await getSessionState();
  delete tabStates[tabId];
  const newRecordingTabId = recordingTabId === tabId ? null : recordingTabId;
  await setSessionState({ tabStates, recordingTabId: newRecordingTabId });
});

function startNetworkWindow(index, durationMs=5000){
  // start slightly earlier to capture fast requests and give small leeway
  const now = Date.now() - 100;
  windows.set(index, { start: now, end: now + durationMs });
}

// Normalize timestamps: some APIs may give seconds instead of ms
function normalizeTimeStamp(ts){
  if (ts == null) return null;
  // If timestamp looks like seconds (e.g. < 1e12), convert to ms
  if (ts < 1e12) return ts * 1000;
  return ts;
}

function withinWindow(ts){
  const n = normalizeTimeStamp(ts);
  if (n == null) return null;
  for(const [idx, w] of windows){ 
    if(n >= w.start && n <= w.end) return idx; 
  }
  return null;
}

async function maybeRecordNetwork(details, phase){
  try {
    // Only capture XHR/fetch requests and filter out .svg files
    if (!details.type || !['xmlhttprequest', 'fetch'].includes(details.type.toLowerCase()) ||
        (details.url && details.url.toLowerCase().endsWith('.svg'))) {
      return;
    }

    const { recordingTabId } = await getSessionState();
    console.log(`[maybeRecordNetwork] phase: ${phase}, url: ${details.url || '(none)'}]`);
    if (!recordingTabId || details.tabId !== recordingTabId) {
      console.log('[maybeRecordNetwork] Skipping - not recording tab');
      return;
    }

    // NOTE: network filtering is applied at download time — capture everything now.
    // Create properly formatted network entry with all required fields
    const entry = {
      method: details.method || 'GET',
      url: details.url,
      type: details.type,
      statusCode: details.statusCode || 0,
      requestBody: '',
      responseBody: ''
    };

    // Process request body if available
    if (details.requestBody) {
      try {
        if (details.requestBody.raw) {
          const rawData = details.requestBody.raw[0];
          if (rawData.bytes) entry.requestBody = new TextDecoder().decode(rawData.bytes);
          else if (rawData.file) entry.requestBody = `[File Data: ${rawData.file}]`;
        } else if (details.requestBody.formData) {
          entry.requestBody = JSON.stringify(details.requestBody.formData);
        } else {
          entry.requestBody = JSON.stringify(details.requestBody);
        }
      } catch (e) {
        console.error('[maybeRecordNetwork] Error processing request body:', e);
      }
    }

    // Always keep a global map of recent APIs so handleUserAction can collect them
    try {
      if (details.url) {
        if (!recordedAPIs.has(details.url)) recordedAPIs.set(details.url, entry);
        else recordedAPIs.set(details.url, { ...recordedAPIs.get(details.url), ...entry });
      }
    } catch (e) { console.error('[maybeRecordNetwork] Error storing recordedAPIs', e); }

    // If the request falls within a current network window, attach it to the session
    const currentIdx = withinWindow(details.timeStamp);
    if (currentIdx != null) {
      console.log(`[maybeRecordNetwork] Recording network event for index ${currentIdx}`);
      // persist to chrome.storage if there is an existing capture slot
      try {
        appendNetworkEvent(currentIdx, entry).catch(()=>{});
      } catch(e) {}
    } else {
      console.log('[maybeRecordNetwork] Event not in any active window, stored in recordedAPIs only');
    }
  } catch(e) { console.error('Error in maybeRecordNetwork:', e); }
}

function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    if (!chrome.debugger) return reject(new Error('chrome.debugger unavailable'));

    // First detach if already attached somewhere
    try {
      if (debuggerTargetTabId) { // Check target tab ID, not just boolean flag
        chrome.debugger.detach({ tabId: debuggerTargetTabId });
      }
    } catch(e) {
      console.warn('Error detaching existing debugger:', e);
    }

    const target = { tabId };
    
    // Clear any existing state
    debuggerAttached = false;
    debuggerTargetTabId = null;
    pendingRequests.clear();
    recordedAPIs.clear();

    // Attach debugger with retry logic
    const tryAttach = (attemptNum = 1) => {
      chrome.debugger.attach(target, '1.3', () => {
        if (chrome.runtime.lastError) {
          console.warn(`Debugger attach attempt ${attemptNum} failed:`, chrome.runtime.lastError);
          if (attemptNum < 3) {
            setTimeout(() => tryAttach(attemptNum + 1), 500 * Math.pow(2, attemptNum));
            return;
          }
          return reject(new Error(chrome.runtime.lastError.message));
        }

        debuggerAttached = true;
        debuggerTargetTabId = tabId;
        
        // listen to debugger events
        chrome.debugger.onEvent.addListener(onDebuggerEvent);

        // Enable required domains
        Promise.all([
          new Promise((res) => chrome.debugger.sendCommand(target, 'Network.enable', {
            maxResourceBufferSize: 10000000, // 10MB buffer
            maxTotalBufferSize: 20000000 // 20MB total
          }, res)),
          new Promise((res) => chrome.debugger.sendCommand(target, 'Network.setCacheDisabled', { cacheDisabled: true }, res))
        ]).then(() => {
          console.log('Network domain enabled and cache disabled');
          resolve();
        }).catch((err) => {
          console.warn('Error enabling network domain:', err);
          resolve(); // Continue anyway as basic functionality will still work
        });
      });
    };
    
    tryAttach();
  });
}

function detachDebugger() {
  return new Promise((resolve) => {
    if (debuggerTargetTabId == null) {
      debuggerAttached = false;
      return resolve();
    }

    const target = { tabId: debuggerTargetTabId };
    
    // Clean up state immediately
    const wasAttached = debuggerAttached;
    debuggerAttached = false;
    debuggerTargetTabId = null;
    pendingRequests.clear();
    
    if (!wasAttached) return resolve();
    
    try {
      chrome.debugger.onEvent.removeListener(onDebuggerEvent);
      chrome.debugger.sendCommand(target, 'Network.disable', {}, () => {
        chrome.debugger.detach(target, () => {
          resolve();
        });
      });
    } catch (e) {
      resolve();
    }
  });
}

function onDebuggerEvent(source, method, params) {
  // only handle events for the attached tab
  if (!debuggerAttached || source?.tabId !== debuggerTargetTabId) return;
  
  try {
    if (method === 'Network.requestWillBeSent') {
      const rid = params.requestId;
      const request = params.request;
      const entry = {
        requestId: rid,
        url: request.url,
        method: request.method,
        type: params.type,
        requestBody: request.postData || '',
        requestHeaders: request.headers || {},
        timeStamp: Date.now()
      };
      
      // Store request info
      pendingRequests.set(rid, entry);
      
      // Record in recordedAPIs
      if (!recordedAPIs.has(entry.url)) {
        recordedAPIs.set(entry.url, {
          method: entry.method,
          url: entry.url,
          requestBody: entry.requestBody,
          requestHeaders: entry.requestHeaders,
          statusCode: 0,
          responseBody: 'Pending...'
        });
      }
    }
    
    if (method === 'Network.responseReceived') {
      const rid = params.requestId;
      const resp = params.response || {};
      const time = Date.now();
      const windowIndex = withinWindow(time);
      const existing = pendingRequests.get(rid) || { requestId: rid, url: resp.url || '', method: null };
      const entry = {
        ...existing,
        statusCode: resp.status,
        mimeType: resp.mimeType || null,
        responseHeaders: resp.headers || {},
        timeStamp: time
      };

      // Handle different response types appropriately
      const target = { tabId: debuggerTargetTabId };
      
      // First try to get the response body
      chrome.debugger.sendCommand(target, 'Network.getResponseBody', { requestId: rid }, async (res) => {
        // If the debugger command failed (resource not found or GC'd), handle gracefully
        if (chrome.runtime.lastError) {
          console.warn('Network.getResponseBody failed:', chrome.runtime.lastError.message);
          
          // create best-effort entry without body
          const networkEntry = {
            method: entry.method || 'GET',
            url: entry.url,
            type: entry.type,
            statusCode: entry.statusCode || 200,
            requestBody: entry.requestBody || '',
            requestHeaders: entry.requestHeaders || {},
            responseHeaders: entry.responseHeaders || {},
            responseBody: `Error fetching body: ${chrome.runtime.lastError.message}`,
            mimeType: entry.mimeType
          };
          
          if (entry.url) recordedAPIs.set(entry.url, networkEntry);
          if (windowIndex != null) appendNetworkEvent(windowIndex, networkEntry).catch(()=>{});
          pendingRequests.delete(rid);
          return;
        }

        let responseBody = '';
        let error = null;
        
        try {
          if (res) {
            // Handle base64 encoded responses
            if (res.base64Encoded) {
              try {
                responseBody = atob(res.body);
              } catch(e) {
                responseBody = res.body; // Keep encoded if decode fails
              }
            } else {
              responseBody = res.body;
            }
            
            // Try to parse and format JSON responses
            if (entry.mimeType?.includes('application/json') || responseBody.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(responseBody);
                responseBody = JSON.stringify(parsed, null, 2);
              } catch(e) {
                console.log('Failed to parse JSON response:', e);
              }
            }
          }
        } catch(e) {
          error = e;
          console.error('Error processing response:', e);
        }

        // Create network entry with all available data
        const networkEntry = {
          method: entry.method || 'GET',
          url: entry.url,
          type: params.type,
          statusCode: entry.statusCode || 200,
          requestBody: entry.requestBody || '',
          requestHeaders: entry.requestHeaders || {},
          responseHeaders: entry.responseHeaders || {},
          responseBody: responseBody || (error ? `Error capturing response: ${error.message}` : ''),
          mimeType: entry.mimeType
        };

        // Update global state
        if (entry.url) {
          recordedAPIs.set(entry.url, networkEntry);
        }

        // Append to storage if in capture window
        if (windowIndex != null) {
          console.log(`Appending network event for ${entry.url}`);
          appendNetworkEvent(windowIndex, networkEntry);
        }

        pendingRequests.delete(rid);
      });
    }

    // Also track response data received events for large responses
    if (method === 'Network.dataReceived') {
      const rid = params.requestId;
      if (pendingRequests.has(rid)) {
        const entry = pendingRequests.get(rid);
        entry.dataReceived = true;
        pendingRequests.set(rid, entry);
      }
    }
  } catch (e) {
    console.error('Error in debugger event handler:', e);
  }
}

chrome.webRequest.onBeforeRequest.addListener((d)=>maybeRecordNetwork(d, 'onBeforeRequest'), { urls: ["<all_urls>"] });
chrome.webRequest.onSendHeaders.addListener((d)=>maybeRecordNetwork(d, 'onSendHeaders'), { urls: ["<all_urls>"] });
chrome.webRequest.onResponseStarted.addListener((d)=>maybeRecordNetwork(d, 'onResponseStarted'), { urls: ["<all_urls>"] });
chrome.webRequest.onCompleted.addListener((d)=>maybeRecordNetwork(d, 'onCompleted'), { urls: ["<all_urls>"] });
chrome.webRequest.onErrorOccurred.addListener((d)=>maybeRecordNetwork(d, 'onErrorOccurred'), { urls: ["<all_urls>"] });

// Fixed hash function with 5px coordinate tolerance
function hashAction(p){
  try{
    const ei = p?.elementInfo || {};
    // Use rounded coordinates (within 5px tolerance) to catch rapid duplicate clicks
    const x = Math.round((p?.x || 0) / 5) * 5;
    const y = Math.round((p?.y || 0) / 5) * 5;
    const tag = ei.tag || p?.targetTag || '';
    const id = ei.id || '';
    const cls = String(ei.class || '').slice(0, 120);
    return [p?.url || '', x, y, tag, id, cls].join('|');
  }catch(_){
    return String(Math.random());
  }
}

async function handleUserAction(kind, payload, sender){
  recordedAPIs.clear();
  
  const tabId = sender.tab?.id; 
  const windowId = sender.tab?.windowId; 
  if (!tabId || !windowId) return;

  const { tabStates = {}, actionIndex = 0 } = await getSessionState();
  const s = tabStates[tabId];
  if (!s || s.status !== 'recording') return;

  // do not record common consent buttons (defense-in-depth)
  try{
    const t=String(payload?.elementInfo?.text||'').trim().toLowerCase();
    const al=String(payload?.elementInfo?.aria?.label||'').trim().toLowerCase();
    const isBtn = (payload?.targetTag||'')==='button' || (payload?.elementInfo?.type||'')==='button';
    const block={'allow':1,'deny':1,'accept':1,'reject':1,'agree':1,'consent':1,'allow all':1,'accept all':1};
    if(isBtn && (block[t]||block[al])) return;
  }catch(_){}

  // dedupe identical clicks within 700ms
  try{
    const now=Date.now();
    const h=hashAction(payload);
    const last=recentClicks.get(h)||0;
    if(now-last<700){
      console.log('[dedup] Ignoring duplicate action within 700ms');
      return;
    }
    recentClicks.set(h,now);
    for(const[k,ts]of recentClicks){
      if(now-ts>5000)recentClicks.delete(k);
    }
  }catch(_){}

  const newActionIndex = actionIndex + 1;
  await setSessionState({ actionIndex: newActionIndex });
  startNetworkWindow(newActionIndex, 5000);

  const meta = { 
    idx: newActionIndex, 
    kind, 
    ts: payload.ts, 
    x: payload.x, 
    y: payload.y, 
    dpr: payload.dpr, 
    vw: payload.vw, 
    vh: payload.vh, 
    url: sender.tab?.url || payload.url, 
    title: sender.tab?.title || payload.title, 
    key: payload.key, 
    targetTag: payload.targetTag, 
    elementInfo: payload.elementInfo 
  };

  // Get current network state for this action
  chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 }, async (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) { return; }

    // Create the capture object with an empty networks array.
    // The `appendNetworkEvent` function will populate this array as network events come in.
    const networks = [];
    await pushCapture({ index: newActionIndex, img: dataUrl, event: meta, networks });

    // Clear the global network log for the next action.
    // This ensures that only networks related to the *next* click are captured.
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // lightweight ping for content script to verify extension context
  if (msg?.type === 'ping') { 
    sendResponse({ ok: true }); 
    return true; 
  }

  if (msg?.type === 'start-recording') {
    chrome.tabs.query({ active:true, currentWindow:true }, async (tabs)=>{
      const tabId=tabs[0]?.id; 
      if(!tabId) return sendResponse({ok:false,error:'No active tab'});
      const res = await startRecording(tabId);
      sendResponse(res);
    });
    return true;
  }

  if (msg?.type === 'stop-recording') {
    chrome.tabs.query({ active:true, currentWindow:true },(tabs)=>{
      const tabId=tabs[0]?.id; 
      if(!tabId) return sendResponse({ok:false}); 
      stopRecording(tabId); 
      sendResponse({ok:true});
    });
    return true;
  }

  if (msg?.type === 'pause-recording') {
    chrome.tabs.query({ active:true, currentWindow:true },(tabs)=>{ 
      const tabId=tabs[0]?.id; 
      if(!tabId) return sendResponse({ok:false}); 
      pauseRecording(tabId); 
      sendResponse({ok:true}); 
    });
    return true;
  }

  if (msg?.type === 'resume-recording') {
    chrome.tabs.query({ active:true, currentWindow:true },(tabs)=>{ 
      const tabId=tabs[0]?.id; 
      if(!tabId) return sendResponse({ok:false}); 
      resumeRecording(tabId); 
      sendResponse({ok:true}); 
    });
    return true;
  }

  if (msg?.type === 'get-status') {
    chrome.tabs.query({ active:true, currentWindow:true }, async (tabs)=>{
      const tabId=tabs[0]?.id;
      const { tabStates = {} } = await getSessionState();
      const s=tabStates[tabId] || {status:'idle'};
      sendResponse({ok:true,status:s.status});
    });
    return true; // Keep message channel open for async response
  }

  if (msg?.type === 'set-filter'){
    try{ 
      setNetworkFilter(msg.filter); 
      chrome.storage.local.set({ networkFilter: msg.filter || '' }); 
    }catch(e){}
    return true;
  }

  if (msg?.type === 'user-click') handleUserAction('click', msg, sender);
  if (msg?.type === 'user-type-commit') handleUserAction('type-commit', msg, sender);

  // Capture console logs forwarded from content script (only while recording)
  if (msg?.type === 'console-log') {
    try{
      const tabId = sender.tab?.id || null;
      getSessionState().then(({ tabStates = {} }) => {
        const s = tabStates[tabId] || { status: 'idle' };
        console.log('[console-log] received from tabId=', tabId, 'status=', s.status, 'level=', msg.level, 'args=', msg.args);
        if (s.status === 'recording'){
          const text = Array.isArray(msg.args) ? msg.args.join(' ') : String(msg.args || '');
          const entry = { ts: msg.ts || Date.now(), level: msg.level || 'log', text, url: msg.url || sender.tab?.url || '', tabId };
          appendConsoleLog(entry).catch((e)=>{ console.error('[console-log] appendConsoleLog failed', e); });
        } else {
          // not recording - ignore
        }
      });
    }catch(e){}
  }
});
