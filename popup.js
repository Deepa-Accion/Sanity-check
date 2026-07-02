let isDownloading = false;

// Fixed coordinate computation - no double DPR multiplication
function computeMarkerXY(image, event){
  try{
    // event.x and event.y are in document-space CSS pixels (no DPR applied in content script)
    // image dimensions are in physical pixels (captured screenshot)
    // We need to scale from document size to image size
    
    const dpr = event?.dpr || window.devicePixelRatio || 1;
    const baseW = (event?.vw || image.width);   // viewport width in CSS pixels
    const baseH = (event?.vh || image.height);  // viewport height in CSS pixels
    
    // Convert CSS viewport dimensions to physical pixels for scaling
    const physicalVw = baseW * dpr;
    const physicalVh = baseH * dpr;
    
    // Scale coordinates from document space to image space
    const sx = image.width / physicalVw;
    const sy = image.height / physicalVh;
    
    const x = Math.round((event?.x ?? 0) * sx);
    const y = Math.round((event?.y ?? 0) * sy);
    
    return {x, y};
  }catch(_){return {x:0, y:0};}
}

// popup.js v1.7.0 (screenshots + per-action network JSON)
const STORAGE_KEY = 'captures';
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopBtn = document.getElementById('stopBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const msgEl = document.getElementById('msg');
const statusEl = document.getElementById('statusText');
const sessionNameEl = document.getElementById('sessionName');
const networkFilterEl = document.getElementById('networkFilter');
const applyFilterBtn = document.getElementById('applyFilterBtn');

function setMsg(text, ok=true){ 
  msgEl.textContent = text || ''; 
  msgEl.style.color = ok ? '#2e7d32' : '#c62828'; 
}

function setButtonsState(status){ 
  startBtn.disabled = status === 'recording' || status === 'paused'; 
  pauseBtn.disabled = status !== 'recording'; 
  resumeBtn.disabled = status !== 'paused'; 
  stopBtn.disabled = status === 'idle'; 
  statusEl.textContent = status || 'idle'; 
}

function getNowStamp(){ 
  const d = new Date(); 
  const pad = (n) => String(n).padStart(2,'0'); 
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`; 
}

async function refreshStatus(){ 
  return new Promise((resolve)=>{ 
    chrome.runtime.sendMessage({type:'get-status'},(res)=>{ 
      const status = res?.status || 'idle'; 
      setButtonsState(status); 
      resolve(status); 
    }); 
  }); 
}

async function onStart(){ 
  setMsg('Requesting consent…'); 
  chrome.runtime.sendMessage({type:'start-recording'},(res)=>{ 
    if(res?.ok){ 
      setMsg('Recording started.'); 
      setButtonsState('recording'); 
    } else { 
      setMsg('Start cancelled: '+(res?.error||'Unknown'), false); 
      setButtonsState('idle'); 
    } 
  }); 
}

function applyNetworkFilter(){ 
  const v = (networkFilterEl.value||'').trim(); 
  chrome.storage.local.set({ networkFilter: v }, ()=>{ 
    try{ 
      chrome.runtime.sendMessage({ type: 'set-filter', filter: v }); 
      setMsg(v ? `Applied filter: ${v}` : 'Filter cleared'); 
    }catch(e){ 
      setMsg('Failed to apply filter', false); 
    } 
  }); 
}

async function onPause(){ 
  chrome.runtime.sendMessage({type:'pause-recording'},(res)=>{ 
    if(res?.ok){ 
      setMsg('Recording paused.'); 
      setButtonsState('paused'); 
    } else { 
      setMsg('Could not pause.', false); 
    } 
  }); 
}

async function onResume(){ 
  chrome.runtime.sendMessage({type:'resume-recording'},(res)=>{ 
    if(res?.ok){ 
      setMsg('Recording resumed.'); 
      setButtonsState('recording'); 
    } else { 
      setMsg('Could not resume.', false); 
    } 
  }); 
}

async function onStop(){ 
  chrome.runtime.sendMessage({type:'stop-recording'},(res)=>{ 
    if(res?.ok){ 
      setMsg('Recording stopped.'); 
      setButtonsState('idle'); 
    } else { 
      setMsg('Could not stop.', false); 
    } 
  }); 
}

async function onClear(){ 
  chrome.storage.local.set({[STORAGE_KEY]:[]},()=>{ 
    setMsg('Cleared captures.'); 
  }); 
}

// ZIP builder (store-only)
function crc32(buf){ 
  let crc = 0 ^ (-1); 
  for(let i=0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF]; 
  return (crc ^ (-1)) >>> 0; 
}

const table = (()=>{ 
  let c; 
  const t = new Array(256); 
  for(let n=0; n<256; n++){ 
    c = n; 
    for(let k=0; k<8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); 
    t[n] = c >>> 0; 
  } 
  return t; 
})();

function writeUInt32LE(buf,off,val){ 
  buf[off] = val & 0xFF; 
  buf[off+1] = (val >>> 8) & 0xFF; 
  buf[off+2] = (val >>> 16) & 0xFF; 
  buf[off+3] = (val >>> 24) & 0xFF; 
}

function writeUInt16LE(buf,off,val){ 
  buf[off] = val & 0xFF; 
  buf[off+1] = (val >>> 8) & 0xFF; 
}

function dosDateTime(d=new Date()){ 
  const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds()/2)) & 0x1F); 
  const date = (((d.getFullYear()-1980) & 0x7F) << 9) | (((d.getMonth()+1) & 0xF) << 5) | (d.getDate() & 0x1F); 
  return { time, date }; 
}

function makeZip(files){ 
  const chunks = []; 
  const centralRecords = []; 
  let offset = 0; 
  const {time,date} = dosDateTime(); 
  files.forEach((f)=>{ 
    const nameBytes = new TextEncoder().encode(f.name); 
    const data = f.data; 
    const crc = crc32(data); 
    const local = new Uint8Array(30+nameBytes.length); 
    writeUInt32LE(local,0,0x04034b50); 
    writeUInt16LE(local,4,20); 
    writeUInt16LE(local,6,0); 
    writeUInt16LE(local,8,0); 
    writeUInt16LE(local,10,time); 
    writeUInt16LE(local,12,date); 
    writeUInt32LE(local,14,crc); 
    writeUInt32LE(local,18,data.length); 
    writeUInt32LE(local,22,data.length); 
    writeUInt16LE(local,26,nameBytes.length); 
    writeUInt16LE(local,28,0); 
    local.set(nameBytes,30); 
    const localOffset = offset; 
    chunks.push(local); 
    offset += local.length; 
    chunks.push(data); 
    offset += data.length; 
    const central = new Uint8Array(46+nameBytes.length); 
    writeUInt32LE(central,0,0x02014b50); 
    writeUInt16LE(central,4,20); 
    writeUInt16LE(central,6,20); 
    writeUInt16LE(central,8,0); 
    writeUInt16LE(central,10,0); 
    writeUInt16LE(central,12,time); 
    writeUInt16LE(central,14,date); 
    writeUInt32LE(central,16,crc); 
    writeUInt32LE(central,20,data.length); 
    writeUInt32LE(central,24,data.length); 
    writeUInt16LE(central,28,nameBytes.length); 
    writeUInt16LE(central,30,0); 
    writeUInt16LE(central,32,0); 
    writeUInt16LE(central,34,0); 
    writeUInt16LE(central,36,0); 
    writeUInt32LE(central,38,0); 
    writeUInt32LE(central,42,localOffset); 
    central.set(nameBytes,46); 
    centralRecords.push(central); 
  }); 
  const centralStart = offset; 
  centralRecords.forEach((c)=>{ 
    chunks.push(c); 
    offset += c.length; 
  }); 
  const centralSize = offset - centralStart; 
  const end = new Uint8Array(22); 
  writeUInt32LE(end,0,0x06054b50); 
  writeUInt16LE(end,4,0); 
  writeUInt16LE(end,6,0); 
  writeUInt16LE(end,8,files.length); 
  writeUInt16LE(end,10,files.length); 
  writeUInt32LE(end,12,centralSize); 
  writeUInt32LE(end,16,centralStart); 
  writeUInt16LE(end,20,0); 
  chunks.push(end); 
  offset += end.length; 
  const zipBuf = new Uint8Array(offset); 
  let p = 0; 
  chunks.forEach((chunk)=>{ 
    zipBuf.set(chunk,p); 
    p += chunk.length; 
  }); 
  return new Blob([zipBuf], { type:'application/zip' }); 
}

function dataUrlToImage(dataUrl){ 
  return new Promise((resolve,reject)=>{ 
    const img = new Image(); 
    img.onload = () => resolve(img); 
    img.onerror = reject; 
    img.src = dataUrl; 
  }); 
}

function canvasToUint8Array(canvas){ 
  return new Promise((resolve)=>{ 
    canvas.toBlob(async (blob)=>{ 
      const buf = new Uint8Array(await blob.arrayBuffer()); 
      resolve(buf); 
    }, 'image/jpeg', 0.8); 
  }); 
}

function drawMarker(ctx,x,y,index){ 
  const r = 12; 
  ctx.beginPath(); 
  ctx.arc(x,y,r,0,Math.PI*2); 
  ctx.fillStyle = '#2e7d32'; 
  ctx.fill(); 
  ctx.lineWidth = 2; 
  ctx.strokeStyle = '#ffffff'; 
  ctx.stroke(); 
  ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; 
  ctx.fillStyle = '#fff'; 
  ctx.textAlign = 'center'; 
  ctx.textBaseline = 'middle'; 
  ctx.fillText(String(index), x, y); 
}

function safeFolder(name){ 
  const n = (name||'').trim(); 
  if(!n) return null; 
  return n.replace(/[<>:"|?*]/g,'').replace(/\s+/g,' ').substring(0,80); 
}

function buildDetailedNetworksJson(networkEvents, filter) {
  const seenUrls = new Set();
  const detailedLogs = [];

  let useRegex = false;
  let re = null;
  let substr = null;
  try{
    if (filter && String(filter).startsWith('re:')){ 
      useRegex = true; 
      re = new RegExp(String(filter).substring(3)); 
    }
    else if (filter) substr = String(filter);
  }catch(e){ 
    console.warn('[buildDetailedNetworksJson] invalid filter', filter); 
  }

  for (const event of (networkEvents || [])) {
    if (!event || !event.url) continue;

    let matched = true;
    if (useRegex){ 
      try{ matched = re.test(event.url); }catch(e){ matched = false; } 
    }
    else if (substr){ 
      matched = event.url.includes(substr); 
    }

    if (matched && !seenUrls.has(event.url)) {
      seenUrls.add(event.url);
      detailedLogs.push({
        url: event.url,
        method: event.method,
        statusCode: event.statusCode,
        requestBody: event.requestBody,
        responseBody: event.responseBody,
      });
    }
  }

  const jsonText = JSON.stringify(detailedLogs, null, 2);
  return new TextEncoder().encode(jsonText);
}

async function prepareFiles(captures, folder, filter) {
  const usedNames = new Set();
  function ensureUniqueName(path){
    if(!usedNames.has(path)){
      usedNames.add(path);
      return path;
    }
    let n=1, b=path, ext=''; 
    const m=path.match(/^(.*?)(\.[^./]+)$/); 
    if(m){
      b=m[1];
      ext=m[2];
    }
    let c; 
    do{
      c=`${b}(${n})${ext}`;
      n++;
    }while(usedNames.has(c)); 
    usedNames.add(c); 
    return c;
  }

  const files = [];
  const base = folder ? folder : `session-${getNowStamp()}`;

  for (let i = 0; i < captures.length; i++) {
    const seq = i+1; 
    const idx = String(seq).padStart(3,'0');
    const { img, event, networks } = captures[i];

    const image = await dataUrlToImage(img);
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    // Use the fixed computeMarkerXY function - coordinates already correct
    const pt = computeMarkerXY(image, event); 
    drawMarker(ctx, pt.x, pt.y, seq);

    const jpgBytes = await canvasToUint8Array(canvas);

    // 1) Add screenshot
    files.push({ name: ensureUniqueName(`${base}/screenshots/${idx}.jpg`), data: jpgBytes });

    // 2) Add element info per-action file
    try {
      const elementPayload = {
        timestamp: event?.ts || Date.now(),
        action: event?.kind || (event?.type || 'click'),
        coordinates: {
          x: event?.x || 0,
          y: event?.y || 0
        },
        url: event?.url,
        title: event?.title,
        elementInfo: event?.elementInfo || null
      };
      const elBytes = new TextEncoder().encode(JSON.stringify(elementPayload, null, 2));
      files.push({ name: ensureUniqueName(`${base}/elementInfo/${idx}.json`), data: elBytes });
    } catch (e) {
      files.push({ name: ensureUniqueName(`${base}/elementInfo/${idx}.json`), data: new TextEncoder().encode('{}') });
    }

    // 3) Prepare networks JSON for this action
    const filteredNetworks = (networks || []).filter(n => {
      try {
        const typ = (n.type || '').toLowerCase();
        const isXhrOrFetch = typ === 'xmlhttprequest' || typ === 'fetch' || typ === 'xhr';
        const isSvg = n.url && String(n.url).toLowerCase().endsWith('.svg');
        return isXhrOrFetch && !isSvg;
      } catch(e) { return false; }
    });

    const jsonBytes = (filteredNetworks && filteredNetworks.length)
      ? buildDetailedNetworksJson(filteredNetworks, filter)
      : new TextEncoder().encode('[]');
    files.push({ name: ensureUniqueName(`${base}/networks/${idx}.json`), data: jsonBytes });
  }

  return files;
}

async function onDownload(){
  if(isDownloading) return; 
  isDownloading = true;
  setMsg('Preparing ZIP…');
  chrome.storage.local.get([STORAGE_KEY], async (res)=>{
    const captures = res[STORAGE_KEY] || [];
    if(!captures.length){ 
      isDownloading = false; 
      setMsg('No captures to download.', false); 
      return; 
    }
    try{
      const folder = safeFolder(sessionNameEl.value);
      const base = folder ? folder : `session-${getNowStamp()}`;
      const filter = (networkFilterEl.value||'').trim();

      const files = await prepareFiles(captures, base, filter);

      chrome.storage.local.get(['consoleLogs'], async (res2)=>{
        try{
          const logs = res2.consoleLogs || [];
          const lines = (logs && logs.length) ? logs.map(l => {
            const time = l.ts ? new Date(l.ts).toISOString() : new Date().toISOString();
            const url = l.url ? ` ${l.url}` : '';
            return `[${time}] ${l.level.toUpperCase()}${url} - ${l.text}`;
          }) : [];
          const text = lines.join('\n');
          const textBytes = new TextEncoder().encode(text);
          files.push({ name: `${base}/consolelog.txt`, data: textBytes });

          const blob = makeZip(files);
          const url = URL.createObjectURL(blob);
          const baseName = folder || `clickshots-${getNowStamp()}`;
          const filename = `${baseName}.zip`;
          chrome.downloads.download({ url, filename, saveAs:true }, (downloadId)=>{
            if(chrome.runtime.lastError){ 
              setMsg('Download failed: '+chrome.runtime.lastError.message, false); 
              URL.revokeObjectURL(url); 
              return; 
            }
            setMsg(`Downloading ${filename}…`);
            setTimeout(()=>URL.revokeObjectURL(url),10000);
          });
          isDownloading = false;
        }catch(e){ 
          setMsg('ZIP error: '+e.message, false); 
        }
      });
    } catch(e){ 
      setMsg('ZIP error: '+e.message, false); 
    }
  });
}

startBtn.addEventListener('click', onStart);
pauseBtn.addEventListener('click', onPause);
resumeBtn.addEventListener('click', onResume);
stopBtn.addEventListener('click', onStop);
downloadBtn.addEventListener('click', onDownload);
clearBtn.addEventListener('click', onClear);
applyFilterBtn.addEventListener('click', applyNetworkFilter);

refreshStatus();

chrome.storage.local.get(['networkFilter'], (res)=>{ 
  if(res && typeof res.networkFilter !== 'undefined'){ 
    networkFilterEl.value = res.networkFilter || ''; 
  } 
});
