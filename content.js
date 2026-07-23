// Guard against multiple injections
if (window.__clickshot_initialized) {
  console.warn('[ClickShot] Content script already initialized, skipping');
} else {
  window.__clickshot_initialized = true;

  // Fixed coordinate function - adds scroll offset
  function getGlobalClientXY(e){
    try{
      // Get viewport coordinates
      let x = e.clientX;
      let y = e.clientY;
      
      // Add scroll offset to get document coordinates
      x += window.scrollX;
      y += window.scrollY;
      
      // Handle iframes
      let w = window;
      while(w !== w.top){
        const fe = w.frameElement;
        if(!fe) break;
        const r = fe.getBoundingClientRect();
        x += r.left;
        y += r.top;
        w = w.parent;
      }
      return {x, y};
    } catch(_) {
      return {x: e.clientX + window.scrollX, y: e.clientY + window.scrollY};
    }
  }

  // contentScript.js v1.7.1 (ONLY real clicks & type-commit on blur)

  // Initialize event queue system
  const EventQueue = {
    key: 'clickshot_event_queue',
    memoryQueue: [],

    enqueue: function(event) {
      try {
        this.memoryQueue.push(event);
        const stored = this.loadFromStorage();
        stored.push(event);
        localStorage.setItem(this.key, JSON.stringify(stored));
      } catch(e) {
        console.warn('Failed to enqueue event', e);
      }
    },

    loadFromStorage: function() {
      try {
        const stored = localStorage.getItem(this.key);
        return stored ? JSON.parse(stored) : [];
      } catch(e) {
        return [];
      }
    },

    getAllEvents: function() {
      try {
        const stored = this.loadFromStorage();
        const merged = [...new Set([...this.memoryQueue, ...stored])];
        return merged;
      } catch(e) {
        return this.memoryQueue;
      }
    },

    clear: function() {
      this.memoryQueue = [];
      try {
        localStorage.removeItem(this.key);
      } catch(e) {}
    },

    processEvents: async function() {
      if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        return false;
      }

      const events = this.getAllEvents();
      if (events.length === 0) return true;

      const failedEvents = [];
      for (const event of events) {
        let success = false;
        for (let retry = 0; retry < 3; retry++) {
          try {
            await chrome.runtime.sendMessage(event.payload);
            success = true;
            break;
          } catch(e) {
            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retry)));
          }
        }
        if (!success) {
          failedEvents.push(event);
        }
      }

      if (failedEvents.length === 0) {
        this.clear();
        return true;
      } else {
        this.memoryQueue = failedEvents;
        try {
          localStorage.setItem(this.key, JSON.stringify(failedEvents));
        } catch(e) {}
        return false;
      }
    }
  };

  // Set up periodic event processing
  setInterval(() => {
    EventQueue.processEvents().catch(() => {});
  }, 1000);

  let overlayEl = null, consentEl = null;
  let clickLock = false;
  let lastClickTs = 0;

  // typing session state
  let activeEl = null;
  let dirty = false;
  let committed = false;

  function ensureOverlay(){ 
    if(overlayEl) return overlayEl; 
    overlayEl = document.createElement('div'); 
    Object.assign(overlayEl.style,{ 
      position:'fixed', 
      top:'12px', 
      right:'12px', 
      zIndex:'2147483647', 
      padding:'10px 12px', 
      borderRadius:'8px', 
      fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', 
      fontSize:'12px', 
      color:'#fff', 
      background:'#2e7d32', 
      boxShadow:'0 2px 10px rgba(0,0,0,.25)', 
      pointerEvents:'none', 
      opacity:'0.9' 
    }); 
    overlayEl.textContent='ClickShot: idle'; 
    document.documentElement.appendChild(overlayEl); 
    return overlayEl; 
  }

  function setBanner(status){ 
    const el = ensureOverlay(); 
    let bg = '#2e7d32', text = 'ClickShot: idle'; 
    if(status === 'started' || status === 'resumed'){ 
      bg = '#2e7d32'; 
      text = 'ClickShot: recording'; 
    } else if(status === 'paused'){ 
      bg = '#f9ab00'; 
      text = 'ClickShot: paused'; 
    } else if(status === 'stopped'){ 
      bg = '#c62828'; 
      text = 'ClickShot: stopped'; 
    } else if(status === 'consent-denied'){ 
      bg = '#c62828'; 
      text = 'ClickShot: consent denied'; 
    } 
    el.style.background = bg; 
    el.textContent = text; 
  }

  function showConsent(){ 
    if(consentEl) return; 
    consentEl = document.createElement('div'); 
    Object.assign(consentEl.style,{ 
      position:'fixed', 
      inset:'0', 
      zIndex:'2147483646', 
      background:'rgba(0,0,0,.35)', 
      display:'flex', 
      alignItems:'center', 
      justifyContent:'center' 
    }); 
    const panel = document.createElement('div'); 
    Object.assign(panel.style,{ 
      width:'360px', 
      maxWidth:'90vw', 
      background:'#fff', 
      color:'#222', 
      borderRadius:'10px', 
      boxShadow:'0 10px 30px rgba(0,0,0,.35)', 
      padding:'16px', 
      fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' 
    }); 
    const title = document.createElement('h2'); 
    title.textContent = 'Allow Click Recording?'; 
    title.style.margin = '0 0 8px'; 
    title.style.fontSize = '16px'; 
    const desc = document.createElement('p'); 
    desc.innerHTML = 'This extension will capture a JPEG (80% quality) of the visible page and network activity on user clicks and when typing is committed (focus out).'; 
    desc.style.margin = '0 0 12px'; 
    desc.style.fontSize = '13px'; 
    const row = document.createElement('div'); 
    row.style.display = 'flex'; 
    row.style.gap = '8px'; 
    const allowBtn = document.createElement('button'); 
    allowBtn.textContent = 'Allow'; 
    Object.assign(allowBtn.style,{ 
      flex:'1', 
      padding:'8px', 
      borderRadius:'6px', 
      border:'1px solid #2e7d32', 
      background:'#2e7d32', 
      color:'#fff', 
      cursor:'pointer' 
    }); 
    const denyBtn = document.createElement('button'); 
    denyBtn.textContent = 'Decline'; 
    Object.assign(denyBtn.style,{ 
      flex:'1', 
      padding:'8px', 
      borderRadius:'6px', 
      border:'1px solid #c62828', 
      background:'#c62828', 
      color:'#fff', 
      cursor:'pointer' 
    }); 
    row.appendChild(allowBtn); 
    row.appendChild(denyBtn); 
    panel.appendChild(title); 
    panel.appendChild(desc); 
    panel.appendChild(row); 
    consentEl.appendChild(panel); 
    document.documentElement.appendChild(consentEl); 
    allowBtn.addEventListener('click',()=>{ 
      try { 
        chrome.runtime.sendMessage({type:'consent-response', allow:true}); 
      } catch (e) { 
        console.warn('Extension context invalidated (allow)', e); 
      } 
      consentEl.remove(); 
      consentEl = null; 
    }); 
    denyBtn.addEventListener('click',()=>{ 
      try { 
        chrome.runtime.sendMessage({type:'consent-response', allow:false}); 
      } catch (e) { 
        console.warn('Extension context invalidated (deny)', e); 
      } 
      consentEl.remove(); 
      consentEl = null; 
    }); 
  }

  function getXPath(element) {
    try {
      if (!element) return '';
      if (element.id) return `//*[@id="${element.id}"]`;
      const paths = [];
      while (element.nodeType === Node.ELEMENT_NODE) {
        let siblings = element.parentNode ? Array.from(element.parentNode.children) : [];
        let index = siblings.indexOf(element) + 1;
        const tagName = element.tagName.toLowerCase();
        const pathIndex = (siblings.filter(sibling => sibling.tagName.toLowerCase() === tagName).length > 1)
          ? `[${index}]`
          : '';
        paths.unshift(tagName + pathIndex);
        element = element.parentNode;
      }
      return '/' + paths.join('/');
    } catch(e) {
      console.warn('Error generating XPath:', e);
      return '';
    }
  }

  function getElementInfo(element) {
    try {
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || '',
        class: element.className || '',
        type: element.type || '',
        value: element.value || '',
        text: element.innerText || element.textContent || '',
        name: element.name || '',
        href: element.href || '',
        src: element.src || '',
        aria: {
          label: element.getAttribute('aria-label') || '',
          role: element.getAttribute('role') || ''
        },
        xpath: getXPath(element),
        attributes: Array.from(element.attributes || []).map(attr => ({
          name: attr.name,
          value: attr.value
        }))
      };
    } catch(err) {
      console.warn('Error capturing element info:', err);
      return null;
    }
  }

  function onInputDirty(){ dirty = true; }

  // Commit on focusout
  function onFocusOut(e){ 
    const el = e.target; 
    if(el !== activeEl) return; 
    el.removeEventListener('input', onInputDirty); 
    el.removeEventListener('change', onChangeCommit); 
    if(!dirty || committed) { 
      activeEl = null; 
      dirty = false; 
      return; 
    }

    committed = true; 
    const rect = el.getBoundingClientRect(); 
    const x = Math.round(rect.left + rect.width/2) + window.scrollX; 
    const y = Math.round(rect.top + rect.height/2) + window.scrollY;

    const elementInfo = getElementInfo(el);

    const eventData = {
      type: 'user-type-commit',
      payload: {
        type: 'user-type-commit',
        ts: Date.now(),
        x,
        y,
        dpr: window.devicePixelRatio || 1,
        vw: window.innerWidth,
        vh: window.innerHeight,
        url: location.href,
        title: document.title,
        targetTag: (el.tagName || '').toLowerCase(),
        elementInfo
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      try {
        chrome.runtime.sendMessage(eventData.payload).catch(() => {
          if (chrome.runtime.lastError) {
            console.warn('chrome.runtime.sendMessage failed (onFocusOut):', chrome.runtime.lastError.message);
          }
          EventQueue.enqueue(eventData);
        });
      } catch (e) {
        if (e.message.includes('Extension context invalidated')) {
          alert('ClickShot extension has been updated. Please reload this page to continue recording.');
        }
        console.warn('Synchronous error in chrome.runtime.sendMessage (onFocusOut):', e);
        EventQueue.enqueue(eventData);
      }
    } else {
      EventQueue.enqueue(eventData);
    }

    activeEl = null; 
    dirty = false; 
  }

  function onChangeCommit(e){ 
    if(!activeEl || committed || !dirty) return; 
    const el = e.target; 
    const rect = el.getBoundingClientRect(); 
    const x = Math.round(rect.left + rect.width/2) + window.scrollX; 
    const y = Math.round(rect.top + rect.height/2) + window.scrollY; 
    committed = true; 
    
    const elementInfo = getElementInfo(el);
    
    const eventData = { 
      type:'user-type-commit', 
      payload: { 
        type:'user-type-commit', 
        ts: Date.now(), 
        x, 
        y, 
        dpr: window.devicePixelRatio || 1, 
        vw: window.innerWidth, 
        vh: window.innerHeight, 
        url: location.href, 
        title: document.title, 
        targetTag: (el.tagName || '').toLowerCase(),
        elementInfo
      } 
    };

    try {
      chrome.runtime.sendMessage(eventData.payload).catch(() => {
        if (chrome.runtime.lastError) {
          EventQueue.enqueue(eventData);
        }
      });
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        alert('ClickShot extension has been updated. Please reload this page to continue recording.');
      }
      EventQueue.enqueue(eventData);
    } 
  }

  // Click handler: ONLY real, trusted user clicks
  function onClick(e){
    if(!e.isTrusted) return;
    
    // Ignore synthetic clicks (programmatic)
    if (e.detail === 0 && e.clientX === 0 && e.clientY === 0) return;
    
    const t = Date.now();
    
    // Stricter debouncing: 250ms window
    if (clickLock || (t - lastClickTs) < 250) return;
    clickLock = true;
    lastClickTs = t;

    // Get information about the clicked element
    let elementInfo = null;
    try {
      const target = e.target;
      elementInfo = getElementInfo(target);
    } catch(err) {
      console.warn('Error capturing element info:', err);
    }

    // Get coordinates with scroll offset
    const coords = getGlobalClientXY(e);

    // Prepare the event data
    const eventData = {
      type: 'user-click',
      payload: {
        type: 'user-click',
        ts: t,
        x: coords.x, 
        y: coords.y,
        dpr: window.devicePixelRatio || 1,
        vw: window.innerWidth,
        vh: window.innerHeight,
        url: location.href,
        title: document.title,
        elementInfo
      }
    };

    // Try immediate send first
    if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
      try {
        chrome.runtime.sendMessage(eventData.payload).catch(() => {
          if (chrome.runtime.lastError) {
            console.warn('chrome.runtime.sendMessage failed (onClick):', chrome.runtime.lastError.message);
          }
          EventQueue.enqueue(eventData);
        });
      } catch (e) {
        if (e.message.includes('Extension context invalidated')) {
          alert('ClickShot extension has been updated. Please reload this page to continue recording.');
        }
        console.warn('Synchronous error in chrome.runtime.sendMessage (onClick):', e);
        EventQueue.enqueue(eventData);
      }
    } else {
      EventQueue.enqueue(eventData);
    }

    setTimeout(()=>{ clickLock = false; }, 120);
  }

  chrome.runtime.onMessage.addListener((msg)=>{
    try {
      if(msg?.type === 'recording-status') setBanner(msg.status);
      else if(msg?.type === 'request-consent') showConsent();
    } catch (e) {
      console.warn('Extension context invalidated (onMessage)', e);
    }
  });

  // Listen for forwarded console events from page
  window.addEventListener('message', (ev) => {
    try{
      const d = ev.data;
      if (!d || !d.__clickshot_console) return;

      try{ console.debug('[clickshot] forwarded console event', d.level, d.args); }catch(e){}

      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function'){
        try{
          chrome.runtime.sendMessage({ type: 'console-log', level: d.level, args: d.args, ts: d.ts, url: location.href });
        }catch(e){
          try{
            window.__clickshot_pendingEvents = window.__clickshot_pendingEvents || [];
            window.__clickshot_pendingEvents.push({ type: 'console', level: d.level, args: d.args, ts: d.ts, url: location.href });
            console.warn('[clickshot] runtime sendMessage threw, buffered event');
          }catch(e){}
        }
      } else {
        try{
          window.__clickshot_pendingEvents = window.__clickshot_pendingEvents || [];
          window.__clickshot_pendingEvents.push({ type: 'console', level: d.level, args: d.args, ts: d.ts, url: location.href });
          console.warn('[clickshot] runtime not available, buffered event');
        }catch(e){
          try{ console.warn('[clickshot] failed to buffer event', e); }catch(e){}
        }
      }
    }catch(e){}
  }, false);

  // Periodic check for buffered events
  function attemptReplayBuffered() {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        return;
      }

      const pendingEvents = window.__clickshot_pendingEvents || [];
      if (pendingEvents.length === 0) return;

      const failedEvents = [];
      pendingEvents.forEach(async (event) => {
        try {
          await chrome.runtime.sendMessage(event.payload);
        } catch (e) {
          failedEvents.push(event);
        }
      });

      window.__clickshot_pendingEvents = failedEvents;
    } catch (e) {
      console.warn('Failed to replay buffered events', e);
    }
  }

  setInterval(attemptReplayBuffered, 2000);

  setInterval(() => {
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {});
    }
  }, 20000);

  // Attach listeners
  window.addEventListener('click', onClick, { capture:true, passive:true });
  window.addEventListener('focusout', onFocusOut, { capture:true, passive:true });

  ensureOverlay();
}
